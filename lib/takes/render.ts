import "server-only";

import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentTemplate, type RenderFormat } from "@/lib/templates/catalog";
import { validateBrief } from "@/lib/templates/brief-schemas";
import { renderRemotionComposition } from "@/lib/video/remotion-cli";
import { deleteR2Object } from "@/lib/r2";
import { putRenderArtifact } from "./storage";
import { stageBriefMaterials } from "./materials";

// Rendering one render of one take.
//
// The state lives on the row, not in server memory, so a reload — or a different
// machine — still sees what happened. The artifact row is what proves the file
// exists; take_renders.latest_artifact_id is a pointer to the current one, and
// older artifacts stay behind as history rather than being overwritten.
//
// An artifact is deliberately NOT a material. It becomes one only if somebody
// promotes it, and then both rows point at the same R2 object (there is never a
// second copy of the bytes — docs/old/schema-v2.md §11).

export type RenderTakeResult =
  | {
      ok: true;
      artifactId: string;
      r2Key: string;
      bytes: number;
      renderedAt: string;
    }
  | { ok: false; error: string };

interface RenderRow {
  id: string;
  take_id: string;
  format: RenderFormat;
  locale: string;
  aspect_ratio: string;
  theme: string;
  /** Whatever this render already recorded about itself. Merged, not replaced:
   *  this column is a bag, and a later writer must not drop an earlier one. */
  params: Record<string, unknown> | null;
  takes: {
    brand_id: string;
    template_id: string;
    template_version: number;
    brief: unknown;
    /** The brief a run fixed, for templates that have one (migration 0050). */
    baked_brief: unknown;
  } | null;
}

export async function renderTake(
  supabase: SupabaseClient,
  renderId: string,
): Promise<RenderTakeResult> {
  const { data, error } = await supabase
    .from("take_renders")
    .select(
      "id, take_id, format, locale, aspect_ratio, theme, params, takes(brand_id, template_id, template_version, brief, baked_brief)",
    )
    .eq("id", renderId)
    .maybeSingle();

  if (error) return { ok: false, error: `出力単位を読めませんでした: ${error.message}` };
  const render = data as RenderRow | null;
  if (!render?.takes) return { ok: false, error: "出力単位が見つかりません" };

  const take = render.takes;
  const template = currentTemplate(take.template_id);
  if (!template) {
    return { ok: false, error: `テンプレートが見つかりません: ${take.template_id}` };
  }

  // A take pinned to an older version may only be re-rendered when that version
  // declared it. Rendering it on today's code instead would quietly change the
  // output somebody already approved (docs/deliverable-architecture.md §4.3).
  if (take.template_version !== template.version && !template.rerenderable) {
    return {
      ok: false,
      error:
        `このテイクは ${take.template_id}@${take.template_version} で作られており、` +
        `現在の版(${template.version})での再レンダーは保証されていません`,
    };
  }

  // The export is a file of the film the player showed, not of the workbench.
  //
  // Reading the working brief here would hand somebody an MP4 of edits they
  // were still making — including a narration with no recording, which would
  // export at the estimated length rather than the measured one. A template
  // with no fixing step has no `baked_brief`, and for it this is the brief it
  // always was (migration 0050, §9.4).
  const source = take.baked_brief ?? take.brief;
  const validated = validateBrief(template.id, source);
  if (!validated.ok) {
    return { ok: false, error: `briefが壊れています: ${validated.issues.join(", ")}` };
  }

  const { error: startError } = await supabase
    .from("take_renders")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", renderId);
  if (startError) {
    return { ok: false, error: `レンダーを開始できませんでした: ${startError.message}` };
  }

  let renderReady = false;
  try {
    const bytes = await produce(supabase, render.take_id, template.id, render.format, validated.brief);
    const renderedAt = new Date().toISOString();
    const { key, mediaType } = await putRenderArtifact(
      take.brand_id,
      render.take_id,
      render.id,
      render.format,
      bytes,
      renderedAt,
    );

    const { data: artifact, error: artifactError } = await supabase
      .from("render_artifacts")
      .insert({
        render_id: render.id,
        r2_key: key,
        media_type: mediaType,
        bytes: bytes.byteLength,
        checksum: createHash("sha256").update(bytes).digest("hex").slice(0, 32),
        status: "ready",
      })
      .select("id")
      .maybeSingle();
    if (artifactError || !artifact) {
      // The object has no durable DB owner yet. Remove it immediately instead
      // of relying on a future global garbage collector to find it.
      try {
        await deleteR2Object(key);
      } catch (cleanupError) {
        const cleanupMessage =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        throw new Error(
          `${artifactError?.message ?? "成果物を登録できませんでした"}; ` +
            `R2補償削除にも失敗しました: ${cleanupMessage}`,
        );
      }
      throw new Error(artifactError?.message ?? "成果物を登録できませんでした");
    }

    // Which renderer drew this file.
    //
    // Written here rather than left to the ledger, because the ledger records
    // what a TEMPLATE VERSION promised while this records what one FILE was
    // made by. Without it, fixing the drawing leaves every existing export
    // silently old: the player runs today's composition, the MP4 does not, and
    // the only staleness anything could see was a newer bake
    // (lib/templates/catalog.ts `rendererChangedSince`).
    const { error: readyError } = await supabase
      .from("take_renders")
      .update({
        status: "ready",
        latest_artifact_id: artifact.id,
        updated_at: renderedAt,
        params: {
          ...(render.params ?? {}),
          rendererRevision: template.rendererRevision,
        },
      })
      .eq("id", renderId);
    if (readyError) {
      throw new Error(`成果物の採用状態を更新できませんでした: ${readyError.message}`);
    }
    renderReady = true;

    const { count: unfinished, error: countError } = await supabase
      .from("take_renders")
      .select("*", { count: "exact", head: true })
      .eq("take_id", render.take_id)
      .neq("status", "ready");
    if (countError) {
      throw new Error(`テイクの完了状態を確認できませんでした: ${countError.message}`);
    }
    if ((unfinished ?? 0) === 0) {
      const { error: takeReadyError } = await supabase
        .from("takes")
        .update({ status: "ready", updated_at: renderedAt })
        .eq("id", render.take_id);
      if (takeReadyError) {
        throw new Error(`テイクを完了状態にできませんでした: ${takeReadyError.message}`);
      }
    }

    return {
      ok: true,
      artifactId: artifact.id as string,
      r2Key: key,
      bytes: bytes.byteLength,
      renderedAt,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (renderReady) {
      // The output itself is durable and adopted. A follow-up state update
      // failing must not rewrite that truthful ready state to failed.
      return { ok: false, error: message };
    }
    const { error: failError } = await supabase
      .from("take_renders")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", renderId);
    return {
      ok: false,
      error: failError
        ? `${message}; 失敗状態も保存できませんでした: ${failError.message}`
        : message,
    };
  }
}

/** Template-specific production. Each arm owns exactly one renderer; a template
 *  without one says so instead of producing an empty file. */
async function produce(
  supabase: SupabaseClient,
  takeId: string,
  templateId: string,
  format: RenderFormat,
  brief: unknown,
): Promise<Buffer> {
  if (templateId === "event-cm" && format === "mp4") {
    return renderEventCmMp4(supabase, takeId, brief);
  }
  throw new Error(
    `${templateId} の ${format} レンダラーはまだv2経路に接続されていません`,
  );
}

/**
 * Put the repository's own static assets where a render can reach them.
 *
 * A brief holds two kinds of path. `material:<uuid>` is staged out of R2 by
 * `stageBriefMaterials`; `defaults/bgm/ink-cinematic.mp3` and its neighbours are
 * files that live in this repository and are served by Next from `public/`.
 * The renderer runs with `--public-dir` pointed at a fresh temp directory, so
 * only the first kind was ever there — and the second kind became a 404 the day
 * the default pool started carrying music, pictures and marks.
 *
 * Copied rather than symlinked: the child process is a separate Remotion CLI
 * with its own cwd, and a link into a repository that may be mid-edit is a
 * subtler thing to debug than a copy. Twelve megabytes per render is worth one
 * fewer mystery; if the pool grows enough to matter, copy only what the brief
 * names.
 */
async function stagePoolAssets(publicDir: string): Promise<void> {
  const from = path.join(process.cwd(), "public", "defaults");
  const to = path.join(publicDir, "defaults");
  try {
    await cp(from, to, { recursive: true });
  } catch (error) {
    // A pool that is not there is a legitimate state — the audio bytes are
    // gitignored, so a fresh clone has none. The composition's designed
    // fallbacks cover it, and a render must not fail for a track nobody chose.
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
}

async function renderEventCmMp4(
  supabase: SupabaseClient,
  takeId: string,
  brief: unknown,
): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "logos-take-"));
  const propsPath = path.join(dir, "props.json");
  const outPath = path.join(dir, "out.mp4");
  const publicDir = path.join(dir, "public");
  try {
    await stagePoolAssets(publicDir);
    const stagedBrief = await stageBriefMaterials(supabase, takeId, brief, publicDir);
    await writeFile(propsPath, JSON.stringify({ brief: stagedBrief }));
    await renderRemotionComposition("event-cm", propsPath, outPath, publicDir);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Run one stage of one video's pipeline.
//
// One stage per request, and each stage does exactly the one thing its name
// says. They used to be two: "structure" read the material AND wrote the
// result into the film, which left the マッピング stage with nothing to do and
// its drawer with nothing to offer. A stage a person cannot run is not a stage.
//
//   extract    read the material as far as rules go
//   structure  work out the event's facts from it — recorded, not applied
//   map        put those facts into the film, and rewrite the narration
//
// Each run is recorded in take_runs, which already models exactly this
// (stage, status, input, steps, usage). The map stage is the only one that
// writes the brief — the brief is the deliverable, and the only thing the
// renderer reads.

import { guardLabsRequest } from "@/lib/labs-access";
import { createServerSupabaseForToken, requireUser } from "@/lib/supabase/server";
import { extractSummary, extractTakeSources } from "@/lib/event-cm/extract";
import {
  structureEventFacts,
  structuringAvailable,
  type EventFacts,
} from "@/lib/event-cm/structure";
import { mapFactsIntoBrief } from "@/lib/event-cm/map";
import {
  placeImagesIntoBrief,
  type ImageMaterial,
} from "@/lib/event-cm/place-images";
import { storeImageClassifications } from "@/lib/materials/classify";
import { draftEventCmNarration, eventCmNarrationAvailable } from "@/lib/event-cm/narration";
import { validateBrief } from "@/lib/templates/brief-schemas";
import type { EventCmBrief } from "@/remotion/event-cm/types";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export const RUNNABLE_STAGES = ["extract", "structure", "map"] as const;
export type RunnableStage = (typeof RUNNABLE_STAGES)[number];

const isRunnable = (value: string): value is RunnableStage =>
  (RUNNABLE_STAGES as readonly string[]).includes(value);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; videoId: string; stage: string }> },
) {
  const denied = await guardLabsRequest(req);
  if (denied) return denied;
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  const { id: brandId, videoId, stage } = await ctx.params;
  if (!isRunnable(stage)) {
    return Response.json({ error: `実行できない段です: ${stage}` }, { status: 400 });
  }
  const supabase = createServerSupabaseForToken(user.token);

  const { data: take, error } = await supabase
    .from("takes")
    .select("id, template_id, brief")
    .eq("id", videoId)
    .eq("brand_id", brandId)
    .eq("tool_kind", "video")
    .maybeSingle();
  if (error) {
    return Response.json({ error: "動画を確認できませんでした" }, { status: 500 });
  }
  if (!take) return Response.json({ error: "動画が見つかりません" }, { status: 404 });
  if (take.template_id !== "event-cm") {
    return Response.json({ error: "このテンプレートには対応していません" }, { status: 400 });
  }

  const startedAt = new Date().toISOString();
  const record = async (
    status: "succeeded" | "failed",
    payload: { input?: unknown; steps?: unknown; usage?: unknown; error?: string },
  ) => {
    await supabase.from("take_runs").insert({
      take_id: take.id,
      stage,
      status,
      input: payload.input ?? {},
      steps: payload.steps ?? [],
      usage: payload.usage ?? {},
      error_message: payload.error ?? null,
      triggered_by: user.id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
  };

  try {
    if (stage === "extract") {
      const sources = await extractTakeSources(supabase, take.id as string);
      const summary = extractSummary(sources);
      if (summary.every((item) => item.mode === "skipped")) {
        throw new Error("読み取れる素材がありません。資料かテキストを追加してください");
      }
      await record("succeeded", {
        // What it was handed, before deciding what it could do with each item.
        // Without this the log says "3 files read" and cannot say which three.
        input: {
          pinned: sources.map((source) => ({
            materialId: source.materialId,
            label: source.label,
            mediaType: source.mediaType,
            bytes: source.bytes,
          })),
        },
        steps: summary,
      });
      return Response.json({ ok: true, sources: summary });
    }

    if (stage === "structure") {
      if (!structuringAvailable()) {
        throw new Error("構造化が設定されていません（OPENAI_API_KEY）");
      }
      // Bodies are re-read rather than carried on the extract run: a PDF has no
      // text layer this repo can store, so the model needs the file itself.
      const sources = await extractTakeSources(supabase, take.id as string);
      const structured = await structureEventFacts(sources);
      await record("succeeded", {
        input: { sources: extractSummary(sources) },
        steps: {
          facts: structured.facts,
          read: structured.readLabels,
          // Which material each fact rests on, for the mapping stage to write
          // into the brief — and what the checking threw out, for the log.
          readIds: structured.attribution.readIds,
          attribution: structured.attribution.byField,
          unverified: structured.attribution.dropped,
          dropped: structured.dropped,
          images: structured.imageCounts,
        },
        usage: structured.usage ?? {},
      });
      // Images are a list, not a value: counting them among "facts found"
      // would report a reading even when every field came back null.
      const found = Object.entries(structured.facts).filter(
        ([key, value]) => key !== "note" && key !== "images" && value !== null,
      );
      return Response.json({
        ok: true,
        facts: structured.facts,
        foundCount: found.length,
        dropped: structured.dropped,
        images: structured.imageCounts,
        note: structured.facts.note,
      });
    }

    // map: take what structuring worked out and put it into the film.
    const { data: lastStructure, error: structureError } = await supabase
      .from("take_runs")
      .select("input, steps, finished_at")
      .eq("take_id", take.id)
      .eq("stage", "structure")
      .eq("status", "succeeded")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (structureError) throw new Error("構造化の結果を読めませんでした");
    const steps = lastStructure?.steps as {
      facts?: EventFacts;
      read?: string[];
      readIds?: string[];
      attribution?: Record<string, string[]>;
    } | null;
    if (!steps?.facts) {
      throw new Error("先に構造化を実行してください");
    }

    const readLabel = (steps.read ?? []).join("、");
    const mapped = mapFactsIntoBrief(
      take.brief as EventCmBrief,
      steps.facts,
      readLabel,
      new Date().toISOString(),
      // A run recorded before attribution existed has no ids; the brief then
      // gets the label alone, as it always did.
      steps.readIds ? { byField: steps.attribution ?? {}, readIds: steps.readIds } : undefined,
    );

    // The pictures go in against the facts that were just applied — speaker
    // names have to exist before a portrait can be matched to one, which is
    // why this runs after the facts and not as a stage of its own.
    //
    // What the extraction stage measured (brightness, proportions) rides on the
    // same run row, so no material is re-read to place an image.
    type MeasuredSource = {
      materialId: string;
      label: string;
      mode: string;
      note?: string;
      image?: {
        luminance: number | null;
        opaque?: boolean;
        aspect: number;
        inkRatio?: number | null;
        trimWidth?: number | null;
        trimHeight?: number | null;
      };
    };
    const measured = (lastStructure?.input as { sources?: MeasuredSource[] } | null)?.sources;

    // Which of those files have an approved normalised copy (§11). Looked up
    // here rather than carried on the run, because approval happens after the
    // reading: the run that read a padded logo is not wrong, and the placement
    // that follows it should still draw the trimmed one.
    const normalizedBy = new Map<string, string>();
    const readIds = (measured ?? []).map((entry) => entry.materialId).filter(Boolean);
    if (readIds.length > 0) {
      const derived = await supabase
        .from("brand_materials")
        .select("id, derived_from_material_id")
        .in("derived_from_material_id", readIds);
      for (const row of derived.data ?? []) {
        normalizedBy.set(row.derived_from_material_id as string, row.id as string);
      }
    }

    const imageMaterials: ImageMaterial[] = (measured ?? [])
      .filter((entry) => entry.image)
      .map((entry) => ({
        materialId: entry.materialId,
        label: entry.label,
        luminance: entry.image?.luminance ?? null,
        // Older runs recorded no opacity. Treating those as opaque keeps a mark
        // knocked out, which is the treatment that cannot fail on ink.
        opaque: entry.image?.opaque ?? true,
        aspect: entry.image?.aspect ?? 0,
        // Absent on runs recorded before the geometry was measured, and absent
        // means 「測っていない」: the mark keeps whatever size the brief has
        // rather than being reset to the row's average.
        inkRatio: entry.image?.inkRatio ?? null,
        trimWidth: entry.image?.trimWidth ?? null,
        trimHeight: entry.image?.trimHeight ?? null,
        normalizedId: normalizedBy.get(entry.materialId) ?? null,
        sent: entry.mode === "passthrough",
        note: entry.note,
      }));
    const images = placeImagesIntoBrief(
      mapped.brief,
      steps.facts.images ?? [],
      imageMaterials,
      readLabel,
    );

    // What each picture IS goes back to the material, not just into this film.
    // The model already decided it; leaving the answer in this run's record is
    // what made the next run pay to decide it again (docs §14-2). Placement
    // above is the other axis and stays with the take.
    const classified = await storeImageClassifications(
      supabase,
      (steps.facts.images ?? []).map((reading) => ({
        materialId: reading.ref,
        category: reading.category ?? null,
        role: reading.role,
      })),
    );

    // The narration is the film's spine: it decides the scene order and the
    // scene lengths, so facts that changed without it are a film narrating a
    // different event. Rewriting it here is what makes 資料 → 事実 →
    // ナレーション → 映像 one chain instead of two branches.
    //
    // An edited narration is left alone. That contract is what makes the
    // unattended path safe: a person who wrote their own words keeps them.
    let rewrote = false;
    let briefToSave = images.brief;
    /** What the rewrite spent, so the log can show it. */
    let narrationUsage: { inputTokens: number; outputTokens: number } | null = null;
    const previous = (take.brief as EventCmBrief).narration;
    if (
      mapped.applied.length > 0 &&
      previous.scenes.length > 0 &&
      previous.source !== "human" &&
      eventCmNarrationAvailable()
    ) {
      const draft = await draftEventCmNarration(briefToSave, {
        now: new Date().toISOString(),
      });
      briefToSave = { ...briefToSave, narration: draft.narration };
      narrationUsage = draft.usage;
      // The recording stays, and the next step of the same run replaces it.
      // Deleting it here would leave the workbench silent in the window between
      // this stage and the voice stage — and if the run stopped in between, the
      // film the user is watching would still be the baked one, which has its
      // own matching voice (§9.2).
      rewrote = true;
    }

    const validated = validateBrief("event-cm", briefToSave);
    if (!validated.ok) {
      throw new Error(`読み取った内容を反映できません: ${validated.issues.join(", ")}`);
    }
    const saved = await supabase
      .from("takes")
      .update({ brief: validated.brief, updated_at: new Date().toISOString() })
      .eq("id", take.id);
    if (saved.error) throw new Error(saved.error.message);

    await record("succeeded", {
      input: { structuredAt: lastStructure?.finished_at ?? null },
      // The rewrite is the only charged call this stage makes, and its cost was
      // going unrecorded — so when it failed on a length limit the log could
      // not say how close to the budget the successful runs had been.
      ...(narrationUsage ? { usage: narrationUsage } : {}),
      steps: {
        applied: mapped.applied,
        keptUserValues: mapped.keptUserValues,
        narrationRewritten: rewrote,
        // Both halves, always. A run that placed nothing has to be able to say
        // why each picture was left alone, or "画像が反映されない" comes back
        // as a mystery instead of as a sentence.
        placedImages: images.placed,
        unusedImages: images.unused,
        imageCounts: {
          judged: (steps.facts.images ?? []).length,
          placed: images.placed.length,
          unused: images.unused.length,
        },
        // Kept next to the placement so the log answers both axes: where each
        // picture went, and what the library now knows it is.
        classified: classified.applied,
        classificationKeptByUser: classified.keptByUser,
        ...(classified.note ? { classificationNote: classified.note } : {}),
      },
    });

    return Response.json({
      ok: true,
      applied: mapped.applied,
      keptUserValues: mapped.keptUserValues,
      narrationRewritten: rewrote,
      narrationKept: previous.source === "human" && mapped.applied.length > 0,
      placedImages: images.placed,
      unusedImages: images.unused,
    });
  } catch (runError) {
    const message =
      runError instanceof Error ? runError.message : "実行できませんでした";
    await record("failed", { error: message });
    return Response.json({ error: message }, { status: 400 });
  }
}

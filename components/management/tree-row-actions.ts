"use client";

import { authedFetch } from "@/lib/authed-fetch";
import type { TreeNodeKind } from "@/lib/brand-tree-actions";
import { repo } from "@/lib/store";
import type { AtRiskMaterial, MaterialChoice } from "./TreeDeleteDialog";

// Where the sidebar's menu items go.
//
// One target type for every kind of row, so the shell holds one piece of
// state instead of five. Each kind knows its own endpoint, and — because the row
// you just deleted may be the page you are looking at — where to send you
// afterwards. Going nowhere would leave a detail screen fetching a take that no
// longer exists and showing its own error instead of the deletion succeeding.

export interface TreeTarget {
  kind: TreeNodeKind;
  id: string;
  name: string;
  /** Set for logo / video. */
  brandId?: string;
  /** Set for brand. */
  organizationId?: string;
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: string; atRisk?: AtRiskMaterial[] };

export type DuplicateResult = { ok: true; id: string } | { ok: false; error: string };

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export async function deleteTreeNode(
  target: TreeTarget,
  materials: MaterialChoice | null,
): Promise<DeleteResult> {
  if (target.kind === "logo") {
    // Logos already had a deletion path — mockup purge plus
    // delete_logo_with_presentation in one RPC — and it runs on the browser
    // repo, not an API route. Reimplementing it over HTTP would give the same
    // logo two ways to be deleted.
    try {
      await repo.deleteLogo(target.id);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "ロゴを削除できませんでした",
      };
    }
  }

  const query = materials ? `?materials=${materials}` : "";
  const path =
    target.kind === "brand"
      ? `/api/brands/${target.id}`
      : `/api/brands/${target.brandId}/videos/${target.id}${query}`;

  let response: Response;
  try {
    response = await authedFetch(path, { method: "DELETE" });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "削除できませんでした",
    };
  }
  if (response.ok) return { ok: true };

  const body = (await response.json().catch(() => null)) as {
    error?: string;
    needsMaterialDecision?: AtRiskMaterial[];
  } | null;
  return {
    ok: false,
    error: body?.error ?? "削除できませんでした",
    atRisk: Array.isArray(body?.needsMaterialDecision)
      ? body.needsMaterialDecision
      : undefined,
  };
}

export async function duplicateTreeNode(target: TreeTarget): Promise<DuplicateResult> {
  if (target.kind !== "video") {
    return { ok: false, error: "これは複製できません" };
  }
  try {
    const response = await authedFetch(
      `/api/brands/${target.brandId}/videos/${target.id}/duplicate`,
      { method: "POST" },
    );
    if (!response.ok) {
      return { ok: false, error: await readError(response, "複製できませんでした") };
    }
    const body = (await response.json()) as { id?: string };
    if (!body.id) return { ok: false, error: "複製の結果を読み取れませんでした" };
    return { ok: true, id: body.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "複製できませんでした",
    };
  }
}

/** The page to land on when the row you deleted was the page you were on. */
export function pathAfterDelete(target: TreeTarget): string {
  switch (target.kind) {
    case "brand":
      return "/brands";
    case "logo":
      return `/brands/${target.brandId}/logos`;
    case "video":
      return `/brands/${target.brandId}/video`;
  }
}

/** The text page of secondary facts about a leaf (format, size, public URL).
 *  Brands have no such page: a Brand's facts are its knowledge claims. */
export function infoPath(target: TreeTarget): string | null {
  switch (target.kind) {
    case "brand":
      return null;
    case "logo":
      return `/brands/${target.brandId}/logos/${target.id}/info`;
    case "video":
      return `/brands/${target.brandId}/video/${target.id}/info`;
  }
}

/** Whether the current pathname is showing the row that just disappeared. */
export function viewingTarget(pathname: string, target: TreeTarget): boolean {
  switch (target.kind) {
    case "brand":
      return (
        pathname === `/brands/${target.id}` ||
        pathname.startsWith(`/brands/${target.id}/`)
      );
    case "logo":
      return pathname.includes(`/logos/${target.id}`) || pathname === `/logos/${target.id}`;
    case "video":
      return pathname.startsWith(`/brands/${target.brandId}/video/${target.id}`);
  }
}

/** Where a freshly made copy should open. */
export function pathAfterDuplicate(target: TreeTarget, newId: string): string {
  return `/brands/${target.brandId}/video/${newId}`;
}

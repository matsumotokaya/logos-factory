// Whether a material may be promoted to the brand, and what to say when not.
//
// docs/asset-normalization.md §12. Since 2026-09-08 promotion is a COPY: the
// take keeps its row and the brand receives its own. The only questions left
// are whether the source is a take's file (a brand file is already there) and
// whether the caller may write into the brand library, which the insert policy
// (0028) decides on the core rung. The screen is not the authority; the server
// counts again with this function, and the database refuses regardless.
//
// Kept separate from the route so the wording can be tested without a
// database, the same split lib/brand-tree-actions.ts and
// lib/event-cm/panel-actions.ts already use.

/** The two owners a material can have. */
export const SCOPE_RANK = { take: 1, brand: 2 } as const;

export type MaterialScope = keyof typeof SCOPE_RANK;

export const isMaterialScope = (value: unknown): value is MaterialScope =>
  typeof value === "string" && value in SCOPE_RANK;

export type PromotionDecision =
  | { can: true; from: MaterialScope; to: MaterialScope }
  | { can: false; reason: string };

/**
 * May this material be copied to that scope?
 *
 * Only take → brand exists today. The copy is additive and the source is
 * untouched, so the screen asks once: nothing is lost, and the brand's copy can
 * be deleted from the brand library like any other file there.
 */
export function promotionTo(
  material: { scope: string },
  target: string,
): PromotionDecision {
  if (!isMaterialScope(material.scope)) {
    return { can: false, reason: "この素材のスコープを読めませんでした" };
  }
  if (!isMaterialScope(target)) {
    return { can: false, reason: "そのスコープは指定できません" };
  }

  const from = SCOPE_RANK[material.scope];
  const to = SCOPE_RANK[target];

  if (to === from) {
    return {
      can: false,
      reason:
        target === "brand"
          ? "この素材はすでにブランドの基盤にあります"
          : "この素材はすでにそのスコープにあります",
    };
  }
  // Pulling a brand file into one video is a real operation in the copy model
  // — it is how a take would pick up a photograph added after it was made —
  // but nothing offers it yet, so it is named rather than silently allowed.
  if (to < from) {
    return { can: false, reason: "ブランドの素材を動画へ引き込む操作はまだありません" };
  }
  return { can: true, from: material.scope, to: target };
}

/**
 * What to say when the database refused the copy into the brand library.
 *
 * The insert policy (0028) asks for the core rung on a scope='brand' row, and
 * the failure arrives as a policy error the person cannot read. This supplies
 * the sentence.
 */
export const promotionRefusal = (target: string): string =>
  target === "brand"
    ? "ブランドの基盤に入れられるのは、このブランドの管理者だけです"
    : "この素材を編集する権限がありません";

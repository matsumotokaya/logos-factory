// Whether a supplied material may be taken out of play for one video.
//
// docs/asset-normalization.md §9.4. A source is on by default and can be
// switched off; off means 「読ませない・候補に出さない」, not 「消す」 — the pin
// stays, under a role the reading stage does not read, so the row and its
// bytes are still this take's and the switch can be flipped back.
//
// The one thing that cannot be switched off is a file the film is drawing. The
// brief would still point at it, and the next render would fail on a pointer to
// something this take no longer holds as an input. So the answer is 「先に差し
// 替えてください」, with the place named when the template can name it.

export type ParkDecision = { can: true } | { can: false; reason: string };

/**
 * May this source be switched off?
 *
 * `onScreen` is every material id the brief points at (lib/takes/material-uri
 * collectMaterialIds); `uses` is what the inventory says about this one, when
 * the template can name its slots (lib/event-cm/material-usage).
 */
export function parkDecision(
  materialId: string,
  onScreen: ReadonlySet<string>,
  uses?: ReadonlyArray<{ label: string }>,
): ParkDecision {
  if (!onScreen.has(materialId)) return { can: true };
  const where = uses && uses.length > 0 ? uses.map((use) => use.label).join("、") : null;
  return {
    can: false,
    reason: where
      ? `この素材は「${where}」に使用中です。先に差し替えてから外してください`
      : "この素材は動画で使用中です。先に差し替えてから外してください",
  };
}

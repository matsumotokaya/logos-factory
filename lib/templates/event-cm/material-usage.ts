import { collectMaterialPaths } from "@/lib/takes/material-uri";
import {
  eventCmScenePlan,
  EVENT_CM_SCENE_LABELS,
  type EventCmBrief,
} from "@/remotion/event-cm/types";

// Where each file is used, in the template's own words.
//
// docs/asset-normalization.md §9.1. The inventory answers 「何を持っているか」
// and the storyboard answers 「どこに載るか」; this is the one line of the
// inventory that reaches across, because a file nobody can place is the same
// as a file nobody has.
//
// The brief is the source, not take_inputs.role: 27 of the 47 pins say
// `brief_source`, which records that somebody uploaded a document to be read,
// not that the film shows it anywhere. Holding the pointer is what being used
// means, so the pointer's PATH is the answer, translated here into the scene
// names the storyboard already prints (EVENT_CM_SCENE_LABELS is the one place
// that owns those words).
//
// A mark legitimately comes back three times — it really is on screen three
// times — so this returns a list, not a slot.

export interface MaterialUse {
  /** What to show: 「シーン3 テーマ の背景」「BGM」. */
  label: string;
  /** The brief path it was found at, for the run log and for debugging. */
  path: string;
}

const sceneLabel = (brief: EventCmBrief, role: keyof typeof EVENT_CM_SCENE_LABELS): string => {
  // Scene numbers come from the plan, so a video whose speakers were removed
  // does not print a number the board never shows.
  const plan = eventCmScenePlan(brief);
  const at = plan.findIndex((scene) => scene.role === role);
  const name = EVENT_CM_SCENE_LABELS[role];
  return at >= 0 ? `シーン${at + 1} ${name}` : name;
};

/**
 * Translate one brief path into what a person would call that place.
 *
 * Unknown paths keep the raw path rather than being dropped: a pointer nobody
 * can name is still a pointer, and silently omitting it would make the
 * inventory claim a file is unused while the film draws it.
 */
function describePath(brief: EventCmBrief, path: string): string {
  const logo = /^logos\.(\d+)\.src$/.exec(path);
  if (logo) {
    // The first mark opens and closes the film as well as standing in the row;
    // the others only appear in the row. Saying so is the point of the column.
    const row = sceneLabel(brief, "cta");
    return Number(logo[1]) === 0
      ? `${sceneLabel(brief, "logoIn")}・${row}・${sceneLabel(brief, "logoOut")} のマーク`
      : `${row} のマーク`;
  }

  // Photographs are objects, not strings — EventPhoto carries a focus point and
  // a zoom alongside the pointer — so the pointer lives one level deeper than
  // the field. Matching `guests.0.photo` finds nothing; the real path is
  // `guests.0.photo.src`, which is what the brief on disk actually holds.
  const guest = /^guests\.(\d+)\.photo\.src$/.exec(path);
  if (guest) {
    const name = brief.guests[Number(guest[1])]?.name;
    return `${sceneLabel(brief, "guests")}${name ? ` ${name}` : ""} の写真`;
  }

  if (path === "visuals.value.src") return `${sceneLabel(brief, "value")} の背景`;
  if (path === "visuals.programs.src") return `${sceneLabel(brief, "program")} の背景`;
  if (path === "visuals.closing.src") return `${sceneLabel(brief, "cta")} の背景`;
  if (path === "bgm") return "BGM";
  if (path === "voice.audio") return "ボイス";

  // An unnamed path prints as itself. It looks like a bug because it is one —
  // a pointer the vocabulary has not learned — and a silent 「この動画には出て
  // いません」 would be a lie about a file the film draws.
  return path;
}

/** Every material this brief points at, and where. */
export function eventCmMaterialUsage(brief: EventCmBrief): Map<string, MaterialUse[]> {
  const found = collectMaterialPaths(brief);
  const usage = new Map<string, MaterialUse[]>();
  for (const [materialId, paths] of found) {
    usage.set(
      materialId,
      paths.map((path) => ({ label: describePath(brief, path), path })),
    );
  }
  return usage;
}

/** The same, as plain JSON for an API response. */
export const eventCmUsageRecord = (brief: EventCmBrief): Record<string, MaterialUse[]> =>
  Object.fromEntries(eventCmMaterialUsage(brief));

// What the video is called, and when to offer a better name.
//
// Two different titles live near each other and only one of them is the film's:
//
//   takes.title   the video's name — breadcrumb, sidebar, the video list. The
//                 user's, and nobody else writes it.
//   brief.title   the event's name, rendered on the title card. Facts change it:
//                 read a flyer and it becomes what the flyer says.
//
// They were the same string at creation, which made the second one look like it
// owned the first: a take created from a seeded proposal was *named* after that
// proposal, and after a flyer replaced the event entirely the sidebar still said
// 金融教育を、じっくり考える夜 while the film said something else.
//
// So: a new video is called 名称未設定 until somebody names it, and when the
// film's title and the video's name disagree we offer to sync them — offer,
// not do. Some people name their own work, and a tool that renames a file
// because it read a PDF has taken a decision that was not its to take.

import type { EventCmBrief } from "@/remotion/event-cm/types";

/** A video nobody has named. Not a placeholder to fill in silently — the point
 *  is that it reads as unnamed, so naming it is visibly the user's move. */
export const UNTITLED_VIDEO = "名称未設定";

export type TitleOfferInput = Pick<EventCmBrief, "title"> & {
  titleDeclined?: string | null;
};

/**
 * The name to offer for this video, or null when there is nothing to ask.
 *
 * Silent when the film has no title, when the two already agree, and when this
 * exact title was offered before and turned down. That last one is what stops
 * the question from coming back on every page load — a prompt that returns
 * after "no" is not a question, it is nagging.
 */
export function titleOffer(takeTitle: string, brief: TitleOfferInput): string | null {
  const proposed = brief.title?.trim() ?? "";
  if (!proposed) return null;
  if (proposed === takeTitle.trim()) return null;
  if (proposed === (brief.titleDeclined ?? "").trim()) return null;
  return proposed;
}

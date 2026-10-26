// Read-model types for V2 video Takes.

import type { VideoTemplateId } from "./templates";

/** One row of the video portal's list. */
export interface VideoSummary {
  /** V2 Take id. */
  id: string;
  brandId: string;
  template: VideoTemplateId;
  /**
   * The painting this take carries (`brief.artDirection`), for templates that
   * can be painted more than one way. Null when the brief does not say — which
   * the list labels as the legacy painting, the same way the renderer does.
   */
  artDirection: string | null;
  title: string;
  published: boolean;
  /** How far along this video is, for the list's status line. */
  state: VideoState;
  createdAt: string;
  /** Retained in the UI read model; V2 always returns false. */
  isPlaceholder: boolean;
}

export type VideoState =
  /** Nothing generated yet — the slot exists but is empty. */
  | "empty"
  /** Renderable in the browser right now. */
  | "preview_ready"
  /** An MP4 has been written. */
  | "mp4_ready";

export const VIDEO_STATE_LABEL: Record<VideoState, string> = {
  empty: "未作成",
  preview_ready: "プレビュー可",
  mp4_ready: "MP4あり",
};

/** What a take's state is derived from. The IO stays in the routes. */
export interface VideoStateInput {
  template: VideoTemplateId;
  /** An MP4 artifact this take has adopted. */
  hasRender: boolean;
  /** A brief the player could draw from. */
  hasBrief: boolean;
}

/**
 * How far along a video is — the one derivation, for every template.
 *
 * Written down once because it was written down twice: the portal's list and
 * the detail screen each branched on the template id, and they had drifted.
 * Nothing here names a template: a video plays from its brief from the moment
 * the take exists, and an exported MP4 is an exported MP4.
 */
export function videoState(input: VideoStateInput): VideoState {
  if (input.hasRender) return "mp4_ready";
  return input.hasBrief ? "preview_ready" : "empty";
}

// Remotion root for the CLI / Studio (the in-app <Player> imports the
// compositions directly and never goes through this file). Props are supplied
// per render via --props; without props a composition renders an empty canvas.

import React from "react";
import { Composition } from "remotion";
// Relative imports on purpose — the Remotion CLI's webpack does not resolve
// the "@/" tsconfig alias.
import {
  EVENT_FPS,
  EVENT_WIDTH,
  EVENT_HEIGHT,
  EVENT_DURATION_FRAMES,
} from "./event/EventComposition";
import {
  EventCmComposition,
  eventCmDurationInFrames,
} from "./event-cm/EventCmComposition";
import type { EventCmBrief } from "./event-cm/types";

/**
 * The narrated event film has no bundled brief to fall back on: a brief only
 * ever exists on a take, so the CLI is always given one through `--props` and
 * Studio opens on an empty canvas, rather than a fixture that would have to be
 * kept in step with the schema.
 */
const EventCmOrEmpty: React.FC<{ brief: EventCmBrief | null }> = ({ brief }) =>
  brief ? <EventCmComposition brief={brief} /> : null;

export const RemotionRoot: React.FC = () => {
  return (
    <>
    {/* Narrated event film. Length is never a constant here: the narration
        decides it, so the same derivation the player uses answers for the CLI
        (eventCmDurationInFrames → eventCmFilm). A fixed durationInFrames would
        cut the video off the moment somebody wrote a longer line. */}
    <Composition
      id="event-cm"
      component={EventCmOrEmpty}
      fps={EVENT_FPS}
      width={EVENT_WIDTH}
      height={EVENT_HEIGHT}
      durationInFrames={EVENT_DURATION_FRAMES}
      defaultProps={{ brief: null as EventCmBrief | null }}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.brief
          ? eventCmDurationInFrames(props.brief)
          : EVENT_DURATION_FRAMES,
        props,
      })}
    />
    </>
  );
};

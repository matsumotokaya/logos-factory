import React from "react";
import { Composition } from "remotion";
import {
  EventCmComposition,
  eventCmDurationInFrames,
  EVENT_FPS,
  EVENT_WIDTH,
  EVENT_HEIGHT,
} from "@/remotion/event-cm/EventCmComposition";
import { FreehandComposition } from "@/freehand/FreehandComposition";
import type { EventCmBrief } from "@/remotion/event-cm/types";
import briefJson from "../props.json";

const brief = briefJson as unknown as EventCmBrief;

export const Root: React.FC = () => (
  <>
    {/* The freehand cut — the same id `npm run render` targets, so the
        default render produces the experiment. The template's own output
        stays registered below as `event-cm-baseline`, which is the thing
        this lab exists to be compared against. */}
    <Composition
      id="event-cm"
      component={FreehandComposition}
      fps={EVENT_FPS}
      width={EVENT_WIDTH}
      height={EVENT_HEIGHT}
      durationInFrames={eventCmDurationInFrames(brief)}
      defaultProps={{ brief }}
      calculateMetadata={({ props }) => ({
        durationInFrames: eventCmDurationInFrames(props.brief),
        props,
      })}
    />
    <Composition
      id="event-cm-baseline"
      component={EventCmComposition}
      fps={EVENT_FPS}
      width={EVENT_WIDTH}
      height={EVENT_HEIGHT}
      durationInFrames={eventCmDurationInFrames(brief)}
      defaultProps={{ brief }}
      calculateMetadata={({ props }) => ({
        durationInFrames: eventCmDurationInFrames(props.brief),
        props,
      })}
    />
  </>
);

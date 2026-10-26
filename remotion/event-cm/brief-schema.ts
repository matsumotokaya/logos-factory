import { z } from "zod";
import {
  EventGuestSchema,
  EventLogoSchema,
  EventPhotoSchema,
  EventProgramSchema,
  EventScheduleSchema,
} from "@/remotion/event/brief-schema";
import { VoiceTrackSchema } from "@/lib/templates/voice-schema";
import {
  EVENT_CM_NARRATED_ROLES,
  eventCmSceneKey,
  type EventCmSceneRole,
} from "./types";

// Runtime shape of an EventCmBrief. Like the event-promo schema this validates
// STRUCTURE, not completeness.
//
// The scene list is the one place with a real constraint, and it has two legal
// states rather than one:
//
//   0 scenes — not written yet. A seeded take is created before the narration
//              stage runs, and the goal reports the narration as the one thing
//              still missing (lib/pipeline/event-cm.ts).
//   written  — one line per narrated scene, in film order, no repeats. Which
//              scenes those are depends on the facts: with nobody announced
//              there is no speaker picture, so a four-beat narration is complete
//              (types.ts `eventCmScenePlan`). What is never legal is a line for
//              a scene the film does not have, or the same scene twice.
//
// A half-written narration is what nothing produces on purpose and no renderer can
// use, so the schema refuses it rather than rendering a film with a silent gap.

export const EventCmSceneSchema = z.object({
  role: z.enum(EVENT_CM_NARRATED_ROLES as [string, ...string[]]),
  /** Which item, when the role repeats (one picture per programme). */
  index: z.number().int().min(0).optional(),
  text: z.string(),
  /** How to say the line, when its spelling cannot be read aloud (types.ts).
   *  Optional, and absent on every line that reads as it is written. */
  reading: z.string().optional(),
});

export const EventCmNarrationSchema = z
  .object({
    version: z.literal(1),
    scenes: z.array(EventCmSceneSchema),
    source: z.enum(["seed", "llm", "human"]),
    updatedAt: z.string(),
    angle: z.string(),
  })
  .refine(
    (narration) => {
      if (narration.scenes.length === 0) return true;
      // Roles keep the film's order, and a role may repeat ONLY as consecutive
      // indexed pictures — which is what a programme per picture is. So the
      // check is: role positions never go backwards, an index appears only where
      // the role legitimately repeats, and no two pictures are the same picture.
      const keys = narration.scenes.map((scene) =>
        eventCmSceneKey({ role: scene.role as EventCmSceneRole, index: scene.index }),
      );
      if (new Set(keys).size !== keys.length) return false;
      const positions = narration.scenes.map((scene) =>
        (EVENT_CM_NARRATED_ROLES as readonly string[]).indexOf(scene.role),
      );
      if (positions.some((position) => position < 0)) return false;
      return positions.every((position, at) => {
        if (at === 0) return true;
        const previous = positions[at - 1];
        if (position > previous) return true;
        // Same role twice: allowed when both are indexed and the index advances.
        return (
          position === previous &&
          narration.scenes[at].index !== undefined &&
          narration.scenes[at - 1].index !== undefined &&
          (narration.scenes[at].index as number) > (narration.scenes[at - 1].index as number)
        );
      });
    },
    {
      message: `scenes must be empty, or follow ${EVENT_CM_NARRATED_ROLES.join(" → ")} in that order (a role may repeat only as consecutive indexed scenes)`,
    },
  );

export const EventCmProvenanceSchema = z.record(
  z.string(),
  z.object({
    origin: z.enum(["brand", "extracted", "inferred", "user"]),
    note: z.string().optional(),
    /** Which material this value was read out of, when it was extracted. */
    source: z.string().optional(),
  }),
);

export const EventCmThemeSchema = z.object({
  palette: z
    .object({
      primary: z.string().optional(),
      accent: z.string().optional(),
      background: z.string().optional(),
      text: z.string().optional(),
    })
    .optional(),
  headingFont: z.string().nullable().optional(),
  bodyFont: z.string().nullable().optional(),
});

/** Three grounds, matching the three scenes that take one. See types.ts. */
export const EventCmVisualsSchema = z.object({
  value: EventPhotoSchema.nullable(),
  programs: EventPhotoSchema.nullable(),
  closing: EventPhotoSchema.nullable(),
});

/**
 * Its own object, not `EventBriefSchema.extend(...)`.
 *
 * Sharing the value schemas (a photo, a logo, a schedule) is the right kind of
 * sharing; inheriting event-promo's FIELD LIST was not — it is what gave
 * event-cm `sideCopy`, `visuals.inkArt` and `visuals.texture`, none of which any
 * event-cm scene draws (types.ts header).
 *
 * The rename does the cleanup by itself: zod strips unknown keys and every write
 * path saves `validateBrief`'s output, so the three dead fields leave the stored
 * briefs the next time one is saved. No migration — they are null in every row
 * and nothing reads them, so there is nothing to preserve or to break.
 */
export const EventCmBriefSchema = z.object({
  presenter: z.string(),
  seriesLabel: z.string(),
  title: z.string(),
  subtitle: z.string(),
  valueLines: z.array(z.string()),
  valueChip: z.string().nullable(),
  programsHeading: z.string(),
  programs: z.array(EventProgramSchema),
  guestsHeading: z.string(),
  guests: z.array(EventGuestSchema),
  schedule: EventScheduleSchema,
  cta: z.string(),
  footnote: z.string().nullable(),
  logos: z.array(EventLogoSchema),
  visuals: EventCmVisualsSchema,
  bgm: z.string().nullable(),
  provenance: EventCmProvenanceSchema.optional(),
  // The id of an art direction (remotion/kit/theme.ts). Not an enum here: the
  // schema validates saved briefs, and an unknown id resolves to the legacy
  // theme rather than making the whole brief unreadable.
  artDirection: z.string().optional(),
  theme: EventCmThemeSchema.optional(),
  factsUpdatedAt: z.string().optional(),
  titleDeclined: z.string().nullable().optional(),
  narration: EventCmNarrationSchema,
  /** Preset id of the chosen reader. A setting; the recording is derived. */
  narrator: z.string().optional(),
  voice: z
    .object({
      track: VoiceTrackSchema,
      audio: z.string().startsWith("material:"),
    })
    .optional(),
});

// Deliberately NOT validated here: whether the narration covers exactly the scenes
// this brief needs. Reading a flyer that names a speaker adds a scene, and the
// stored narration — written when there was no speaker — would instantly become
// invalid. Refusing to save a fact somebody just supplied is the wrong answer to
// it; `narrationIsStale` reports the mismatch and the map stage rewrites. The film
// keeps playing in the meantime, with the budget standing in for the line that
// has not been written yet (timeline.ts).

export type EventCmBriefInput = z.infer<typeof EventCmBriefSchema>;

import type { Scene, SceneBackdrop } from "../layout";
import type { SceneComponent } from "../components";
import { themeById, type Theme } from "../theme";

/** Plain kanji numerals for the agenda trio (stat variant "seal"). */
const KANJI_NUMERALS = ["一", "二", "三"] as const;
import type { EventPhoto } from "@/remotion/event/types";
import { eventCmScenePlan } from "@/remotion/event-cm/types";
import type { EventCmBrief } from "@/remotion/event-cm/types";
import type { EventCmSceneRole } from "@/remotion/event-cm/types";

// The narrated event promo, written in the vocabulary.
//
// This is the acceptance test for the whole rewrite: if 世界が恋する日本酒
// cannot be rebuilt from these seventeen components and seven arrangements,
// the vocabulary is not finished. Everything the hand-composed version did is
// either here or is a gap worth naming.
//
// What each scene gets is a real editorial decision, not a mapping table:
//
//   logoIn   the presenter's mark, knocked out, with the series above it.
//   title    the title. One hero per film, and this is it.
//   value    the promise, as verse, over the主役 photograph.
//   program  what happens, numbered.
//   guests   who speaks. Portraits, or monograms where there is no photograph.
//   cta      the date, the call, the credits. Space is the statement.
//   logoOut  the mark again, alone.
//
// Arrangements alternate deliberately (centre → centre → full-bleed → numbered
// → row → corner) because a film whose every scene is centred reads as a slide
// deck however well each slide is set.

/**
 * A ground, when there is a photograph for it.
 *
 * Written as a spread so that a scene with no photograph carries no `backdrop`
 * key at all, rather than an explicit `undefined` — the same distinction the
 * rest of the brief keeps between "nothing here" and "a value that is empty".
 */
const backdropFor = (
  photo: EventPhoto | null,
  weight: SceneBackdrop["weight"],
  field: string,
): { backdrop?: SceneBackdrop } =>
  photo ? { backdrop: { photo, weight, fields: [field] } } : {};

/**
 * The presenter's mark, alone.
 *
 * Both ends of the film are this scene: it opens so the viewer knows whose film
 * this is before anyone speaks, and closes so they remember. `logos[0]` is the
 * brand's own mark (lib/event-cm/seed.ts puts it there); with no image the
 * `logo` component sets the name as a mincho credit, which is the designed
 * answer rather than a gap.
 *
 * The closing plate drops the series label. By then it has been said, and the
 * last thing on screen should be one thing.
 */
function markScene(brief: EventCmBrief, opening: boolean): Scene {
  const mark = brief.logos[0] ?? null;
  const components: SceneComponent[] = [];
  if (opening && brief.seriesLabel) {
    components.push({ kind: "kicker", text: brief.seriesLabel, fields: ["seriesLabel"] });
  }
  components.push({
    kind: "logo",
    src: mark?.src ?? null,
    name: mark?.name ?? brief.presenter,
    scale: mark?.scale,
    // Painted by the theme, from its ground and what was measured about the
    // artwork (paint.ts `treatmentOn`). This used to force `knockout` on the
    // premise that "the stage is ink black" — true of every stage there was
    // until `standard`, and the reason the opening plate of a standard film
    // came out as a white mark on a white ground.
    treatment: mark?.treatment,
    opaque: mark?.opaque,
    luminance: mark?.luminance,
    emphasis: "hero",
    fields: ["logos"],
  });
  // The credit under the rule, unless the mark IS that credit.
  //
  // With no artwork the logo component draws its `name` as a typographic
  // credit, and that name is the brand's — the same string the presenter line
  // carries, since the seed fills both from `brand.name`. So every brand
  // without a logo file opened on its own name printed twice, with a rule
  // between the two copies. Guarded here rather than in the seed because the
  // duplication is a property of what gets DRAWN: a brand that supplies
  // artwork wants both, and it is this scene that knows which happened.
  const markIsTheCredit =
    !mark?.src && (mark?.name ?? brief.presenter) === brief.presenter;
  if (brief.presenter && !markIsTheCredit) {
    components.push({ kind: "rule", length: "short" });
    components.push({
      kind: "body",
      text: brief.presenter,
      emphasis: "caption",
      fields: ["presenter"],
    });
  }
  return { layout: "centre-stack", components };
}

/**
 * The title screen. The narration's first line calls this title.
 *
 * It stands on the programme photograph, as a hero — the film's most dynamic
 * picture opening its most important line (Freehand's casting, kept). One
 * photograph reads as several shots when its scenes treat it differently:
 * here at full presence under the title, in the agenda dimmed behind a list.
 */
function titleScene(brief: EventCmBrief): Scene {
  const components: SceneComponent[] = [
    { kind: "heading", text: brief.title, fields: ["title"] },
  ];
  if (brief.subtitle) {
    components.push({ kind: "subheading", text: brief.subtitle, fields: ["subtitle"] });
  }
  return {
    layout: "centre-stack",
    components,
    ...backdropFor(brief.visuals.programs, "hero", "visuals.programs"),
  };
}

function valueScene(brief: EventCmBrief): Scene {
  const components: SceneComponent[] = [];
  if (brief.valueChip) {
    components.push({ kind: "chip", text: brief.valueChip, fields: ["valueChip"] });
  }
  if (brief.valueLines.length > 0) {
    components.push({
      kind: "lines",
      lines: brief.valueLines,
      emphasis: "primary",
      fields: ["valueLines"],
    });
  }
  // The photograph carries the frame and the promise sits over it, so it is the
  // scene's ground rather than one of its components. With no photograph the
  // theme's ink shows through, which is the designed state, not a hole.
  return {
    layout: "full-bleed-overlay",
    components,
    ...backdropFor(brief.visuals.value, "hero", "visuals.value"),
  };
}

/**
 * What happens — one programme at a time when there is more than one.
 *
 * A numbered list of three is three messages on one slide, and the narration
 * line for it can only manage 「いろいろあります」. Given its own picture, each
 * programme gets a number set large, its own words at a size that can be read,
 * and a line of narration that says what it actually is. With a single
 * programme (or none) the scene is the list it always was.
 */
function programScene(brief: EventCmBrief, index: number | undefined, theme: Theme): Scene {
  const components: SceneComponent[] = [];
  const at = index ?? 0;
  const one = brief.programs[at] ?? null;
  // How many agenda pictures this film actually has — the template's three,
  // less the ones deleted. Asked of the plan rather than of `programs.length`,
  // which counts items and no longer counts pictures.
  const total =
    eventCmScenePlan(brief).filter((scene) => scene.role === "program").length ||
    1;

  if (brief.programsHeading) {
    components.push({
      kind: "kicker",
      text: brief.programsHeading,
      fields: ["programsHeading"],
    });
  }
  // The numeral is the scene's own structure: it says which of how many without
  // a word, which is what lets three consecutive pictures read as one programme
  // each rather than as three unrelated slides. Drawn even when the slot has no
  // item yet, because the template has three agenda pictures whatever this
  // event has put in them — the earlier fallback borrowed the WHOLE list for an
  // unfilled slot, which said the same thing three times.
  //
  // Which register the numeral is set in is the art direction's decision, not
  // this scene's (theme.ts `ornament.numerals`). 墨: plain kanji in a seal box
  // — the digits read as pagination, the formal 壱弐参 as overdressed (client
  // call), and 一二三 in a hairline square is the register an invitation
  // actually uses. Standard: 01 02 03, because in a gothic face 「一」 is a
  // bar. The latin micro-label carries the "of three" in both.
  const unit = `PROGRAM ${at + 1} / ${total}`;
  components.push(
    theme.ornament.numerals === "kanji-seal"
      ? {
          kind: "stat",
          value: KANJI_NUMERALS[at % KANJI_NUMERALS.length],
          unit,
          variant: "seal",
          fields: ["programs"],
        }
      : {
          kind: "stat",
          value: String(at + 1).padStart(2, "0"),
          unit,
          variant: "ordinal",
          fields: ["programs"],
        },
  );
  if (one) {
    components.push({
      kind: "lines",
      lines: [one.title],
      emphasis: "primary",
      fields: ["programs"],
    });
  }
  // Held well back (`support`): the list is what this scene says, and the room
  // it was photographed in is what it says it in.
  return {
    layout: "numbered-stack",
    components,
    ...backdropFor(brief.visuals.programs, "support", "visuals.programs"),
  };
}

/**
 * Who speaks — as the art direction presents speakers (theme.ts
 * `ornament.people`).
 *
 * `panels`: the speakers ARE the scene, so they fill it — portrait panels split
 * by a hairline seam, names set into each panel's own shadow. No heading, since
 * the overlay slot sits exactly where the panels set their names and two faces
 * filling the frame do not need to be captioned 「登壇者」.
 *
 * `row`: the corporate speaker list — ring-bounded avatars abreast under the
 * heading, each with its name and, under that, the title and company. The
 * heading comes back because a row of medallions does not announce what it is.
 *
 * The list and each portrait are offered as separate fields either way:
 * correcting who is announced and choosing the picture of one of them are
 * different decisions, and the storyboard panel has to be able to offer both.
 */
function guestsScene(brief: EventCmBrief, theme: Theme): Scene {
  const fields = [
    "guests",
    ...brief.guests.map((_, index) => `guests[${index}].photo`),
  ];

  if (theme.ornament.people === "row") {
    const components: SceneComponent[] = [];
    if (brief.guestsHeading) {
      components.push({
        kind: "kicker",
        text: brief.guestsHeading,
        fields: ["guestsHeading"],
      });
    }
    components.push({
      kind: "people",
      people: brief.guests,
      presentation: "row",
      // `primary`, not `hero`: in this arrangement the speakers are a list the
      // scene presents, not the picture itself. Hero here would set the names
      // at title size and leave no room for the titles under them.
      emphasis: "primary",
      fields,
    });
    // Standing on the theme's own ground on purpose. The lab's verdict on a
    // medallion row was "small circles floating in empty space" — true of a
    // cinematic film with an empty upper frame, and the reason `standard` has
    // a `groundWash` instead (theme.ts `palette.groundWash`).
    return { layout: "row", components };
  }

  return {
    layout: "full-bleed-overlay",
    components: [
      {
        kind: "people",
        people: brief.guests,
        presentation: "panels",
        emphasis: "hero",
        fields,
      },
    ],
  };
}

function ctaScene(brief: EventCmBrief): Scene {
  const components: SceneComponent[] = [
    {
      kind: "datetime",
      date: brief.schedule.date,
      weekday: brief.schedule.weekday,
      time: brief.schedule.time,
      // One component, three facts. The storyboard offers all three rather than
      // picking one, because "直す" on a date that shows a time too would
      // silently be the wrong field.
      fields: ["schedule.date", "schedule.time", "schedule.weekday"],
    },
  ];
  // Facts nobody confirmed never appear. A null venue leaves rather than
  // becoming "未定" (deliverable-architecture §17.2).
  if (brief.schedule.venue) {
    components.push({
      kind: "body",
      text: brief.schedule.venue,
      emphasis: "caption",
      fields: ["schedule.venue"],
    });
  }
  if (brief.schedule.fee) {
    components.push({
      kind: "body",
      text: brief.schedule.fee,
      emphasis: "caption",
      fields: ["schedule.fee"],
    });
  }
  components.push({ kind: "rule", length: "short" });
  if (brief.cta) components.push({ kind: "cta", text: brief.cta, fields: ["cta"] });
  if (brief.logos.length > 0) {
    components.push({
      kind: "logoRow",
      // Passed through as recorded. How each mark is painted is the theme's
      // answer, derived from its ground and the measurement (paint.ts
      // `treatmentOn`) — this used to force `knockout`, which assumed the
      // credits row could only ever sit on ink.
      logos: brief.logos.map((logo) => ({ ...logo })),
      fields: ["logos"],
    });
  }
  if (brief.footnote) {
    components.push({
      kind: "body",
      text: brief.footnote,
      emphasis: "caption",
      fields: ["footnote"],
    });
  }
  return {
    layout: "corner-credit",
    components,
    ...backdropFor(brief.visuals.closing, "support", "visuals.closing"),
  };
}

/**
 * The one picture for one scene role.
 *
 * One message per picture, one line of narration per picture. An earlier version
 * returned two scenes for `program` when there were speakers, which meant a
 * single narration line ran across a cut — and the storyboard and the film then
 * disagreed about how many times the screen changes. Speakers are their own
 * scene now, with their own line, and are dropped entirely when nobody is
 * announced (`eventCmScenePlan`).
 */
export function sceneForRole(
  role: EventCmSceneRole,
  brief: EventCmBrief,
  /** Which item, for roles that repeat (programmes). */
  index?: number,
  /**
   * The art direction the scene will be painted in. film.ts passes the one it
   * resolved (the brand-dressed theme); a caller without one gets the brief's
   * own answer, which is what the film would resolve to anyway. Only the
   * programme scene reads it today — for the numeral register.
   */
  theme: Theme = themeById(brief.artDirection),
): Scene {
  switch (role) {
    case "logoIn":
      return markScene(brief, true);
    case "title":
      return titleScene(brief);
    case "value":
      return valueScene(brief);
    case "program":
      return programScene(brief, index, theme);
    case "guests":
      return guestsScene(brief, theme);
    case "cta":
      return ctaScene(brief);
    case "logoOut":
      return markScene(brief, false);
  }
}

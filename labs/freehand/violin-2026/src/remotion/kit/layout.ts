// How a scene arranges what it holds.
//
// A finite list on purpose. This is the layer that keeps output from looking
// systematic OR looking random: the arrangements are the ones commercial
// announcement video actually uses, so choosing among them is a real choice
// with no bad options — unlike a free canvas, where most placements are wrong,
// and unlike one fixed composition, where every film is the same film.
//
// An LLM picks the arrangement and the order of components. It never picks
// coordinates. Everything below resolves to flex, so a dropped or empty
// component closes the layout up instead of leaving a hole.

import type { SceneComponent } from "./components";
import type { EventPhoto } from "@/remotion/event/types";

export const SCENE_LAYOUTS = [
  /** Everything stacked and centred. The default; carries a title reveal. */
  "centre-stack",
  /** Copy on the left, a figure or portrait on the right. */
  "split-copy-figure",
  /** The mirror: figure left, copy right. Alternating these across scenes is
   *  what stops a film reading as a slide deck. */
  "split-figure-copy",
  /** A photo fills the frame; copy sits over it, bottom-left. */
  "full-bleed-overlay",
  /** Items abreast — three programmes, three speakers. */
  "row",
  /** Items stacked with large numerals beside them. */
  "numbered-stack",
  /** Small copy pinned to a corner over a mostly empty stage. Used for
   *  credits and closings, where the space IS the statement. */
  "corner-credit",
] as const;

export type SceneLayout = (typeof SCENE_LAYOUTS)[number];

/**
 * The stage itself.
 *
 * The margins are generous and the same for every arrangement: in this kind of
 * film the breathing room IS the art direction. Here rather than in the renderer
 * because the storyboard has to draw the same stage — a diagram with its own
 * margins would describe a composition nobody is making.
 */
export const STAGE = { width: 1920, height: 1080, padX: 132, padY: 96 } as const;

/**
 * How a region sits on the stage, as plain values.
 *
 * Deliberately not `React.CSSProperties`: this module is the contract and stays
 * free of React, so both the Remotion renderer and the plain-DOM storyboard can
 * read it. The property names line up with CSS, so each consumer spreads them
 * into whatever it draws with.
 */
export interface RegionGeometry {
  alignItems: "center" | "flex-start" | "flex-end" | "stretch";
  justifyContent: "center" | "flex-start" | "flex-end" | "stretch";
  textAlign: "center" | "left" | "right";
  /** Occupies one half of the stage; the other slot takes the rest. */
  half: "left" | "right" | null;
  /** Ignores the stage margins and reaches the edges. */
  bleed: boolean;
}

export const REGION_GEOMETRY: Record<LayoutSlot["region"], RegionGeometry> = {
  centre: {
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    half: null,
    bleed: false,
  },
  left: {
    alignItems: "flex-start",
    justifyContent: "center",
    textAlign: "left",
    half: "left",
    bleed: false,
  },
  right: {
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    half: "right",
    bleed: false,
  },
  "bottom-left": {
    alignItems: "flex-start",
    justifyContent: "flex-end",
    textAlign: "left",
    half: null,
    bleed: false,
  },
  "bottom-right": {
    alignItems: "flex-end",
    justifyContent: "flex-end",
    textAlign: "right",
    half: null,
    bleed: false,
  },
  full: {
    alignItems: "stretch",
    justifyContent: "stretch",
    textAlign: "center",
    half: null,
    bleed: true,
  },
};

export interface LayoutSlot {
  /** Where this group sits. Resolved to flex by the renderer. */
  region: "centre" | "left" | "right" | "bottom-left" | "bottom-right" | "full";
  /** Cross-axis alignment of the group's own contents. */
  align: "start" | "centre" | "end";
  /** Gap between components in this group, in composition pixels. */
  gap: number;
}

export interface LayoutSpec {
  /** Named groups, in draw order. A scene's components are distributed across
   *  them by the renderer, in the order the scene lists them. */
  slots: LayoutSlot[];
  /**
   * How many components this arrangement holds well. Beyond it the stage gets
   * crowded, and the scene is asked to drop rather than shrink everything —
   * the same honesty rule as the fitter (fit.ts).
   */
  capacity: number;
  /**
   * Which side of the frame the copy occupies — where a backdrop photograph
   * must yield to type. This is the arrangement's knowledge, not the scene's:
   * the scene says WHAT stands behind it, the layout knows WHERE its words
   * sit, and the theme says how dark the yielding side goes
   * (ThemeBackdrop.directional). `centre` means no side is safe, so the
   * renderer falls back to the theme's radial scrim.
   */
  copySide: "left" | "right" | "bottom" | "centre";
}

export const LAYOUTS: Record<SceneLayout, LayoutSpec> = {
  "centre-stack": {
    slots: [{ region: "centre", align: "centre", gap: 36 }],
    capacity: 5,
    copySide: "centre",
  },
  "split-copy-figure": {
    slots: [
      { region: "left", align: "start", gap: 28 },
      { region: "right", align: "centre", gap: 20 },
    ],
    capacity: 6,
    copySide: "left",
  },
  "split-figure-copy": {
    slots: [
      { region: "left", align: "centre", gap: 20 },
      { region: "right", align: "start", gap: 28 },
    ],
    capacity: 6,
    copySide: "right",
  },
  "full-bleed-overlay": {
    slots: [
      { region: "full", align: "centre", gap: 0 },
      { region: "bottom-left", align: "start", gap: 24 },
    ],
    capacity: 4,
    copySide: "left",
  },
  row: {
    slots: [{ region: "centre", align: "centre", gap: 72 }],
    capacity: 4,
    copySide: "bottom",
  },
  "numbered-stack": {
    // The left half, not the centre: this arrangement stands on a photograph
    // (the agenda scenes), and a centred full-width column walks its text
    // across the photograph's bright side. The copy keeps to the side the
    // scrim darkens — measured on the carry-back's first render, where the
    // programme titles crossed the lit glass and lost their edges.
    slots: [{ region: "left", align: "start", gap: 34 }],
    capacity: 4,
    copySide: "left",
  },
  "corner-credit": {
    slots: [{ region: "bottom-left", align: "start", gap: 22 }],
    // The closing plate holds more than any other arrangement, and legitimately
    // so: date, venue, fee, a rule, the call, the credits and a footnote is
    // what an announcement actually ends on. They crowd less than they count
    // because nearly all of them are set small.
    capacity: 7,
    copySide: "left",
  },
};

/**
 * A scene: an arrangement, the things in it, and how long it holds.
 *
 * `components` are listed most important first. The renderer distributes them
 * across the layout's slots and the fitter decides how loudly each is set, so
 * a scene never states a position or a size.
 */
/**
 * A photograph laid under the whole scene.
 *
 * The ground, not a component. A component is something the arrangement places
 * — it lands in a slot, it can be dropped by the fitter, it has an entrance.
 * A photograph filling the frame does none of that: it is what the scene is
 * standing on, and `numbered-stack` and `corner-credit` have no full-bleed slot
 * to put one in even though those are exactly the scenes that want a ground.
 *
 * `weight` says what the picture is FOR, and the theme decides how far it is
 * dimmed. The hand-composed sake film used 0.5 behind the promise and 0.22
 * behind the programme list — the same photograph treated differently because
 * in one scene it is the subject and in the other it is the room the words are
 * in. A scene naming an opacity would be a scene making the theme's decision.
 *
 * Absent is not a hole: the theme's ground shows through, which is the designed
 * state and the reason a film with no photographs at all is still finished.
 */
export interface SceneBackdrop {
  photo: EventPhoto;
  weight: "hero" | "support";
  /** Brief paths this ground came from, for the storyboard's correction panel. */
  fields?: string[];
}

export interface Scene {
  layout: SceneLayout;
  components: SceneComponent[];
  /** Optional interstitial plate shown before this scene, when the theme's
   *  transition is `card`. The text is the scene's own idea in a few words. */
  card?: string;
  backdrop?: SceneBackdrop;
}

/**
 * Which slot each component lands in.
 *
 * Figures (images, portraits, marks) go to the figure slot when the layout has
 * one, everything else to the copy slot. This is a rule rather than a choice
 * because putting a portrait in the text column is never what was meant.
 */
export function distribute(scene: Scene): SceneComponent[][] {
  const spec = LAYOUTS[scene.layout];
  const groups: SceneComponent[][] = spec.slots.map(() => []);
  if (spec.slots.length === 1) {
    groups[0] = [...scene.components];
    return groups;
  }

  const figureAt = spec.slots.findIndex(
    (slot) => slot.region === "right" || slot.region === "full",
  );
  const copyAt = spec.slots.findIndex((_, index) => index !== figureAt);
  const isFigure = (component: SceneComponent) =>
    component.kind === "image" ||
    component.kind === "person" ||
    component.kind === "people";

  for (const component of scene.components) {
    groups[isFigure(component) ? figureAt : copyAt].push(component);
  }
  return groups;
}

/** Components beyond what this arrangement holds well. */
export const overCapacity = (scene: Scene): SceneComponent[] =>
  scene.components.slice(LAYOUTS[scene.layout].capacity);

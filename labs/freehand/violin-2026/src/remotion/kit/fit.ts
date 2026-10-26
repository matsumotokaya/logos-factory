import {
  EMPHASIS_LEVELS,
  emphasisOf,
  isEmpty,
  textOf,
  type Emphasis,
  type SceneComponent,
} from "./components";
import type { Theme } from "./theme";

// Making any input legible.
//
// This is the reproducibility guarantee, and it is a TYPESETTING problem, not
// a generation problem. Nothing here asks a model to write shorter; it asks
// how large the words can be set and still fit, and answers deterministically.
//
// The order of concessions is fixed, loudest first:
//
//   1. Set it at the emphasis the scene asked for.
//   2. Step down the type scale, up to two steps. A long title set smaller is
//      still a designed title.
//   3. Report that it does not fit. The scene then drops its least important
//      component and asks again — a decision the layout makes, not the fitter.
//
// The one thing never done is silent overflow, because that is the failure
// mode that turns "any input works" into a lie.

/** Japanese full-width counts as one; Latin and digits as half. */
export function measure(text: string): number {
  let width = 0;
  for (const char of text.trim()) {
    width += /[\x20-\x7E｡-ﾟ]/.test(char) ? 0.5 : 1;
  }
  return width;
}

const linesNeeded = (text: string, charsPerLine: number): number =>
  Math.max(1, Math.ceil(measure(text) / charsPerLine));

const stepDown = (emphasis: Emphasis, steps: number): Emphasis => {
  const at = EMPHASIS_LEVELS.indexOf(emphasis);
  return EMPHASIS_LEVELS[Math.min(EMPHASIS_LEVELS.length - 1, at + steps)];
};

/** How many steps down the scale a component may go before it stops reading
 *  as the thing it is. Two is the limit: a hero at caption size is not a hero. */
const MAX_STEPS_DOWN = 2;

export type FitResult =
  | { kind: "fits"; emphasis: Emphasis; steppedDown: number; lines: number }
  | { kind: "overflows"; emphasis: Emphasis; lines: number; allowed: number };

/**
 * Set one component as loudly as it can be set.
 *
 * Empty components always fit: they either draw their designed substitute or
 * leave the stage (components.ts EMPTY_BEHAVIOUR), and neither needs room for
 * text.
 */
export function fitComponent(component: SceneComponent, theme: Theme): FitResult {
  const requested = emphasisOf(component);
  const texts = textOf(component).filter((text) => text.trim());
  if (isEmpty(component) || texts.length === 0) {
    return { kind: "fits", emphasis: requested, steppedDown: 0, lines: 0 };
  }

  for (let steps = 0; steps <= MAX_STEPS_DOWN; steps += 1) {
    const emphasis = stepDown(requested, steps);
    const step = theme.scale[emphasis];
    // Every string in a component gets its own line box; a list of three items
    // is three settings, not one paragraph of the three joined.
    const lines = texts.reduce(
      (total, text) => total + linesNeeded(text, step.charsPerLine),
      0,
    );
    const allowed = step.maxLines * Math.max(1, texts.length);
    if (lines <= allowed) {
      return { kind: "fits", emphasis, steppedDown: steps, lines };
    }
    if (steps === MAX_STEPS_DOWN) {
      return { kind: "overflows", emphasis, lines, allowed };
    }
  }
  // Unreachable: the loop always returns on its final iteration.
  return { kind: "overflows", emphasis: requested, lines: 0, allowed: 0 };
}

export interface SceneFit {
  /** Components that will be drawn, with the emphasis they ended up at. */
  placed: Array<{ component: SceneComponent; emphasis: Emphasis; steppedDown: number }>;
  /** Components dropped because the stage could not hold them. */
  dropped: SceneComponent[];
  /** True when nothing had to be dropped and nothing was stepped down. */
  clean: boolean;
}

/**
 * Fit a whole scene.
 *
 * Components are considered in the order given, which is the order of
 * importance: a scene lists what it most wants to say first. Anything that
 * cannot be set even two steps down is dropped rather than allowed to spill,
 * and the caller is told — a dropped programme list is a collection task, not
 * something to discover in the finished MP4.
 *
 * A scene is also allowed only one `hero`. Two things shouting is the most
 * common way a composed layout stops looking composed, so the second is
 * demoted rather than left to compete.
 */
export function fitScene(components: SceneComponent[], theme: Theme): SceneFit {
  const placed: SceneFit["placed"] = [];
  const dropped: SceneComponent[] = [];
  let heroTaken = false;

  for (const component of components) {
    const requested = emphasisOf(component);
    const demoted: SceneComponent =
      requested === "hero" && heroTaken
        ? ({ ...component, emphasis: "primary" } as SceneComponent)
        : component;

    const fit = fitComponent(demoted, theme);
    if (fit.kind === "overflows") {
      dropped.push(component);
      continue;
    }
    if (fit.emphasis === "hero") heroTaken = true;
    placed.push({ component: demoted, emphasis: fit.emphasis, steppedDown: fit.steppedDown });
  }

  return {
    placed,
    dropped,
    clean: dropped.length === 0 && placed.every((item) => item.steppedDown === 0),
  };
}

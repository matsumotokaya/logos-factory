// One scene on screen.
//
// The stage puts the theme's ground down, arranges the scene's components
// through the layout it asked for, and lets each one arrive on the theme's
// schedule. It never positions anything itself — regions resolve to flex, so a
// component that turned out empty or was dropped by the fitter simply closes
// the layout up.

import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import {
  distribute,
  LAYOUTS,
  REGION_GEOMETRY,
  STAGE,
  type Scene,
  type SceneBackdrop,
} from "../layout";
import { fitScene } from "../fit";
import { focusPosition, resolveSrc } from "../paint";
import { captionSafeBottom, type Theme } from "../theme";
import { KitComponent } from "./KitComponent";
import { enterDelay, sceneFade } from "./motion";
import type { LayoutSlot } from "../layout";
import type { Emphasis, SceneComponent } from "../components";

const ALIGN: Record<LayoutSlot["align"], React.CSSProperties["alignItems"]> = {
  start: "flex-start",
  centre: "center",
  end: "flex-end",
};

/**
 * The photograph a scene stands on.
 *
 * Cover, framed at the brief's focus point, dimmed by the theme, pushed slowly
 * for the length of the scene and covered by a scrim. The push is what keeps a
 * still photograph from reading as a paused video; the scrim is what lets any
 * photograph — including a bright one nobody art-directed — carry type.
 */
const Backdrop: React.FC<{
  backdrop: SceneBackdrop;
  theme: Theme;
  length: number;
  /** Where the layout puts its words — the side the photograph yields to. */
  copySide: "left" | "right" | "bottom" | "centre";
}> = ({ backdrop, theme, length, copySide }) => {
  const frame = useCurrentFrame();
  const [from, to] = theme.backdrop.push;
  const directional = theme.backdrop.directional;
  const tint = directional?.tint.join(",") ?? "";
  // Darkness only where the type is. The full-frame dim this replaces is the
  // measured reason backdrops used to read as black screens (theme.ts).
  const scrim =
    directional && copySide !== "centre"
      ? `linear-gradient(to ${copySide === "left" ? "right" : copySide === "right" ? "left" : "top"}, rgba(${tint},${directional.strength}) 0%, rgba(${tint},${directional.strength * 0.55}) ${Math.round(directional.reach * 0.45)}%, transparent ${directional.reach}%)`
      : theme.backdrop.scrim;
  return (
    <AbsoluteFill>
      <Img
        src={resolveSrc(backdrop.photo.src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: focusPosition(backdrop.photo),
          opacity: theme.backdrop.opacity[backdrop.weight],
          transform: `scale(${interpolate(frame, [0, Math.max(length, 1)], [from, to], {
            extrapolateRight: "clamp",
          })})`,
        }}
      />
      <AbsoluteFill style={{ background: scrim }} />
    </AbsoluteFill>
  );
};

export const Stage: React.FC<{
  scene: Scene;
  theme: Theme;
  /** Frames this scene holds — decided upstream by the narration timeline. */
  length: number;
}> = ({ scene, theme, length }) => {
  const frame = useCurrentFrame();
  const spec = LAYOUTS[scene.layout];

  // The fitter decides how loudly each component is set and which ones cannot
  // be set at all. Running it here, at draw time, means the same brief always
  // produces the same stage — no state to fall out of date.
  const fitted = fitScene(scene.components, theme);
  const emphasisFor = new Map<SceneComponent, Emphasis>(
    fitted.placed.map((item) => [item.component, item.emphasis]),
  );
  const kept: Scene = {
    ...scene,
    components: fitted.placed.map((item) => item.component),
  };
  const groups = distribute(kept);

  let order = 0;
  const fullBleed = spec.slots.some((slot) => slot.region === "full");
  // Content stays out of the letterbox bars: the bars overlay the frame, so a
  // stage padded only by its own margin would set type underneath them.
  const padY = Math.max(STAGE.padY, (theme.chrome.letterbox ?? 0) + 48);

  return (
    // `lang` and `wordBreak` sit HERE, on the one root, and nowhere else.
    //
    // Both are inherited, so one declaration reaches every component. Putting
    // them in `typeStyle()` instead would mean every future text component has
    // to remember them, and the one that forgets breaks Japanese lines in the
    // middle of words again — 「金融教育を、じっくり考/える夜」 rather than
    // 「金融教育を、/じっくり考える夜」.
    //
    // `auto-phrase` is not a style: a phrase broken mid-word is wrong in any
    // art direction, so it is not on the theme's palette of choices. What the
    // theme supplies is the LANGUAGE, without which the property does nothing
    // at all (theme.ts `lang`).
    <AbsoluteFill
      lang={theme.lang}
      style={{
        opacity: sceneFade(theme, frame, length),
        wordBreak: "auto-phrase",
      }}
    >
      {scene.backdrop ? (
        <Backdrop
          backdrop={scene.backdrop}
          theme={theme}
          length={length}
          copySide={spec.copySide}
        />
      ) : null}
      {groups.map((components, slotIndex) => {
        const slot = spec.slots[slotIndex];
        const geometry = REGION_GEOMETRY[slot.region];
        const isFull = geometry.bleed;
        return (
          <AbsoluteFill
            key={`${slot.region}-${slotIndex}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: slot.gap,
              padding: isFull ? 0 : `${padY}px ${STAGE.padX}px`,
              // The subtitle band owns the bottom of the frame; a region that
              // stacks against the bottom edge stops above it (theme.ts).
              ...(geometry.justifyContent === "flex-end" && !isFull
                ? { paddingBottom: captionSafeBottom(theme) }
                : {}),
              justifyContent: geometry.justifyContent,
              textAlign: geometry.textAlign,
              alignItems: isFull ? "stretch" : ALIGN[slot.align],
              // A split layout uses half the stage per side.
              ...(geometry.half === "left" ? { right: "50%" } : {}),
              ...(geometry.half === "right" && !fullBleed ? { left: "50%" } : {}),
            }}
          >
            {components.map((component, i) => (
              <KitComponent
                key={`${component.kind}-${slotIndex}-${i}`}
                component={component}
                theme={theme}
                emphasis={emphasisFor.get(component) ?? "secondary"}
                delay={enterDelay(order++)}
              />
            ))}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

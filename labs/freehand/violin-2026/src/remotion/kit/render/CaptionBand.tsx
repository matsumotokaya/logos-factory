// The subtitle band.
//
// Always drawn, never a scene's decision: most people watch this kind of film
// with the sound off, so a film whose words exist only as audio says nothing
// to them. It sits above every scene and below nothing.
//
// The default backdrop is a solid plate rather than a gradient. A gradient is
// prettier and cannot be trusted: a subtitle lands on photography, on gold
// rules, and on the scene's own typography, and blending with all of them is
// not possible. A plate says plainly that the subtitle is a separate layer —
// which reads better than a line that has half-disappeared into a picture.

import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Theme } from "../theme";
import { captionAt, type Caption } from "@/remotion/event-cm/captions";

/** Frames a caption takes to appear. Short: a subtitle that fades slowly
 *  reads as an effect, and the eye is already at the next line. */
const FADE = 4;

export const CaptionBand: React.FC<{ captions: Caption[]; theme: Theme }> = ({
  captions,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  const caption = captionAt(captions, nowMs);
  if (!caption) return null;

  const startFrame = (caption.fromMs / 1000) * fps;
  const endFrame = (caption.toMs / 1000) * fps;
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + FADE, Math.max(startFrame + FADE + 1, endFrame - FADE), endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const plate = theme.caption.backdrop === "plate";

  // Inside the bottom letterbox bar: black that is already there, so the line
  // never lands on the picture and never needs its own plate.
  if (theme.caption.backdrop === "bar") {
    const bar = theme.chrome.letterbox ?? 0;
    return (
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
        <div
          style={{
            height: bar,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            maxWidth: 1600,
            fontFamily: theme.textFont,
            fontWeight: 600,
            fontSize: theme.caption.size,
            lineHeight: 1.4,
            letterSpacing: "0.06em",
            color: theme.caption.color,
            opacity,
          }}
        >
          {caption.text}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      {theme.caption.backdrop === "scrim" ? (
        <AbsoluteFill
          style={{
            top: "auto",
            height: theme.caption.bottom + theme.caption.size * 3.4,
            background: `linear-gradient(to top, ${theme.palette.ground}cc 0%, ${theme.palette.ground}00 100%)`,
            opacity,
          }}
        />
      ) : null}
      <div
        style={{
          position: "relative",
          marginBottom: theme.caption.bottom,
          // Fitted to the line rather than spanning the frame: a full-width bar
          // letterboxes the film, while a fitted block stays a caption.
          maxWidth: 1320,
          // Generous horizontal padding so the plate never crops a character's
          // side bearing, which is what makes a tight box look like a mistake.
          padding: plate
            ? `${Math.round(theme.caption.size * 0.42)}px ${Math.round(theme.caption.size * 0.85)}px`
            : "0 96px",
          backgroundColor: plate ? theme.caption.plate : undefined,
          textAlign: "center",
          fontFamily: theme.textFont,
          fontSize: theme.caption.size,
          lineHeight: 1.5,
          letterSpacing: "0.04em",
          color: theme.caption.color,
          textShadow:
            theme.caption.backdrop === "shadow"
              ? `0 2px 12px ${theme.palette.ground}, 0 0 32px ${theme.palette.ground}`
              : undefined,
          opacity,
        }}
      >
        {caption.text}
      </div>
    </AbsoluteFill>
  );
};

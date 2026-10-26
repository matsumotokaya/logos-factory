// The 30s event promo — first template of the event/seminar axis (和モダン・
// ラグジュアリー art direction). Fixed scene timeline, no narration: built
// for muted autoplay with BGM. Driven entirely by an EventBrief; every asset
// slot (logos, portraits, scene photography, ink artwork, BGM) has a
// *designed* fallback so the video is complete with zero files and gets
// richer as files arrive. Consumed like the CM template: <Player> in-app,
// Remotion CLI for MP4.
//
// Remotion rules: animate only via useCurrentFrame/interpolate/spring —
// CSS transitions/animations do not render correctly.

import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";
import { resolveSrc } from "@/remotion/kit/paint";
import type { EventBrief, EventGuest, EventLogo, EventPhoto } from "./types";
import {
  EVENT_DURATION_FRAMES,
  EVENT_FAINT,
  EVENT_FPS,
  EVENT_GOLD,
  EVENT_GOLD_BRIGHT,
  EVENT_HEIGHT,
  EVENT_MUTED,
  EVENT_SCENES,
  EVENT_SERIF,
  EVENT_TEXT,
  EVENT_WIDTH,
} from "./palette";
import { EventBackground } from "./EventBackground";

export { EVENT_FPS, EVENT_WIDTH, EVENT_HEIGHT, EVENT_DURATION_FRAMES };

// A type alias (not an interface) on purpose: Remotion's <Composition>
// requires props assignable to Record<string, unknown>, which interfaces
// don't structurally satisfy.
export type EventVideoProps = {
  brief: EventBrief;
};

/**
 * A src is a staged path, a signed same-origin URL, or a staticFile name. The
 * first two are already loadable; only the last needs resolving.
 *
 * Kept as a name this template already uses, but the rule itself now lives in
 * the kit (`remotion/kit/paint.ts`) so the renderer and the storyboard cannot
 * end up with two answers — which is exactly what happened when the kit carried
 * an identity function instead.
 */
export const resolveMediaSrc = resolveSrc;

// ---------- shared motion helpers ----------

/** Scene-local fade in over `inFrames` and out over the scene's last 12. */
const sceneFade = (frame: number, length: number, inFrames = 14): number =>
  interpolate(frame, [0, inFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) *
  interpolate(frame, [length - 12, length - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/** Gentle rise+fade for a block, starting at `delay` (scene-local frames).
 *  A pure function of the frame — safe inside .map() unlike a hook. */
const rise = (frame: number, delay: number, distance = 26): React.CSSProperties => {
  const t = interpolate(frame, [delay, delay + 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ease = 1 - Math.pow(1 - t, 3);
  return { opacity: ease, transform: `translateY(${(1 - ease) * distance}px)` };
};

const focusPosition = (photo: EventPhoto): string => {
  const f = photo.focus ?? { x: 0.5, y: 0.5 };
  return `${f.x * 100}% ${f.y * 100}%`;
};

/**
 * Full-bleed scene photography with a slow Ken Burns push and a scrim.
 * Photos never carry text contrast on their own, so the scrim is part of the
 * component rather than something each scene remembers to add.
 */
const SceneBackdrop: React.FC<{
  photo: EventPhoto;
  length: number;
  /** Photo opacity under the scrim — programme/closing text needs it lower. */
  opacity?: number;
}> = ({ photo, length, opacity = 0.42 }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, length], [1.04, 1.13], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill>
      <Img
        src={resolveMediaSrc(photo.src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: focusPosition(photo),
          opacity,
          transform: `scale(${scale})`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(85% 75% at 50% 50%, rgba(11,13,19,0.42) 0%, rgba(11,13,19,0.92) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

/** Per-character staggered reveal for the big serif title. */
const CharReveal: React.FC<{
  text: string;
  delay: number;
  perChar?: number;
  style?: React.CSSProperties;
}> = ({ text, delay, perChar = 4, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", justifyContent: "center", ...style }}>
      {Array.from(text).map((ch, i) => {
        const start = delay + i * perChar;
        const t = interpolate(frame, [start, start + 20], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const ease = 1 - Math.pow(1 - t, 3);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: ease,
              transform: `translateY(${(1 - ease) * 30}px)`,
              filter: `blur(${(1 - ease) * 6}px)`,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/** Thin gold rule that wipes open from the center. */
const GoldRule: React.FC<{ width: number; delay: number }> = ({ width, delay }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        width,
        height: 1,
        background: `linear-gradient(90deg, transparent, ${EVENT_GOLD_BRIGHT}, transparent)`,
        transform: `scaleX(${1 - Math.pow(1 - t, 3)})`,
        opacity: t,
      }}
    />
  );
};

const SceneShell: React.FC<{ length: number; children: React.ReactNode }> = ({
  length,
  children,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        opacity: sceneFade(frame, length),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// ---------- scenes ----------

export const SeriesScene: React.FC<{ brief: EventBrief; length: number }> = ({ brief, length }) => {
  const frame = useCurrentFrame();
  const texture = brief.visuals.texture;
  return (
    <SceneShell length={length}>
      {texture && (
        <AbsoluteFill>
          <Img
            src={resolveMediaSrc(texture)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              // Grain, not imagery: enough to keep the opening from reading as
              // flat CSS, far too faint to be recognisable as a photo.
              opacity: 0.14,
              mixBlendMode: "screen",
              transform: `scale(${interpolate(frame, [0, length], [1.02, 1.08])})`,
            }}
          />
        </AbsoluteFill>
      )}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 34,
        }}
      >
        <GoldRule width={220} delay={4} />
        <div
          style={{
            ...rise(frame, 8),
            fontSize: 44,
            letterSpacing: "0.22em",
            color: EVENT_TEXT,
          }}
        >
          {brief.presenter}
        </div>
        <div
          style={{
            ...rise(frame, 16),
            fontSize: 30,
            letterSpacing: "0.18em",
            color: EVENT_MUTED,
          }}
        >
          {brief.seriesLabel}
        </div>
        <GoldRule width={220} delay={22} />
      </div>
    </SceneShell>
  );
};

export const TitleScene: React.FC<{ brief: EventBrief; length: number }> = ({ brief, length }) => {
  const frame = useCurrentFrame();
  const ink = brief.visuals.inkArt;
  return (
    <SceneShell length={length}>
      {ink && (
        // 「酒」 in brush script, oversized and bleeding off the left edge so it
        // balances the vertical copy on the right. Kept very faint on purpose:
        // at any strength where it reads as a picture it steals contrast from
        // the title sitting on top of it, so it works as texture instead.
        <Img
          src={resolveMediaSrc(ink)}
          style={{
            position: "absolute",
            height: 1040,
            width: "auto",
            left: -240,
            bottom: -170,
            opacity: interpolate(frame, [0, 44], [0, 0.065], { extrapolateRight: "clamp" }),
            transform: `scale(${interpolate(frame, [0, length], [1, 1.05])}) rotate(-4deg)`,
          }}
        />
      )}
      <CharReveal
        text={brief.title}
        delay={6}
        perChar={5}
        style={{
          fontSize: 128,
          fontWeight: 600,
          letterSpacing: "0.1em",
          color: EVENT_TEXT,
          textShadow: "0 0 60px rgba(11,13,19,0.9), 0 0 120px rgba(11,13,19,0.7)",
        }}
      />
      <div
        style={{
          ...rise(frame, 52),
          marginTop: 44,
          fontSize: 40,
          letterSpacing: "0.14em",
          color: EVENT_GOLD_BRIGHT,
        }}
      >
        {brief.subtitle}
      </div>
      {brief.sideCopy && (
        <div
          style={{
            position: "absolute",
            right: 96,
            top: 220,
            writingMode: "vertical-rl",
            fontSize: 25,
            letterSpacing: "0.3em",
            color: EVENT_FAINT,
            height: 640,
            opacity: rise(frame, 70).opacity,
          }}
        >
          {brief.sideCopy}
        </div>
      )}
    </SceneShell>
  );
};

export const ValueScene: React.FC<{ brief: EventBrief; length: number }> = ({ brief, length }) => {
  const frame = useCurrentFrame();
  const photo = brief.visuals.value;
  return (
    <SceneShell length={length}>
      {photo && <SceneBackdrop photo={photo} length={length} opacity={0.5} />}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {brief.valueLines.map((line, i) => (
          <div
            key={line}
            style={{
              ...rise(frame, 8 + i * 14),
              fontSize: 84,
              fontWeight: 600,
              letterSpacing: "0.06em",
              lineHeight: 1.5,
              color: EVENT_TEXT,
              textShadow: "0 4px 40px rgba(11,13,19,0.9)",
            }}
          >
            {line}
          </div>
        ))}
        {brief.valueChip && (
          <div
            style={{
              ...rise(frame, 44),
              marginTop: 52,
              border: `1px solid ${EVENT_GOLD}`,
              background: "rgba(11,13,19,0.35)",
              color: EVENT_GOLD_BRIGHT,
              fontSize: 32,
              letterSpacing: "0.16em",
              padding: "20px 56px",
            }}
          >
            {brief.valueChip}
          </div>
        )}
      </div>
    </SceneShell>
  );
};

export const ProgramsScene: React.FC<{ brief: EventBrief; length: number }> = ({ brief, length }) => {
  const frame = useCurrentFrame();
  const photo = brief.visuals.programs;
  return (
    <SceneShell length={length}>
      {photo && <SceneBackdrop photo={photo} length={length} opacity={0.22} />}
      <div style={{ position: "relative" }}>
        <div
          style={{
            ...rise(frame, 4),
            fontSize: 30,
            letterSpacing: "0.3em",
            color: EVENT_GOLD_BRIGHT,
            marginBottom: 64,
          }}
        >
          {brief.programsHeading}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 44, maxWidth: 1360 }}>
          {brief.programs.map((p, i) => (
            <div
              key={p.title}
              style={{
                ...rise(frame, 16 + i * 18),
                display: "flex",
                alignItems: "center",
                gap: 40,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontSize: 58,
                  color: EVENT_GOLD,
                  letterSpacing: "0.04em",
                  fontStyle: "italic",
                  width: 92,
                  flexShrink: 0,
                  textAlign: "center",
                }}
              >
                {`0${i + 1}`}
              </span>
              <span
                style={{
                  width: 1,
                  alignSelf: "stretch",
                  background: "rgba(201,164,92,0.4)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 40,
                  lineHeight: 1.55,
                  color: EVENT_TEXT,
                  textShadow: "0 2px 24px rgba(11,13,19,0.85)",
                }}
              >
                {p.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    </SceneShell>
  );
};

/**
 * Circular portrait cut from a landscape frame. The brief's focus point is
 * placed exactly at the medallion's centre by translating the image by that
 * fraction of its own size — so framing needs no source aspect ratio and no
 * pre-cropped derivative file.
 */
const GuestPortrait: React.FC<{ guest: EventGuest; size: number }> = ({ guest, size }) => {
  const photo = guest.photo;
  if (photo) {
    const f = photo.focus ?? { x: 0.5, y: 0.5 };
    const zoom = photo.zoom ?? 1;
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          padding: 4,
          border: `1px solid ${EVENT_GOLD}`,
          boxShadow: "0 0 60px rgba(201,164,92,0.14)",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            overflow: "hidden",
          }}
        >
          <Img
            src={resolveMediaSrc(photo.src)}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              height: size * zoom,
              width: "auto",
              maxWidth: "none",
              transform: `translate(${-f.x * 100}%, ${-f.y * 100}%)`,
            }}
          />
        </div>
      </div>
    );
  }
  // Designed fallback: a monogram medallion — the guest's family-name
  // character inside a thin gold ring. Intentional, not a missing-image box.
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1px solid ${EVENT_GOLD}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(60% 60% at 50% 40%, rgba(201,164,92,0.14), rgba(201,164,92,0.02))",
      }}
    >
      <span style={{ fontSize: size * 0.42, color: EVENT_GOLD_BRIGHT }}>
        {Array.from(guest.name)[0]}
      </span>
    </div>
  );
};

export const GuestsScene: React.FC<{ brief: EventBrief; length: number }> = ({ brief, length }) => {
  const frame = useCurrentFrame();
  return (
    <SceneShell length={length}>
      <div
        style={{
          ...rise(frame, 4),
          fontSize: 30,
          letterSpacing: "0.3em",
          color: EVENT_GOLD_BRIGHT,
          marginBottom: 68,
        }}
      >
        {brief.guestsHeading}
      </div>
      <div style={{ display: "flex", gap: 110, alignItems: "flex-start" }}>
        {brief.guests.map((g, i) => (
          <div
            key={g.name}
            style={{
              ...rise(frame, 14 + i * 14),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: 360,
            }}
          >
            <GuestPortrait guest={g} size={240} />
            <div
              style={{
                marginTop: 38,
                fontSize: 46,
                letterSpacing: "0.12em",
                color: EVENT_TEXT,
              }}
            >
              {g.name}
            </div>
            {/* pre-line: briefs control awkward wraps with explicit \n */}
            <div
              style={{
                marginTop: 16,
                fontSize: 25,
                lineHeight: 1.6,
                color: EVENT_MUTED,
                whiteSpace: "pre-line",
              }}
            >
              {g.role}
            </div>
          </div>
        ))}
      </div>
    </SceneShell>
  );
};

/** Base height of the closing credit row's logos, before per-logo `scale`. */
const LOGO_BASE_HEIGHT = 64;

const LogoSlot: React.FC<{ logo: EventLogo }> = ({ logo }) => {
  if (logo.src) {
    const height = LOGO_BASE_HEIGHT * (logo.scale ?? 1);
    return (
      <Img
        src={resolveMediaSrc(logo.src)}
        style={{
          height,
          width: "auto",
          maxWidth: 300,
          objectFit: "contain",
          // `invert` carries a single-colour dark asset (e.g. a black-only
          // SVG) onto the ink canvas. Assets that were opaque are knocked out
          // ahead of time by prepare-assets.mjs and need nothing here.
          filter: logo.treatment === "invert" ? "invert(1)" : undefined,
          opacity: 0.92,
        }}
      />
    );
  }
  // Typographic fallback — the partner's name set in serif, reads as a
  // deliberate credit line rather than a missing logo.
  return (
    <span style={{ fontSize: 33, letterSpacing: "0.14em", color: EVENT_TEXT, opacity: 0.92 }}>
      {logo.name}
    </span>
  );
};

export const ClosingScene: React.FC<{ brief: EventBrief; length: number }> = ({ brief, length }) => {
  const frame = useCurrentFrame();
  const photo = brief.visuals.closing;
  const details = [brief.schedule.venue, brief.schedule.fee].filter(Boolean).join("　");
  return (
    <SceneShell length={length}>
      {photo && <SceneBackdrop photo={photo} length={length} opacity={0.24} />}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            ...rise(frame, 4),
            fontSize: 34,
            letterSpacing: "0.16em",
            color: EVENT_MUTED,
            textShadow: "0 2px 28px rgba(11,13,19,0.9)",
          }}
        >
          {brief.title}
        </div>
        <div
          style={{
            ...rise(frame, 12),
            marginTop: 36,
            display: "flex",
            alignItems: "baseline",
            gap: 36,
            color: EVENT_TEXT,
            textShadow: "0 4px 40px rgba(11,13,19,0.9)",
          }}
        >
          <span style={{ fontSize: 108, letterSpacing: "0.05em" }}>{brief.schedule.date}</span>
          <span style={{ fontSize: 44, color: EVENT_GOLD_BRIGHT }}>{brief.schedule.weekday}</span>
          <span style={{ fontSize: 52 }}>{brief.schedule.time}</span>
        </div>
        {details && (
          <div style={{ ...rise(frame, 22), marginTop: 24, fontSize: 30, color: EVENT_MUTED }}>
            {details}
          </div>
        )}
        <div
          style={{
            ...rise(frame, 30),
            marginTop: 44,
            border: `1px solid ${EVENT_GOLD}`,
            background: "rgba(11,13,19,0.35)",
            color: EVENT_GOLD_BRIGHT,
            fontSize: 31,
            letterSpacing: "0.16em",
            padding: "20px 64px",
          }}
        >
          {brief.cta}
        </div>
        {brief.footnote && (
          <div style={{ ...rise(frame, 38), marginTop: 26, fontSize: 21, color: EVENT_FAINT }}>
            {brief.footnote}
          </div>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 58,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 52,
          opacity: rise(frame, 46).opacity,
        }}
      >
        {brief.logos.map((logo, i) => (
          <React.Fragment key={logo.name}>
            {i > 0 && (
              <span style={{ width: 1, height: 40, background: "rgba(201,164,92,0.35)" }} />
            )}
            <LogoSlot logo={logo} />
          </React.Fragment>
        ))}
      </div>
    </SceneShell>
  );
};

// ---------- root ----------

export const EventComposition: React.FC<EventVideoProps> = ({ brief }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Music is the only audio here, so it carries the whole track. A short fade
  // in is enough — the supplied cue already opens quiet and builds, which is
  // why this doesn't ramp for longer.
  const bgmVolume = interpolate(
    frame,
    [0, 20, durationInFrames - 40, durationInFrames],
    [0, 0.62, 0.62, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ fontFamily: EVENT_SERIF, backgroundColor: "#0b0d13" }}>
      <EventBackground />
      {brief.bgm && <Audio src={resolveMediaSrc(brief.bgm)} volume={() => bgmVolume} loop />}
      <Sequence from={EVENT_SCENES.series.from} durationInFrames={EVENT_SCENES.series.length}>
        <SeriesScene brief={brief} length={EVENT_SCENES.series.length} />
      </Sequence>
      <Sequence from={EVENT_SCENES.title.from} durationInFrames={EVENT_SCENES.title.length}>
        <TitleScene brief={brief} length={EVENT_SCENES.title.length} />
      </Sequence>
      <Sequence from={EVENT_SCENES.value.from} durationInFrames={EVENT_SCENES.value.length}>
        <ValueScene brief={brief} length={EVENT_SCENES.value.length} />
      </Sequence>
      <Sequence from={EVENT_SCENES.programs.from} durationInFrames={EVENT_SCENES.programs.length}>
        <ProgramsScene brief={brief} length={EVENT_SCENES.programs.length} />
      </Sequence>
      <Sequence from={EVENT_SCENES.guests.from} durationInFrames={EVENT_SCENES.guests.length}>
        <GuestsScene brief={brief} length={EVENT_SCENES.guests.length} />
      </Sequence>
      <Sequence from={EVENT_SCENES.closing.from} durationInFrames={EVENT_SCENES.closing.length}>
        <ClosingScene brief={brief} length={EVENT_SCENES.closing.length} />
      </Sequence>
    </AbsoluteFill>
  );
};

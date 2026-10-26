// Drawing one component of the vocabulary.
//
// Every judgment the sake template made by hand — the gold rule that opens
// from the centre, the per-character title reveal, the monogram medallion
// standing in for a missing portrait, the vertical side copy — lives here now,
// as a property of the component rather than of one composition. That is the
// whole point of the rewrite: those decisions were good, and they were
// trapped.
//
// Nothing here reads a brief. A component is given its parameters, its
// emphasis and a theme, and draws. What goes in it is decided upstream.

import React from "react";
import { Img, interpolate, useCurrentFrame } from "remotion";
import {
  emphasisOf,
  isEmpty,
  type Emphasis,
  type PersonParams,
  type SceneComponent,
} from "../components";
import type { LogoTreatment } from "@/remotion/event/types";
import { captionSafeBottom, type Theme } from "../theme";
import { enterStyle } from "./motion";
import { focusPosition, markPainting, resolveSrc } from "../paint";
import { phraseBlocks } from "../phrase";

function typeStyle(theme: Theme, emphasis: Emphasis, display: boolean): React.CSSProperties {
  const step = theme.scale[emphasis];
  return {
    fontFamily: display ? theme.displayFont : theme.textFont,
    fontSize: step.size,
    lineHeight: step.lineHeight,
    letterSpacing: `${step.tracking}em`,
    color: theme.palette.ink,
  };
}

/**
 * Per-character staggered reveal. Reserved for the loudest text on a stage:
 * used everywhere it becomes a tic rather than an entrance.
 *
 * Characters are grouped into phrase blocks (../phrase.ts) and the flex wraps
 * between BLOCKS, never inside one. Animating per character makes every
 * character its own flex item, and a wrapping flex breaks between any two items
 * — which is why `word-break: auto-phrase` on the Stage root, correct for every
 * plain run in the film, changed nothing at all here. The title kept breaking
 * mid-word (「コンサルティングについ / て、話をします」) until this grouping
 * existed.
 *
 * The cascade counts through the whole string rather than restarting per block,
 * so the reveal still reads as one movement across the line.
 */
const CharReveal: React.FC<{
  text: string;
  delay: number;
  lang: string;
  style: React.CSSProperties;
}> = ({ text, delay, lang, style }) => {
  const frame = useCurrentFrame();
  const charStyle = (index: number): React.CSSProperties => {
    const start = delay + index * 4;
    const t = interpolate(frame, [start, start + 20], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const ease = 1 - Math.pow(1 - t, 3);
    return {
      display: "inline-block",
      opacity: ease,
      transform: `translateY(${(1 - ease) * 30}px)`,
      filter: `blur(${(1 - ease) * 6}px)`,
    };
  };

  let index = 0;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", ...style }}>
      {phraseBlocks(text, lang).map((block, blockIndex) => (
        <span
          key={`${block}-${blockIndex}`}
          // The block is the unit a line may break between, so it must not
          // break inside: `nowrap` is what actually holds the rule.
          style={{ display: "inline-block", whiteSpace: "nowrap" }}
        >
          {Array.from(block).map((char, charIndex) => (
            <span key={`${char}-${charIndex}`} style={charStyle(index++)}>
              {char === " " ? "\u00a0" : char}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
};

/** A hairline that opens from the centre. Structure in this art direction. */
const Rule: React.FC<{ theme: Theme; width: number; delay: number }> = ({
  theme,
  width,
  delay,
}) => {
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
        background: `linear-gradient(90deg, transparent, ${theme.palette.accentBright}, transparent)`,
        transform: `scaleX(${1 - Math.pow(1 - t, 3)})`,
        opacity: t,
      }}
    />
  );
};

/**
 * 「見本」 on a stock photograph.
 *
 * Muted, never accent. In this art direction gold means somebody decided —
 * a sample marked in gold reads as a chosen design rather than a placeholder,
 * which is the opposite of what it is for.
 */
const SampleTag: React.FC<{ theme: Theme }> = ({ theme }) => (
  <span
    style={{
      display: "inline-block",
      fontFamily: theme.textFont,
      fontSize: Math.round(theme.scale.caption.size * 0.78),
      letterSpacing: "0.18em",
      lineHeight: 1,
      padding: "5px 10px",
      color: theme.palette.muted,
      border: `1px solid ${theme.palette.muted}66`,
    }}
  >
    見本
  </span>
);

/**
 * A portrait, or the designed substitute for one.
 *
 * The monogram is not a placeholder: a gold-ringed medallion carrying the
 * family name is a finished way to present a speaker whose photo never
 * arrived, and it is why this template can ship with no assets at all.
 */
const Portrait: React.FC<{ theme: Theme; person: PersonParams; size: number }> = ({
  theme,
  person,
  size,
}) => {
  const initial = person.name.trim().charAt(0) || "・";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        border: `1px solid ${theme.palette.accent}`,
        boxShadow: `0 0 0 6px ${theme.palette.ground}, 0 0 40px rgba(0,0,0,0.5)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.palette.ground,
      }}
    >
      {person.photo ? (
        <Img
          src={resolveSrc(person.photo.src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: focusPosition(person.photo),
            transform: `scale(${person.photo.zoom ?? 1})`,
          }}
        />
      ) : (
        <span
          style={{
            fontFamily: theme.displayFont,
            fontSize: size * 0.42,
            color: theme.palette.accentBright,
          }}
        >
          {initial}
        </span>
      )}
    </div>
  );
};

const PersonBlock: React.FC<{ theme: Theme; person: PersonParams; size: number }> = ({
  theme,
  person,
  size,
}) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
    <Portrait theme={theme} person={person} size={size} />
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: theme.displayFont,
          fontSize: theme.scale.secondary.size,
          letterSpacing: "0.08em",
          color: theme.palette.ink,
        }}
      >
        {person.name}
      </div>
      {person.role ? (
        <div
          style={{
            marginTop: 8,
            fontFamily: theme.textFont,
            fontSize: theme.scale.caption.size,
            lineHeight: 1.6,
            letterSpacing: "0.12em",
            color: theme.palette.muted,
            whiteSpace: "pre-line",
          }}
        >
          {person.role}
        </div>
      ) : null}
      {person.photo?.sample ? (
        <div style={{ marginTop: 12 }}>
          <SampleTag theme={theme} />
        </div>
      ) : null}
    </div>
  </div>
);

/** A logo image, or its name set as a credit — the designed substitute.
 *  How it is painted is derived from the theme's ground and what was measured
 *  about the artwork; both rules live in ../paint.ts, shared with the
 *  storyboard. This used to default to `knockout`, which is correct on ink and
 *  paints an invisible white mark on the standard ground. */
const LogoMark: React.FC<{
  theme: Theme;
  src: string | null;
  name: string;
  scale?: number;
  height: number;
  treatment?: LogoTreatment;
  opaque?: boolean | null;
  luminance?: number | null;
}> = ({ theme, src, name, scale = 1, height, treatment, opaque, luminance }) => {
  // Two ways to end up with no artwork, and the same answer for both: there
  // was none, or there was some that provably cannot be seen on this ground.
  // Drawing an invisible mark is worse than drawing the name, because the frame
  // looks finished and is missing the one thing it was there to say.
  const painting = markPainting(theme.palette.ground, { treatment, opaque, luminance });
  return src && painting.draw === "artwork" ? (
    <Img
      src={resolveSrc(src)}
      style={{
        height: height * scale,
        width: "auto",
        objectFit: "contain",
        filter: painting.filter,
      }}
    />
  ) : (
    <span
      style={{
        fontFamily: theme.displayFont,
        fontSize: theme.scale.caption.size,
        letterSpacing: "0.2em",
        color: theme.palette.muted,
      }}
    >
      {name}
    </span>
  );
};

export const KitComponent: React.FC<{
  component: SceneComponent;
  theme: Theme;
  emphasis: Emphasis;
  /** Frame this component starts arriving on. */
  delay: number;
}> = ({ component, theme, emphasis, delay }) => {
  const frame = useCurrentFrame();
  const enter = enterStyle(theme, emphasis, frame, delay);
  const step = theme.scale[emphasis];

  // An empty component either draws its substitute (handled inside the pieces
  // above) or leaves. Text-only kinds leave.
  if (isEmpty(component) && component.kind !== "image") {
    const substitutes = ["person", "people", "logo", "logoRow"];
    if (!substitutes.includes(component.kind)) return null;
  }

  switch (component.kind) {
    case "kicker":
      return (
        <div
          style={{
            ...enter,
            ...typeStyle(theme, emphasis, false),
            letterSpacing: "0.34em",
            color: theme.palette.faint,
          }}
        >
          {component.text}
        </div>
      );

    case "heading":
      // The one place per stage that gets a character reveal.
      return emphasis === "hero" ? (
        <CharReveal
          text={component.text}
          delay={delay}
          lang={theme.lang}
          style={{
            ...typeStyle(theme, emphasis, true),
            fontWeight: 600,
            justifyContent: "center",
            textShadow: `0 0 60px ${theme.palette.ground}, 0 0 120px ${theme.palette.ground}`,
          }}
        />
      ) : (
        <div style={{ ...enter, ...typeStyle(theme, emphasis, true), fontWeight: 600 }}>
          {component.text}
        </div>
      );

    case "subheading":
      return (
        <div
          style={{
            ...enter,
            ...typeStyle(theme, emphasis, true),
            color: theme.palette.accentBright,
          }}
        >
          {component.text}
        </div>
      );

    case "lines":
      return (
        <div style={{ ...enter, ...typeStyle(theme, emphasis, true) }}>
          {component.lines.map((line, i) => (
            <div key={`${line}-${i}`}>{line}</div>
          ))}
        </div>
      );

    case "body":
      return (
        <div
          style={{
            ...enter,
            ...typeStyle(theme, emphasis, false),
            color: theme.palette.muted,
            maxWidth: step.charsPerLine * step.size,
          }}
        >
          {component.text}
        </div>
      );

    case "chip":
      return (
        <div
          style={{
            ...enter,
            ...typeStyle(theme, emphasis, false),
            display: "inline-block",
            padding: "10px 26px",
            border: `1px solid ${theme.palette.accent}`,
            color: theme.palette.accentBright,
            letterSpacing: "0.2em",
          }}
        >
          {component.text}
        </div>
      );

    case "list":
      return (
        <div style={{ ...enter, display: "flex", flexDirection: "column", gap: 26 }}>
          {component.items.map((item, i) => (
            <div key={`${item}-${i}`} style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
              {component.numbered !== false ? (
                <span
                  style={{
                    fontFamily: theme.displayFont,
                    fontSize: step.size * 1.15,
                    color: theme.palette.accent,
                    minWidth: step.size * 1.6,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              ) : null}
              <span style={typeStyle(theme, emphasis, false)}>{item}</span>
            </div>
          ))}
        </div>
      );

    case "person":
      return (
        <div style={enter}>
          <PersonBlock theme={theme} person={component.person} size={step.size * 5} />
        </div>
      );

    case "people":
      // Full-height panels: the speakers ARE the scene, not items on it.
      // Freehand Lab's measured verdict on the medallion row was "small
      // circles floating in empty space"; the panels are what replaced it.
      if (component.presentation === "panels") {
        return (
          <div style={{ display: "flex", width: "100%", height: "100%" }}>
            {component.people.map((person, i) => {
              const t = interpolate(frame, [delay + i * 8, delay + i * 8 + 22], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const ease = 1 - Math.pow(1 - t, 3);
              const dir = i === 0 ? -1 : 1;
              return (
                <div
                  key={`${person.name}-${i}`}
                  style={{
                    position: "relative",
                    flex: 1,
                    overflow: "hidden",
                    opacity: ease,
                    transform: `translateX(${(1 - ease) * dir * 60}px)`,
                    // The seam: a hairline of accent between panels, not a gap.
                    borderLeft: i > 0 ? `1px solid ${theme.palette.accent}66` : undefined,
                    backgroundColor: theme.palette.ground,
                  }}
                >
                  {person.photo ? (
                    <>
                      <Img
                        src={resolveSrc(person.photo.src)}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          objectPosition: focusPosition(person.photo),
                          transform: `scale(${person.photo.zoom ?? 1.06})`,
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: "46%",
                          background: `linear-gradient(to top, ${theme.palette.ground}e6 0%, transparent 100%)`,
                        }}
                      />
                    </>
                  ) : (
                    // No photograph: the medallion, centred on the ink — the
                    // same designed substitute, at panel scale.
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Portrait theme={theme} person={person} size={240} />
                    </div>
                  )}
                  <div
                    style={{
                      position: "absolute",
                      left: 90,
                      // Clear of BOTH the bar and the subtitle. A letterboxed
                      // theme puts its captions in chrome, so clearing the bar
                      // was enough; a theme without bars sets the plate inside
                      // the picture, and this name landed underneath it. max()
                      // rather than captionSafeBottom() alone so 墨 keeps the
                      // exact 196px it was approved at.
                      bottom: Math.max(
                        (theme.chrome.letterbox ?? 0) + 64,
                        captionSafeBottom(theme),
                      ),
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: theme.displayFont,
                        fontSize: theme.scale.primary.size,
                        fontWeight: 600,
                        letterSpacing: "0.1em",
                        color: theme.palette.ink,
                        textShadow: `0 2px 20px ${theme.palette.ground}`,
                      }}
                    >
                      {person.name}
                    </div>
                    {person.role ? (
                      <div
                        style={{
                          marginTop: 12,
                          fontFamily: theme.textFont,
                          fontSize: theme.scale.caption.size,
                          letterSpacing: "0.12em",
                          color: theme.palette.muted,
                          whiteSpace: "pre-line",
                        }}
                      >
                        {person.role}
                      </div>
                    ) : null}
                    {person.photo?.sample ? (
                      <div style={{ marginTop: 14 }}>
                        <SampleTag theme={theme} />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      return (
        <div style={{ ...enter, display: "flex", gap: 72, justifyContent: "center" }}>
          {component.people.map((person, i) => (
            <PersonBlock
              key={`${person.name}-${i}`}
              theme={theme}
              person={person}
              size={step.size * 4}
            />
          ))}
        </div>
      );

    case "logo":
      return (
        <div style={enter}>
          <LogoMark
            theme={theme}
            src={component.src}
            name={component.name}
            scale={component.scale}
            treatment={component.treatment}
            opaque={component.opaque}
            luminance={component.luminance}
            height={step.size * 1.6}
          />
        </div>
      );

    case "logoRow":
      return (
        <div
          style={{
            ...enter,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 56,
            flexWrap: "wrap",
          }}
        >
          {component.logos.map((logo, i) => (
            <LogoMark
              key={`${logo.name}-${i}`}
              theme={theme}
              src={logo.src}
              name={logo.name}
              scale={logo.scale}
              treatment={logo.treatment}
              opaque={logo.opaque}
              luminance={logo.luminance}
              height={step.size * 1.5}
            />
          ))}
        </div>
      );

    case "stat":
      // The ordinal: a large, light numeral with the unit on its baseline and
      // nothing around it — how a corporate deck numbers an agenda. The seal
      // below is the same statement in the 和 register; the theme picks
      // (theme.ts `ornament.numerals`).
      if (component.variant === "ordinal") {
        return (
          <div style={{ ...enter, display: "flex", alignItems: "baseline", gap: 26 }}>
            <span
              style={{
                fontFamily: theme.displayFont,
                fontWeight: 300,
                fontSize: step.size * 2.4,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: theme.palette.accent,
                fontVariantNumeric: "tabular-nums lining-nums",
              }}
            >
              {component.value}
            </span>
            {component.unit ? (
              <span
                style={{
                  fontFamily: theme.textFont,
                  fontSize: theme.scale.caption.size * 0.92,
                  letterSpacing: "0.5em",
                  color: theme.palette.accent,
                }}
              >
                {component.unit}
              </span>
            ) : null}
          </div>
        );
      }
      // The seal: a hairline box carrying the numeral, the unit riding beside
      // it small. Made for 一二三 — bare at 250px they read as bars, and the
      // formal 壱弐参 read as overdressed (both measured in the Freehand Lab).
      if (component.variant === "seal") {
        return (
          <div style={{ ...enter, display: "flex", alignItems: "flex-end", gap: 28 }}>
            <div
              style={{
                width: step.size * 3,
                height: step.size * 3,
                border: `1px solid ${theme.palette.accent}88`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `${theme.palette.ground}59`,
              }}
            >
              <span
                style={{
                  fontFamily: theme.displayFont,
                  fontWeight: 700,
                  fontSize: step.size * 1.7,
                  lineHeight: 1,
                  color: theme.palette.accentBright,
                  textShadow: `0 2px 24px ${theme.palette.ground}`,
                }}
              >
                {component.value}
              </span>
            </div>
            {component.unit ? (
              <span
                style={{
                  fontFamily: theme.textFont,
                  fontSize: theme.scale.caption.size * 0.92,
                  letterSpacing: "0.5em",
                  color: theme.palette.accent,
                  paddingBottom: 10,
                }}
              >
                {component.unit}
              </span>
            ) : null}
          </div>
        );
      }
      return (
        <div style={{ ...enter, textAlign: "center" }}>
          <span style={{ ...typeStyle(theme, emphasis, true), color: theme.palette.accentBright }}>
            {component.value}
          </span>
          {component.unit ? (
            <span
              style={{
                fontFamily: theme.displayFont,
                fontSize: step.size * 0.5,
                color: theme.palette.accent,
                marginLeft: 8,
              }}
            >
              {component.unit}
            </span>
          ) : null}
          {component.label ? (
            <div
              style={{
                marginTop: 10,
                fontFamily: theme.textFont,
                fontSize: theme.scale.caption.size,
                letterSpacing: "0.18em",
                color: theme.palette.muted,
              }}
            >
              {component.label}
            </div>
          ) : null}
        </div>
      );

    case "datetime":
      // Three sizes, always: the numerals carry, the weekday rides small
      // beside them, the time sits under. Every well-set announcement does
      // this, which is why it is one component and not three.
      return (
        <div style={{ ...enter, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            <span style={{ ...typeStyle(theme, emphasis, true), letterSpacing: "0.04em" }}>
              {component.date}
            </span>
            {component.weekday ? (
              <span
                style={{
                  fontFamily: theme.displayFont,
                  fontSize: step.size * 0.45,
                  letterSpacing: "0.24em",
                  color: theme.palette.accent,
                }}
              >
                {component.weekday}
              </span>
            ) : null}
          </div>
          {component.time ? (
            <span
              style={{
                fontFamily: theme.textFont,
                fontSize: theme.scale.caption.size,
                letterSpacing: "0.28em",
                color: theme.palette.muted,
              }}
            >
              {component.time}
            </span>
          ) : null}
        </div>
      );

    case "cta":
      return (
        <div
          style={{
            ...enter,
            ...typeStyle(theme, emphasis, false),
            letterSpacing: "0.2em",
            color: theme.palette.accentBright,
          }}
        >
          {component.text}
        </div>
      );

    case "image": {
      // Empty is not a hole: the theme's ground shows through, which is the
      // designed state (components.ts EMPTY_BEHAVIOUR.image).
      if (!component.photo) return null;
      const scale = interpolate(frame, [0, 240], [1.06, 1.14]);
      return (
        <Img
          src={resolveSrc(component.photo.src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: focusPosition(component.photo),
            opacity: enter.opacity,
            transform: `scale(${scale})`,
          }}
        />
      );
    }

    case "rule":
      return theme.ornament.rules ? (
        <Rule theme={theme} width={component.length === "full" ? 720 : 240} delay={delay} />
      ) : null;

    case "mark":
      return (
        <div
          style={{
            ...enter,
            fontFamily: theme.displayFont,
            fontSize: step.size,
            letterSpacing: "0.3em",
            color: theme.palette.accent,
          }}
        >
          {component.glyph ?? theme.ornament.markGlyph}
        </div>
      );
  }
};

/** Emphasis a component ends up at when nothing overrides it. */
export const defaultEmphasisOf = emphasisOf;

// The pictures, hand-composed. Eight of them since 2026-09-14: the guests
// picture is out (props.json suppresses it) and its people moved beside the
// programmes they appear in.
//
// Same words, same order, same lengths — eventCmFilm() decides those and this
// file never argues with it. What is free here is everything visual.
//
// The rules this file is written under (FINDINGS.md):
//  - GOLD IS NUMBERS AND LINES. Rules, rings, numerals, kickers. Never body
//    copy: the moment gold says something, it stops meaning "decided".
//  - LATIN RESTATES FACTS ONLY. Dates, times, roman numerals, role names
//    (PROGRAMME, GUESTS) and proper nouns that are already Latin. No English
//    copy is invented here, because copy nobody wrote is copy nobody can
//    correct.
//  - ONE tracking-in per scene. It is the luxury cliché; used twice it is a
//    tic.
//  - Type sits on the side the subject is not on, and the scrim darkens only
//    that side.

import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { resolveSrc } from "@/remotion/kit/paint";
import type { EventCmBrief } from "@/remotion/event-cm/types";
import type { EventGuest } from "@/remotion/event/types";
import { FH, LETTERBOX, ROMAN_NUMERALS, TYPE_SHADOW } from "./palette";
import { SpotlightSweep } from "./chrome";
import { Photo, Scrim, type CameraMove } from "./Photo";
import { SequenceGround, VelvetGround, VideoGround } from "./Ground";
import { groundOf } from "./sources";

/* ---------------------------------------------------------------- helpers */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const SAFE_TOP = LETTERBOX;
const SAFE_HEIGHT = 1080 - LETTERBOX * 2;
/** The one horizontal margin in the film. */
const MARGIN = 130;

const easeOut = (p: number): number => 1 - Math.pow(1 - p, 3);

/** Fade+rise entrance. Returns style for a block appearing at `delay`. */
const enter = (
  frame: number,
  delay: number,
  { dur = 18, rise = 24 }: { dur?: number; rise?: number } = {},
): React.CSSProperties => {
  const eased = easeOut(interpolate(frame, [delay, delay + dur], [0, 1], clamp));
  return { opacity: eased, transform: `translateY(${(1 - eased) * rise}px)` };
};

/**
 * The luxury move: letters that arrive far apart and close in.
 *
 * Once per scene, and only on a line set `white-space: nowrap` — a wrapping
 * block reflows while the tracking collapses, which reads as a bug rather
 * than as an entrance.
 */
const trackingIn = (
  frame: number,
  delay: number,
  { dur = 40, from = 0.6, to = 0.12 }: { dur?: number; from?: number; to?: number } = {},
): React.CSSProperties => {
  const eased = easeOut(interpolate(frame, [delay, delay + dur], [0, 1], clamp));
  return {
    opacity: eased,
    letterSpacing: `${from - (from - to) * eased}em`,
  };
};

/** A gold hairline that draws itself. */
const GoldRule: React.FC<{
  width: number;
  delay: number;
  frame: number;
  align?: "left" | "right" | "center";
}> = ({ width, delay, frame, align = "left" }) => {
  const eased = easeOut(interpolate(frame, [delay, delay + 22], [0, 1], clamp));
  return (
    <div
      style={{
        width: width * eased,
        height: 1,
        alignSelf: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
        background: `linear-gradient(to right, ${FH.gold}, ${FH.goldDim})`,
        opacity: eased > 0 ? 1 : 0,
      }}
    />
  );
};

/** Latin micro-label: role names and proper nouns, never new copy. */
const Kicker: React.FC<{
  text: string;
  frame: number;
  delay?: number;
  size?: number;
  color?: string;
  centred?: boolean;
}> = ({ text, frame, delay = 4, size = 23, color = FH.gold, centred = false }) => (
  <div
    style={{
      ...enter(frame, delay, { rise: 12 }),
      fontFamily: FH.en,
      fontWeight: 400,
      fontSize: size,
      letterSpacing: "0.46em",
      // The tracking hangs off the last letter, so a centred kicker has to
      // be pushed back by exactly that much to look centred.
      ...(centred ? { textIndent: "0.46em" } : {}),
      textTransform: "uppercase",
      color,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

/**
 * The programme numeral, held in a ring.
 *
 * sake found that a bare display numeral reads as a bar (一 IS a bar); `I`
 * has exactly the same problem, and roman numerals are worse because the
 * three of them differ only in width. The ring carries the visual mass, the
 * numeral stays the subject, and the ring draws itself the way the rules do.
 */
const NumeralRing: React.FC<{
  numeral: string;
  frame: number;
  delay?: number;
  size?: number;
}> = ({ numeral, frame, delay = 6, size = 220 }) => {
  const drawn = easeOut(interpolate(frame, [delay, delay + 38], [0, 1], clamp));
  const shown = easeOut(interpolate(frame, [delay + 14, delay + 40], [0, 1], clamp));
  const r = size / 2 - 2;
  const circumference = 2 * Math.PI * r;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        style={{ position: "absolute", left: 0, top: 0, transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={FH.gold}
          strokeWidth={1.5}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - drawn)}
        />
      </svg>
      <span
        style={{
          fontFamily: FH.en,
          fontWeight: 300,
          fontSize: Math.round(size * 0.545),
          lineHeight: 1,
          color: FH.goldBright,
          letterSpacing: "0.06em",
          // Centres the glyph against its own trailing tracking.
          textIndent: "0.06em",
          opacity: shown,
          textShadow: "0 2px 26px rgba(5,3,5,0.6)",
        }}
      >
        {numeral}
      </span>
    </div>
  );
};

/** A halo, not a glow: what keeps a caption legible on a moving ground. */
const CAPTION_SHADOW =
  "0 1px 2px rgba(5,3,2,0.96), 0 0 8px rgba(5,3,2,0.92), 0 0 20px rgba(5,3,2,0.78)";

/**
 * A real photograph, framed in a gold hairline.
 *
 * The frame is doing a job, not decorating: everything else on these three
 * pictures is a stand-in, and the hairline is what says THIS ONE IS REAL
 * (sake v9's wipe, same role).
 */
const Inset: React.FC<{
  src: string;
  focus: { x: number; y: number } | null;
  frame: number;
  width: number;
  height: number;
  delay?: number;
  from?: "left" | "right";
  length: number;
  caption?: string;
  /** A second, smaller line under the caption — the person's role. */
  sub?: string;
  /** The camera on the portrait. Default is the film's slow push; a wide
   *  shot dropped into a small frame asks for more. */
  move?: CameraMove;
  /** Defaults to the daylight-into-night correction every inset needs. */
  grade?: string;
}> = ({
  src,
  focus,
  frame,
  width,
  height,
  delay = 20,
  from = "right",
  length,
  caption,
  sub,
  move = { scaleFrom: 1.02, scaleTo: 1.1 },
  grade = "saturate(0.88) brightness(0.84)",
}) => {
  const eased = easeOut(interpolate(frame, [delay, delay + 26], [0, 1], clamp));
  const dir = from === "right" ? 1 : -1;
  return (
    <div
      style={{
        opacity: eased,
        transform: `translateX(${(1 - eased) * dir * 70}px)`,
      }}
    >
      <div
        style={{
          // POSITIONED ON PURPOSE. <Photo> is an AbsoluteFill: without a
          // positioned ancestor here it sizes itself to the wrapper below
          // and paints straight over the caption.
          position: "relative",
          width,
          height,
          overflow: "hidden",
          border: `1px solid ${FH.goldDim}`,
          background: FH.groundDeep,
          boxShadow: "0 18px 60px rgba(3,2,3,0.66)",
        }}
      >
        <Photo
          src={src}
          length={length}
          move={move}
          focus={focus}
          // Insets are daylight photographs dropped into a night hall, graded
          // down until they belong to it. A pair needs more than that — see
          // panelGrade(), which is what keeps two portraits shot in two
          // studios at the same brightness.
          grade={grade}
        />
      </div>
      {caption ? (
        <div
          style={{
            marginTop: 10,
            // Room for the wash below to fade out inside its own box.
            padding: "6px 0 8px",
            // A soft local darkening, sized and placed on the NAME rather
            // than on the column: an ellipse at 18% across, gone by 76%. On a
            // dark ground it is invisible; on the light pool it is what takes
            // the violinist's name off the 2.1:1 it measured bare. A flat plate
            // would do the same job and read as a UI chip.
            background:
              "radial-gradient(ellipse 62% 150% at 18% 50%, rgba(5,3,2,0.90) 0%, rgba(5,3,2,0.70) 40%, rgba(5,3,2,0) 82%)",
            fontFamily: FH.jp,
            fontWeight: 500,
            fontSize: 21,
            letterSpacing: "0.2em",
            // Full ivory, not the muted grade the other micro-labels use, and
            // a tight halo rather than the film's wide type shadow.
            //
            // This caption is the one piece of type in the film with NO scrim
            // under it and a ground that moves: it hangs below the frame on
            // the live picture. Measured on programme I's third shot, the
            // strip behind the violinist's name reads 116 mean and peaks at
            // 190 — the stage light pool drifts through it — where the same
            // strip on the first shot reads 16. TYPE_SHADOW is a 26px glow
            // and does nothing at that distance; three short shadows put a
            // dark edge on the glyphs themselves, which is what survives.
            color: FH.ivory,
            textShadow: CAPTION_SHADOW,
          }}
        >
          {caption}
          {sub ? (
            <div
              style={{
                marginTop: 4,
                fontWeight: 400,
                fontSize: 16,
                letterSpacing: "0.12em",
                color: FH.ivoryMuted,
                // The role can be long (「株式会社 atsumari COO / ヴァイオリン制作者」)
                // and the frame is what bounds it, so it is allowed to wrap.
                maxWidth: width,
                whiteSpace: "normal",
              }}
            >
              {sub}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

/** Any scene's ground, whatever shape sources.ts gave it today. */
const Ground: React.FC<{ sceneKey: string; length: number }> = ({ sceneKey, length }) => {
  const ground = groundOf(sceneKey);
  if (!ground) return null;
  const picture =
    ground.kind === "sequence" ? (
      <SequenceGround shots={ground.shots!} length={length} />
    ) : ground.kind === "video" ? (
      <VideoGround src={ground.src!} grade={ground.grade} />
    ) : ground.kind === "velvet" ? (
      <VelvetGround sweep={ground.sweep} />
    ) : (
      <Photo
        src={ground.src!}
        length={length}
        move={ground.move ?? { scaleFrom: 1.04, scaleTo: 1.12 }}
        focus={ground.focus ?? { x: 0.5, y: 0.5 }}
        grade={ground.grade}
      />
    );
  if (!ground.wash) return <>{picture}</>;
  return (
    <>
      {picture}
      <AbsoluteFill
        style={{
          background: `linear-gradient(to top, ${ground.washColor ?? FH.velvetFrom} 0%, ${ground.washColor ?? FH.velvetFrom} 58%, rgba(11,8,10,0) 100%)`,
          opacity: ground.wash,
          mixBlendMode: "multiply",
        }}
      />
    </>
  );
};

/* ------------------------------------------------------------- mark scene */

/**
 * The two silent pictures — which stopped saying the same thing on
 * 2026-09-14.
 *
 * Both used to be the presenter's mark. The client then moved the film from
 * "WealthPark Lab presents" to something a property-management company sends
 * to its own owners: a film that OPENED on our mark would confuse the person
 * it reached (「Aという管理会社から来ているのにWealthPark Lab主体」). So the
 * name moves from the front door to the credits:
 *
 *   opening   the title of the evening, centred over the curtain. A film's
 *             title card — nobody's name on it. (The title scene that follows
 *             shows the same words again over the key visual; the client
 *             read both and kept both.)
 *   closing   one line the client wrote, and under it, small, PRODUCED BY
 *             and the mark. A credit, where a credit goes.
 */
const PRODUCED_BY = "Produced by";

/** The title, broken at the reading pause it already contains. A title
 *  without one stays on a single line rather than inheriting a break that
 *  belongs to these words. */
const titleLinesOf = (title: string): string[] =>
  title.includes("、")
    ? title.split("、").map((part, i, all) => (i < all.length - 1 ? `${part}、` : part))
    : [title];

export const FhMarkScene: React.FC<{
  brief: EventCmBrief & { closingLine?: string };
  length: number;
  opening: boolean;
}> = ({ brief, length, opening }) => {
  const frame = useCurrentFrame();
  const mark = brief.logos[0] ?? null;
  // The end card leaves; the opening does not (the title cuts into it).
  const fadeOut = opening ? 1 : interpolate(frame, [length - 26, length - 2], [1, 0], clamp);
  const glow = 0.5 + Math.sin(frame * 0.045) * 0.12;
  const titleLines = titleLinesOf(brief.title);
  return (
    <AbsoluteFill style={{ background: FH.ground, opacity: fadeOut }}>
      <Ground sceneKey={opening ? "logoIn" : "logoOut"} length={length} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 54% 44% at 50% 46%, rgba(240,223,174,${0.1 * glow}), transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: SAFE_TOP,
          height: SAFE_HEIGHT,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: opening ? 34 : 30,
        }}
      >
        {opening ? (
          <>
            <GoldRule width={200} delay={8} frame={frame} align="center" />
            {/* The one tracking-in of the scene, on the first line only; the
                second arrives plainly a beat later so the two read as one
                title rather than as two entrances. */}
            <div style={{ textAlign: "center" }}>
              {titleLines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    ...(i === 0
                      ? trackingIn(frame, 14, { dur: 46, from: 0.5, to: 0.14 })
                      : { ...enter(frame, 40, { rise: 14, dur: 26 }), letterSpacing: "0.14em" }),
                    fontFamily: FH.jp,
                    fontWeight: 600,
                    fontSize: 58,
                    lineHeight: 1.7,
                    color: FH.ivory,
                    whiteSpace: "nowrap",
                    textShadow: TYPE_SHADOW,
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
            <GoldRule width={200} delay={56} frame={frame} align="center" />
          </>
        ) : (
          <>
            {brief.closingLine ? (
              <div
                style={{
                  ...trackingIn(frame, 4, { dur: 40, from: 0.4, to: 0.12 }),
                  fontFamily: FH.jp,
                  fontWeight: 600,
                  fontSize: 48,
                  lineHeight: 1.6,
                  color: FH.ivory,
                  whiteSpace: "nowrap",
                  textShadow: TYPE_SHADOW,
                }}
              >
                {brief.closingLine}
              </div>
            ) : null}
            <GoldRule width={240} delay={22} frame={frame} align="center" />
            {/* The credit. PRODUCED BY is Latin restating a fact (who made
                it), which is what Latin is for in this film; the mark is a
                third the size it was when it opened the film, because a
                credit is not a headline. */}
            <div
              style={{
                ...enter(frame, 36, { rise: 12, dur: 24 }),
                display: "flex",
                alignItems: "center",
                gap: 26,
              }}
            >
              <Kicker text={PRODUCED_BY} frame={frame} delay={36} size={19} color={FH.ivoryMuted} />
              {mark?.src ? (
                <Img
                  src={resolveSrc(mark.src)}
                  style={{
                    height: 46,
                    // The supplied mark is a dark vector: knocked out to
                    // white and pulled back to 0.92 so it sits as ivory.
                    filter: "brightness(0) invert(1)",
                    opacity: 0.92,
                  }}
                />
              ) : (
                <div
                  style={{
                    fontFamily: FH.en,
                    fontWeight: 300,
                    fontSize: 40,
                    color: FH.ivory,
                    letterSpacing: "0.16em",
                  }}
                >
                  {mark?.name ?? brief.presenter}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ title scene */

export const FhTitleScene: React.FC<{ brief: EventCmBrief; length: number }> = ({
  brief,
  length,
}) => {
  const frame = useCurrentFrame();
  const titleLines = titleLinesOf(brief.title);
  // No presenter kicker and no series line above the title since 2026-09-14
  // (FhMarkScene explains why). The rule that used to sit under the kicker
  // now opens the block, so the title still arrives inside two lines of gold.
  return (
    <AbsoluteFill style={{ background: FH.ground }}>
      <Ground sceneKey="title" length={length} />
      {/* Only the type's side is darkened — the instrument keeps its own
          light, which is the whole reason it is the ground. The key visual is
          a daylight photograph (sources.ts), so the scrim reaches further
          than it did over the macro clips. */}
      <Scrim side="left" strength={0.9} reach={70} />
      <div
        style={{
          position: "absolute",
          left: MARGIN,
          top: SAFE_TOP,
          height: SAFE_HEIGHT,
          width: 900,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 26,
        }}
      >
        <GoldRule width={120} delay={6} frame={frame} />
        <div>
          {titleLines.map((line, i) => (
            <div
              key={i}
              style={{
                ...trackingIn(frame, 20 + i * 8, { dur: 42 }),
                fontFamily: FH.jp,
                fontWeight: 600,
                fontSize: 52,
                lineHeight: 1.62,
                color: FH.ivory,
                whiteSpace: "nowrap",
                textShadow: TYPE_SHADOW,
              }}
            >
              {line}
            </div>
          ))}
        </div>
        <GoldRule width={280} delay={62} frame={frame} />
        {brief.subtitle ? (
          <div
            style={{
              ...enter(frame, 70, { rise: 16 }),
              fontFamily: FH.jp,
              fontWeight: 500,
              fontSize: 29,
              letterSpacing: "0.16em",
              color: FH.ivoryMuted,
              textShadow: TYPE_SHADOW,
            }}
          >
            {brief.subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ value scene */

export const FhValueScene: React.FC<{ brief: EventCmBrief; length: number }> = ({
  brief,
  length,
}) => {
  const frame = useCurrentFrame();
  const [lead, second] = brief.valueLines;
  return (
    <AbsoluteFill style={{ background: FH.ground }}>
      <Ground sceneKey="value" length={length} />
      {/* Copy right, instrument left — the value picture is the one place
          the film changes hands, and the ground drifts left to make room. */}
      <Scrim side="right" strength={0.84} reach={70} />
      <div
        style={{
          position: "absolute",
          right: MARGIN,
          top: SAFE_TOP,
          height: SAFE_HEIGHT,
          width: 1010,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          justifyContent: "center",
          textAlign: "right",
          gap: 30,
        }}
      >
        {/* The chip is a kicker here rather than a bordered pill: a box
            around two words is the template's move, and this direction
            spends its rules on structure instead. */}
        {brief.valueChip ? (
          <div
            style={{
              ...enter(frame, 6, { rise: 12 }),
              fontFamily: FH.jp,
              fontWeight: 500,
              fontSize: 25,
              letterSpacing: "0.44em",
              color: FH.gold,
            }}
          >
            {brief.valueChip}
          </div>
        ) : null}
        <GoldRule width={200} delay={14} frame={frame} align="right" />
        {lead ? (
          <div
            style={{
              ...enter(frame, 24, { rise: 28, dur: 24 }),
              fontFamily: FH.jp,
              fontWeight: 600,
              fontSize: 42,
              lineHeight: 1.92,
              letterSpacing: "0.04em",
              color: FH.ivory,
              textShadow: TYPE_SHADOW,
            }}
          >
            {lead}
          </div>
        ) : null}
        {/* The second line is set small and late rather than dropped: the
            third is the CTA verbatim, and saying it twice is what makes a
            film sound like it is running out of things to say. */}
        {second ? (
          <div
            style={{
              ...enter(frame, 76, { rise: 22, dur: 26 }),
              fontFamily: FH.jp,
              fontWeight: 400,
              fontSize: 26,
              lineHeight: 2,
              letterSpacing: "0.04em",
              color: FH.ivoryMuted,
              textShadow: TYPE_SHADOW,
            }}
          >
            {second}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------- program scene */

/**
 * Who stands beside which programme, and how.
 *
 * Since 2026-09-14 this is the ONLY place the speakers are introduced: the
 * client took the three-panel 登壇者紹介 out of the film, so a person who is
 * not beside a programme is not in the film. Hence the moderator beside III.
 *
 *   I    the two players, as a PAIR: equal portraits side by side, the
 *        violinist first because the Stradivari is hers. One photograph
 *        beside a programme reads as "this person", two read as "these
 *        people play it".
 *   II   nobody — the ring is the subject.
 *   III  the maker, and under him the moderator, as a STACK: the maker's
 *        landscape frame at the size it was cut for, the moderator smaller
 *        beneath it (the client's word: 「カポラリさんより小さめ」). Smaller is
 *        the hierarchy — he runs the evening, he does not perform in it.
 *
 * The indices are into the RAW brief's guests, not the drawn one: suppressing
 * the guests picture empties `drawn.guests` (film.ts applySuppression), and
 * this scene still needs the people. FreehandComposition passes them.
 */
const PROGRAM_INSET: Record<
  number,
  { guests: number[]; side: "left" | "right"; arrange: "pair" | "stack" } | undefined
> = {
  0: { guests: [0, 1], side: "right", arrange: "pair" },
  2: { guests: [2, 3], side: "left", arrange: "stack" },
};

/** The pair in programme I: panel size, and the gap between the two. */
/**
 * How much shorter than 2:3 the pair's frames are, in px (2026-09-24).
 *
 * The two heads did not line up. The accordionist's picture is already
 * pinned to its top edge (PANEL_MOVE_BY_FILE) and cannot come down further,
 * so the violinist goes UP instead: her file is exactly 2:3, the frame is cut
 * this much shorter, and her photo is anchored to its bottom (focus y 1 in
 * props.json), which takes the trim off the top of her picture. The
 * accordionist's frame is cut by the same amount off the bottom (a little of
 * the accordion). The client's estimate was 10-15px.
 */
const PAIR_TOP_TRIM = 15;
const PAIR = { width: 340, height: 510 - PAIR_TOP_TRIM, gap: 18 } as const;

/** The stack in programme III: the maker's frame, the moderator's, the gap. */
const STACK = {
  lead: { width: 592, height: 333 },
  second: { width: 318, height: 212 },
  gap: 30,
} as const;

/** Every caption block under an inset: name line, role line, margins. Used
 *  to centre a stack in the safe band without measuring the DOM. */
const CAPTION_BLOCK = 78;

/**
 * The moderator's portrait is a WIDE shot — a man on a street, head and
 * shoulders in the middle fifth of a 16:9 frame — and at the stack's small
 * size the face came out 40px tall. Scaling about the centre by 1.32 and
 * sliding the picture down 8% puts the face at box y≈80 of 212 with the top
 * of the head inside the frame (worked out from the cover geometry: 960×540
 * covers 318×212 at 0.393, face centre at image (0.5, 0.35) lands at box
 * (159, 74) before the scale).
 */
const MODERATOR_MOVE: CameraMove = { scaleFrom: 1.32, scaleTo: 1.4, yFrom: 8, yTo: 7 };

/** The label for the one speaker who does not perform. The narration says
 *  モデレーター, so the eye can say it too. */
const CREDIT_ROLE = "モデレーター";

/** Which guest is the moderator: the one whose role is not a performance.
 *  Keyed by role text rather than by position, because the guest order lives
 *  in props.json and is not this file's to depend on. */
const isModerator = (person: EventGuest): boolean => /WealthPark研究所/.test(person.role);

/** Which side the copy sits on, programme by programme. Declared rather than
 *  derived from the inset, because the grounds are lit for these sides
 *  (ASSET-PROMPTS.md): I and II keep the copy left, III moves it right to
 *  clear the portraits. */
const PROGRAM_COPY_SIDE: Array<"left" | "right"> = ["left", "left", "right"];

/**
 * How wide a programme title may run before it wraps.
 *
 * II is the exception. Its line is twenty characters — 920px set at 42px —
 * and b2's three instruments start at x≈549, so a single line lands its tail
 * on the middle instrument. Wrapped at 620 the balancer splits it 10/10,
 * ≈460px a line, and the copy stops before the first instrument.
 */
const PROGRAM_COPY_WIDTH: number[] = [1080, 620, 1080];

/**
 * What a portrait is graded to before it joins the film.
 *
 * These were shot by different photographers in different places, and at full
 * brightness they are the only daylight in a two-minute night. The default is
 * what that costs everyone.
 *
 * The accordionist costs more. Measured on the rendered panels, the three
 * players ran 68 / 125 / 83 mean luminance: one portrait against black, one
 * against dark panelling, and one against a lit white cyclorama half again as
 * bright as either neighbour. Only that one is pulled down, and only in
 * brightness; its saturation goes UP rather than down, because the red
 * accordion is the best colour in the pair and the point is to lose the
 * studio wall, not the instrument.
 *
 * The moderator's photograph (member_1.jpg, supplied 2026-09-15 in place of
 * the sake-2026 tatami portrait) is a daylight street with green foliage
 * behind him — whole-frame 122, and the one GREEN thing in a bordeaux and
 * gold film. It is small, so it can afford to come down hardest, and it
 * takes the most sepia of any picture here to turn the leaves toward amber.
 *
 * The two players were re-shot by the client 2026-09-24 (terashita-2,
 * tsuchiya-2: both studio portraits on grey). The white cyclorama is gone,
 * so the accordionist's pull-down went with it — the new file is the DARK
 * one (73 mean against the violinist's 109, the black accordion is most of
 * it) and is lifted instead. Measured on programme I's last shot: panels
 * 88 / 77, faces 101 / 95.
 *
 * Keyed by file rather than by position, for the reason isModerator() gives.
 */
const PANEL_GRADE = "saturate(0.88) brightness(0.8)";
const PANEL_GRADE_BY_FILE: Array<[string, string]> = [
  ["tsuchiya_3277w", "saturate(0.95) sepia(0.14) brightness(0.52)"],
  ["tsuchiya-2", "saturate(0.9) brightness(1.04)"],
  ["kato", "saturate(0.6) sepia(0.32) brightness(0.55) contrast(1.04)"],
];
const panelGrade = (src: string): string =>
  PANEL_GRADE_BY_FILE.find(([file]) => src.includes(file))?.[1] ?? PANEL_GRADE;

/**
 * The accordionist's portrait, pinned to its top edge.
 *
 * Her file is 0.688:1 in a 0.667:1 panel, so cover fits the height exactly
 * and there is no vertical slack: the default push scales about the centre
 * and takes the top of her head off (the client, 2026-09-24). Drifting down
 * by exactly what the scale covers, y = 50(s − 1)/s, keeps the image's top
 * edge on the panel's top edge through the whole move — at the midpoint the
 * linear pair undershoots by 0.4px, still covered. It also lowers her head
 * to the violinist's height, which is the other half of the note; the price
 * is a little of the accordion at the bottom, which the client accepted.
 */
const PANEL_MOVE_BY_FILE: Array<[string, CameraMove]> = [
  ["tsuchiya-2", { scaleFrom: 1.02, scaleTo: 1.1, yFrom: 0.97, yTo: 4.54 }],
];
const panelMove = (src: string): CameraMove | undefined =>
  PANEL_MOVE_BY_FILE.find(([file]) => src.includes(file))?.[1];

export const FhProgramScene: React.FC<{
  brief: EventCmBrief;
  /** The people, from the RAW brief — see PROGRAM_INSET. */
  people: EventGuest[];
  length: number;
  index: number;
  total: number;
}> = ({ brief, people, length, index, total }) => {
  const frame = useCurrentFrame();
  const numeral = ROMAN_NUMERALS[index % ROMAN_NUMERALS.length];
  const item = brief.programs[index] ?? null;
  const inset = PROGRAM_INSET[index];
  const insetGuests = (inset?.guests ?? [])
    .map((i) => people[i])
    .filter((g): g is NonNullable<typeof g> => Boolean(g?.photo));
  const place = PROGRAM_COPY_SIDE[index % PROGRAM_COPY_SIDE.length];
  // One size on all three. II's ring was 300 while its ground was a bare
  // curtain and the numeral had to be the subject; b2 (three instruments on
  // velvet) is now under it, and an oversized ring beside a real photograph
  // reads as two subjects competing rather than as one.
  const ringSize = 220;

  // Where the inset block sits in the safe band. The pair is 510 of picture
  // plus its caption; the stack is two pictures, two captions and a gap.
  // Both are centred rather than hung from a fixed offset, so a change to
  // either size moves the block, not its edges.
  const blockHeight =
    inset?.arrange === "pair"
      ? PAIR.height + CAPTION_BLOCK
      : STACK.lead.height + CAPTION_BLOCK + STACK.gap + STACK.second.height + CAPTION_BLOCK;
  const blockTop = SAFE_TOP + Math.round((SAFE_HEIGHT - blockHeight) / 2);

  return (
    <AbsoluteFill style={{ background: FH.ground }}>
      <Ground sceneKey={`program${index}`} length={length} />
      <Scrim side={place} strength={0.7} reach={72} />
      <div
        style={{
          position: "absolute",
          top: SAFE_TOP,
          height: SAFE_HEIGHT,
          ...(place === "left" ? { left: MARGIN } : { right: MARGIN }),
          width: 1120,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: place === "right" ? "flex-end" : "flex-start",
          gap: 26,
        }}
      >
        <Kicker text={`Programme ${numeral}`} frame={frame} delay={4} size={22} />
        <NumeralRing numeral={numeral} frame={frame} delay={10} size={ringSize} />
        <GoldRule width={360} delay={44} frame={frame} align={place} />
        {item ? (
          <div
            style={{
              ...enter(frame, 52, { rise: 26, dur: 24 }),
              fontFamily: FH.jp,
              fontWeight: 600,
              fontSize: 42,
              lineHeight: 1.82,
              letterSpacing: "0.04em",
              color: FH.ivory,
              maxWidth: PROGRAM_COPY_WIDTH[index % PROGRAM_COPY_WIDTH.length],
              textAlign: place,
              textWrap: "balance",
              textShadow: TYPE_SHADOW,
            }}
          >
            {item.title}
          </div>
        ) : null}
        {/* The heading names the series of three; it is the same words on
            all three pictures, so it sits last and small. */}
        {brief.programsHeading ? (
          <div
            style={{
              ...enter(frame, 66, { rise: 12 }),
              fontFamily: FH.jp,
              fontWeight: 400,
              fontSize: 21,
              letterSpacing: "0.3em",
              color: FH.ivoryMuted,
            }}
          >
            {`${brief.programsHeading}　${index + 1} / ${total}`}
          </div>
        ) : null}
      </div>
      {inset && insetGuests.length > 0 ? (
        <div
          style={{
            position: "absolute",
            top: blockTop,
            ...(inset.side === "right" ? { right: MARGIN } : { left: MARGIN }),
            display: "flex",
            flexDirection: inset.arrange === "pair" ? "row" : "column",
            alignItems: "flex-start",
            gap: inset.arrange === "pair" ? PAIR.gap : STACK.gap,
          }}
        >
          {insetGuests.map((person, i) => {
            const size =
              inset.arrange === "pair" ? PAIR : i === 0 ? STACK.lead : STACK.second;
            const moderator = isModerator(person);
            return (
              <Inset
                key={i}
                src={person.photo!.src}
                focus={person.photo!.focus ?? null}
                frame={frame}
                width={size.width}
                height={size.height}
                length={length}
                from={inset.side}
                // Staggered, so the two arrive as a phrase rather than a
                // block. The moderator arrives late in III: the narration
                // names him last, and the picture should not be ahead of it.
                delay={moderator ? 96 : 26 + i * 8}
                caption={moderator ? `${CREDIT_ROLE}　${person.name}` : person.name}
                sub={person.role}
                move={moderator ? MODERATOR_MOVE : panelMove(person.photo!.src)}
                grade={panelGrade(person.photo!.src)}
              />
            );
          })}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------- cta scene */

/**
 * The invitation, as three lines.
 *
 * The client's instruction of 2026-09-14: no heading about the series, no
 * footnote about dates, no date card — three short lines that say what the
 * evening is, the last of them the ask. They are NOT the narration: the
 * voice says the sentences, the screen says the nouns (FINDINGS, review round
 * 1), and the lines in props.json `cta` are worded a little apart from the
 * spoken ones on purpose.
 *
 * Each line arrives when the voice reaches it, roughly: the narration for
 * this scene runs about eighteen seconds and names the three things in
 * order, so the list builds under the voice rather than landing whole in
 * the first second. The markers are hairlines, not dots — gold is lines and
 * numbers in this film, and a bullet is neither.
 *
 * The symbol that used to sit behind the copy as a watermark is gone with
 * the heading: the film names its maker once now, on the end card.
 */
const CTA_LINE_DELAYS = [14, 72, 132];

export const FhCtaScene: React.FC<{ brief: EventCmBrief; length: number }> = ({
  brief,
  length,
}) => {
  const frame = useCurrentFrame();
  const lines = (brief.cta ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <AbsoluteFill style={{ background: FH.ground }}>
      <Ground sceneKey="cta" length={length} />
      {/* Centred type on three different grounds (the rows, the reception,
          the podium) — a radial scrim is the one darkening that fits all
          three, and it leaves the lamps at the edges alone. */}
      <Scrim side="radial" strength={0.82} />
      <SpotlightSweep start={30} duration={150} strength={0.12} />
      <div
        style={{
          position: "absolute",
          top: SAFE_TOP,
          height: SAFE_HEIGHT,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          {lines.map((line, i) => {
            const delay = CTA_LINE_DELAYS[i] ?? CTA_LINE_DELAYS[CTA_LINE_DELAYS.length - 1] + 40 * i;
            const last = i === lines.length - 1;
            return (
              <div
                key={i}
                style={{
                  ...enter(frame, delay, { rise: 22, dur: 26 }),
                  display: "flex",
                  alignItems: "center",
                  gap: 30,
                }}
              >
                {/* Centred on the row: GoldRule's `align` is its cross-axis
                    placement, and in a row that is vertical. */}
                <GoldRule width={44} delay={delay + 4} frame={frame} align="center" />
                <span
                  style={{
                    fontFamily: FH.jp,
                    // The ask is the last line and the one the scene ends on,
                    // so it is the only one set at full weight.
                    fontWeight: last ? 600 : 500,
                    fontSize: 40,
                    lineHeight: 1.5,
                    letterSpacing: "0.06em",
                    color: last ? FH.ivory : FH.ivory,
                    whiteSpace: "nowrap",
                    textShadow: TYPE_SHADOW,
                  }}
                >
                  {line}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

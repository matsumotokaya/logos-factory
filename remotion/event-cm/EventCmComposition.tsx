// The narrated event promo.
//
// Built entirely from the component kit (remotion/kit): the scenes are
// arrangements of vocabulary components, painted by a theme that the brand's
// own palette and typography feed into. Nothing in this file positions
// anything or picks a font.
//
// This replaces the previous version, which sequenced event-promo's
// hand-composed scene components. Those were good, and their judgments were
// kept — they live in the kit's components now, where a second template can
// reach them and a brand's values can change them.
//
// The spine is still the narration: scene order comes from the narration's roles
// and scene length from the timeline, which sharpens from budget to narration to
// measured voice (timeline.ts).

import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useVideoConfig,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import { getRemotionEnvironment } from "remotion";
import { EventBackground } from "@/remotion/event/EventBackground";
import { resolveMediaSrc } from "@/remotion/event/EventComposition";
import { EVENT_FPS, EVENT_HEIGHT, EVENT_WIDTH } from "@/remotion/event/palette";
import { Stage } from "@/remotion/kit/render/Stage";
import { CaptionBand } from "@/remotion/kit/render/CaptionBand";
import { eventCmFilm } from "./film";
import { msToFrame, msToFrames } from "./timeline";
// Side effect: delivers the Japanese faces the theme stacks name, so a
// renderer without the system families does not draw tofu.
import "@/remotion/kit/fonts";
import { eventCmSfxCue } from "@/lib/templates/event-cm/sfx-cues";
import { poolGain, poolPlayback, unlicensedDefaults } from "@/lib/assets/defaults";
import type { EventCmBrief } from "./types";

export { EVENT_FPS, EVENT_WIDTH, EVENT_HEIGHT };

export type EventCmVideoProps = {
  brief: EventCmBrief;
};

export const EventCmComposition: React.FC<EventCmVideoProps> = ({ brief: raw }) => {
  // No `useCurrentFrame()` here, deliberately. Nothing in this component
  // depends on which frame is being drawn any more: the music's level is a
  // function handed to the player (below), and every scene reads its own frame
  // inside its own Sequence. Subscribing here re-rendered the whole tree on
  // every frame for nothing.
  const { durationInFrames, fps } = useVideoConfig();
  // The whole film, derived once (film.ts). This component only sequences it —
  // suppression, timing, scene building and captions are not its business.
  // Memoised on the brief because this component re-renders every frame
  // (useCurrentFrame), and the film includes fitting every scene's type.
  const film = useMemo(() => eventCmFilm(raw), [raw]);
  const brief = film.drawn;
  const theme = film.theme;

  // Music opens alone, steps back under the narration, and comes up again for
  // the close. Ducking costs nothing here — Remotion takes volume as a
  // function of the frame — so the film does not have to choose one level for
  // its whole length.
  //
  // With no voice yet there is nothing to duck under, and the music carries
  // the film at full level. The same composition therefore works at every
  // stage of the take's life, which is the point (timeline.ts).
  const hasVoice = film.hasVoice;
  // ON A LEVELLED FLOOR, so these two numbers are a mix decision rather than
  // one file's mastering.
  //
  // They used to be 0.62 / 0.16 applied to the raw file, and the pool's two
  // tracks are mastered 5.5 dB apart — so the ink track played about 10 dB
  // under the narration when it was meant to sit just under it, and choosing
  // the other track would have changed the whole film's balance. Measured in
  // the walkthrough: the opening mark read −26 dB against a −16 dB voice.
  //
  // `poolGain` brings any pool track to the BGM reference (−16 dB, set by the
  // quieter track's headroom), so FULL means "music carrying the frame on its
  // own" and the duck means "far enough down to stay out of the words".
  // The closing plate's footage, IF it may be shown.
  //
  // The one place in this composition where preview and export are allowed to
  // differ, and it is the pool's own promise rather than a bug: an asset marked
  // `licensed: false` is fine to watch and must not leave the building inside
  // an MP4 (lib/assets/defaults.ts). Until 2026-08-27 nothing consumed that
  // flag — `unlicensedDefaults` had no caller — so adding the first asset that
  // needs it means writing the exclusion, not trusting it. Withholding it is
  // safe because the plate under it is the art direction's own ground: the end
  // card is finished either way, which is the same premise as every other slot.
  const declaredEndCard = theme.endCard;
  const endCard =
    declaredEndCard &&
    !(
      getRemotionEnvironment().isRendering &&
      unlicensedDefaults([declaredEndCard.video]).length > 0
    )
      ? declaredEndCard
      : null;

  const bgmGain = poolGain(brief.bgm);
  // Where this track starts and how long one pass runs (lib/assets/defaults.ts
  // `poolPlayback`). Zero for a track with no declared edit — including every
  // user-supplied file — which takes the plain `loop` path below.
  const bgmPlayback = poolPlayback(brief.bgm);
  const bgmTrim = Math.round(bgmPlayback.startFromSec * fps);
  // Floor, not round: a loop one frame longer than the file plays a frame of
  // silence at every seam.
  const bgmLoopFrames = Math.max(1, Math.floor(bgmPlayback.loopSec * fps));
  // Loop ONLY when the track would actually run out.
  //
  // A bed longer than the film never reaches its own end, so wrapping it adds a
  // mechanism that does nothing — and a mechanism that does nothing is still a
  // mechanism the two players have to agree about. The approved 墨 films play a
  // plain `<Audio>` and sound right; a 3-minute bed under a 51-second film is
  // the same situation and now takes the same path.
  const bgmLoops = bgmPlayback.loopSec > 0 && bgmLoopFrames < durationInFrames;
  const FULL = bgmGain;
  /**
   * The bed under a narrator.
   *
   * −10.9 dB below `FULL`. It was −9.9 dB (a plain 0.32) until 2026-08-30, when
   * the owner judged it a decibel loud — **in the exported MP4**, which is the
   * only surface either of us can measure. The browser preview is not settled
   * enough to level a mix by (see README「プレビューは音のバランスを保証しない」), so
   * a number decided there would be a number decided on nothing.
   */
  const UNDER_VOICE = 0.285 * bgmGain;
  const startFrame = msToFrame(film.voiceStartMs, fps);
  const endFrame = msToFrame(film.voiceEndMs, fps);
  const duckIn = Math.round(fps * 0.5);
  const duckOut = Math.round(fps * 0.8);

  /**
   * The music's level at one frame OF THE FILM.
   *
   * A pure function of the frame, and handed to `<Audio volume>` as one. It
   * used to be a value computed from `useCurrentFrame()` and closed over by
   * `() => bgmVolume`, which ignored the frame the player asked about — so the
   * answer depended on when React last re-rendered rather than on which frame
   * was being asked for. The renderer re-renders once per frame and got the
   * right answer; the browser, which schedules audio ahead of what is on
   * screen, did not always.
   *
   * NEVER RETURNS ZERO while the film is running. A volume of 0 is not a quiet
   * moment to @remotion/media, it is a mute instruction —
   * `effectiveMuted = muted || mediaMuted || userPreferredVolume <= 0` — and
   * the old curve was exactly 0 at frame 0, so every playback began by muting
   * the track and unmuting it a frame later. Audio is scheduled in chunks
   * before it is heard, so whether that first chunk survived the mute varied
   * from one press of play to the next: 「1回目に再生した時が大きかったけど2回目
   * に再生してみるとちっちゃくなっている」 (owner, 2026-08-30), with the sound
   * cues — which carry plain numbers and are never muted — left standing over
   * a bed that had dropped out.
   *
   * −80 dB is silence to a listener and a number to the player.
   */
  const SILENT = 0.0001;
  const bgmVolumeAt = (f: number): number =>
    hasVoice
      ? interpolate(
          f,
          [
            0,
            20,
            startFrame,
            startFrame + duckIn,
            Math.max(startFrame + duckIn + 1, endFrame - duckOut),
            endFrame,
            durationInFrames,
          ],
          [SILENT, FULL, FULL, UNDER_VOICE, UNDER_VOICE, FULL, SILENT],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      : interpolate(
          f,
          [0, 20, durationInFrames - 40, durationInFrames],
          [SILENT, FULL, FULL, SILENT],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );

  return (
    <AbsoluteFill
      style={{ fontFamily: theme.textFont, backgroundColor: theme.palette.ground }}
    >
      {theme.palette.groundWash ? (
        <AbsoluteFill style={{ background: theme.palette.groundWash }} />
      ) : null}
      {/* The theme decides whether anything lives behind the scenes. This used
          to be unconditional, which meant a light art direction declared
          `background: "still"` and still got 墨's drifting indigo field with
          gold particles painted over its ground — the one part of the art
          direction that could not be changed. EventBackground IS the 墨 field
          (EVENT_GOLD, ink-black); a theme that wants a different atmosphere
          brings its own layer rather than parameterising this one. */}
      {theme.motion.background === "still" ? null : <EventBackground />}
      {brief.bgm &&
        (bgmLoops ? (
          // A track shorter than the film: laid down as explicit passes.
          //
          // `<Loop>` did this and is gone. Its children are Sequences, so the
          // frame handed to `volume` restarts at every pass — which is why the
          // curve used to be closed over instead of read from that frame, and
          // that closure is what made the browser and the renderer disagree.
          // Writing the passes out keeps the curve a pure function of the
          // FILM's frame: each pass knows its own offset.
          //
          // Remotion's own `loop` is not used either: the CLI renderer loops
          // and the browser Player does not, so the film had music for 26 of
          // its 51 seconds on screen and all 51 in the MP4 (2026-08-26).
          Array.from(
            { length: Math.ceil(durationInFrames / bgmLoopFrames) },
            (_, pass) => {
              const from = pass * bgmLoopFrames;
              return (
                <Sequence
                  key={`bgm-${pass}`}
                  from={from}
                  durationInFrames={bgmLoopFrames}
                >
                  <Audio
                    src={resolveMediaSrc(brief.bgm as string)}
                    volume={(f) => bgmVolumeAt(from + f)}
                    {...(bgmTrim > 0 ? { trimBefore: bgmTrim } : {})}
                  />
                </Sequence>
              );
            },
          )
        ) : (
          // Longer than the film, or a length nobody measured. Not in a
          // Sequence, so the frame `volume` is handed IS the film's frame.
          // `loop` is passed only when the length is unknown, because a track
          // that cannot run out does not need it.
          <Audio
            src={resolveMediaSrc(brief.bgm)}
            volume={bgmVolumeAt}
            {...(bgmPlayback.loopSec > 0 ? {} : { loop: true })}
          />
        ))}
      {brief.voice ? (
        // Held back by the lead-in so the opening belongs to the music.
        <Sequence from={msToFrame(film.voiceStartMs, fps)}>
          <Audio src={resolveMediaSrc(brief.voice.audio)} />
        </Sequence>
      ) : null}
      {film.scenes.map((scene) => {
        // One picture per scene. The film's shape is the film's shape here too:
        // keyed by scene identity rather than by role, because three programme
        // pictures share a role and React would have treated them as one
        // Sequence re-rendered three times.
        const from = msToFrame(scene.fromMs, fps);
        const length = msToFrames(scene.durationMs, fps);
        return (
          <Sequence key={scene.key} from={from} durationInFrames={length}>
            {/* The closing plate stands on footage (theme.ts ThemeEndCard).
                Inside this scene's Sequence rather than behind the whole film,
                because that is what it is: one scene's ground, not an
                atmosphere. Three layers in the approved order — graded
                footage, a flat wash of this theme's ground, then the theme's
                radial scrim — and the wash is what keeps the ground the colour
                the mark was painted against. No `loop`: the clip is longer
                than the plate, and a clip that has to repeat inside four
                seconds is the wrong clip. */}
            {endCard && scene.role === "logoOut" ? (
              <AbsoluteFill>
                <Video
                  src={resolveMediaSrc(endCard.video)}
                  muted
                  // `objectFit` is a prop rather than a style on this component;
                  // passing it in `style` renders correctly and logs a warning
                  // on every frame of every render.
                  objectFit="cover"
                  style={{
                    width: "100%",
                    height: "100%",
                    ...(endCard.grade ? { filter: endCard.grade } : {}),
                  }}
                />
                <AbsoluteFill style={{ background: endCard.wash }} />
                <AbsoluteFill style={{ background: theme.backdrop.scrim }} />
              </AbsoluteFill>
            ) : null}
            <Stage scene={scene.scene} theme={theme} length={length} />
          </Sequence>
        );
      })}
      {/* Sound cues sit outside the scene Sequences: a cue marking a cut is
          allowed to ring past it (lib/event-cm/sfx-cues.ts). */}
      {film.scenes.map((scene) => {
        const sfx = eventCmSfxCue(scene.role, scene.index ?? 0, theme.sound.cues);
        if (!sfx) return null;
        return (
          <Sequence key={`sfx-${scene.key}`} from={msToFrame(scene.fromMs + sfx.atMs, fps)}>
            <Audio src={resolveMediaSrc(sfx.src)} volume={sfx.volume} />
          </Sequence>
        );
      })}
      {/* The letterbox: above the scenes, below the captions that live in it. */}
      {theme.chrome.letterbox ? (
        <>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: theme.chrome.letterbox,
              background: theme.chrome.color,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: theme.chrome.letterbox,
              background: theme.chrome.color,
            }}
          />
        </>
      ) : null}
      {/* Above every scene and inside the bar. Subtitles are not one scene's
          business. */}
      <CaptionBand captions={film.captions} theme={theme} />
    </AbsoluteFill>
  );
};

/** Total frames for this brief — the Player and the renderer must agree. */
export const eventCmDurationInFrames = (brief: EventCmBrief, fps = EVENT_FPS): number =>
  msToFrames(eventCmFilm(brief).totalMs, fps);

// The freehand cut.
//
// Everything the film SAYS comes from eventCmFilm(), untouched: scene order,
// scene lengths, narration timing, captions, audio. Everything the film SHOWS
// is replaced — this file, ./scenes.tsx and the rest of ./freehand are the
// experiment.

import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { resolveMediaSrc } from "@/remotion/event/EventComposition";
import { eventCmFilm } from "@/remotion/event-cm/film";
import { msToFrame, msToFrames } from "@/remotion/event-cm/timeline";
import type { EventCmBrief } from "@/remotion/event-cm/types";
import type { FilmScene } from "@/remotion/event-cm/film";
import { FH } from "./palette";
import { cueFor } from "./sfx";
import { FreehandCaptions, Grain, Letterbox, Vignette } from "./chrome";
import {
  FhCtaScene,
  FhMarkScene,
  FhProgramScene,
  FhTitleScene,
  FhValueScene,
} from "./scenes";

export type FreehandProps = { brief: EventCmBrief };

const sceneView = (
  scene: FilmScene,
  brief: EventCmBrief,
  /** The guests as written, not as drawn — see FhProgramScene. */
  people: EventCmBrief["guests"],
  length: number,
  programTotal: number,
): React.ReactNode => {
  switch (scene.role) {
    case "logoIn":
      return <FhMarkScene brief={brief} length={length} opening />;
    case "title":
      return <FhTitleScene brief={brief} length={length} />;
    case "value":
      return <FhValueScene brief={brief} length={length} />;
    case "program":
      return (
        <FhProgramScene
          brief={brief}
          people={people}
          length={length}
          index={scene.index ?? 0}
          total={programTotal}
        />
      );
    case "guests":
      // Not in this film since 2026-09-14: props.json suppresses the picture
      // and the film plan never produces it. The people are introduced beside
      // the programmes instead. Kept as a case so the switch stays total.
      return null;
    case "cta":
      return <FhCtaScene brief={brief} length={length} />;
    case "logoOut":
      return <FhMarkScene brief={brief} length={length} opening={false} />;
  }
};

export const FreehandComposition: React.FC<FreehandProps> = ({ brief: raw }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const film = useMemo(() => eventCmFilm(raw), [raw]);
  const brief = film.drawn;

  // Audio behaviour: music opens alone, ducks under the voice, returns for
  // the close. The narration is recorded, so the first branch is the one
  // that runs.
  //
  // THE MUSIC OPENS AT FULL, by the client's instruction (2026-09-11). The
  // baseline faded it up over 20 frames, which is two thirds of a second of
  // an 86-second film spent arriving; the film now starts already playing.
  // The 2-frame ramp that remains is not a fade — it is there so the first
  // sample is not a step from silence, which clicks.
  //
  // MEASURED, AND NOT WHAT THE INSTRUCTION WANTED. The envelope is now full
  // at frame 2, but strung-up-joy.mp3 is itself silent for its first 1.8s —
  // its first note is at exactly 54 frames (max level -84dB through 1.7s,
  // -20.8dB at 1.8s). So the film still opens on silence, and no change to
  // the envelope can fix that. The fix is one prop on the Audio below,
  // `trimBefore={54}`, which drops the file's silent head. It is not applied
  // here because it moves the music 1.8s earlier against every cut in the
  // film, and that is the client's call rather than this file's.
  const FULL = 0.62;
  const UNDER_VOICE = 0.16;
  /** Click guard, not a fade: two frames from silence to full. */
  const OPEN_RAMP = 2;
  const startFrame = msToFrame(film.voiceStartMs, fps);
  const endFrame = msToFrame(film.voiceEndMs, fps);
  const duckIn = Math.round(fps * 0.5);
  const duckOut = Math.round(fps * 0.8);
  const bgmVolume = film.hasVoice
    ? interpolate(
        frame,
        [
          0,
          OPEN_RAMP,
          startFrame,
          startFrame + duckIn,
          Math.max(startFrame + duckIn + 1, endFrame - duckOut),
          endFrame,
          durationInFrames,
        ],
        [0, FULL, FULL, UNDER_VOICE, UNDER_VOICE, FULL, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : interpolate(
        frame,
        [0, OPEN_RAMP, durationInFrames - 40, durationInFrames],
        [0, FULL, FULL, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );

  const programTotal = film.scenes.filter((scene) => scene.role === "program").length;

  return (
    // `lang` + `word-break: auto-phrase` is the whole line-breaking policy,
    // set once: both are inherited, so every text in the film breaks at
    // phrase boundaries rather than wherever the character count runs out.
    // `lang` is not decoration — without it the engine has no language to
    // segment for and the property silently does nothing (sake D13).
    <AbsoluteFill
      lang="ja"
      style={{
        fontFamily: FH.jp,
        backgroundColor: FH.ground,
        ...({ wordBreak: "auto-phrase" } as unknown as React.CSSProperties),
      }}
    >
      {/* NO `loop`. The supplied piece is 3:10 and the film is 1:26, so a
          loop could only ever be a seam waiting to happen. */}
      {/* The requester wants music from the first frame. The file itself opens
          with 1.8 s of silence (measured: -84 dB until 1.7 s, first note at
          1.8 s), so the envelope alone cannot deliver that — the lead-in is
          trimmed. 54 frames = 1.8 s at 30 fps. The bed has no hits synced to
          cuts, so shifting it does not move any picture. */}
      {brief.bgm && (
        <Audio src={resolveMediaSrc(brief.bgm)} volume={() => bgmVolume} trimBefore={54} />
      )}
      {brief.voice ? (
        <Sequence from={msToFrame(film.voiceStartMs, fps)}>
          <Audio src={resolveMediaSrc(brief.voice.audio)} />
        </Sequence>
      ) : null}
      {film.scenes.map((scene) => {
        const from = msToFrame(scene.fromMs, fps);
        const length = msToFrames(scene.durationMs, fps);
        return (
          <Sequence key={scene.key} from={from} durationInFrames={length}>
            {sceneView(scene, brief, raw.guests, length, programTotal)}
          </Sequence>
        );
      })}
      {/* Sound cues sit outside the scene Sequences: an effect that marks a
          cut has to be allowed to ring past it (sfx.ts). */}
      {film.scenes.map((scene) => {
        const cue = cueFor(scene.role, scene.index ?? 0);
        if (!cue) return null;
        return (
          <Sequence key={`sfx-${scene.key}`} from={msToFrame(scene.fromMs + cue.atMs, fps)}>
            <Audio src={resolveMediaSrc(cue.src)} volume={cue.volume} />
          </Sequence>
        );
      })}
      <Vignette />
      <Grain />
      <Letterbox />
      <FreehandCaptions captions={film.captions} />
    </AbsoluteFill>
  );
};

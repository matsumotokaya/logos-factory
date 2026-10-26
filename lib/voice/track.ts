// The recorded narration's data contract, shared by the voice stage, the API
// routes, the Remotion composition and the Player UI. Plain types only —
// importable from server and client alike.

/** One scene's slice of the mixed voice track (ms on the final timeline). */
export type VoiceSceneOf<Scene> = Scene & {
  startMs: number;
  durationMs: number;
};

/** Sentence-level caption timing (character-count proration within a scene). */
export interface VoiceCaption {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * The voice artifact: everything the video renderer needs besides the WAV.
 *
 * Generic over the script's own scene type: the track is timing measured over
 * whatever scenes were spoken, and the role vocabulary belongs to the
 * template's script, not to the recording of it.
 */
export interface VoiceTrackOf<Scene> {
  version: 1;
  generatedAt: string;
  totalMs: number;
  sampleRate: number;
  /** true when the audio is the keyless placeholder tone. */
  mock: boolean;
  provider: string;
  voice: string;
  scenes: VoiceSceneOf<Scene>[];
  captions: VoiceCaption[];
}

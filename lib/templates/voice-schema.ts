import { z } from "zod";

// The voice track a narrated template pins into its brief: the mixed WAV's
// timing, scene by scene and caption by caption.
//
// Its own file because every narrated template needs it, and the brief schemas
// that use it are imported by the module that collects them. Passthrough
// because the track is written by the voice stage, not by a user: validation
// here is a guard against a truncated write, not a contract negotiation.

export const VoiceTrackSchema = z
  .object({
    version: z.literal(1),
    generatedAt: z.string(),
    totalMs: z.number().positive(),
    sampleRate: z.number().positive(),
    mock: z.boolean(),
    provider: z.string(),
    voice: z.string(),
    scenes: z.array(z.object({ startMs: z.number(), durationMs: z.number() }).passthrough()),
    captions: z.array(
      z.object({ text: z.string(), startMs: z.number(), endMs: z.number() }),
    ),
  })
  .passthrough();

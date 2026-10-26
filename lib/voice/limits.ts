// Limits the narration has to respect, shared by the browser and the server.
//
// Separate from lib/voice/synthesize.ts because that module is `server-only`
// (it reaches the TTS provider), and the editor needs the same number to tell
// somebody their line is too long BEFORE they ask for it to be read.

/**
 * The provider's per-request ceiling.
 *
 * The same number is written in lib/voice/tts-lib/tts.mjs, which runs
 * as a standalone ESM script and cannot import this file. Both sides say so;
 * changing one alone means the editor accepts a line the synthesiser refuses.
 */
export const TTS_MAX_SECTION_CHARS = 2000;

// TTS provider layer. Currently: Gemini (same model/prompt as the AI Studio
// app). Additional providers can be added to PROVIDERS with the same
// synthesize() signature.
//
// Set TTS_MOCK=1 to skip the API and produce placeholder audio whose
// duration approximates real speech — lets the full pipeline (mixing, BGM,
// timing JSON, prepare.mjs handoff) be tested without an API key.

import { GoogleGenAI } from "@google/genai";

// Hard API-quality limit. Duplicated on purpose: labs runs as plain ESM scripts
// with no path aliases, so it cannot import the app's copy. The app's is
// lib/voice/limits.ts `TTS_MAX_SECTION_CHARS`, which points back here —
// change one and change the other, or the editor will accept a line this
// refuses.
const MAX_SECTION_CHARS = 2000;
const MAX_RETRIES = 2;

function buildPrompt(cleanText, persona) {
  return persona
    ? `Please read the following text in a "${persona}" custom character tone. Do not write or speak any introductory greetings, confirmations, or chat responses. Immediately start reading the exact text, and outputs ONLY the spoken audio (no text output allowed at all): "${cleanText}"`
    : `Say this exact text and output ONLY the spoken audio, do not include any text responses: "${cleanText}"`;
}

function mockPcm(text) {
  // ~7 chars/sec speaking rate; quiet 220 Hz tone with per-sentence pauses.
  const rate = 24000;
  const seconds = Math.max(1, text.length / 7);
  const n = Math.round(seconds * rate);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const on = Math.floor(t * 2) % 4 !== 3; // brief gaps to sound speech-like
    pcm[i] = on ? Math.round(Math.sin(2 * Math.PI * 220 * t) * 6000) : 0;
  }
  return { pcm, sampleRate: rate };
}

/**
 * How long to wait before retrying, or null when retrying cannot help.
 *
 * The provider states the wait it wants: a 429 body carries
 * `"retryDelay": "57s"`. The fixed 1.5s/3.0s backoff this replaced was two
 * orders of magnitude short of that, so both retries were spent inside the
 * same quota window and the whole recording failed on a limit that would have
 * cleared by itself. Honouring the stated delay is right on any tier: it is the
 * one number that is actually known. (It was found on the free tier, where 3
 * calls a minute against a seven-scene film made this the ordinary path rather
 * than an edge, but a paid key states its own delay the same way.)
 *
 * A PER-DAY quota is the null case. Its RetryInfo still says ~60s, because
 * that is when the per-MINUTE window reopens -- but the daily allowance is
 * gone until tomorrow, so obeying it spends two minutes to fail anyway.
 *
 * Capped so a malformed or hostile value cannot hang a render, and floored at
 * the old backoff so non-quota failures (a blocked response, a dropped
 * socket) still retry promptly.
 */
const MAX_RETRY_WAIT_MS = 90_000;
export function retryDelayMs(err, attempt) {
  const message = String(err?.message ?? "");
  if (/PerDay/i.test(message)) return null;
  const backoff = 1500 * (attempt + 1);
  const stated = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (!stated) return backoff;
  const asked = Math.ceil(Number(stated[1]) * 1000) + 500; // a beat past the window
  return Math.min(MAX_RETRY_WAIT_MS, Math.max(backoff, asked));
}

async function geminiSynthesize({ text, voice, persona, model, apiKey }) {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(text, persona);

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      });
      const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      const data = part?.inlineData?.data;
      if (!data) throw new Error("No audio data in response (content may have been blocked).");

      const rateMatch = part.inlineData.mimeType?.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
      const buf = Buffer.from(data, "base64");
      const even = buf.length - (buf.length % 2);
      const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + even));
      return { pcm, sampleRate };
    } catch (err) {
      lastError = err;
      const wait = retryDelayMs(err, attempt);
      if (wait === null) throw err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}

const PROVIDERS = {
  gemini: geminiSynthesize,
};

// Synthesize one section of clean speech text (interval tags already
// stripped by timing.speechText). Returns {pcm: Int16Array, sampleRate}.
export async function synthesizeSection({ text, voice, persona, model, provider = "gemini", apiKey }) {
  if (text.length > MAX_SECTION_CHARS) {
    throw new Error(`Section too long for TTS (${text.length} > ${MAX_SECTION_CHARS} chars).`);
  }
  if (process.env.TTS_MOCK === "1")
    return mockPcm(text);

  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Add it to tts-studio/.env or the repo root .env.");
  const synthesize = PROVIDERS[provider];
  if (!synthesize) throw new Error(`Unknown TTS provider: ${provider}`);
  return synthesize({ text, voice, persona, model, apiKey });
}

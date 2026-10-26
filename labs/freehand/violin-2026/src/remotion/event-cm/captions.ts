import { eventCmTimeline } from "./timeline";
import { eventCmSceneKey, type EventCmBrief } from "./types";
import { phraseBlocks } from "@/remotion/kit/phrase";

// Subtitles.
//
// Not optional, and not a feature of the voice. Business video is watched
// muted — a film whose words only exist as audio says nothing to most of the
// people who see it. So subtitles are derived from whatever is known, on the
// same three-stage principle as the timeline (timeline.ts):
//
//   narration written  → the sentences, timed by character weight
//   voice recorded    → the sentences, timed by the measured track
//
// Deriving from the narration is the part that matters. Reading the voice track's
// own captions would be simpler, and would mean no subtitles until somebody
// paid for TTS — which is exactly backwards for the reason subtitles exist.
//
// Sentence-level, not scene-level: a beat runs five to eight seconds and
// carries forty characters, which is a paragraph on screen. Sentences give
// two-to-four second cards of fifteen to twenty-five characters, which is what
// commercial subtitles actually are, and the narration is already written so
// its sentences break where a reader would breathe.
//
// Bounded by their own scene. One message per picture means a subtitle never
// runs across a cut, so a reader is never shown a line whose picture has
// already gone.

export interface Caption {
  text: string;
  fromMs: number;
  toMs: number;
}

/** Split on Japanese sentence endings, keeping the delimiter with its clause. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。．！？!?])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * The longest a single subtitle card may be.
 *
 * Commercial subtitles are fifteen to twenty-five characters on screen for two
 * to four seconds. A sentence is normally already that, which is why splitting
 * on 。 is the primary rule — but a *sentence* is not guaranteed to be a card.
 * Somebody writing their own line can type two hundred characters without a
 * full stop, and the band has no line limit: the plate simply grows until it
 * covers the picture it was supposed to subtitle.
 */
const MAX_CARD_CHARS = 28;

/**
 * Below this, a card reads as a leftover rather than a line.
 *
 * The measured case: 「知られざる日本酒業界の舞台裏と世界への広がりについて
 * 語ります。」 is 31 characters, and filling to the 28 limit left a card
 * containing 「ます。」 — three characters on screen for a beat. The requester
 * flagged it in review; the fix at the time was to add a 、 to the sentence,
 * which is the author working around the splitter.
 */
const MIN_CARD_CHARS = 8;

/**
 * One sentence as one or more cards.
 *
 * Three rules, in order of how much a reader notices them:
 *
 *   1. **Break at 、 first** — that is where a reader would pause anyway.
 *   2. **Otherwise break between 文節** (../kit/phrase.ts). Filling to the
 *      limit and slicing whatever is left over cuts words in half, which is
 *      the same defect as a mid-word line break and was fixed in the same
 *      week; the two工程 simply had the hole in different places.
 *   3. **Aim for cards of equal length, not full cards.** Packing greedily to
 *      28 is what produces the 28+3 split. Deciding how MANY cards first and
 *      then filling toward that average gives 16+15 for the same sentence.
 *
 * `lang` is defaulted rather than threaded: every caption in this template is
 * Japanese today. When a non-Japanese art direction arrives, this is the second
 * place that needs the language and `theme.lang` is where it lives.
 */
export function splitCards(sentence: string, lang = "ja"): string[] {
  if (weightOf(sentence) <= MAX_CARD_CHARS) return [sentence];

  const clauses = sentence
    .split(/(?<=[、,])/)
    .map((clause) => clause.trim())
    .filter(Boolean);

  // The smallest pieces a card boundary may fall between. A clause that already
  // fits stays whole — its 、 is a better break than anything inside it.
  const atoms = clauses.flatMap((clause) =>
    weightOf(clause) <= MAX_CARD_CHARS ? [clause] : phraseBlocks(clause, lang),
  );

  const total = atoms.reduce((sum, atom) => sum + weightOf(atom), 0);
  const cardCount = Math.max(1, Math.ceil(total / MAX_CARD_CHARS));
  const target = Math.ceil(total / cardCount);

  const cards: string[] = [];
  let current = "";
  for (const atom of atoms) {
    if (!current) {
      current = atom;
      continue;
    }
    const combined = weightOf(current) + weightOf(atom);
    // Past the average is allowed while it keeps the card legal; past the limit
    // never is. Aiming at the average is rule 3.
    if (combined > MAX_CARD_CHARS || weightOf(current) >= target) {
      cards.push(current);
      current = atom;
      continue;
    }
    current += atom;
  }
  if (current) cards.push(current);

  // A single atom longer than a card has nothing left to break on — one word,
  // typically a name or a long katakana run. Sliced only here, as a last resort.
  const sized = cards.flatMap((card) => {
    if (weightOf(card) <= MAX_CARD_CHARS) return [card];
    const runs: string[] = [];
    for (let at = 0; at < card.length; at += MAX_CARD_CHARS) {
      runs.push(card.slice(at, at + MAX_CARD_CHARS));
    }
    return runs;
  });

  // Last tidy: a trailing fragment joins the card before it when it fits. The
  // balancing above usually prevents one, but an unsplittable atom at the end
  // can still leave a stub.
  const last = sized[sized.length - 1];
  if (
    sized.length > 1 &&
    weightOf(last) < MIN_CARD_CHARS &&
    weightOf(sized[sized.length - 2]) + weightOf(last) <= MAX_CARD_CHARS
  ) {
    sized.splice(sized.length - 2, 2, sized[sized.length - 2] + last);
  }

  return sized.length > 0 ? sized : [sentence];
}

const weightOf = (text: string): number => Math.max(1, text.replace(/\s/g, "").length);


export function captionsFor(brief: EventCmBrief): Caption[] {
  const timeline = eventCmTimeline(brief);
  // By scene identity: with three programme pictures, keying by role would time
  // every one of them against the first.
  const timingOf = new Map(
    timeline.scenes.map((scene) => [eventCmSceneKey(scene), scene]),
  );
  const captions: Caption[] = [];

  // One line per picture, so a scene's subtitles are bounded by that scene.
  // Nothing spans a cut, and the silent opening and close carry no text at all.
  for (const scene of brief.narration.scenes) {
    const timing = timingOf.get(eventCmSceneKey(scene));
    if (!timing) continue;

    const startMs = timing.fromMs;
    const endMs = timing.fromMs + timing.durationMs;
    const available = Math.max(1, endMs - startMs);

    const sentences = splitSentences(scene.text).flatMap((line) => splitCards(line));
    if (sentences.length === 0) continue;

    const total = sentences.reduce((sum, sentence) => sum + weightOf(sentence), 0);
    let cursor = startMs;
    for (const [i, sentence] of sentences.entries()) {
      const share = Math.round((weightOf(sentence) / total) * available);
      // The last sentence absorbs the rounding, so subtitles always end
      // exactly where their scene does rather than a few frames short.
      const toMs = i === sentences.length - 1 ? endMs : cursor + share;
      captions.push({ text: sentence, fromMs: cursor, toMs });
      cursor = toMs;
    }
  }

  return captions;
}

/** The caption showing at a given moment, if any. */
export const captionAt = (captions: Caption[], ms: number): Caption | null =>
  captions.find((caption) => ms >= caption.fromMs && ms < caption.toMs) ?? null;

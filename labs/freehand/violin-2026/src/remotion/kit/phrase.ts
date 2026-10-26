// Where a Japanese line is allowed to break.
//
// `fit.ts` decides HOW MANY lines a component gets and how loudly it is set.
// Nothing decided WHERE those lines break, and the browser's default answer for
// Japanese is "anywhere", which produced 「金融教育を、じっくり考/える夜」 — a
// break inside a word. The requester's rule: long paragraphs want justified
// edges, but a one-to-three-line phrase broken mid-word reads as a defect.
//
// Two mechanisms, because there are two kinds of text here:
//
//   1. **Plain runs** get `word-break: auto-phrase`, declared once on the Stage
//      root with the theme's `lang`. The engine segments; nothing here runs.
//   2. **The animated title** cannot use that at all. It is revealed character
//      by character, which means each character is its own inline-block inside
//      a wrapping flex — so the text is no longer a run and flex wraps between
//      any two boxes. `auto-phrase` was added first and changed nothing on the
//      title for exactly this reason. Grouping the characters into blocks and
//      wrapping between BLOCKS is what makes the animation and the break rule
//      coexist.

/**
 * Text split into blocks a line may break between — roughly 文節.
 *
 * `Intl.Segmenter` alone is too fine: it returns morphemes, so
 * 「知られざる」 arrives as 知 / ら / れ / ざる and 「金融教育」 as two nouns.
 * Breaking there is still wrong. Three rules glue morphemes back into meaning
 * blocks, and they are deliberately shallow — no dictionary, no part-of-speech
 * table, nothing to keep current:
 *
 *   - **A segment beginning with kana joins the one before it.** That is what
 *     particles, auxiliaries and okurigana are: 話 + を + し + ます → 「話をします」.
 *   - **Adjacent kanji-only segments join.** Compound nouns segment apart:
 *     日本酒 + 業界 → 「日本酒業界」.
 *   - **Punctuation joins the block before it and CLOSES it.** 「、」 ends a
 *     block, so what follows starts a new one instead of gluing on.
 *
 * The guarantee is a break at a meaning boundary, not a specific break: which
 * boundary is used depends on how much fits, and that is the layout's business.
 * Callers wanting an exact break still write the text to fall that way.
 */
export function phraseBlocks(text: string, lang = "ja"): string[] {
  if (!text) return [];
  // No segmenter, or a language this heuristic was not written for: one block,
  // which is the same as not grouping at all. Never throw over typography.
  if (typeof Intl === "undefined" || !("Segmenter" in Intl) || !lang.startsWith("ja")) {
    return [text];
  }

  let segments: string[];
  try {
    const segmenter = new Intl.Segmenter(lang, { granularity: "word" });
    segments = [...segmenter.segment(text)].map((part) => part.segment);
  } catch {
    return [text];
  }

  const blocks: string[] = [];
  // Blocks a punctuation mark has closed: nothing may glue onto them.
  const closed = new Set<number>();

  for (const segment of segments) {
    const previous = blocks.length - 1;
    const openBefore = previous >= 0 && !closed.has(previous);

    if (PUNCTUATION.test(segment)) {
      // Leading punctuation has nothing to attach to — 「（」 opens a block.
      if (openBefore) {
        blocks[previous] += segment;
        closed.add(previous);
      } else {
        blocks.push(segment);
      }
      continue;
    }

    if (openBefore && startsWithKana(segment)) {
      blocks[previous] += segment;
      continue;
    }
    if (openBefore && isKanjiOnly(segment) && endsWithKanji(blocks[previous])) {
      blocks[previous] += segment;
      continue;
    }
    blocks.push(segment);
  }

  return blocks;
}

/** Marks that end a block rather than start one. */
const PUNCTUATION = /^[、。，．！？…‥」』）】〉》・:;,.!?]+$/u;

const KANA = /[ぁ-ゟ゠-ヿ]/u;
const KANJI = /[々〇㐀-䶿一-鿿豈-﫿]/u;

const startsWithKana = (text: string): boolean => KANA.test(text.charAt(0));
const isKanjiOnly = (text: string): boolean =>
  text.length > 0 && [...text].every((char) => KANJI.test(char));
const endsWithKanji = (text: string): boolean => KANJI.test(text.charAt(text.length - 1));

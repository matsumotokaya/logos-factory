import type { EventFacts } from "./structure";

// Throwing away what a planning document contains but an announcement must not.
//
// The reading stage is told to copy what the material says, and it does — which
// is right for values and wrong for scaffolding. A 企画書 is full of things that
// look like facts and are not: section headings, placeholders nobody has filled
// in yet, internal notes about expected attendance, decorative characters from
// a flyer's styling. Reading the sake event's material produced a fee of
// 「XXXX円」, a footnote of 「レオパレス21 オーナー約40名・社員約10名」 and a
// value chip reading 「本企画が目指す価値」 — the heading above the value, not
// the value.
//
// This runs after the model and before anything is applied, in code rather
// than in the prompt, because these are recognisable by rule (§17.2). What
// rules cannot judge — whether a sentence is a claim or a caption — stays the
// model's problem.

/** Nobody has filled this in yet. Not a fact; not even a wrong fact. */
const PLACEHOLDER = /^[\s]*([XxＸｘ]{2,}|[○●◯〇]{2,}|[□■]{2,}|[-–—ー]{2,}|未定|調整中|TBD|T\.B\.D\.?)[\s]*/i;

/** A value that is only a placeholder, or is built around one. */
export function isPlaceholder(value: string): boolean {
  const text = value.trim();
  if (!text) return true;
  if (PLACEHOLDER.test(text)) return true;
  // 「XXXX円」「〇〇会場」: a placeholder wearing a unit.
  return /([XxＸｘ]{3,}|[○●◯〇]{2,}|[□■]{2,})/.test(text);
}

/**
 * Headings a planning document puts ABOVE its content.
 *
 * These arrive as values because they sit in the same visual position a value
 * would. The give-away is that they describe the slot rather than fill it.
 */
const HEADING = /^(本?企画(が目指す)?(価値|概要|趣旨|目的)|開催概要|イベント概要|ターゲット|想定|狙い|背景|課題|価値|概要|目的|趣旨)$/;

export const isHeading = (value: string): boolean => HEADING.test(value.trim());

/**
 * Notes the organiser wrote for themselves.
 *
 * Expected attendance, internal breakdowns, budget lines. They belong to the
 * plan, not to the announcement, and putting one on screen tells the audience
 * something about the client's business rather than about the event.
 */
const INTERNAL_NOTE = /(オーナー|社員|関係者|社内|想定集客|集客目標|動員|見込み|名程度|約\d+名)/;

export const isInternalNote = (value: string): boolean =>
  INTERNAL_NOTE.test(value.trim());

/** Decoration a flyer uses for emphasis. Set in mincho it reads as damage. */
const DECORATION = /[＼／\\|｜■□▼▲◆◇★☆※]/g;

export const stripDecoration = (value: string): string =>
  value.replace(DECORATION, "").replace(/\s+/g, " ").trim();

/**
 * A count is not a person.
 *
 * 「Miss SAKE 2名」 is how a plan says two more speakers are coming, and it
 * arrives shaped exactly like a guest. Naming it on screen invents a person
 * called "Miss SAKE 2名" — the one thing this template refuses to do.
 */
// Ends in a count: 「Miss SAKE 2名」「登壇者3名」「２名」. A real name does not.
const COUNT_AS_NAME = /[\d０-９]+\s*(名|人|名様)\s*$/;

export const isCountNotPerson = (name: string): boolean =>
  COUNT_AS_NAME.test(name.trim());

const clean = (value: string | null): string | null => {
  if (value === null) return null;
  const text = stripDecoration(value);
  if (!text) return null;
  if (isPlaceholder(text) || isHeading(text)) return null;
  return text;
};

export interface SanitizeReport {
  /** Field paths that were dropped, with why — surfaced in the run log. */
  dropped: Array<{ field: string; value: string; reason: string }>;
}

/**
 * Clean the facts a reading produced.
 *
 * Dropping to null is deliberate: null means "the material does not state
 * this", and a placeholder in the source is exactly that — the material has
 * not stated it. The seeded proposal then keeps standing, which is a better
 * screen than 「XXXX円」.
 */
export function sanitizeFacts(facts: EventFacts): {
  facts: EventFacts;
  report: SanitizeReport;
} {
  const dropped: SanitizeReport["dropped"] = [];
  const drop = (field: string, value: string, reason: string) => {
    dropped.push({ field, value, reason });
  };

  const scalar = (field: string, value: string | null): string | null => {
    if (value === null) return null;
    const text = stripDecoration(value);
    if (!text) return null;
    if (isPlaceholder(text)) {
      drop(field, value, "資料側が未記入（プレースホルダ）");
      return null;
    }
    if (isHeading(text)) {
      drop(field, value, "資料の見出しであって値ではない");
      return null;
    }
    return text;
  };

  const footnote = (() => {
    const value = scalar("footnote", facts.footnote);
    if (value && isInternalNote(value)) {
      drop("footnote", value, "社内向けのメモ（掲載する注記ではない）");
      return null;
    }
    return value;
  })();

  const guests = (() => {
    if (!facts.guests) return null;
    const kept = facts.guests.filter((guest) => {
      const name = stripDecoration(guest.name);
      if (!name || isPlaceholder(name)) {
        drop("guests", guest.name, "氏名が未記入");
        return false;
      }
      if (isCountNotPerson(name)) {
        drop("guests", guest.name, "人数であって人物ではない");
        return false;
      }
      return true;
    });
    return kept.length > 0
      ? kept.map((guest) => ({
          name: stripDecoration(guest.name),
          role: stripDecoration(guest.role),
        }))
      : null;
  })();

  const list = (field: string, values: string[] | null): string[] | null => {
    if (!values) return null;
    const kept = values
      .map((value) => clean(value))
      .filter((value): value is string => value !== null);
    if (kept.length === 0) {
      drop(field, values.join(" / "), "掲載できる内容が残らなかった");
      return null;
    }
    return kept;
  };

  return {
    facts: {
      ...facts,
      title: scalar("title", facts.title),
      subtitle: scalar("subtitle", facts.subtitle),
      seriesLabel: scalar("seriesLabel", facts.seriesLabel),
      presenter: scalar("presenter", facts.presenter),
      valueChip: scalar("valueChip", facts.valueChip),
      cta: scalar("cta", facts.cta),
      date: scalar("date", facts.date),
      weekday: scalar("weekday", facts.weekday),
      time: scalar("time", facts.time),
      venue: scalar("venue", facts.venue),
      fee: scalar("fee", facts.fee),
      footnote,
      valueLines: list("valueLines", facts.valueLines),
      programs: list("programs", facts.programs),
      guests,
    },
    report: { dropped },
  };
}

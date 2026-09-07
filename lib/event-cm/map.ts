import type { EventFacts } from "./structure";
import type { FactAttribution, FactKey } from "./attribution";
import { isSuppressed } from "./facts";
import { sameName } from "./names";
import type { EventCmBrief } from "@/remotion/event-cm/types";

// Stage ④: putting what was read into the film.
//
// Two rules decide everything here, and both are about not taking something
// away from the user:
//
//   1. **A fact never overwrites a person.** A field whose origin is `user`
//      was typed or confirmed by someone; re-reading the flyer must not undo
//      that. Same contract as the narration narration's `source: "human"`.
//   2. **A null never overwrites anything.** The structuring stage returns
//      null for what the material does not say, and null means "no new
//      information", not "the material says this is empty". The seeded
//      proposal keeps standing.
//
// What changes is the origin as much as the value: a date the flyer states
// stops being "仮に入れた値" and becomes "資料から読んだ", and that single
// change is the whole point of putting a document in.
//
// The origin also records WHICH documents, by material id (`sources`), when
// the structuring stage could say. That is what makes 「外す」 mean something
// later: a value whose every source has left the take goes back to being a
// proposal (withdraw.ts). Values written before attribution existed keep their
// label and no ids, and are simply never withdrawn.

export interface MappedField {
  path: string;
  label: string;
  before: string;
  after: string;
}

export interface MapResult {
  brief: EventCmBrief;
  /** Fields the material actually changed. */
  applied: MappedField[];
  /** Fields the material spoke to but that a person had already settled. */
  keptUserValues: string[];
}

export const FACT_LABELS: Record<string, string> = {
  title: "イベント名",
  subtitle: "サブタイトル",
  seriesLabel: "シリーズ・回次",
  presenter: "主催",
  valueLines: "訴求",
  valueChip: "訴求の一言",
  programs: "プログラム",
  guests: "登壇者",
  "schedule.date": "開催日",
  "schedule.time": "開始時刻",
  "schedule.venue": "会場",
  "schedule.fee": "参加費",
  cta: "行動喚起",
  footnote: "注記",
};

/** brief path → the fact key the structuring stage answers under. */
export const FACT_KEY_BY_PATH: Record<string, FactKey> = {
  title: "title",
  subtitle: "subtitle",
  seriesLabel: "seriesLabel",
  presenter: "presenter",
  valueLines: "valueLines",
  valueChip: "valueChip",
  programs: "programs",
  guests: "guests",
  "schedule.date": "date",
  "schedule.time": "time",
  "schedule.venue": "venue",
  "schedule.fee": "fee",
  cta: "cta",
  footnote: "footnote",
};

export function mapFactsIntoBrief(
  brief: EventCmBrief,
  facts: EventFacts,
  source: string,
  now: string = new Date().toISOString(),
  attribution?: Pick<FactAttribution, "byField" | "readIds">,
): MapResult {
  const applied: MappedField[] = [];
  const keptUserValues: string[] = [];
  let next: EventCmBrief = { ...brief };
  const provenance = { ...(brief.provenance ?? {}) };

  const settle = (path: string, before: string, after: string, write: () => void) => {
    if (after === "" || after === before) return;
    if (provenance[path]?.origin === "user" || isSuppressed(brief, path)) {
      keptUserValues.push(FACT_LABELS[path] ?? path);
      return;
    }
    write();
    // A field the model attributed rests on those documents; one it did not
    // rests on everything that was read. No attribution at all (an older run)
    // leaves the ids off rather than guessing.
    const key = FACT_KEY_BY_PATH[path];
    const cited = key ? attribution?.byField[key] : undefined;
    const sources = attribution
      ? cited && cited.length > 0
        ? cited
        : attribution.readIds
      : undefined;
    provenance[path] = {
      origin: "extracted",
      source,
      ...(sources && sources.length > 0 ? { sources } : {}),
    };
    applied.push({ path, label: FACT_LABELS[path] ?? path, before, after });
  };

  const text = (path: string, value: string | null, before: string, write: (v: string) => void) => {
    if (value === null) return;
    const trimmed = value.trim();
    settle(path, before, trimmed, () => write(trimmed));
  };

  text("title", facts.title, brief.title, (v) => (next = { ...next, title: v }));
  text("subtitle", facts.subtitle, brief.subtitle, (v) => (next = { ...next, subtitle: v }));
  text("seriesLabel", facts.seriesLabel, brief.seriesLabel, (v) => (next = { ...next, seriesLabel: v }));
  text("presenter", facts.presenter, brief.presenter, (v) => (next = { ...next, presenter: v }));
  text("valueChip", facts.valueChip, brief.valueChip ?? "", (v) => (next = { ...next, valueChip: v }));
  text("cta", facts.cta, brief.cta, (v) => (next = { ...next, cta: v }));
  text("footnote", facts.footnote, brief.footnote ?? "", (v) => (next = { ...next, footnote: v }));

  if (facts.valueLines && facts.valueLines.length > 0) {
    const lines = facts.valueLines.map((line) => line.trim()).filter(Boolean);
    settle("valueLines", brief.valueLines.join(""), lines.join(""), () => {
      next = { ...next, valueLines: lines };
    });
  }
  if (facts.programs && facts.programs.length > 0) {
    const items = facts.programs.map((item) => item.trim()).filter(Boolean);
    settle(
      "programs",
      brief.programs.map((program) => program.title).join(" / "),
      items.join(" / "),
      () => {
        next = { ...next, programs: items.map((title) => ({ title })) };
      },
    );
  }
  if (facts.guests && facts.guests.length > 0) {
    // The one field the seeder refuses to fill, because a fabricated speaker
    // is a fabricated person. Read from a document it is a fact.
    //
    // The portrait is carried across by name. A photograph is an attribute of
    // the speaker, not a version of the speaker list, so re-reading the flyer
    // must not throw away the picture already placed against them — which is
    // exactly what rebuilding the list with `photo: null` used to do, silently,
    // every time the document was read again.
    const guests = facts.guests
      .filter((guest) => guest.name.trim())
      .map((guest) => {
        const name = guest.name.trim();
        const known = brief.guests.find((existing) => sameName(existing.name, name));
        return { name, role: guest.role.trim(), photo: known?.photo ?? null };
      });
    settle(
      "guests",
      brief.guests.map((guest) => guest.name).join("、"),
      guests.map((guest) => guest.name).join("、"),
      () => {
        next = { ...next, guests };
      },
    );
  }

  const schedule = { ...brief.schedule };
  const scheduleText = (
    path: string,
    value: string | null,
    key: "date" | "time" | "venue" | "fee",
  ) => {
    if (value === null) return;
    const trimmed = value.trim();
    settle(path, brief.schedule[key] ?? "", trimmed, () => {
      schedule[key] = trimmed;
    });
  };
  scheduleText("schedule.date", facts.date, "date");
  scheduleText("schedule.time", facts.time, "time");
  scheduleText("schedule.venue", facts.venue, "venue");
  scheduleText("schedule.fee", facts.fee, "fee");
  // The weekday rides with the date and has no goal field of its own.
  if (facts.weekday && facts.weekday.trim() && provenance["schedule.date"]?.origin === "extracted") {
    schedule.weekday = facts.weekday.trim();
  }
  next = { ...next, schedule };

  // Stamping only when something actually changed keeps a re-read that found
  // nothing new from marking the narration stale.
  const factsUpdatedAt = applied.length > 0 ? now : brief.factsUpdatedAt;
  return {
    brief: { ...next, provenance, ...(factsUpdatedAt ? { factsUpdatedAt } : {}) },
    applied,
    keptUserValues,
  };
}

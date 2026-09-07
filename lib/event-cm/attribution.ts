import type { EventFacts } from "./structure";

// Which material each fact rests on.
//
// The model reads every document in one call and answers with facts; on its
// own that answer says what was found and not where. Here it also says where,
// by material id — and because a model's citation is a claim like any other,
// what can be checked by rule is checked: a value said to come from a text
// file has to occur in that file. PDFs and pictures go to the model whole and
// cannot be checked that way, so their citations are kept as given.
//
// Why ids, and why several: a date confirmed by the flyer and by the pasted
// note rests on both, and a portrait attached to a speaker rests on the picture
// and on the document that named them. One label string could say neither.
// Ids are what let a removed document take its values with it (withdraw.ts);
// a label cannot be matched against a pin.

export const FACT_KEYS = [
  "title",
  "subtitle",
  "seriesLabel",
  "presenter",
  "valueLines",
  "valueChip",
  "programs",
  "guests",
  "date",
  "weekday",
  "time",
  "venue",
  "fee",
  "cta",
  "footnote",
] as const;

export type FactKey = (typeof FACT_KEYS)[number];

/** One line of the model's answer: this field rests on these materials. */
export interface CitedField {
  field: string;
  refs: string[];
}

/** What the extraction stage handed the model, as far as checking needs. */
export interface AttributionSource {
  materialId: string;
  mode: "text" | "passthrough" | "skipped";
  text?: string;
}

export interface FactAttribution {
  /** fact key → material ids, verified where verification was possible. */
  byField: Record<string, string[]>;
  /**
   * Every material the model was handed, in order. The fallback for a fact the
   * model did not attribute: it came from what was read, all of it.
   */
  readIds: string[];
  /** Citations that did not survive checking, and why. Surfaced in the run log. */
  dropped: Array<{ field: string; ref: string; reason: string }>;
}

/** Whitespace and character width do not make two strings different facts. */
const fold = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

/** The strings a fact is made of, for checking against a text source. */
function stringsOf(facts: EventFacts, field: FactKey): string[] {
  switch (field) {
    case "valueLines":
      return facts.valueLines ?? [];
    case "programs":
      return facts.programs ?? [];
    case "guests":
      return (facts.guests ?? []).map((guest) => guest.name);
    default: {
      const value = facts[field];
      return typeof value === "string" ? [value] : [];
    }
  }
}

export function attributeFacts(
  cited: readonly CitedField[],
  facts: EventFacts,
  sources: readonly AttributionSource[],
): FactAttribution {
  const read = sources.filter((source) => source.mode !== "skipped");
  const readIds = read.map((source) => source.materialId);
  const textOf = new Map<string, string>();
  for (const source of read) {
    if (source.mode === "text" && source.text) textOf.set(source.materialId, fold(source.text));
  }

  const byField: Record<string, string[]> = {};
  const dropped: FactAttribution["dropped"] = [];

  for (const { field, refs } of cited) {
    if (!(FACT_KEYS as readonly string[]).includes(field)) continue;
    const key = field as FactKey;
    const strings = stringsOf(facts, key).map(fold).filter(Boolean);
    // A citation for a field the reading left null is noise, not evidence.
    if (strings.length === 0) continue;

    const kept: string[] = [];
    for (const ref of refs) {
      if (kept.includes(ref)) continue;
      if (!readIds.includes(ref)) {
        dropped.push({ field, ref, reason: "読んだ資料に無いIDです" });
        continue;
      }
      const text = textOf.get(ref);
      if (text !== undefined && !strings.some((value) => text.includes(value))) {
        dropped.push({ field, ref, reason: "その資料の本文にこの値が見つかりません" });
        continue;
      }
      kept.push(ref);
    }
    if (kept.length > 0) byField[key] = kept;
  }

  return { byField, readIds, dropped };
}

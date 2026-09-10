import { FACT_KEY_BY_PATH, FACT_LABELS } from "./map";
import { isSpokenFact, previewOf } from "./facts";
import { collectMaterialPaths } from "@/lib/takes/material-uri";
import type { EventCmBrief } from "@/remotion/event-cm/types";

// What leaves the film when a document leaves the take.
//
// 「外して再構造化したら新しい構造になるのでは」 — it should, and it did not:
// the mapping stage writes what a reading found and never clears what it did
// not, so a removed flyer's date stayed in the video wearing 「資料から読んだ」.
// This is the other half. It runs when the pin is removed, by rule and at
// once, because everything it needs is already recorded: which material each
// value rests on (provenance.sources) and which slots point at the file
// (material: pointers).
//
// Two passes, one rule each:
//   1. A slot pointing at a file the take no longer holds goes back to what
//      the template proposes — a picture to the default visual, a mark out of
//      the row, the music to the template's track. Otherwise the brief keeps a
//      pointer to bytes it cannot reach and the next render fails on it.
//   2. A fact none of whose sources is still held goes back to the proposal
//      too, and says so. A fact another document also states keeps standing,
//      on that document. A fact a person typed has no sources and is never
//      touched; neither is one recorded before attribution existed.
//
// The proposal is the template's seed for this brand (seed.ts), handed in by
// the caller: the values the take opened with, which is what 「仮」 has meant
// everywhere else on the screen.

export interface Withdrawal {
  path: string;
  label: string;
  before: string;
  after: string;
  reason: string;
}

export interface WithdrawResult {
  brief: EventCmBrief;
  withdrawn: Withdrawal[];
}

export const WITHDRAWN_NOTE = "根拠の資料が外されたため、仮の値に戻しました";

const GUEST_PHOTO_PATH = /^guests\[\d+\]\.photo$/;

/** One fact, copied from the proposal. The weekday rides with the date. */
function copyFact(from: EventCmBrief, to: EventCmBrief, path: string): EventCmBrief {
  switch (path) {
    case "title":
      return { ...to, title: from.title };
    case "subtitle":
      return { ...to, subtitle: from.subtitle };
    case "seriesLabel":
      return { ...to, seriesLabel: from.seriesLabel };
    case "presenter":
      return { ...to, presenter: from.presenter };
    case "valueLines":
      return { ...to, valueLines: [...from.valueLines] };
    case "valueChip":
      return { ...to, valueChip: from.valueChip };
    case "programs":
      return { ...to, programs: from.programs.map((program) => ({ ...program })) };
    case "guests":
      return { ...to, guests: from.guests.map((guest) => ({ ...guest })) };
    case "schedule.date":
      return {
        ...to,
        schedule: { ...to.schedule, date: from.schedule.date, weekday: from.schedule.weekday },
      };
    case "schedule.time":
      return { ...to, schedule: { ...to.schedule, time: from.schedule.time } };
    case "schedule.venue":
      return { ...to, schedule: { ...to.schedule, venue: from.schedule.venue } };
    case "schedule.fee":
      return { ...to, schedule: { ...to.schedule, fee: from.schedule.fee } };
    case "cta":
      return { ...to, cta: from.cta };
    case "footnote":
      return { ...to, footnote: from.footnote };
    default:
      return to;
  }
}

/**
 * @param held every material id still pinned to the take, in any role, after
 *   the removal. Membership is the whole test: a file pinned again as a
 *   normalised copy or as the mark is still here, and nothing of it leaves.
 */
export function withdrawMaterials(
  brief: EventCmBrief,
  held: ReadonlySet<string>,
  fallback: EventCmBrief,
  now: string = new Date().toISOString(),
): WithdrawResult {
  const withdrawn: Withdrawal[] = [];
  let next: EventCmBrief = { ...brief, visuals: { ...brief.visuals }, schedule: { ...brief.schedule } };
  const provenance = { ...(brief.provenance ?? {}) };
  let spoken = false;

  const note = (path: string, label: string, before: string, after: string, reason: string) => {
    withdrawn.push({ path, label, before, after, reason });
    if (isSpokenFact(path)) spoken = true;
  };

  // 1. Slots pointing at files the take no longer holds.
  const logoIndices = new Set<number>();
  for (const [id, paths] of collectMaterialPaths(brief)) {
    if (held.has(id)) continue;
    for (const at of paths) {
      const logo = /^logos\.(\d+)\.src$/.exec(at);
      if (logo) {
        logoIndices.add(Number(logo[1]));
        continue;
      }
      const guest = /^guests\.(\d+)\.photo\.src$/.exec(at);
      if (guest) {
        const index = Number(guest[1]);
        const name = next.guests[index]?.name ?? "";
        next = {
          ...next,
          guests: next.guests.map((person, i) => (i === index ? { ...person, photo: null } : person)),
        };
        delete provenance[`guests[${index}].photo`];
        note(`guests[${index}].photo`, `${name}の写真`, "写真あり", "", "写真の素材が外されました");
        continue;
      }
      const visual = /^visuals\.(value|programs|closing)\.src$/.exec(at);
      if (visual) {
        const key = visual[1] as "value" | "programs" | "closing";
        const path = `visuals.${key}`;
        next = { ...next, visuals: { ...next.visuals, [key]: fallback.visuals[key] } };
        provenance[path] = fallback.provenance?.[path] ?? { origin: "inferred", note: WITHDRAWN_NOTE };
        note(
          path,
          FACT_LABELS[path] ?? path,
          "写真あり",
          fallback.visuals[key] ? "既定の画像" : "",
          "写真の素材が外されました",
        );
        continue;
      }
      if (at === "bgm") {
        next = { ...next, bgm: fallback.bgm };
        provenance.bgm = fallback.provenance?.bgm ?? { origin: "inferred", note: WITHDRAWN_NOTE };
        note("bgm", "BGM", "あり", fallback.bgm ? "既定の曲" : "", "音声の素材が外されました");
      }
      // Anything else — a voice track, a path this vocabulary has not learned —
      // is left as it is. Nothing here is allowed to guess.
    }
  }
  if (logoIndices.size > 0) {
    const before = next.logos.map((logo) => logo.name).join("、");
    next = { ...next, logos: next.logos.filter((_, index) => !logoIndices.has(index)) };
    const current = provenance.logos;
    if (current?.sources) {
      provenance.logos = { ...current, sources: current.sources.filter((id) => held.has(id)) };
    }
    note("logos", "ロゴ", before, next.logos.map((logo) => logo.name).join("、"), "ロゴの素材が外されました");
  }

  // 2. Facts none of whose sources is still here.
  for (const [path, entry] of Object.entries(provenance)) {
    if (!(path in FACT_KEY_BY_PATH)) continue;
    if (entry.origin === "user") continue;
    const sources = entry.sources ?? [];
    if (sources.length === 0) continue;
    if (sources.some((id) => held.has(id))) continue;

    const before = previewOf(next, path);
    next = copyFact(fallback, next, path);
    provenance[path] = { ...(fallback.provenance?.[path] ?? { origin: "inferred" }), note: WITHDRAWN_NOTE };
    if (path === "guests") {
      // The old speakers' portrait entries name indices that no longer mean
      // the same people.
      for (const key of Object.keys(provenance)) {
        if (GUEST_PHOTO_PATH.test(key)) delete provenance[key];
      }
    }
    note(path, FACT_LABELS[path] ?? path, before, previewOf(next, path), WITHDRAWN_NOTE);
  }

  if (withdrawn.length === 0) return { brief, withdrawn };
  return {
    brief: { ...next, provenance, ...(spoken ? { factsUpdatedAt: now } : {}) },
    withdrawn,
  };
}

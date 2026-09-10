import { archetypeFor, subjectFor } from "./archetypes";
import { templateBgm, templatePortrait, templateVisual } from "@/lib/assets/defaults";
import {
  currentTemplate,
  defaultArtDirection,
  templateDressing,
} from "@/lib/templates/catalog";
import {
  EVENT_CM_SUPPRESSED_NOTE,
  EVENT_CM_VOICE_PATH,
  eventCmNarratedSteps,
} from "@/remotion/event-cm/types";
import type {
  EventCmBrief,
  EventCmProvenance,
  EventCmNarration,
  EventCmSceneRole,
} from "@/remotion/event-cm/types";
import { NEW_FILM_THEME_ID } from "@/remotion/kit/theme";

// Hand someone a finished film before they have told us anything.
//
// Everything here is deterministic and free: no LLM, no render, no network.
// The brand's own values fill what they can, the archetype proposes the rest,
// and the default asset pool dresses what is left. What comes out is a
// complete EventCmBrief — the goal, on screen, in the brand's colours, one
// click after "add a video".
//
// Two rules hold the whole thing together:
//
//   1. **Every proposal is labelled.** provenance records `brand` for what the
//      brand actually has and `inferred` for what this file guessed, so the
//      screen can say which is which and publish can warn (§17.5).
//   2. **Obviously-fictional people, not plausible ones.** This rule was "no
//      invented people" until 2026-08-30, when the guests were 「ゲストスピー
//      カー」 and 「モデレーター」 — roles, never names. The reasoning was that
//      a guessed name is a person who does not exist wearing a real stock face.
//
//      The owner's call reversed it, and the reason is what the seeded film IS:
//      a sample somebody is deciding from. A speaker picture captioned with two
//      job categories does not show what the template does with a speaker
//      picture. 山田太郎 / 山田花子 are the Japanese equivalent of John Doe —
//      nobody reads them as a real booking — so they buy the realism without
//      buying the fabrication. The line moved from "never a name" to "never a
//      name that could be mistaken for a real one".
//
//      What did NOT move: the photograph still carries 「（見本）」
//      (`EventPhoto.sample`), the caveat stays OFF the name because names are
//      spoken aloud, and every one of these is `inferred` provenance — the fact
//      list says the tool guessed them.

export interface SeedBrandInput {
  name: string;
  industry?: string | null;
  description?: string | null;
  /** Adopted palette, if the brand has one. Missing keys mean missing values. */
  palette?: { primary?: string; accent?: string; text?: string; background?: string };
  /** Adopted typography, if the brand has any. */
  headingFont?: string | null;
  bodyFont?: string | null;
  /**
   * The brand's mark, WITH what was measured about it.
   *
   * One field rather than a bare `logoSrc`, because the two were separable and
   * got separated: the promoter measured the artwork, wrote the result to
   * `brand_materials`, returned only the id, and the brief went out with no
   * measurement at all. The renderer then had to guess, guessed "opaque", and
   * drew a near-black SVG unchanged on the ink ground.
   *
   * Absent measurements are still legal — a caller may genuinely not know — and
   * `markPainting` handles that safely. What is no longer possible is passing
   * artwork while forgetting that a measurement exists.
   */
  logo?: {
    src: string;
    /** `null` = not measured. Never taken to mean opaque. */
    opaque?: boolean | null;
    luminance?: number | null;
  } | null;
}

const WEEKDAY_LABEL = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/**
 * The first Friday at least four weeks out.
 *
 * Someone asking for an event video today is not running the event tomorrow;
 * they are preparing one, and preparation runs a month or two. Friday evening
 * is when this kind of gathering actually happens. Wrong for any given event,
 * right often enough to be worth proposing — and instantly correctable.
 */
export function proposedDate(now: Date): Date {
  const date = new Date(now.getTime());
  date.setDate(date.getDate() + 28);
  while (date.getDay() !== 5) date.setDate(date.getDate() + 1);
  return date;
}

const formatDate = (date: Date): string =>
  `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;

export function seedEventCmBrief(
  brand: SeedBrandInput,
  options: {
    now: Date;
    seed: string;
    /**
     * The painting the user chose in the add dialog (a theme id). Absent means
     * nobody chose, and the template's first declared painting is used — the
     * one `defaultRenders` also names, so a take made with no opinion and its
     * render row agree.
     */
    artDirection?: string;
  },
): EventCmBrief {
  const archetype = archetypeFor(brand);
  const subject = subjectFor(brand);
  const date = proposedDate(options.now);
  const provenance: EventCmProvenance = {};
  const inferred = (path: string, note?: string) => {
    provenance[path] = { origin: "inferred", note };
  };
  const fromBrand = (path: string) => {
    provenance[path] = { origin: "brand" };
  };

  // The brand supplies its own name; everything narrative is a proposal.
  fromBrand("presenter");
  inferred("title", `業種「${brand.industry ?? "—"}」から${archetype.kind}を想定`);
  inferred("subtitle");
  inferred("seriesLabel");
  inferred("valueLines");
  inferred("valueChip");
  inferred("programs", `${archetype.kind}の一般的な進行`);
  inferred("schedule.date", "今日から4週間後以降の最初の金曜日");
  inferred("schedule.time", `${archetype.kind}に多い開始時刻`);
  inferred("cta");
  inferred("guests", "登壇者は見本の氏名・所属・見本写真を仮置き。実在しません");

  // The voice starts OFF, and that is a finished state rather than a missing
  // one (owner's call, 2026-08-30).
  //
  // It used to start on — meaning "unrecorded" — so a take that had just been
  // created opened with two outstanding steps against a film nobody had
  // touched. A recording is one of the narration's two outputs, like the
  // subtitles are (types.ts `EVENT_CM_CAPTIONS_PATH`); declining an output is a
  // decision, not an incomplete job. A film with words on screen and music
  // under them is complete. Switching the voice ON is what creates the work,
  // and that is when the count appears — because until somebody asks for a
  // reading, there is nothing owing.
  //
  // Recorded as a suppression for the same reason narration-off is one: there
  // is nothing to null out, so "off" has to be stored as a decision or the next
  // read would treat it as never-set.
  provenance[EVENT_CM_VOICE_PATH] = {
    origin: "inferred",
    note: EVENT_CM_SUPPRESSED_NOTE,
  };
  inferred("narration", "テンプレートの下書き。資料を読むと書き直されます");

  // The one slot the pool dresses. A null here is not a hole: the composition
  // draws a designed substitute, which is the template's whole premise.
  //
  // Ink art and texture used to be seeded here too. Neither is drawn by any
  // event-cm scene — they were event-promo's, inherited by an `extends` that has
  // since been removed (remotion/event-cm/types.ts).
  //
  // THE TEMPLATE'S TRACK FOR THIS PAINTING, not the brand's industry's. This
  // used to read `defaultAsset("bgm", archetype.tone)`, which made the music a
  // consequence of what business the customer is in — two event videos could
  // open differently for a reason nobody chose, and the brand had no say
  // either. The music now follows the one thing the user DID choose: the art
  // direction (lib/templates/catalog.ts `artDirections`). Two takes of the
  // same painting always open on the same track.
  const template = currentTemplate("event-cm");
  const artDirection =
    options.artDirection ??
    (template ? defaultArtDirection(template) : undefined) ??
    NEW_FILM_THEME_ID;
  const dressing = template
    ? templateDressing(template, artDirection)
    : { bgm: undefined, visuals: {} as Record<string, string> };
  const bgm = templateBgm(dressing.bgm);
  if (bgm) inferred("bgm", "テンプレートの既定BGM");

  // The visual slots, one tier further down the same ladder.
  //
  //   1. the brand's own picture — brands arrive with a logo and a palette,
  //      almost never with photography, so this is usually empty
  //   2. the template's stock picture for this painting — here. 墨 has a set;
  //      standard has none yet (its pictures are being made, docs/demo-assets.md
  //      §6), so a standard film stands on tier 3 until they land
  //   3. the composition's designed substitute — an ink ground and gold
  //      particles, or the corporate wash, which is a finished frame, not a hole
  //
  // Tier 3 is why this can be empty and the film still complete. That premise
  // is what lets the pool grow later without touching a template.
  const visual = (path: string) => {
    const asset = templateVisual(dressing.visuals[path]);
    if (asset) inferred(path, "テンプレートの既定画像");
    return asset ? { src: asset.src } : null;
  };

  // A SAMPLE FACE, and the film says so in the name beside it.
  //
  // The rest of this seeder guesses freely because a wrong guess is corrected
  // in five seconds. A face is the exception: nobody can tell by looking that
  // it was guessed, so a stock portrait beside a plausible name is the one
  // place this tool could be mistaken for a record of a real event.
  //
  // The answer is not to withhold the picture. A speaker scene carried by
  // monograms undersells what the template can do, and 「ゲストスピーカー」's
  // monogram is its first character — 「ゲ」, which reads as a truncated word
  // rather than an initial. So: show the photograph, and tag the PICTURE
  // 「見本」 where a viewer is already looking (EventPhoto.sample). Names stay
  // clean roles — putting the caveat in the name made the voice say it.
  //
  // Deliberately a weaker guard than it could be, at this stage. The point of
  // the demo is that somebody sees their own event, rendered better than they
  // expected, and nothing later happens if that does not land. If the label
  // turns out to confuse more than it protects, it comes off — the decision
  // lives here and in catalog.ts, nowhere else.
  const portrait = (path: string) => {
    const asset = templatePortrait(dressing.visuals[path]);
    if (asset) inferred(path, "テンプレートの見本写真");
    // The caveat rides on the PICTURE. It was on the name for a day, and the
    // narration read it aloud — 「ゲストスピーカー見本と、モデレーター見本が」.
    return asset ? { src: asset.src, sample: true } : null;
  };

  // NO DUMMY MARK HERE, even though the pool has four.
  //
  // This is where the seeder stops guessing, and the line is not arbitrary: a
  // photograph of a tea room claims nothing about anybody, a sample face is
  // labelled 「（見本）」 beside it, but a MARK shown next to a company's name
  // reads as that company's identity — a trademark-shaped claim, and not one
  // anybody corrects in five seconds.
  //
  // The typographic credit is the designed answer, not a hole: 「ロゴなし→
  // 明朝のクレジット表記」 is the fallback this art direction was built with.
  // The pool's marks are there for fixtures (scripts/compare-art-directions.ts)
  // and for a user to choose, not for this function to assign.
  if (brand.logo) fromBrand("logos");
  else inferred("logos", "ロゴ画像が未解決のため、明朝のクレジット表記で代替");

  // The brand's look, pinned. What it does not have keeps the theme's own —
  // and an absent accent is recorded as the tool's, not the brand's.
  const hasBrandLook = Boolean(
    brand.palette?.accent || brand.headingFont?.trim() || brand.bodyFont?.trim(),
  );
  if (hasBrandLook) fromBrand("theme");
  else inferred("theme", "ブランドの配色・書体が未採用のため、テーマの既定で描く");
  if (!brand.palette?.accent) {
    inferred("theme.accent", "このブランドはアクセントを持たないため、テーマの色を使う");
  }

  // Titles AND what each one covers. The narration speaks the detail, so it is
  // proposed here rather than invented while writing (types.ts EventProgram).
  const proposedPrograms = archetype.programsFor(subject);

  const brief: EventCmBrief = {
    presenter: brand.name,
    seriesLabel: archetype.seriesLabel,
    title: archetype.titleFor(subject),
    subtitle: archetype.subtitle,
    valueLines: [...archetype.valueLines],
    valueChip: archetype.valueChip,
    programsHeading: `${proposedPrograms.length}つのプログラム`,
    programs: proposedPrograms,
    guestsHeading: "登壇者",
    // Two speakers, in the shape an event actually has them (owner's call,
    // 2026-08-30 — rule 2 at the top of this file).
    //
    // The guest is from OUTSIDE and the moderator is the host: that is the
    // usual arrangement, and it is why only one of these carries a made-up
    // company. The moderator's is the brand's own name, which is not a guess at
    // all — the one real fact in the pair.
    //
    // `role` carries the company on its own line above the title. Both
    // presentations set it with `white-space: pre-line`
    // (render/KitComponent.tsx), so the newline is the layout: 名前 / 会社 /
    // 肩書き, which is how a speaker is credited.
    guests: [
      {
        name: "山田太郎",
        role: "株式会社サンプル\n代表取締役CEO",
        photo: portrait("guests.0.photo"),
      },
      {
        name: "山田花子",
        role: `${brand.name}\n広報`,
        photo: portrait("guests.1.photo"),
      },
    ],
    schedule: {
      date: formatDate(date),
      weekday: WEEKDAY_LABEL[date.getDay()],
      time: `${archetype.startHour}:00 START`,
      // Facts nobody has stated stay absent rather than becoming "未定".
      venue: null,
      fee: null,
    },
    cta: archetype.cta,
    footnote: null,
    logos: [
      {
        name: brand.name,
        src: brand.logo?.src ?? null,
        // Carried, not recomputed. The renderer derives the treatment from
        // these (remotion/kit/mark.ts) and cannot read the database.
        ...(brand.logo?.opaque === undefined ? {} : { opaque: brand.logo.opaque }),
        ...(brand.logo?.luminance === undefined
          ? {}
          : { luminance: brand.logo.luminance }),
      },
    ],
    visuals: {
      value: visual("visuals.value"),
      programs: visual("visuals.programs"),
      closing: visual("visuals.closing"),
    },
    bgm: bgm?.src ?? null,
    // The painting the user picked in the add dialog, or the template's first
    // when nobody picked. It used to be stamped from a global default, which
    // meant asking for モダンジャパニーズ and being handed a white corporate
    // film with no switch anywhere to correct it; then from the template's one
    // declared painting, which meant no way to ask for the other. Now the
    // dialog asks, and this records the answer.
    //
    // `NEW_FILM_THEME_ID` is the last resort for a template that has declared
    // nothing at all, and event-cm never reaches it.
    artDirection,
    theme: {
      palette: brand.palette,
      headingFont: brand.headingFont ?? null,
      bodyFont: brand.bodyFont ?? null,
    },
    provenance,
    narration: { version: 1, scenes: [], source: "seed", updatedAt: "", angle: "" },
  };
  // Filled last, because which lines a film needs is a question about the film.
  return { ...brief, narration: draftNarration(brief, options.now) };
}

/**
 * A line for every picture that speaks, before anyone has written one.
 *
 * The narration is what the film is built on — it decides each scene's length,
 * its subtitles, and what the voice reads — so a take seeded without one is a
 * take seeded without its spine. It used to start empty, which made 「追加した
 * 瞬間に完成した映像が再生される」 true of the PICTURES and false of the words.
 *
 * These lines say what their scene is FOR and state no facts. That distinction
 * is the whole reason they are safe to speak aloud: a seeded date sits in the
 * fact list wearing a 「仮に入れた値」 label, but a subtitle has no label on it
 * — 「9月18日、渋谷でお待ちしています」 would read as an announcement, while
 * 「開催日と会場を、最後にここでお伝えします」 reads as a draft (README
 * 「捏造の方針」). Lengths sit inside each scene's budget, so the seeded film
 * runs at roughly the length the written one will.
 *
 * `source: "seed"`: this is a draft, and the mapping stage must replace it
 * without being asked twice — the same as `"llm"`, since every decision asks
 * whether the source is `"human"`. It was recorded as `"llm"` until 2026-08-29,
 * which got the behaviour right and the record wrong: no model wrote these.
 */
const DRAFT_LINES: Partial<Record<EventCmSceneRole, string>> = {
  title: "はじめに、このイベントの名前と主旨をお伝えします。",
  value:
    "参加する理由をここでお伝えします。この時間で何が得られるのかを、ひとことでまとめる場所です。",
  guests: "当日お話しいただく方について、ここでご紹介する場所です。",
  cta: "開催日と会場、お申し込みの方法を、最後にここでお伝えします。",
};

// Longer than they were, because the programmes now carry what they cover and
// the scene budget grew with them (eventCmSceneBudget). A draft is also the
// film's FIRST length estimate — stage one of 「想定尺 → 文字数 → 実測」 — so a
// draft much shorter than the line that replaces it makes the freshly seeded
// video mistime itself. Still not one fact: 「この時間で扱う内容を、ここで一文
// にします」 reads as a placeholder, which is the whole point.
const DRAFT_PROGRAM_LINES = [
  "当日の流れをご紹介します。ひとつめのプログラムでは何を扱うのか、その中身をここで一文にしてお伝えします。",
  "ふたつめのプログラムについて、扱う内容をここで一文にしてお伝えする場所です。",
  "みっつめのプログラムについて、扱う内容をここで一文にしてお伝えする場所です。",
];

function draftNarration(brief: EventCmBrief, now: Date): EventCmNarration {
  return {
    version: 1,
    scenes: eventCmNarratedSteps(brief).map((step) => ({
      role: step.role,
      ...(step.index === undefined ? {} : { index: step.index }),
      text:
        step.role === "program"
          ? (DRAFT_PROGRAM_LINES[step.index ?? 0] ??
            DRAFT_PROGRAM_LINES[DRAFT_PROGRAM_LINES.length - 1])
          : (DRAFT_LINES[step.role] ?? ""),
    })),
    source: "seed",
    updatedAt: now.toISOString(),
    angle: "テンプレートの下書き。資料を読むと書き直されます",
  };
}

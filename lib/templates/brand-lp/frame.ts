import type { BrandLpBrief, LpBasis, LpContent, LpSection } from "./brief-schema";
import type { LpContext, LpFact } from "./context";

// The frame: the page a brand gets from its facts alone, with no model.
//
// Every section has a place to take its words from, and a stand-in for when
// that place is empty — so a brand with a name and nothing else still gets a
// whole page, and each stand-in is recorded as `sample` on the section it
// fills. The writer (write.ts) then rewrites the words; it does not change
// where they came from. That is decided here, by rule, because "is this
// customer's voice real" is not a question to put to the model that wrote it.
//
// Pure.

/** Longer than this, a measured CTA is a sentence, not a button. */
export const CTA_MAX = 12;
const DEFAULT_CTA = "お問い合わせ";

export const SAMPLE_FEATURES = [
  { title: "すぐに始められる", body: "申し込みから利用開始までの手順を最小限にしました。必要な準備はわずかです。" },
  { title: "使い続けやすい設計", body: "毎日迷わず使えるよう、画面と導線をシンプルに保っています。" },
  { title: "安心のサポート", body: "はじめての方にも、導入前の相談から利用開始後まで担当が伴走します。" },
];

export const SAMPLE_VOICES = [
  { quote: "使い始めてから、日々の確認にかかる時間が大きく減りました。必要な情報にすぐたどり着けます。", name: "K.S さん", role: "ご利用者" },
  { quote: "はじめてでも迷わず使えました。困ったときの案内も丁寧で、安心して続けられています。", name: "M.T さん", role: "ご利用者" },
  { quote: "導入の決め手はわかりやすさでした。周りにもすすめています。", name: "A.N さん", role: "ご利用者" },
];

type AnyFact = LpFact<unknown> | null;

/** A section that stands on these facts: from the kit, or with some readings not yet confirmed in it. */
function standing(facts: AnyFact[], notes: { kit: string; workspace: string }): LpBasis {
  const present = facts.filter((fact): fact is LpFact<unknown> => fact !== null);
  const pending = present.filter((fact) => fact.origin === "workspace").map((fact) => fact.path);
  return {
    origin: pending.length > 0 ? "workspace" : "kit",
    paths: present.map((fact) => fact.path),
    pending,
    note: pending.length > 0 ? notes.workspace : notes.kit,
  };
}

const sample = (note: string, facts: AnyFact[] = []): LpBasis => {
  const present = facts.filter((fact): fact is LpFact<unknown> => fact !== null);
  return {
    origin: "sample",
    paths: present.map((fact) => fact.path),
    pending: present.filter((fact) => fact.origin === "workspace").map((fact) => fact.path),
    note,
  };
};

export type Framed = {
  content: LpContent;
  basis: BrandLpBrief["basis"];
  /** How many of the features / voices came from the brand, for the writer. */
  sourced: { features: number; voices: number };
};

export function frameLp(context: LpContext): Framed {
  const { kit, tagline, description, audience, summary, ctaLabel } = context;
  const name = kit.brand.name;
  const about = description ?? summary;
  const basis = {} as Record<LpSection, LpBasis>;

  // ---- hero, overview, closing: all stand on what the brand says it is
  basis.hero = about
    ? standing([tagline, description, summary], {
        kit: "キットの説明とタグラインから書いています",
        workspace: "AIが読み取った、キットに未確定の項目から書いています",
      })
    : sample("ブランドの説明がキットにもワークスペースにも無いため、名前だけで組んだ仮の内容です", [tagline]);
  basis.overview = about
    ? standing([description, summary, audience], {
        kit: "キットの説明から書いています",
        workspace: "AIが読み取った、キットに未確定の項目から書いています",
      })
    : sample("ブランドの説明が無いため、仮の内容です");
  basis.closing = about
    ? standing([description, ctaLabel], {
        kit: "キットの説明と CTA の文言から書いています",
        workspace: "AIが読み取った、キットに未確定の項目から書いています",
      })
    : sample("ブランドの説明が無いため、仮の内容です", [ctaLabel]);

  // ---- features: the brand's own, topped up to three
  const ownFeatures = (context.features?.value ?? []).slice(0, 3);
  basis.features =
    ownFeatures.length >= 3
      ? standing([context.features], {
          kit: "キットの特長から書いています",
          workspace: "AIがサイトから読み取った特長（キットに未確定）から書いています",
        })
      : sample(
          ownFeatures.length > 0
            ? `特長が${ownFeatures.length}件しか読み取れていないため、残りは説明文から書いた仮の内容です`
            : "特長がキットにもサイトの読み取りにも無いため、説明文から書いた仮の内容です",
          [context.features],
        );

  // ---- voices: the brand's own, word for word, or stand-ins
  const ownVoices = (context.voices?.value ?? []).slice(0, 3);
  basis.voices =
    ownVoices.length > 0
      ? standing([context.voices], {
          kit: "キットのお客様の声をそのまま載せています",
          workspace: "AIがサイトから読み取ったお客様の声（キットに未確定）をそのまま載せています",
        })
      : sample("お客様の声がキットにもサイトの読み取りにも無いため、架空の仮の内容です。公開前に実際の声へ差し替えてください");

  const sub = about?.value ?? `${name} のご紹介です。`;
  return {
    content: {
      hero: {
        eyebrow: kit.brand.industry || "",
        headline: tagline?.value ?? name,
        sub,
      },
      overview: {
        heading: `${name} とは`,
        body: [description?.value, summary?.value].filter(Boolean).join(" ") || sub,
        points: [],
      },
      features: {
        heading: `${name} の特長`,
        items: [
          ...ownFeatures.map((item) => ({ title: item.title, body: item.description })),
          ...SAMPLE_FEATURES.slice(0, 3 - ownFeatures.length),
        ],
      },
      voices: { heading: "お客様の声", items: ownVoices.length > 0 ? ownVoices : SAMPLE_VOICES },
      closing: { headline: "まずは、お気軽にどうぞ。", sub: "" },
      cta: {
        label: ctaLabel && [...ctaLabel.value].length <= CTA_MAX ? ctaLabel.value : DEFAULT_CTA,
        href: kit.brand.website || "#",
      },
    },
    basis,
    sourced: { features: ownFeatures.length, voices: ownVoices.length },
  };
}

// What kind of event a brand would plausibly hold.
//
// The product's opinion, written as rules (§17.2). A finance-education media
// company runs an evening talk with two speakers and a Q&A; a restaurant runs
// a tasting; a B2B tool runs a meetup. Nobody told us that — but guessing it
// well is the whole difference between handing someone a finished film and
// handing them an empty form.
//
// Everything here is a PROPOSAL, recorded as `inferred` in the brief's
// provenance and warned about on publish. The one thing archetypes never do is
// invent a person: a plausible date can be corrected, a plausible speaker is a
// lie with a name on it.

export interface EventArchetype {
  id: string;
  /** Human label for the kind of gathering. */
  kind: string;
  /** Words in the brand's industry or description that select this archetype. */
  matches: RegExp;
  /** Title built from the brand's own subject matter, never free invention. */
  titleFor: (subject: string) => string;
  subtitle: string;
  seriesLabel: string;
  /** Two short lines — the template sets them as the value scene's key copy. */
  valueLines: [string, string];
  valueChip: string;
  /**
   * Three programmes, as CONTENT rather than format.
   *
   * Every archetype used to propose the running order — 「専門家による解説」,
   * 「ゲストとの対談」, 「質疑応答」 — and that is why the agenda scenes had
   * nothing to say: the only line available for 「専門家による解説」 is 「主催者
   * が解説します」. A programme that names what you will LEARN gives the
   * narration a sentence, and gives the viewer a reason.
   *
   * The arc is the same in every archetype and generalises past this template's
   * examples: **where it came from → what it actually is → what kinds there
   * are**. It fits 金融教育 and it fits 陶芸, 仮想通貨, インターネット広告
   * without changing shape — which is the test the requester set.
   *
   * A function of the subject, like `titleFor`, so a domain that has its own
   * vocabulary can use it and a general one can fall back to the subject.
   */
  programsFor: (subject: string) => Array<{ title: string; detail: string }>;
  cta: string;
  /** Start time that suits this kind of gathering. 24h, on the hour. */
  startHour: number;
  /** Which of the default asset pool's tones dresses it (lib/assets/defaults). */
  tone: string;
}

/**
 * Ordered: the first match wins, so the specific sits above the general and
 * the catch-all sits last.
 */
export const EVENT_ARCHETYPES: EventArchetype[] = [
  {
    id: "finance-talk",
    kind: "セミナー",
    matches: /金融|投資|資産|保険|証券|銀行|フィンテック|会計|税/,
    titleFor: (subject) => `${subject}を、じっくり考える夜`,
    subtitle: "〜これからの選択を、根っこから〜",
    seriesLabel: "トークシリーズ",
    valueLines: ["数字の向こう側にある、", "判断の根拠を持ち帰る。"],
    valueChip: "少人数で、深く",
    programsFor: (subject) => [
      {
        title: "お金の歴史",
        detail:
          "貨幣がどう生まれ、資本主義を経て、投資という仕組みが発明されたのかをたどります。",
      },
      {
        title: "そもそも投資とは何か",
        detail:
          "投機や賭けと何が違うのか、判断の基準になる考え方を整理します。",
      },
      {
        title: "投資の種類",
        detail:
          "株式、不動産、債券、金。それぞれが何に賭けているのかを並べて見ます。",
      },
    ],
    cta: "詳細・お申し込みはこちら",
    startHour: 19,
    tone: "ink",
  },
  {
    id: "learning-session",
    kind: "講座",
    matches: /教育|学習|スクール|研修|大学|アカデミ|キャリア|教室|講座|ワークショップ/,
    titleFor: (subject) => `${subject}をはじめる、最初の一歩`,
    subtitle: "〜知識を、使える形にする〜",
    seriesLabel: "公開講座",
    valueLines: ["聞いて終わりにしない。", "その日から動ける形で。"],
    valueChip: "実践までを一度に",
    programsFor: (subject) => [
      {
        title: `${subject}の成り立ち`,
        detail:
          "どこから生まれ、いま何がどう変わりつつあるのかを最初に押さえます。",
      },
      {
        title: "よくある誤解",
        detail:
          "入り口でつまずきやすい思い込みを、ひとつずつほどいていきます。",
      },
      {
        title: "使いはじめる手順",
        detail:
          "明日から手を動かすために、何をどの順で選ぶのかを具体的に示します。",
      },
    ],
    cta: "詳細・お申し込みはこちら",
    startHour: 19,
    tone: "ink",
  },
  {
    id: "tech-meetup",
    kind: "ミートアップ",
    matches: /SaaS|ソフト|テック|AI|開発|エンジニア|クラウド|データ|IT/i,
    titleFor: (subject) => `${subject}の現場で、いま起きていること`,
    subtitle: "〜つくっている人の話を聞く〜",
    seriesLabel: "ミートアップ",
    valueLines: ["資料には出てこない、", "現場の判断を聞く。"],
    valueChip: "つくり手が話す",
    programsFor: (subject) => [
      {
        title: `${subject}のいまの地図`,
        detail:
          "何がすでに解かれていて、どこがまだ手作業なのかを整理します。",
      },
      {
        title: "設計の選びかた",
        detail:
          "つくり手が実際に何と何を比べ、どちらを捨てたのかを聞きます。",
      },
      {
        title: "動かして確かめる",
        detail:
          "手元で試しながら、詰まりやすいところをその場で聞ける時間です。",
      },
    ],
    cta: "参加登録はこちら",
    startHour: 19,
    tone: "ink",
  },
  {
    id: "tasting",
    kind: "体験会",
    matches: /飲食|レストラン|カフェ|食品|酒|料理|菓子|小売|物販/,
    titleFor: (subject) => `${subject}を、味わってから選ぶ`,
    subtitle: "〜つくり手と囲む時間〜",
    seriesLabel: "体験会",
    valueLines: ["説明ではなく、", "その場で確かめる。"],
    valueChip: "つくり手と一緒に",
    programsFor: (subject) => [
      {
        title: `${subject}のつくり方`,
        detail:
          "素材から仕上げまで、どんな判断の積み重ねでできているのかを聞きます。",
      },
      {
        title: "違いが分かる、という体験",
        detail:
          "並べて味わうと何が見えるのか。言葉になる前の差を確かめます。",
      },
      {
        title: "選び方の基準",
        detail:
          "好みをどう言葉にするか。次に自分で選ぶための物差しを持ち帰ります。",
      },
    ],
    cta: "詳細・お申し込みはこちら",
    startHour: 18,
    tone: "ink",
  },
  {
    id: "public-lecture",
    kind: "講演会",
    matches: /医療|福祉|介護|健康|クリニック|病院|NPO|行政|自治体/,
    titleFor: (subject) => `${subject}のこれからを、みんなで考える`,
    subtitle: "〜専門家と、地域と〜",
    seriesLabel: "公開講演会",
    valueLines: ["ひとりで抱えないために、", "まず知っておくこと。"],
    valueChip: "どなたでも",
    programsFor: (subject) => [
      {
        title: `${subject}のいま`,
        detail:
          "数字と制度が、この数年でどう変わってきたのかを最初に共有します。",
      },
      {
        title: "現場で起きていること",
        detail:
          "統計には出てこない、日々の判断と迷いのほうを聞きます。",
      },
      {
        title: "備えておけること",
        detail:
          "いま手元でできる準備と、頼れる先をひとつずつ確かめます。",
      },
    ],
    cta: "詳細・お申し込みはこちら",
    startHour: 14,
    tone: "ink",
  },
  {
    id: "general-seminar",
    kind: "セミナー",
    // The catch-all. Matches anything, so it must be last.
    matches: /.*/,
    titleFor: (subject) => `${subject}について、話をします`,
    subtitle: "〜現場の視点から〜",
    seriesLabel: "セミナー",
    valueLines: ["一般論ではなく、", "実際に起きていることを。"],
    valueChip: "現場の話を",
    // The general arc, and the one every other archetype is a specialisation
    // of: **where it came from → what it actually is → what kinds there are.**
    // Written against 金融 and checked against 陶芸, 仮想通貨 and インター
    // ネット広告, which is the test set the requester named. An arc of
    // 「全体像 / 判断の分かれ目 / 事例」 fitted a consulting talk and said
    // nothing about a craft or a currency.
    programsFor: (subject) => [
      {
        title: `${subject}の成り立ち`,
        detail: `${subject}がどこから生まれ、いまの形になるまでに何があったのかをたどります。`,
      },
      {
        title: `そもそも${subject}とは何か`,
        detail:
          "よく混同されるものとの違いを、自分で判断できる基準の形に整理します。",
      },
      {
        title: `${subject}の種類`,
        detail:
          "どんなやり方があり、それぞれ何に向いているのかを並べて見ます。",
      },
    ],
    cta: "詳細・お申し込みはこちら",
    startHour: 19,
    tone: "ink",
  },
];

export function archetypeFor(input: {
  industry?: string | null;
  description?: string | null;
}): EventArchetype {
  const haystack = `${input.industry ?? ""} ${input.description ?? ""}`;
  return (
    EVENT_ARCHETYPES.find((archetype) => archetype.matches.test(haystack)) ??
    EVENT_ARCHETYPES[EVENT_ARCHETYPES.length - 1]
  );
}

/**
 * What the event is about, in a few words, taken from the brand's own text.
 *
 * Reusing the brand's industry keeps the title grounded in something the
 * brand actually said about itself. Inventing a subject would put words in
 * their mouth that no later correction traces back to a source.
 */
export function subjectFor(input: {
  industry?: string | null;
  name: string;
}): string {
  const industry = input.industry?.trim();
  if (!industry) return input.name;
  // "金融教育メディア" → "金融教育": the medium is how they publish, not what
  // the evening is about. Same for the shape of the organisation — a 代理店 or
  // a 教室 is who is speaking, and leaving it in produced titles like
  // 「インターネット広告代理店の全体像」.
  //
  // Repeated, because they stack: 「仮想通貨の情報サービス」 → 「仮想通貨の情報」
  // → 「仮想通貨」. One pass left the middle one.
  const NOISE = /(メディア|サービス|事業|会社|カンパニー|代理店|教室|スクール|研究所|総研|ラボ|支援|の情報)$/u;
  let subject = industry;
  for (let pass = 0; pass < 4; pass += 1) {
    const trimmed = subject.replace(NOISE, "").trim();
    if (!trimmed || trimmed === subject) break;
    subject = trimmed;
  }
  return subject || industry;
}

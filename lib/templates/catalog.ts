// The template catalog — what kinds of marketing tool this product can make.
//
// This is the authority (docs/old/schema-v2.md §8). public.template_versions is a
// ledger of what has existed, written from here by lib/templates/ledger.ts; it
// is never edited by hand and never treated as the definition.
//
// Adding a template means adding an entry here plus its renderer and its brief
// schema. The order is deliberate: the template declares the shape of the data
// it needs, and that shape is what the collection pipeline goes and fills.
//
// Deliberately free of zod and of any server-only import: the video portal and
// the add dialog are client components and only need this metadata.

export const TOOL_KINDS = [
  "lp",
  "video",
  "banner",
  "guideline",
  "logo_presentation",
  "site",
  "merch",
  "document",
  "other",
] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

/** The fixed small vocabulary a template picks a subset of. */
export const PIPELINE_STAGES = [
  "collect",
  "extract",
  "structure",
  "render",
  "publish",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Surfaces a template is able to publish to. Publishing to a surface the
 *  template does not declare is refused (docs/old/schema-v2.md §12). */
export const PUBLISH_SURFACES = [
  "canonical_url",
  "vanity_url",
  "embed",
  "social",
  "custom_domain",
] as const;
export type PublishSurface = (typeof PUBLISH_SURFACES)[number];

export type RenderFormat = "mp4" | "html" | "png" | "pdf" | "svg" | "wav";

/** One output unit the template produces by default. Locale, aspect ratio and
 *  theme belong to the render, never to the take. */
export interface RenderSpec {
  locale: string;
  aspectRatio: string;
  theme: string;
  format: RenderFormat;
}

export interface CostProfile {
  /** Charged LLM calls happen in this template's pipeline. */
  llm: boolean;
  /** Charged text-to-speech happens. */
  tts: boolean;
  /** none = derived on read, local = needs headless Chrome, cloud = Lambda. */
  render: "none" | "local" | "cloud";
}

/**
 * One painting a template can be made in, and what a new take of it opens with.
 *
 * `id` is a theme id (remotion/kit/theme.ts `THEMES`). The pool ids follow the
 * same rules as `defaultBgm` / `defaultVisuals` on the template — they are the
 * per-painting reading of those two fields, which stay as the fallback.
 */
export interface ArtDirectionEntry {
  id: string;
  /** Pool track a new take of this painting opens with. */
  bgm?: string;
  /** Pool pictures for the visual slots, keyed by brief path. */
  visuals?: Record<string, string>;
}

export interface TemplateEntry {
  id: string;
  /** Bumped whenever the rendered result or the brief shape can change. Takes
   *  pin this number, so an old take keeps pointing at what it was made with. */
  version: number;
  toolKind: ToolKind;
  briefSchemaVersion: number;
  /** Identifies the renderer build. Recorded on the ledger row so "why does
   *  this look different" has an answer that is not "we think it changed". */
  rendererRevision: string;
  /**
   * The display name, for templates that do NOT belong to a family.
   *
   * A template with a `family` must not set this: its name IS
   * `family - variant`, derived by `templateName()`. Two places holding the
   * name is how the picker and the list came to disagree — the dialog said
   * イベント紹介動画/スタンダード while the badge said イベント動画.
   */
  name?: string;
  summary: string;
  /** What the template needs in order to render at all. */
  requires: string;
  duration?: string;
  /** Video-specific: whether narration is part of the template. */
  narration?: boolean;
  /**
   * Video-specific: whether editing accumulates instead of reaching the film.
   *
   * True means the take carries two briefs — the one being edited and the one a
   * run fixed — and the player, the export and the public URL all read the
   * fixed one (`takes.baked_brief`, migration 0050). The screen then owes the
   * user an account of the difference, which is what `lib/event-cm/bake.ts`
   * computes. False (the default) means a saved edit is the film.
   */
  bakesBrief?: boolean;
  /**
   * Whether this template's brief is authored on the deliverable surface —
   * the pipeline, the storyboard, the fact list, the narration and the film
   * step (docs/template-contract.md §3).
   *
   * Declared here rather than compared as a template id in the screen. The
   * screen used to ask `video.template === "event-cm"` in seven places, which
   * made a property of the template a fact about one string, and put the
   * decision 1,900 lines deep in a component.
   *
   * A template may only declare this once it supplies the whole contract:
   * a fact ontology, a seed from the brand, the reading stages, a scene
   * vocabulary, the bake, and provenance. Setting it true with a piece missing
   * gives the surface nothing to draw. The operations themselves still resolve
   * to lib/templates/event-cm directly; turning this on for a SECOND template
   * is what forces them into a lookup, and that is where the interface should
   * be designed — against two vocabularies rather than one (§3.1).
   */
  authoring?: boolean;
  /**
   * Video-specific: the id of the pool track a new take starts with.
   *
   * THE DEFAULT BGM BELONGS TO THE TEMPLATE, not to the brand and not to the
   * brand's industry (owner's decision, 2026-08-17). An event promo and a
   * product film want different music because they are different kinds of
   * film — that is a property of the template, and it does not vary by who is
   * making one. Every new take of a template gets the same track.
   *
   * It used to be chosen from the seeded archetype's `tone`, which made the
   * music a consequence of the brand's industry: two takes of the same template
   * could open with different music for no reason the user had chosen.
   *
   * The ids below are PLACEHOLDERS from the two tracks currently in the pool.
   * Proper per-template tracks are to be commissioned; swapping them is editing
   * this field, and nothing else moves — existing takes keep whatever their
   * brief already points at, because a brief is not re-seeded.
   */
  defaultBgm?: string;
  /**
   * Video-specific: pool artwork a new take dresses its visual slots with.
   *
   * Keyed by the brief path the picture fills (`visuals.value`), valued with a
   * pool asset id. Same rule as `defaultBgm`, one tier down the ladder:
   *
   *   1. the BRAND's own picture, when it has one
   *   2. the TEMPLATE's stock picture — here
   *   3. the composition's designed substitute (an ink ground, gold particles)
   *
   * Tier 1 is what a key visual should be, and mostly is not: a brand arrives
   * with a logo, a palette and some type, and hardly ever with photography. So
   * the template needs a decent picture of its own rather than falling
   * straight to tier 3 every time.
   *
   * EMPTY TODAY, deliberately. The pool carries no images yet (owner is
   * preparing them, 2026-08-17), and pointing at artwork that does not exist
   * would put broken slots in every new film. The mechanism is here so that
   * arriving artwork is a pool entry plus a line in this map — the same shape
   * the BGM already has.
   */
  defaultVisuals?: Record<string, string>;
  /**
   * Video-specific: the paintings this template can be made in, in the order
   * the add dialog offers them.
   *
   * A template is a CATEGORY (the shape of the brief); an art direction is how
   * that brief is painted, and the same film can be painted more than one way
   * (README 「アートディレクションは交換できる」). So the dialog's second
   * question — the style — is answered from here, not by a second template id.
   * Each entry also carries what a new take of that painting is dressed with,
   * because the dressing follows the painting: 和モダン opens on the ink track
   * and a tea room, the corporate film on the bright track and — once the pool
   * has them — bright photographs (docs/demo-assets.md §6).
   *
   * The first entry is what a take gets when nobody chooses, and it must agree
   * with `defaultRenders[0].theme` (lib/kit/themes.test.ts). Absent means one
   * painting, the one `defaultRenders` names, dressed from `defaultBgm` /
   * `defaultVisuals`.
   */
  artDirections?: ArtDirectionEntry[];
  /**
   * Whether the add dialog offers this template. Default true.
   *
   * False keeps a template in the catalog for the takes that already exist —
   * they still render, still list, still open — while no new ones are made.
   * The first step of retiring a template, taken before its code is pulled
   * apart from whatever shares it.
   */
  addable?: boolean;
  stages: PipelineStage[];
  publishSurfaces: PublishSurface[];
  costProfile: CostProfile;
  defaultRenders: RenderSpec[];
  /**
   * Video-specific: the kind of film this is, and the style it is made in.
   *
   * A FAMILY is a kind of film (a product introduction, an event
   * introduction). A VARIANT is the art direction it is made in. The add
   * dialog asks for the family first and the style second, because that is the
   * order the decision is actually made in — "I need an event video" comes
   * before "and I want the modern-Japanese look".
   *
   * The pair still resolves to ONE template id, and the id is what a take
   * pins. So this is grouping for display, not a second axis in the data:
   * adding a style means adding an entry here, exactly as before.
   *
   * Not part of `templateSpec()`. The ledger records what a version promised —
   * scene structure, cost, surfaces — and how the picker groups it is not that.
   * Regrouping the dialog must not look like the template changed.
   */
  family?: string;
  variant?: string;
  /** Every brand is offered exactly one of these, unpublished. */
  isBrandDefault: boolean;
  /**
   * Whether a take pinned to THIS version can still be re-rendered after a
   * newer version ships. Declared honestly rather than assumed: a template
   * whose inputs live outside its own row cannot promise it.
   */
  rerenderable: boolean;
}

export const TEMPLATES: TemplateEntry[] = [
  {
    id: "logo-presentation",
    version: 1,
    toolKind: "logo_presentation",
    briefSchemaVersion: 1,
    rendererRevision: "react/presentation@2026-08-08",
    name: "ロゴプレゼンテーション",
    summary:
      "ロゴの正本データと編集済みコピー、採用アセット配置から構成する恒久プレゼンテーションです。",
    requires: "ロゴ正本とプレゼンテーション編集内容",
    stages: ["collect", "render", "publish"],
    publishSurfaces: ["canonical_url", "vanity_url"],
    costProfile: { llm: false, tts: false, render: "none" },
    defaultRenders: [
      { locale: "und", aspectRatio: "responsive", theme: "", format: "html" },
    ],
    isBrandDefault: false,
    // The view resolves the immutable template version plus the still-canonical
    // logo master and this Take's editorial snapshot at request time.
    rerenderable: true,
  },
  {
    id: "event-cm",
    version: 1,
    toolKind: "video",
    briefSchemaVersion: 1,
    // Bumped for the end card standing on footage, the second painting, the
    // corporate cue sheet (2026-08-27/28), the standard opening falling
    // silent (2026-08-30), and the third painting (2026-09-24). Now that
    // renders record what drew them
    // (lib/takes/render.ts), a revision left behind would tell an export it
    // was made by a build it was not.
    rendererRevision: "remotion/event-cm@2026-09-24",
    summary:
      "イベント告知のナレーション駆動CM。ナレーションを先に書き、そのボイスのタイミングが画面の尺と並びを決めます。絵はアートディレクションで選びます——モダンジャパニーズ（墨黒×金×明朝・シネスコ帯・写真主役）か、スタンダード（白地×紺×ゴシック）か、ラグジュアリー（ボルドーの黒×シャンパンゴールド×明朝と欧文セリフ・ローマ数字）。章の転換や登壇者の登場は効果音が刻みます。素材が無いスロットは設計済みのフォールバックで描かれます。",
    requires: "イベントの事実（EventBrief）と、そこから書いたナレーション",
    duration: "30秒前後（ナレーションとボイスの長さで決まる）",
    narration: true,
    // Two paintings of the same film. Each carries its own music and its own
    // stock pictures, because a tea room under a corporate title is as wrong
    // as 和太鼓 under one — the dressing follows the art direction, not the
    // template (README 「アートディレクションは交換できる」).
    //
    // STANDARD FIRST (owner's call, 2026-08-30). The first entry is what a take
    // gets when nobody chooses, and `defaultRenders` below has to say the same
    // id — lib/kit/themes.test.ts requires the two to agree, so flipping the
    // default is editing both, once.
    //
    // 墨 led while it was the only painting anyone had watched at delivery
    // quality. It is still the proven one, and it is still what a film with NO
    // art direction recorded is painted in (`LEGACY_THEME_ID` — that is a
    // different question and it protects the approved takes). What changed is
    // which painting a NEW film opens in: standard is the corporate default,
    // 和モダン is the one you choose on purpose.
    artDirections: [
      {
        id: "standard",
        // Three minutes, so a 51-second film never reaches its end and there is
        // no loop seam at all (owner's call, 2026-08-30). The same bed the
        // product film takes — see `defaultBgm` on product-cm for why that is
        // now a decision rather than a coincidence.
        bgm: "bgm-shine-through-tokyo",
        // The bright set, delivered 2026-08-27 and measured at ingest
        // (`node scripts/check-pool-images.mjs … --tone light`). Chosen by what
        // each layout needs, exactly as the 墨 set above:
        //
        // - `programs` is drawn TWICE — full presence under the centred title,
        //   dimmed behind each agenda card — so its subject has to sit
        //   centre-right. The long white table recedes to the right and leaves
        //   a plain sunlit wall on the left: the flattest copy side of the six.
        // - `value` is the hero behind the promise. The desk with paper, pen and
        //   water says 「学ぶ」 in a way an empty corridor cannot, and its busy
        //   left third (measured sd 0.258, the highest here) is tamed by the
        //   lightening scrim at 0.84 rather than fought.
        // - `closing` carries date, venue and the call in its LOWER left, which
        //   is why the lobby won: its lower left is polished sunlit floor, while
        //   the corridor's is a wall that runs the full height.
        //
        // The two portraits are chosen to look UNALIKE, the same rule the 墨
        // pair follows — and the pale studio ground is why they are separate
        // entries at all rather than reused from 墨.
        visuals: {
          "visuals.programs": "still-light-seminar-table",
          "visuals.value": "still-light-desk-notebook",
          "visuals.closing": "still-light-venue-lobby",
          "guests.0.photo": "portrait-light-02",
          "guests.1.photo": "portrait-light-03",
        },
      },
      {
        id: "sumi",
        // Placeholder: matches the 墨黒×金×明朝 art direction. Ducks under the
        // narration and returns for the closing mark.
        bgm: "bgm-ink-cinematic",
        // Subject "日本文化を学ぶ" (docs/demo-assets.md §2). Chosen per slot
        // by what each layout needs, not by which picture is prettiest:
        //
        // - `programs` is drawn TWICE — full presence under the centred title,
        //   and dimmed behind each agenda card. So it needs its subject
        //   centre-right: far right leaves the title standing on empty floor.
        //   茶碗と茶筅 sits right of centre; 炉と光 (still-tearoom-hearth) does
        //   not, and is the alternate rather than the default for that reason
        //   alone.
        // - `value` is the hero behind the promise, so it takes the strongest
        //   picture: 硯と筆 says "learning" without a single written character.
        // - `closing` carries date, venue and the call in its lower left, which
        //   is why the lecture room won over the entrance — its lower left is
        //   empty tatami, the entrance's is textured wet paving.
        //
        // The two speaker portraits are here too, and they are chosen to look
        // UNALIKE. Pool order would have given two grey-haired men in navy
        // suits, and a speaker scene where both panels read as the same person
        // is worse than one with no photographs at all.
        visuals: {
          "visuals.programs": "still-tearoom-bowl",
          "visuals.value": "still-inkstone",
          "visuals.closing": "still-venue-lanterns",
          // Swapped away from the two suited 60-somethings on the requester's
          // first watch (2026-08-25). Which two is not a rule — that they look
          // unalike is. An open-collar shirt and an indigo jacket also read
          // closer to 「学ぶ」 than two boardroom portraits do.
          "guests.0.photo": "portrait-speaker-05",
          "guests.1.photo": "portrait-speaker-06",
        },
      },
      {
        id: "luxury",
        // PLACEHOLDER. The lab's film ran on a track supplied for that one
        // event (Strung Up Joy), whose licence does not reach the pool. The
        // ink track is the pool's only cinematic bed; a luxury track is to be
        // commissioned, and swapping it is this one line.
        bgm: "bgm-ink-cinematic",
        // Subject "夜のホールと名器", the lab's generated set (defaults.ts).
        // Placeholders by the owner's word (2026-09-24). Chosen by what each
        // layout needs, the same way as the two sets above:
        //
        // - `programs` is drawn twice — under the centred title and dimmed
        //   behind each agenda card — so the instrument alone on its plinth,
        //   black all round (left third 0.016), carries both.
        // - `value`: the empty stage with one shaft of light, the lab's
        //   darkest copy side (0.041, sd 0.012) behind the promise.
        // - `closing`: the empty rows before the doors open; the lower left,
        //   where the date and the call sit, is the seats in shadow.
        //
        // The portraits are 墨's charcoal studio pair: a dark ground behind a
        // face is what this painting wants too, and the lab's portraits are of
        // real people.
        visuals: {
          "visuals.programs": "still-luxe-violin-on-stand",
          "visuals.value": "still-luxe-stage-spotlight",
          "visuals.closing": "still-luxe-auditorium-seats",
          "guests.0.photo": "portrait-speaker-05",
          "guests.1.photo": "portrait-speaker-06",
        },
      },
    ],
    // The storyboard is a workbench: edits collect there and reach the film
    // only when the user asks. The only template that works this way today.
    bakesBrief: true,
    // The only template that supplies the whole authoring contract today.
    authoring: true,
    // The script is written by an LLM from the brief, then spoken. Both are
    // charged, and both re-run only when asked.
    //
    // No `variant`: the family has three styles and they are art directions,
    // not templates. The name the user sees is composed from the family and
    // the painting a take carries (lib/video/templates.ts `videoDisplayName`).
    family: "イベント紹介動画",
    stages: ["collect", "structure", "render", "publish"],
    publishSurfaces: ["canonical_url", "embed", "social"],
    costProfile: { llm: true, tts: true, render: "local" },
    defaultRenders: [
      { locale: "ja", aspectRatio: "16:9", theme: "standard", format: "mp4" },
    ],
    isBrandDefault: false,
    // Script, voice timing and the pinned WAV all live on the take, so an old
    // version renders again as long as its materials exist.
    rerenderable: true,
  },

];

/**
 * The one derivation of a template's display name.
 *
 * Grouped templates are named by their pair (`製品紹介動画 - スタンダード`);
 * ungrouped ones carry an explicit `name`; a family whose styles are art
 * directions rather than templates (event-cm) is named by the family alone,
 * and the painting is added per take (lib/video/templates.ts
 * `videoDisplayName`). Every screen reads one of those two, so adding a style
 * or renaming a family moves the picker, the list badge, the video detail
 * header and the default take title together.
 */
export const templateName = (template: TemplateEntry): string =>
  template.name ?? [template.family, template.variant].filter(Boolean).join(" - ");

/**
 * The paintings a template can be made in, in dialog order.
 *
 * A template that declares none has exactly one: whatever `defaultRenders`
 * paints (empty for the tools that do not paint — an LP's theme is its own
 * business). Never empty for a video template that renders.
 */
export const artDirectionIds = (template: TemplateEntry): string[] =>
  template.artDirections?.map((entry) => entry.id) ??
  template.defaultRenders
    .map((render) => render.theme)
    .filter((theme, index, all) => theme.length > 0 && all.indexOf(theme) === index);

/** The painting a take of this template gets when nobody chooses. */
export const defaultArtDirection = (template: TemplateEntry): string | undefined =>
  artDirectionIds(template)[0];

/**
 * What a new take is dressed with, for one painting.
 *
 * Per-painting entries win; the template-level `defaultBgm` / `defaultVisuals`
 * are the answer for a template with one painting, and the fallback for an id
 * the template has not declared — which yields nothing rather than the wrong
 * painting's pictures, so a film that asked for a painting this template does
 * not know stands on its designed ground instead of on a tea room.
 */
export function templateDressing(
  template: TemplateEntry,
  artDirection: string | undefined = defaultArtDirection(template),
): { bgm?: string; visuals: Record<string, string> } {
  const entry = template.artDirections?.find((item) => item.id === artDirection);
  if (template.artDirections && !entry) return { visuals: {} };
  return {
    bgm: entry?.bgm ?? template.defaultBgm,
    visuals: entry?.visuals ?? template.defaultVisuals ?? {},
  };
}

const BY_ID = new Map(TEMPLATES.map((template) => [template.id, template]));

/** The current version of a template. Takes pin a version and must not use this
 *  to resolve one they were not created with. */
export const currentTemplate = (id: string): TemplateEntry | null =>
  BY_ID.get(id) ?? null;

export const isTemplateId = (id: string): boolean => BY_ID.has(id);

/**
 * Whether an exported file was drawn by a renderer that has since changed.
 *
 * `rendererRevision` was declared and written to the ledger, and then read by
 * nothing: fixing the drawing left every existing MP4 silently old, because the
 * only thing that could make an export look stale was a newer bake. The player
 * runs today's composition and the file does not, and nobody was told.
 *
 * `produced` is what the render row recorded at export time
 * (`take_renders.params.rendererRevision`). Unknown is NOT stale: exports made
 * before this was recorded cannot be compared, and claiming they are old would
 * put an amber box on every video once, permanently.
 */
export function rendererChangedSince(produced: unknown, templateId: string): boolean {
  if (typeof produced !== "string" || produced === "") return false;
  const current = currentTemplate(templateId)?.rendererRevision;
  return Boolean(current) && produced !== current;
}

/** What to record on a render so the check above has something to compare. */
export const rendererRevisionOf = (templateId: string): string | null =>
  currentTemplate(templateId)?.rendererRevision ?? null;

export const templatesForTool = (toolKind: ToolKind): TemplateEntry[] =>
  TEMPLATES.filter((template) => template.toolKind === toolKind);

/**
 * The serializable form written to the ledger's `spec`. The brief schema is not
 * in here (it is code); what is in here is everything a later reader needs in
 * order to say what this version promised.
 */
export function templateSpec(template: TemplateEntry): Record<string, unknown> {
  return {
    name: templateName(template),
    summary: template.summary,
    requires: template.requires,
    duration: template.duration ?? null,
    narration: template.narration ?? null,
    stages: template.stages,
    publishSurfaces: template.publishSurfaces,
    costProfile: template.costProfile,
    defaultRenders: template.defaultRenders,
    // Which paintings this version could be made in. Ids only: the dressing
    // (which pool track, which stock picture) is a default, not a promise.
    artDirections: artDirectionIds(template),
    isBrandDefault: template.isBrandDefault,
    rerenderable: template.rerenderable,
  };
}

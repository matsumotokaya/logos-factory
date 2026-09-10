"use client";

// The narrated event promo's workspace: the goal on screen, and underneath it
// what the goal is currently made of.
//
// The list below the player is not a completeness score. It answers the one
// question a user has when a finished film appears out of nothing — "where did
// all this come from?" — by showing each field's origin (§17.5). A proposal
// the tool made is labelled as one, so nobody publishes a guessed date
// believing somebody typed it.
//
// TWO BRIEFS, on purpose. `brief` is the workbench — the storyboard, the fact
// list and every edit act on it. `playing` is the film a run fixed, and it is
// the only thing the player runs. They disagree while somebody is working, and
// the notice between them says by how much rather than hiding it
// (docs/old/event-cm-refactor-plan.md §9.5).

import dynamic from "next/dynamic";
import { cn } from "@/lib/cn";
import { eventCmGoalState } from "@/lib/pipeline/event-cm";
import {
  describeChanges,
  filmStatus,
  FILM_STEP_LABEL,
  type BakeState,
  type FilmStatus,
  type FilmStep,
} from "@/lib/templates/event-cm/bake";
import type { BriefSource } from "./BriefSourceIntake";
import { type FactEdit } from "./FactList";
import Storyboard from "./Storyboard";
import BrandAssetSlots from "@/components/brand/BrandAssetSlots";
import { eventCmFilm } from "@/remotion/event-cm/film";
import { eventCmStoryboard } from "@/lib/storyboard/event-cm";
import { eventCmContract } from "@/lib/templates/event-cm/contract";
import {
  eventCmSceneKey,
  narrationChars,
  narrationStaleness,
  type EventCmBrief,
  type EventCmSceneRole,
} from "@/remotion/event-cm/types";

/** The three colours the whole screen uses (docs/video-state-model.md §3.1):
 *  amber = a change not yet in the film, green = nothing outstanding, and a
 *  quiet grey for the states that are neither. Never red — an unreflected edit
 *  is the ordinary condition of a workbench, and a red dot living there through
 *  every session teaches people to ignore the colour that means something broke. */
const STATUS_DOT: Record<FilmStatus, string> = {
  unrun: "bg-ink/25",
  behind: "bg-amber-500",
  matched: "bg-ink/25",
  settled: "bg-emerald-500",
};

const EventCmPlayer = dynamic(() => import("./EventCmPlayerClient"), {
  ssr: false,
  loading: () => (
    // On the page's own paper: the black shell this used to sit in is gone.
    <div className="flex aspect-video items-center justify-center bg-ink/[0.03] text-[12px] text-ink-muted">
      プレビューを読み込み中…
    </div>
  ),
});

export default function EventCmWorkspace({
  brief,
  playing,
  bake,
  bakedAt,
  steps,
  onEditFact,
  onEditNarration,
  onDeletePanel,
  onRewriteNarration,
  imageSources = [],
  materialUrls,
  inventory,
  writing,
}: {
  brief: EventCmBrief;
  /** The film the player runs: what the last run fixed. */
  playing: EventCmBrief;
  /** How far `playing` is behind `brief`, and whether it exists at all. */
  bake: BakeState;
  /** When the played film was fixed. Null = never run. */
  bakedAt: string | null;
  /** What the one button would run now. Matching the storyboard and being
   *  finished are different things, and only the second one is green. */
  steps: FilmStep[];
  /** Correct a value, or switch a field off. Absent = read only. */
  onEditFact?: (edit: FactEdit) => void;
  /** Save one picture's narration line, from the storyboard panel. */
  onEditNarration?: (
    scene: { role: EventCmSceneRole; index?: number },
    text: string,
    /** The reading, "" to clear it. Sent on every save, so the panel is the one
     *  place that decides whether this line needs one (types.ts `reading`). */
    reading: string,
  ) => Promise<boolean>;
  /** Remove one picture from the film, from the panel that shows it. */
  onDeletePanel?: (scene: {
    role: EventCmSceneRole;
    index?: number;
  }) => Promise<boolean>;
  /** Draft the whole narration again. `force` replaces hand-edited lines. */
  onRewriteNarration?: (force: boolean) => void;
  /** Images pinned to this video: the candidate list for every photo slot. */
  imageSources?: BriefSource[];
  /** `material:<uuid>` → the signed URL it became, as the server resolved it.
   *  Inverted by the board so a slot can name the file it holds. */
  materialUrls?: Record<string, string>;
  /**
   * The material inventory, drawn under the board.
   *
   * Passed in rather than fetched here, for the same reason the pipeline drawer
   * takes its sections as nodes: this component knows about the film, not about
   * endpoints. It is the same element the mapping drawer renders (§9.2), so the
   * two surfaces cannot drift.
   */
  inventory?: React.ReactNode;
  writing?: boolean;
}) {
  const goal = eventCmGoalState(brief);
  const chars = narrationChars(brief.narration);
  const stale = narrationStaleness(brief);
  const storyboard = eventCmStoryboard(brief);
  // The workbench, not the film: this reports on what is being written, so a
  // budget overrun is visible while it is still being edited rather than after
  // the next run.
  const contract = eventCmContract(brief);
  // The sanctioned door to the drawn values (remotion/event-cm/film.ts): the
  // slots must show what the film actually carries, so a suppressed mark or a
  // declined brand base is reflected here rather than contradicted.
  const film = eventCmFilm(brief);
  // The brief arrives with its pointers already signed, so going the other way
  // is how a slot names its file rather than pattern-matching a URL.
  const uriByUrl = new Map(
    Object.entries(materialUrls ?? {}).map(([uri, url]) => [url, uri]),
  );
  const status = filmStatus(bake, steps);
  const unreflected = status === "behind";
  // When the film being played was fixed. Date and time, because two runs in
  // one afternoon is the ordinary case and a date alone would not tell them
  // apart. Absent for a take that has never been run — that branch says so.
  const playedAt = bakedAt
    ? new Date(bakedAt).toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="flex flex-col gap-6">
      {/* Nothing above the film.

          There used to be two lines here: the presenter and date on the left,
          the format and duration on the right. Neither belonged. The presenter
          and the date are IN the film — the closing plate says them — so
          printing them over the player is a caption on a caption, and read as
          though the tool had generated a subtitle. The format and duration are
          metadata about the file, which belongs with the other metadata under
          the title (BrandVideoDetail), not in the frame above the picture.

          A comfortable reading width even when the page is wide: a 16:9 player
          across a 2000px column is 1100px tall and pushes the storyboard
          entirely off screen. Centred, because a column with one wide object in
          it that hugs the left edge looks like a layout that failed. */}
      <div className="mx-auto flex w-full max-w-5xl flex-col">
        {/* The player, bare. It used to sit in a black rounded shell ("dark
            surround because the film itself is ink-black") — a rationale that
            died the day a second art direction arrived: around the white
            standard film the shell read as a black frame that might be part of
            the video (requester, 2026-08-26). Decoration around the picture is
            gone entirely; the frame IS the film's edge.

            The amber ring stays because it is not decoration: it marks the
            picture while the workbench is ahead of it, and the line underneath
            says why. */}
        <div className={cn(unreflected && "ring-2 ring-amber-400")}>
          <EventCmPlayer brief={playing} />
        </div>

        {/* The preview does not promise the mix. The browser player and the
            MP4 renderer are two unrelated audio implementations (realtime
            WebAudio vs offline per-frame multiplication) and nothing makes
            them agree — the owner heard the BGM uniformly quiet in preview
            while the exported MP4 measured correct (2026-08-30). Decided:
            don't chase it; say it under the picture instead, so nobody
            levels a mix — or rejects one — by ear against this player. */}
        <p className="mt-2 text-[11px] text-ink-faint">
          ※ プレビューでは音声のバランスが崩れます。実際の音量バランスは、MP4に書き出すことで確認できます。
        </p>

        {/* Which version this is, as a STATUS LINE rather than a message.

            It used to be a bordered, tinted paragraph in a sentence — which is
            the shape of an error, so a video in a perfectly ordinary state (two
            edits not yet reflected: the everyday condition of a workbench) read
            as a video with something wrong with it. The same facts as a line of
            metadata — when it was made, how many changes since, which ones —
            read as what they are. Only the change count carries colour.

            And it stands off the picture. Tucked right under the frame it read
            as part of the player rather than as a line about it. */}
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
          <span
            aria-hidden="true"
            className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status])}
          />
          {status === "unrun" ? (
            // Never run, and that is usually a finished state now: a take is
            // created with the reading switched off, so the film it opens with
            // is the whole film — words on screen, music under them. Saying
            // 「下書きのまま」 over a complete video was the same mistake the
            // badge was making (seed.ts, 2026-08-30).
            //
            // It still has to be able to say the other thing, because a person
            // who switched the voice on and has not run it yet IS looking at a
            // draft.
            steps.length === 0 ? (
              <span>
                このまま完成しています
                <span className="text-ink-faint">
                  　ボイスを付けると、ナレーションが読まれて尺が実測に変わります
                </span>
              </span>
            ) : (
              <span>
                下書きのまま再生中
                <span className="text-ink-faint">
                  　「動画を作り直す」で
                  {steps.map((step) => FILM_STEP_LABEL[step]).join("・")}
                  が済みます
                </span>
              </span>
            )
          ) : (
            <>
              <span>更新 {playedAt}</span>
              {status === "behind" ? (
                <span className="font-medium text-amber-700">
                  変更 {bake.changes.length}件（{describeChanges(bake.changes)}）
                </span>
              ) : status === "matched" ? (
                // Matching the storyboard is not the same as being finished:
                // this take plays exactly what the storyboard says AND still
                // has work in it. 最新 here would sit over a button reading
                // 未処理3件 — the two-surfaces-disagreeing bug in miniature.
                <span>
                  残りの工程 {steps.map((step) => FILM_STEP_LABEL[step]).join("・")}
                </span>
              ) : (
                // Said rather than left as the absence of a warning: "nothing
                // is complaining" and "I know this is current" are different
                // feelings, and the second is the one needed before publishing.
                <span className="font-medium text-emerald-700">最新</span>
              )}
            </>
          )}
        </p>
      </div>

      {/* Directly under the goal: what the film is made of, picture by picture.
          The narration used to sit here as five paragraphs of text, which said
          what would be *heard* and nothing about what would be seen. */}
      {/* The narration and the film disagree. Two different disagreements, and
          the second one is the one that used to be invisible: a line with no
          picture to be read over is not a stale sentence, it is text the user
          wrote that the film has nowhere to put. Saying so — with the words
          still shown — is the difference between "it was deleted" and "it no
          longer has a place". */}
      {stale || storyboard.orphanLines.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
          {/* Which disagreement, in the words of that disagreement. One
              sentence for both used to claim 「変わる前の内容を読み上げています」
              even when the words were current and only the set of pictures had
              changed. */}
          <p>
            {stale === "facts"
              ? "資料や項目が変わったあと、ナレーションが書き直されていません。いまの映像は、変わる前の内容を語っています。"
              : "映像のシーンとナレーションの行が合っていません。"}
            {storyboard.orphanLines.length > 0
              ? "いま映像に無いシーンの行が残っています。"
              : null}
            {storyboard.panels.some((panel) => panel.narrated && !panel.narration)
              ? "ナレーションが書かれていないシーンがあります。"
              : null}
          </p>
          {storyboard.orphanLines.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {storyboard.orphanLines.map((line) => (
                <li key={eventCmSceneKey(line)} className="text-pretty">
                  <span className="mr-2 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold">
                    使われていない行
                  </span>
                  {line.text}
                </li>
              ))}
            </ul>
          ) : null}
          {onRewriteNarration ? (
            <button
              type="button"
              onClick={() => onRewriteNarration(brief.narration.source === "human")}
              disabled={writing}
              className="mt-3 rounded-full border border-amber-400 bg-white px-4 py-1.5 text-[11px] font-semibold text-amber-900 transition hover:border-amber-600 disabled:opacity-50"
            >
              {writing ? "書き直しています…" : "ナレーションを書き直す"}
            </button>
          ) : null}
          {brief.narration.source === "human" ? (
            <p className="mt-1.5 text-[11px]">
              手で直した行も置き換わります。残したい言葉は先にコピーしてください。
            </p>
          ) : null}
        </div>
      ) : null}

      {/* The contract, checked.
          The budgets were stated to the writer and then never looked at again
          (lib/event-cm/contract.ts). Placed above the storyboard because it is
          about the writing as a whole, and shown even when everything passes:
          the numbers are what let somebody decide the film is right, rather
          than merely un-complained-about. */}
      {brief.narration.scenes.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-xl border border-hairline px-4 py-3 text-[11px]">
          {contract.map((check) => (
            <li key={check.id} className="flex flex-wrap items-baseline gap-x-2">
              <span
                aria-hidden
                className={cn(
                  "font-semibold",
                  check.ok ? "text-emerald-600" : "text-amber-700",
                )}
              >
                {check.ok ? "✓" : "✗"}
              </span>
              <span className="font-medium">{check.label}</span>
              <span className={check.ok ? "text-ink-muted" : "text-amber-800"}>
                {check.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Storyboard
        brief={brief}
        goalFields={goal.fields}
        busy={writing}
        uriByUrl={uriByUrl}
        onEditFact={onEditFact}
        onEditNarration={onEditNarration}
        onDeletePanel={onDeletePanel}
        imageSources={imageSources}
      />

      {brief.narration.scenes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline px-4 py-4 text-[12px] text-ink-muted">
          まだナレーションがありません。いまの映像は各シーンの想定尺で並んでいます。
          ナレーションを書くと尺がその文字数に合い、読み上げると実測に置き換わります。
        </p>
      ) : brief.narration.angle ? (
        <p className="text-pretty text-[12px] text-ink-muted">
          訴求軸: {brief.narration.angle}
          <span className="mx-1.5 text-ink-faint">・</span>
          <span className="tabular-nums">{chars}字</span>
        </p>
      ) : null}

      {/* No flat list of the whole brief here any more.
    
          It used to sit under the board as 「この動画は何でできているか」, and
          it answered that in the abstract while leaving out the half a reader
          of a storyboard wants: WHERE each value ends up. Every field is now
          printed under the picture that carries it (Storyboard `PanelFacts`) —
          the dates under the closing card, a portrait under the speakers, a
          mark under both mark cards because it really is on screen twice. That
          makes the board the mapping it is read as.
    
          The whole-brief view still exists, in the pipeline's マッピング
          drawer, which is where a list of everything belongs. And the things no
          picture carries — the music, the reading, the video's own name — are
          already controls in the header, so a 「基本情報」 section here would
          have been a third place to read the same two facts.
    
          What survives is the count of guesses, because that is a fact about
          the video that no single panel can state. */}
      {goal.provisional.length > 0 ? (
        <p className="w-full max-w-5xl text-[12px] text-amber-800">
          {goal.provisional.length}件はこちらで仮に決めた値です（
          {goal.provisional.map((field) => field.label).join("、")}）。各シーンの
          「仮」の項目を開くと直せます。
        </p>
      ) : null}

      {/* The inventory sits under the board because the board answers 「どこに
          載るか」 and this answers 「何を持っているか」 — adjacent questions, and
          a reader who has just seen a scene wants to know what else is on hand.

          Two tiers, because the injection has two layers: this deliverable's
          material, and the brand's base that every deliverable starts from
          (docs/asset-normalization.md §7, §9.1). */}
      {inventory ? (
        <section className="flex w-full max-w-5xl flex-col gap-3 border-t border-hairline pt-6">
          <div>
            <h3 className="text-sm font-medium text-ink">素材</h3>
            <p className="text-[11px] text-ink-faint">
              この動画が使っているものと、ブランドが持っているもの。分類はここで直せます。
              どのシーンに置くかは、上の絵コンテでシーンを開いて選びます。
            </p>
          </div>

          {/* The same named slots the brand page shows, answered for THIS film.
              A video carries its own mark and its own key visual — often not
              the brand's — and reading them in the same rows is what makes the
              difference legible instead of requiring a comparison between two
              differently shaped screens. */}
          <BrandAssetSlots
            slots={[
              {
                key: "logo",
                label: "ロゴ",
                hint: "冒頭・締め・エンドカードに出ます",
                items: film.drawn.logos.map((logo, index) => ({
                  id: `${index}-${logo.name}`,
                  name: logo.name,
                  previewUrl: logo.src,
                  note: index === 0 ? "提供者のマーク" : "パートナー",
                })),
                emptyNote:
                  "この動画はマークを持ちません。冒頭と締めは明朝のクレジット表記で描かれます。",
              },
              {
                key: "keyvisual",
                label: "キービジュアル",
                hint: "テーマのシーンの地になります",
                items: film.drawn.visuals.value
                  ? [
                      {
                        id: "visuals.value",
                        name: "テーマの背景",
                        previewUrl: film.drawn.visuals.value.src,
                        note: "シーンを開くと差し替えられます",
                      },
                    ]
                  : [],
                emptyNote:
                  "この動画はキービジュアルを持ちません。墨の地と金の粒子で描かれます（設計された代替で、穴ではありません）。",
              },
            ]}
          />

          {inventory}
        </section>
      ) : null}
    </div>
  );
}

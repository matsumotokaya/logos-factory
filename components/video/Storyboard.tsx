"use client";

// The storyboard, under the player.
//
// EVERY `src` here goes through `resolveSrc`, the renderer's own rule
// (remotion/kit/paint.ts). A brief holds two kinds of path — an absolute signed
// URL for a pinned material, and a bare `defaults/...` for a pool asset — and
// only the first works when handed straight to an <img>. The second is
// relative, so the browser resolved it against the PAGE: opening a video at
// /brands/<id>/video/<takeId> fetched /brands/<id>/video/defaults/stills/… and
//404'd on every pool picture (measured in the dev log, 2026-08-28). The player
// was never affected, which is why this survived so long — Remotion resolves
// its own srcs, and these hand-written <img> tags are the only ones that do not.
//
// A panel is a wireframe on a 1920×1080 artboard, scaled down to whatever width
// it is given — the same technique the deck panels in slide-factory use, and the
// reason a small card and its enlargement are one implementation rather than two.
//
// It is not trying to look like the film. The film has a drifting ink ground,
// gold particles and type that animates in; a sixth-size imitation of that would
// promise something it cannot keep. What the wireframe is faithful about is the
// things a storyboard is read for: which arrangement, what is on the stage,
// where, how loud, in what order, for how long, and what is said over it. Those
// come from the theme's own type scale and the kit's own region geometry, so a
// change to either shows up here without anyone updating a picture.
//
// Enlarging a panel is also where the panel's facts are corrected. The list in
// the modal is the same FactList as the pipeline's structure stage, filtered to
// the fields this picture actually shows — reading "this date is a guess" and
// fixing it should not be two different screens.

import { Dialog } from "@base-ui/react/dialog";
import { captionAt } from "@/remotion/event-cm/captions";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  eventCmStoryboard,
  type StoryboardBlock,
  type StoryboardPanel,
} from "@/lib/storyboard/event-cm";
import { LAYOUTS, REGION_GEOMETRY, STAGE } from "@/remotion/kit/layout";
import { focusPosition, markPainting, resolveSrc } from "@/remotion/kit/paint";
import { captionSafeBottom, type Theme } from "@/remotion/kit/theme";
import {
  EVENT_CM_CHARS_PER_SECOND,
  EVENT_CM_SCENE_LABELS,
  captionsAreOff,
  eventCmSceneBudget,
  eventCmSceneKey,
  type EventCmBrief,
  type EventCmSceneRole,
} from "@/remotion/event-cm/types";
import { TTS_MAX_SECTION_CHARS } from "@/lib/voice/limits";
import type { GoalFieldState } from "@/lib/pipeline/stages";
import {
  factFieldsFor,
  isPhotoSlot,
  isSuppressed,
  photoOf,
  previewOf,
} from "@/lib/event-cm/facts";
import type { BriefSource } from "./BriefSourceIntake";
import { panelDeletion, type PanelDeletion } from "@/lib/event-cm/panel-actions";
import FactList, { type FactEdit } from "./FactList";

/** Roles are English in the contract; the names shown here are the template's
 *  own vocabulary, and they live with the roles so the screen and the narration
 *  prompt cannot drift apart (remotion/event-cm/types.ts). */
const ROLE_LABELS: Record<string, string> = EVENT_CM_SCENE_LABELS;

const LAYOUT_LABELS: Record<string, string> = {
  "centre-stack": "中央に積む",
  "split-copy-figure": "左に文字・右に図",
  "split-figure-copy": "左に図・右に文字",
  "full-bleed-overlay": "全面に写真・文字を重ねる",
  row: "横に並べる",
  "numbered-stack": "番号付きで積む",
  "corner-credit": "隅にまとめる",
};

const seconds = (ms: number) => (ms / 1000).toFixed(1);

/** What the film sets when a mark has no artwork: the name, quietly. Not a
 *  placeholder — this IS the design (components.ts EMPTY_BEHAVIOUR.logo). */
function LogoCredit({ theme, name }: { theme: Theme; name: string }) {
  return (
    <span
      style={{
        fontFamily: theme.displayFont,
        fontSize: theme.caption.size,
        letterSpacing: "0.2em",
        color: theme.palette.muted,
      }}
    >
      {name}
    </span>
  );
}

/** One block, drawn at artboard scale. */
function Block({ block, theme }: { block: StoryboardBlock; theme: Theme }) {
  const step = theme.scale[block.emphasis];

  if (block.state === "omitted") return null;

  // Figures are areas, not words: a rectangle at the size it will occupy says
  // more than a label would.
  if (block.kind === "image") {
    return (
      <div
        className="flex flex-1 items-center justify-center border border-dashed"
        style={{
          borderColor: "rgba(244,239,228,0.28)",
          background:
            "repeating-linear-gradient(45deg, rgba(244,239,228,0.06) 0 24px, transparent 24px 48px)",
          minHeight: 240,
        }}
      >
        <span style={{ fontSize: 30, color: "rgba(244,239,228,0.6)", letterSpacing: "0.2em" }}>
          {block.state === "substitute" ? "写真なし → 墨の地" : "写真"}
        </span>
      </div>
    );
  }

  if (block.kind === "rule") {
    return (
      <div
        style={{
          height: 3,
          width: 180,
          background: theme.palette.accent,
          opacity: 0.8,
        }}
      />
    );
  }

  // A single mark, at the size the renderer gives it: KitComponent draws a logo
  // at 1.6× its emphasis step, so at `hero` the opening plate is a 211px mark
  // and not the small credit line a type block would have produced.
  //
  // The mark is drawn, not framed. A gold-bordered box with the company name
  // set inside it was invented by this panel — the film draws either the
  // artwork or, with no artwork, the name as a quiet mincho credit. Readers
  // took the invented box for the design, and the accent colour sealed it:
  // gold means "a decision was made" everywhere else in this art direction.
  if (block.kind === "logo") {
    const figure = block.figures[0];
    const height = Math.round(step.size * 1.6);
    // Asked the same question the renderer asks, so a mark the film will not
    // draw is not drawn here either. A storyboard that shows artwork the film
    // replaces with a credit is not a preview of anything.
    const painting = figure
      ? markPainting(theme.palette.ground, figure)
      : ({ draw: "credit" } as const);
    if (figure?.src && painting.draw === "artwork") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveSrc(figure.src)}
          alt={figure.label}
          style={{
            height,
            width: "auto",
            maxWidth: "100%",
            objectFit: "contain",
            filter: painting.filter,
          }}
        />
      );
    }
    return <LogoCredit theme={theme} name={figure?.label ?? ""} />;
  }

  // The credit row: marks as they will be drawn, and names where there is no
  // artwork. Same rule as the single mark — nothing invented, nothing in gold.
  if (block.kind === "logoRow") {
    return (
      <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
        {block.figures.map((figure, index) => {
          const painting = markPainting(theme.palette.ground, figure);
          return figure.src && painting.draw === "artwork" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${figure.label}-${index}`}
              src={resolveSrc(figure.src)}
              alt={figure.label}
              style={{
                height: 56,
                width: "auto",
                objectFit: "contain",
                filter: painting.filter,
              }}
            />
          ) : (
            <LogoCredit key={`${figure.label}-${index}`} theme={theme} name={figure.label} />
          );
        })}
      </div>
    );
  }

  if (block.kind === "people" || block.kind === "person") {
    return (
      <div style={{ display: "flex", gap: 48, alignItems: "flex-end" }}>
        {block.figures.map((figure, index) => (
          <div key={`${figure.label}-${index}`} style={{ textAlign: "center" }}>
            {/* The medallion IS the design — a gold ring is what the film draws
                around a speaker, photograph or not. So this frame is faithful,
                unlike the box the mark used to get. */}
            <div
              style={{
                width: 210,
                height: 210,
                borderRadius: "50%",
                overflow: "hidden",
                border: `1px solid ${theme.palette.accent}`,
                background: theme.palette.ground,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {figure.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveSrc(figure.src)}
                  alt={figure.label}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: focusPosition(figure),
                    transform: `scale(${figure.zoom ?? 1})`,
                  }}
                />
              ) : (
                // A missing portrait is not a hole: the component sets a
                // monogram, in the accent, exactly like this.
                <span
                  style={{
                    fontSize: Math.round(210 * 0.42),
                    color: theme.palette.accentBright,
                    fontFamily: theme.displayFont,
                  }}
                >
                  {figure.label.trim().charAt(0) || "・"}
                </span>
              )}
            </div>
            <div
              style={{
                marginTop: 20,
                fontSize: theme.scale.secondary.size,
                color: theme.palette.ink,
              }}
            >
              {figure.label}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Everything else is type. Drawn at the theme's real size for its emphasis,
  // in the theme's real colour — that is the part of the film a storyboard can
  // tell the truth about.
  const color =
    block.emphasis === "caption"
      ? theme.palette.faint
      : block.emphasis === "secondary"
        ? theme.palette.muted
        : theme.palette.ink;

  const lines =
    block.state === "substitute"
      ? [block.substitute ?? ""]
      : block.kind === "list"
        ? block.text.map((line, index) => `${index + 1}　${line}`)
        : block.text;

  return (
    <div
      style={{
        fontSize: step.size,
        lineHeight: step.lineHeight,
        letterSpacing: `${step.tracking}em`,
        color,
        fontFamily: block.emphasis === "hero" ? theme.displayFont : theme.textFont,
        maxWidth: block.kind === "list" ? "100%" : `${step.charsPerLine + 1}em`,
        ...(block.kind === "chip"
          ? {
              border: `2px solid ${theme.palette.accent}`,
              padding: "14px 28px",
              color: theme.palette.accent,
            }
          : {}),
      }}
    >
      {lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}

/** The 1920×1080 stage, laid out by the same region geometry the renderer uses. */
function Artboard({ panel, theme }: { panel: StoryboardPanel; theme: Theme }) {
  const spec = LAYOUTS[panel.layout];
  // The subtitle showing at this picture's midpoint — the same `captionAt` the
  // band itself uses. Taking the first of the panel's captions instead drew the
  // previous panel's line, because a sentence that runs across a cut belongs to
  // both panels.
  const caption = captionAt(panel.captions, panel.fromMs + panel.durationMs / 2);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: theme.palette.ground,
        overflow: "hidden",
      }}
    >
      {/* The ground. Drawn at the theme's own dimming so a panel shows what the
          scene will actually stand on — the one photographic fact a wireframe
          can state without pretending to be the film. */}
      {panel.backdrop ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveSrc(panel.backdrop.src)}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: focusPosition(panel.backdrop),
            opacity: theme.backdrop.opacity[panel.backdrop.weight],
          }}
        />
      ) : null}
      {panel.backdrop ? (
        <div style={{ position: "absolute", inset: 0, background: theme.backdrop.scrim }} />
      ) : null}

      {panel.regions.map((region, index) => {
        const slot = spec.slots[index];
        const geometry = REGION_GEOMETRY[region.region];
        const hasBleed = spec.slots.some((entry) => REGION_GEOMETRY[entry.region].bleed);
        return (
          <div
            key={`${region.region}-${index}`}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              gap: slot.gap,
              padding: geometry.bleed ? 0 : `${STAGE.padY}px ${STAGE.padX}px`,
              // Same rule as the renderer: the subtitle band is not composed over.
              ...(geometry.justifyContent === "flex-end" && !geometry.bleed
                ? { paddingBottom: captionSafeBottom(theme) }
                : {}),
              justifyContent: geometry.justifyContent,
              textAlign: geometry.textAlign,
              alignItems: geometry.bleed
                ? "stretch"
                : slot.align === "start"
                  ? "flex-start"
                  : slot.align === "end"
                    ? "flex-end"
                    : "center",
              ...(geometry.half === "left" ? { right: "50%" } : {}),
              ...(geometry.half === "right" && !hasBleed ? { left: "50%" } : {}),
            }}
          >
            {region.blocks.map((block, blockIndex) => (
              <Block key={`${block.kind}-${blockIndex}`} block={block} theme={theme} />
            ))}
          </div>
        );
      })}

      {/* The subtitle sits where it will sit: the theme decides the size and the
          distance from the bottom, and it is above every scene. */}
      {caption ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: theme.caption.bottom,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: theme.caption.size,
              color: theme.caption.color,
              background: "rgba(0,0,0,0.72)",
              padding: "10px 28px",
              fontFamily: theme.textFont,
            }}
          >
            {caption.text}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Native-size artboard, CSS-scaled to the width it is given. */
function ScaledArtboard({ panel, theme }: { panel: StoryboardPanel; theme: Theme }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => setScale(element.clientWidth / STAGE.width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={viewportRef}
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: `${STAGE.width} / ${STAGE.height}`, background: theme.palette.ground }}
    >
      {scale > 0 ? (
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: STAGE.width, height: STAGE.height, transform: `scale(${scale})` }}
        >
          <Artboard panel={panel} theme={theme} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The narration line for one picture, editable in place.
 *
 * Saving marks the narration `human`, which is the contract that keeps a later
 * re-run from overwriting the words somebody wrote (lib/event-cm/narration.ts).
 *
 * It does NOT touch the recording, and it does not touch the film. Saving used
 * to delete the voice on the reasoning that a reading of replaced words is a
 * lie; the reasoning was right and the remedy was wrong — the film went silent
 * in the middle of an edit (§9.2). The film only moves when the user runs it, so
 * the note below points at that button instead of describing a deletion.
 */
function NarrationLine({
  role,
  index,
  text,
  reading,
  busy,
  onSave,
}: {
  role: EventCmSceneRole;
  index?: number;
  text: string;
  reading?: string;
  busy?: boolean;
  onSave: (
    scene: { role: EventCmSceneRole; index?: number },
    text: string,
    reading: string,
  ) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(text);
  const [readingDraft, setReadingDraft] = useState(reading ?? "");
  const [saved, setSaved] = useState(false);
  const dirty =
    draft.trim() !== text.trim() || readingDraft.trim() !== (reading ?? "").trim();
  // The length is the scene's length: a picture holds for as long as its line
  // takes to read (remotion/event-cm/timeline.ts). So the budget is not style
  // advice — 300 characters here is a fifty-second scene, and 2,000 is a line
  // no voice will read at all.
  // Counted on what will be SAID, not what will be shown: the scene's length is
  // measured from the spoken copy (remotion/event-cm/timeline.ts), so a line
  // whose reading is longer than its subtitle holds its picture longer. The
  // number here has to be the one the film is going to use.
  const spoken = readingDraft.trim() || draft;
  const chars = spoken.replace(/\s/g, "").length;
  const budget = eventCmSceneBudget({ role, index });
  const seconds = Math.round(chars / EVENT_CM_CHARS_PER_SECOND);

  return (
    <div className="mt-4">
      {/* Which of these two is the subtitle is said on the label, because the
          answer stopped being obvious the moment a second field appeared. */}
      <div className="mb-1.5 text-[11px] font-semibold text-ink-faint">
        ナレーション
        <span className="ml-1.5 font-normal">この文がそのまま字幕になります</span>
      </div>
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setSaved(false);
        }}
        rows={Math.max(2, Math.ceil(draft.length / 34))}
        aria-label="このシーンのナレーション（この文がそのまま字幕になります）"
        className="w-full rounded-xl border border-hairline px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-ink"
      />
      {/* The reading sits directly under the sentence it belongs to, and stays
          empty on almost every line: a name like 「〆張鶴」 is the exception, not
          the rule, and asking for two copies of every sentence would be asking
          for the second one to rot. Whole line rather than per-word, so what is
          typed here is exactly what the narrator will be handed. */}
      <div className="mb-1.5 mt-3 text-[11px] font-semibold text-ink-faint">
        読み方
        <span className="ml-1.5 font-normal">
          任意。入力すると、読み上げはこちらを優先します（字幕は上の文のまま）
        </span>
      </div>
      <textarea
        value={readingDraft}
        onChange={(event) => {
          setReadingDraft(event.target.value);
          setSaved(false);
        }}
        rows={Math.max(1, Math.ceil(readingDraft.length / 34))}
        aria-label="このシーンの読み方（任意。入力すると読み上げに使われます）"
        placeholder="読めない固有名詞があるときだけ。行全体をかなで書き直してください（例: 〆張鶴 → しめはりつる）"
        className="w-full rounded-xl border border-hairline px-3 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-ink-faint focus:border-ink"
      />
      {readingDraft.trim() ? (
        <div className="mt-1.5 text-[11px] font-semibold text-accent">
          この行は読み方のほうを発音します。字幕は上の文のままです
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={async () => {
            if (!draft.trim() || busy) return;
            const ok = await onSave({ role, index }, draft.trim(), readingDraft.trim());
            if (ok) setSaved(true);
          }}
          disabled={busy || !dirty || !draft.trim()}
          className="rounded-full bg-ink px-4 py-1.5 text-[11px] font-semibold text-paper transition hover:bg-accent disabled:opacity-40"
        >
          {busy ? "保存中…" : "この行を保存"}
        </button>
        <span
          className={cn(
            "tabular-nums text-[11px]",
            chars > TTS_MAX_SECTION_CHARS
              ? "font-semibold text-red-700"
              : chars > budget.max
                ? "text-amber-700"
                : "text-ink-faint",
          )}
        >
          {readingDraft.trim() ? "読み方 " : ""}
          {chars}字（目安{budget.min}〜{budget.max}字）・約{seconds}秒
        </span>
        {chars > TTS_MAX_SECTION_CHARS ? (
          <span className="text-[11px] font-semibold text-red-700">
            この長さは読み上げられません（上限{TTS_MAX_SECTION_CHARS}字）
          </span>
        ) : chars > budget.max ? (
          <span className="text-[11px] text-amber-700">
            長いぶんシーンも伸びます（このシーンだけで約{seconds}秒）
          </span>
        ) : null}
        {saved ? (
          <span role="status" className="text-[11px] font-semibold text-emerald-700">
            保存しました。「動画を作り直す」を押すと動画プレビューに反映されます
          </span>
        ) : !text ? (
          <span className="text-[11px] text-amber-700">
            このシーンのナレーションはまだありません。書いて保存するか、上の「ナレーションを書き直す」でまとめて書けます
          </span>
        ) : dirty ? (
          <span className="text-[11px] text-ink-faint">
            保存しても動画プレビューは変わりません。直し終えたら「動画を作り直す」を押してください
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Removing this picture from the film.
 *
 * Two clicks, even though nothing here is destructive any more — the picture
 * goes and the values stay, for the agenda as well as the speakers
 * (lib/event-cm/panel-actions.ts). Removing one picture still changes what the
 * film says, which is not something to do by brushing past a control, and the
 * confirmation names the picture rather than asking "are you sure".
 *
 * When the picture cannot go, the reason is the whole control. A film missing
 * its title card or its call to action is not a shorter film, it is a broken
 * announcement, and this template says so out loud rather than offering a
 * button that quietly does nothing (lib/event-cm/panel-actions.ts).
 */
function PanelDelete({
  decision,
  busy,
  onDelete,
  onDeleted,
}: {
  decision: PanelDeletion;
  busy?: boolean;
  onDelete: () => Promise<boolean>;
  /** Close the panel. The picture is gone, so there is nothing left to look at. */
  onDeleted: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!decision.can) {
    return (
      <p className="mt-5 border-t border-hairline pt-4 text-[11px] text-ink-faint">
        このシーンは削除できません — {decision.reason}
      </p>
    );
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
      {asking ? (
        <>
          <span className="text-[12px] text-ink">{decision.confirm}</span>
          <button
            type="button"
            onClick={async () => {
              setFailed(false);
              const ok = await onDelete();
              // Failure keeps the panel open with the reason: the page-level
              // banner sits behind this dialog, where nobody can read it.
              if (ok) onDeleted();
              else setFailed(true);
            }}
            disabled={busy}
            className="rounded-full bg-red-600 px-4 py-1.5 text-[11px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "削除中…" : "削除する"}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="text-[11px] text-ink-faint hover:text-ink"
          >
            やめる
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          disabled={busy}
          className="text-[11px] font-semibold text-red-700 hover:underline disabled:opacity-50"
        >
          このシーンを削除する
        </button>
      )}
      {failed ? (
        <p role="alert" className="w-full text-[11px] font-semibold text-red-700">
          削除できませんでした。もう一度お試しください
        </p>
      ) : null}
    </div>
  );
}

/** The list of what this picture holds, and where the values came from. */
function PanelContents({ panel }: { panel: StoryboardPanel }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {panel.regions.flatMap((region) =>
        region.blocks.map((block, index) => (
          <li
            key={`${region.region}-${block.kind}-${index}`}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]"
          >
            <span className="w-24 shrink-0 text-ink-faint">{block.label}</span>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                block.state === "filled"
                  ? "border-hairline bg-ink/[0.03] text-ink-muted"
                  : block.state === "substitute"
                    ? "border-accent/40 bg-accent/5 text-accent"
                    : "border-hairline text-ink-faint",
              )}
            >
              {block.state === "filled"
                ? "値あり"
                : block.state === "substitute"
                  ? "設計代替"
                  : "画面から消える"}
            </span>
            <span className="min-w-0 flex-1 text-pretty text-ink-muted">
              {block.state === "substitute" ? (
                block.substitute
              ) : block.figures.length > 0 ? (
                <>
                  {block.figures.map((figure, figureIndex) => (
                    <span key={`${figure.label}-${figureIndex}`}>
                      {figureIndex > 0 ? "、" : ""}
                      {figure.label}
                      {/* Named individually because "3名" hides which one will
                          come out as a monogram. */}
                      {figure.hasAsset ? null : (
                        <span className="text-accent">（画像なし→代替）</span>
                      )}
                    </span>
                  ))}
                </>
              ) : (
                block.text.join(" / ") || "—"
              )}
            </span>
          </li>
        )),
      )}
    </ul>
  );
}

/**
 * The name of the material sitting in a slot.
 *
 * 「写真あり」 answered the wrong question. A storyboard is read to find out
 * WHICH picture is behind a scene, and a row saying that one exists is worth
 * about as much as a row saying the title is a title. The label already names
 * the slot (「大西 美香の写真」), so the value's job is to name the file in it.
 *
 * The client's brief has its pointers replaced by signed URLs, so the mapping
 * the server handed over is inverted rather than the URL pattern-matched — the
 * same inversion the music picker does, and for the same reason: a URL shape is
 * not a contract.
 */
function materialNameOf(
  src: string | null,
  uriByUrl: Map<string, string>,
  sources: readonly BriefSource[],
): string | null {
  if (!src) return null;
  const uri = uriByUrl.get(src) ?? src;
  const id = uri.startsWith("material:") ? uri.slice("material:".length) : null;
  const known = id ? sources.find((source) => source.id === id) : null;
  if (known) return known.label;
  // A pool asset, or a pointer this take cannot resolve. The last path segment
  // is the file, which still says more than 「あり」.
  const name = decodeURIComponent(src.split("?")[0].split("/").pop() ?? "");
  return name || null;
}

/**
 * The video's facts, as carried by ONE picture.
 *
 * The workspace used to print every field of the brief in a single list under
 * the whole board, headed 「この動画は何でできているか」. It answered the
 * question in the abstract and left the useful half out: *where* each value
 * ends up. A date is not a property of the video, it is what the closing card
 * says; a portrait is what the speakers' card shows; a mark is on screen twice
 * and so appears under both mark cards. Distributing them makes the storyboard
 * the mapping it is read as. The flat list still exists, in the pipeline's
 * マッピング drawer, which is where a whole-brief view belongs.
 *
 * Read-only: values are typed in the panel (「シーンを開くとその中身を直せる」),
 * and two editable copies of one row is how they end up disagreeing.
 */
function PanelFacts({
  brief,
  goalFields,
  paths,
  uriByUrl,
  imageSources,
}: {
  brief: EventCmBrief;
  goalFields: GoalFieldState[];
  paths: string[];
  uriByUrl: Map<string, string>;
  imageSources: readonly BriefSource[];
}) {
  const originOf = new Map(goalFields.map((field) => [field.path, field.origin]));
  const byPath = new Map(factFieldsFor(brief).map((field) => [field.path, field]));
  const rows = paths.flatMap((path) => {
    const field = byPath.get(path);
    return field ? [{ field, origin: originOf.get(path) ?? null }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <dl className="mt-2 flex flex-col gap-1 border-t border-hairline pt-2">
      {rows.map(({ field, origin }) => {
        const off = isSuppressed(brief, field.path);
        const value = isPhotoSlot(field.path)
          ? materialNameOf(photoOf(brief, field.path), uriByUrl, imageSources)
          : previewOf(brief, field.path);
        return (
          <div key={field.path} className="flex items-baseline gap-2 text-[11px]">
            <dt className="min-w-20 shrink-0 text-ink-faint">{field.label}</dt>
            <dd
              className={cn(
                "min-w-0 flex-1 truncate",
                off ? "text-ink-faint line-through" : "text-ink-muted",
              )}
            >
              {/* A field with nothing in it is not a hole: the film draws a
                  designed stand-in. Saying 「設計代替」 rather than showing an
                  empty cell is the same stance the rest of the screen takes. */}
              {off ? "表示しない" : value || "設計代替で描画"}
            </dd>
            {/* Only the guess is worth a badge here. Printing 「あなたの入力」
                on every corrected row would fill the board with labels that
                say nothing is wrong. */}
            {!off && origin === "inferred" ? (
              <span className="shrink-0 rounded-full border border-amber-300/60 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-800">
                仮
              </span>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}

function PanelCard({
  panel,
  theme,
  brief,
  goalFields,
  busy,
  uriByUrl,
  onEditFact,
  onEditNarration,
  onDeletePanel,
  imageSources,
}: {
  panel: StoryboardPanel;
  theme: Theme;
  brief: EventCmBrief;
  goalFields: GoalFieldState[];
  busy?: boolean;
  /** Signed URL → `material:<uuid>`, so a slot can name the file in it. */
  uriByUrl: Map<string, string>;
  onEditFact?: (edit: FactEdit) => void;
  /** Save one panel's narration line. Absent = read only. */
  onEditNarration?: (
    scene: { role: EventCmSceneRole; index?: number },
    text: string,
    /** The reading, "" to clear it. Sent on every save, so the panel is the one
     *  place that decides whether this line needs one (types.ts `reading`). */
    reading: string,
  ) => Promise<boolean>;
  /** Remove this picture from the film. Absent = read only. */
  onDeletePanel?: (scene: {
    role: EventCmSceneRole;
    index?: number;
  }) => Promise<boolean>;
  imageSources?: BriefSource[];
}) {
  // A repeated role needs a name that tells the pictures apart.
  const label =
    panel.index === undefined
      ? (ROLE_LABELS[panel.role] ?? panel.role)
      : `${ROLE_LABELS[panel.role] ?? panel.role}${panel.index + 1}`;
  // Asked so the empty caption line can say WHICH emptiness it is.
  const captionsOff = captionsAreOff(brief);
  const title = `シーン${panel.no} ${label}`;
  // Controlled so a completed action can close it. A destructive action that
  // leaves its own dialog open has not told the user anything happened.
  const [open, setOpen] = useState(false);
  // Every field this picture shows, deduped, in the order they appear — the
  // modal's edit list is exactly this panel's business and nothing else. The
  // ground counts: it is on screen for the whole scene.
  const paths = [
    ...new Set(
      [
        ...panel.regions.flatMap((region) =>
          region.blocks.flatMap((block) => block.fields),
        ),
        ...(panel.backdrop?.fields ?? []),
      ]
        .filter((field) => field.editable)
        .map((field) => field.path),
    ),
  ];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <figure className="min-w-0">
        <figcaption className="mb-2 flex items-center justify-between gap-3 px-0.5 text-[11px]">
          <span className="min-w-0 truncate">
            <span className="font-semibold text-ink">{title}</span>
            <span className="ml-2 tabular-nums text-ink-faint">
              {seconds(panel.fromMs)}〜{seconds(panel.fromMs + panel.durationMs)}s
            </span>
          </span>
          {panel.counts.provisional > 0 ? (
            <span className="shrink-0 rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-800">
              仮の値 {panel.counts.provisional}件
            </span>
          ) : null}
        </figcaption>

        <Dialog.Trigger
          render={
            <button
              type="button"
              aria-label={`${title} を拡大して中身を見る`}
              className="block w-full overflow-hidden rounded-xl border border-hairline bg-[#0b0d13] text-left shadow-sm transition hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
          }
        >
          <ScaledArtboard panel={panel} theme={theme} />
        </Dialog.Trigger>

        <div className="mt-2 px-0.5">
          <p className="text-[11px] text-ink-faint">
            {LAYOUT_LABELS[panel.layout] ?? panel.layout}
            <span className="mx-1.5">・</span>
            部品 {panel.counts.filled}/{panel.counts.blocks}
            {panel.counts.substitute > 0 ? `（設計代替 ${panel.counts.substitute}）` : ""}
          </p>
          {/* The subtitle, as text. On the artboard it is a plate at the size it
              will be; here it is readable at any card width. */}
          {panel.captions.length > 0 ? (
            <p className="mt-1 text-pretty text-[12px] leading-relaxed text-ink-muted">
              {panel.captions.map((caption) => `「${caption.text}」`).join(" ")}
            </p>
          ) : panel.narrated ? (
            // Two different emptinesses. 「まだ書いていない」 is work outstanding;
            // 「オフにした」 is a finished decision, and reporting it as the first
            // would send somebody looking for words that are already written.
            <p className="mt-1 text-[12px] text-ink-faint">
              {captionsOff
                ? panel.narration
                  ? `字幕オフ（この言葉は読み上げます）「${panel.narration}」`
                  : "字幕オフ"
                : "字幕なし（ナレーションがまだありません）"}
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-ink-faint">音楽だけ・ボイスなし</p>
          )}
          {panel.dropped.length > 0 ? (
            <p className="mt-1 text-[11px] text-amber-700">
              入りきらないため落ちます: {panel.dropped.join("、")}
            </p>
          ) : null}

          {/* Which of the video's facts this picture is carrying.
              The storyboard IS the mapping — that is what it is read for — so
              the values live under the picture that shows them rather than in
              one flat list of everything under the whole board. The dates go
              under the closing card because that is where they appear; a
              speaker's portrait goes under the speakers; a logo appears under
              BOTH mark cards, because it really is on screen twice.
              Read-only here, editable in the panel: 「シーンを開くとその中身を
              直せる」 stays the one place values are typed. */}
          <PanelFacts
            brief={brief}
            goalFields={goalFields}
            paths={paths}
            uriByUrl={uriByUrl}
            imageSources={imageSources ?? []}
          />
        </div>
      </figure>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/70" />
        <Dialog.Viewport className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6">
          <Dialog.Popup className="mx-auto w-full max-w-5xl rounded-2xl bg-paper p-5 shadow-2xl focus:outline-none">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Dialog.Title className="text-balance font-display text-lg font-semibold">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-[12px] text-ink-muted">
                  {seconds(panel.fromMs)}〜{seconds(panel.fromMs + panel.durationMs)}秒
                  <span className="mx-1.5">・</span>
                  {LAYOUT_LABELS[panel.layout] ?? panel.layout}
                  <span className="mx-1.5">・</span>
                  この配置が置ける部品は{panel.capacity}点
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="閉じる"
                className="shrink-0 rounded-full border border-hairline px-3 py-1.5 text-[12px] font-semibold hover:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                閉じる <span aria-hidden="true">×</span>
              </Dialog.Close>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-hairline">
              <ScaledArtboard panel={panel} theme={theme} />
            </div>

            {/* The line read over this picture, in the place you change it.
                One panel, one message, one line — so the narration belongs to
                the panel rather than to a separate narration screen, and reading
                「この日付は仮です」 and fixing it are already not two screens. */}
            {panel.narrated && onEditNarration ? (
              <NarrationLine
                // Remounted when the saved line changes — a draft belongs to the
                // words it was started from, and must never be carried onto a
                // different picture or over a line rewritten elsewhere.
                key={`${eventCmSceneKey(panel)}:${panel.narration}:${panel.reading ?? ""}`}
                role={panel.role}
                index={panel.index}
                text={panel.narration}
                reading={panel.reading}
                busy={busy}
                onSave={onEditNarration}
              />
            ) : panel.narration ? (
              <p className="mt-4 text-pretty text-[13px] leading-relaxed">
                {panel.narration}
              </p>
            ) : null}

            <div className="mt-4">
              <PanelContents panel={panel} />
            </div>

            {/* Removing a picture belongs to the picture. Reaching for the fact
                list to make a panel disappear means knowing which field the
                panel came from, which is exactly what the panel is for. */}
            {onDeletePanel ? (
              <PanelDelete
                decision={panelDeletion(brief, { role: panel.role, index: panel.index })}
                busy={busy}
                onDelete={() => onDeletePanel({ role: panel.role, index: panel.index })}
                onDeleted={() => setOpen(false)}
              />
            ) : null}

            {onEditFact && paths.length > 0 ? (
              <div className="mt-5 border-t border-hairline pt-4">
                <FactList
                  brief={brief}
                  goalFields={goalFields}
                  busy={busy}
                  onEdit={onEditFact}
                  paths={paths}
                  imageSources={imageSources}
                />
              </div>
            ) : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function Storyboard({
  brief,
  goalFields,
  busy,
  uriByUrl,
  onEditFact,
  onEditNarration,
  onDeletePanel,
  imageSources,
}: {
  brief: EventCmBrief;
  goalFields: GoalFieldState[];
  busy?: boolean;
  /** Signed URL → `material:<uuid>`, so a slot can name the file in it. */
  uriByUrl: Map<string, string>;
  onEditFact?: (edit: FactEdit) => void;
  onEditNarration?: (
    scene: { role: EventCmSceneRole; index?: number },
    text: string,
    /** The reading, "" to clear it. Sent on every save, so the panel is the one
     *  place that decides whether this line needs one (types.ts `reading`). */
    reading: string,
  ) => Promise<boolean>;
  onDeletePanel?: (scene: {
    role: EventCmSceneRole;
    index?: number;
  }) => Promise<boolean>;
  imageSources?: BriefSource[];
}) {
  const storyboard = eventCmStoryboard(brief);
  // The film's own theme: the storyboard model carries it so the panels and
  // the renderer cannot measure against different type scales.
  const theme = storyboard.theme;

  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-base font-semibold tracking-tight">絵コンテ</h2>
        <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
      </div>

      <p className="mt-2 tabular-nums text-[12px] text-ink-muted">
        {storyboard.panels.length}シーン
        <span className="mx-1.5 text-ink-faint">|</span>
        {seconds(storyboard.totalMs)}秒
        <span className="mx-1.5 text-ink-faint">|</span>
        部品 {storyboard.counts.filled}/{storyboard.counts.blocks}
        {storyboard.counts.substitute > 0 ? (
          <>
            <span className="mx-1.5 text-ink-faint">|</span>
            設計代替 {storyboard.counts.substitute}
          </>
        ) : null}
      </p>
      <p className="mt-1 text-[11px] text-ink-faint">
        絵コンテは「どのシーンに何が乗るか」を確認するものです。配置・文字の大きさ・尺・字幕は実際の映像と同じですが、
        <strong className="font-semibold">動く墨の地・金の粒子・タイポの動きは描いていません</strong>
        （縮小では再現できないため）。仕上がりはプレイヤーで確認してください。
      </p>

      {/* Three abreast where there is room. Fewer than that and the overview
          carries little more information than one enlarged panel; more and a
          picture stops being readable at all. The panel scales itself, so the
          only decision here is how many fit. */}
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2 3xl:grid-cols-3">
        {storyboard.panels.map((panel) => (
          <PanelCard
            // Keyed by WHICH PICTURE, never by its position. Deleting the sixth
            // panel used to renumber the seventh into its place, so React reused
            // the same component instance: the open dialog stayed open showing
            // different content, and the narration textarea kept the deleted
            // panel's draft — one click away from writing it over the next
            // picture's line.
            key={eventCmSceneKey(panel)}
            panel={panel}
            theme={theme}
            brief={brief}
            goalFields={goalFields}
            busy={busy}
            uriByUrl={uriByUrl}
            onEditFact={onEditFact}
            onEditNarration={onEditNarration}
            onDeletePanel={onDeletePanel}
            imageSources={imageSources}
          />
        ))}
      </div>
    </section>
  );
}

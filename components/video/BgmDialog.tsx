"use client";

// The music control, built the same way as the narration one.
//
// Same shape on purpose: BGM and narration are the two things the film SAYS out
// loud, they are both always-on-or-off, and both are chosen once and changed on
// a whim. Two controls that answer the same kind of question should not be one
// row of pills under the storyboard and one button in the header.
//
// The difference is that nothing is generated here: a track is chosen and the
// brief records it, so the confirmation says 変更しました rather than 完成しました.
//
// What it does NOT say is that the film now plays it. Choosing a track changes
// the workbench, and the player keeps the version a run fixed until somebody
// presses 動画を作り直す (docs/video-state-model.md §2). That fact belongs to
// the dot on the trigger and to the notice under the player — not to a sentence
// inside this dialog, which is read before the change and forgotten after it.

import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { cn } from "@/lib/cn";
import StatusDot from "./StatusDot";
import type { DefaultAsset } from "@/lib/assets/defaults";
import type { BriefSource } from "./BriefSourceIntake";

/** 「3分00秒」. A length nobody measured is simply not shown. */
function trackLength(seconds: number | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes > 0 ? `${minutes}分${String(rest).padStart(2, "0")}秒` : `${rest}秒`;
}

export default function BgmDialog({
  /** The brief's own pointer: a pool path, or `material:<uuid>`. */
  current,
  pool,
  uploads,
  /** The chosen track is not the one the played film has (§5). */
  unreflected,
  busy,
  onChoose,
  onTurnOff,
}: {
  current: string | null;
  pool: readonly DefaultAsset[];
  uploads: readonly BriefSource[];
  unreflected: boolean;
  busy: boolean;
  onChoose: (src: string) => Promise<boolean>;
  onTurnOff: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(current);
  const [done, setDone] = useState<string | null>(null);

  const options = [
    ...pool.map((asset) => ({
      src: asset.src,
      label: asset.label,
      // The length, because it decides whether the track repeats in this film
      // and a person choosing music wants to know that before they choose.
      length: trackLength(asset.durationSec),
      // Genre and character. It used to be the credit — 「Suno AI（商用利用可
      // プランで生成）」 — which answers a licensing question nobody reading a
      // music picker is asking (owner, 2026-08-30).
      note: (asset.keywords ?? []).join("・"),
      // Said in a sentence, not only in a chip: a hover title is invisible on a
      // touch screen, and the consequence (a silent MP4) is not guessable.
      warnNote: asset.licensed ? null : "書き出したMP4では無音になります",
      warn: asset.licensed ? null : "試聴用",
    })),
    ...uploads.map((source) => ({
      src: `material:${source.id}`,
      label: source.label,
      length: null,
      note: "この動画にアップロードした音声",
      warnNote: null,
      warn: null,
    })),
  ];
  const currentLabel = options.find((option) => option.src === current)?.label ?? null;

  const run = async (work: () => Promise<boolean>, message: string) => {
    const ok = await work();
    if (!ok) return;
    setDone(message);
    setTimeout(() => {
      setOpen(false);
      setDone(null);
    }, 900);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setChosen(current);
        else setDone(null);
      }}
    >
      <Dialog.Trigger
        render={
          <button
            type="button"
            className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold transition hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        }
      >
        <span className="inline-flex items-center gap-2">
          BGM
          <StatusDot on={Boolean(current)} unreflected={unreflected} />
        </span>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Viewport className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6">
          <Dialog.Popup className="mx-auto mt-16 w-full max-w-lg rounded-2xl bg-paper p-5 shadow-2xl focus:outline-none">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Dialog.Title className="font-display text-base font-semibold">
                  BGM
                </Dialog.Title>
                {/* The state, and nothing else. It used to end with 「読み上げ
                    中は音量が下がります」 — a description of our mixing, put in
                    front of somebody who came here to change the music (owner,
                    2026-08-30). Ducking is something the film does correctly on
                    its own; being told about it answers no question. */}
                <Dialog.Description className="mt-1 text-[12px] text-ink-muted">
                  {current
                    ? `オン ・ ${currentLabel ?? "この動画の音源"}`
                    : "オフ（音楽なしで再生します）"}
                </Dialog.Description>
                {/* Said here only when it is true, and phrased as the state of
                    this video rather than as a rule about the product. A
                    standing sentence explaining the bake would be read before
                    the change and forgotten after it. */}
                {unreflected ? (
                  <p className="mt-1.5 text-[12px] text-amber-700">
                    この選択は、まだ動画プレビューに反映していません。「動画を作り直す」を押すと入ります。
                  </p>
                ) : null}
              </div>
              <Dialog.Close
                aria-label="閉じる"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline text-[14px] leading-none text-ink-muted transition hover:bg-ink/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span aria-hidden="true">×</span>
              </Dialog.Close>
            </div>

            <fieldset className="mt-4">
              <div className="flex flex-col gap-1.5">
                {options.map((option) => (
                  <label
                    key={option.src}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] transition",
                      chosen === option.src
                        ? "border-ink bg-ink/[0.03]"
                        : "border-hairline hover:border-ink/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="bgm-track"
                      value={option.src}
                      checked={chosen === option.src}
                      onChange={() => setChosen(option.src)}
                      className="size-4 accent-ink"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{option.label}</span>
                      {option.length ? (
                        <span className="ml-2 text-[11px] text-ink-muted">
                          {option.length}
                        </span>
                      ) : null}
                      {option.note ? (
                        <span className="block text-[11px] text-ink-faint">{option.note}</span>
                      ) : null}
                      {option.warnNote ? (
                        <span className="block text-[11px] text-ink-faint">
                          {option.warnNote}
                        </span>
                      ) : null}
                    </span>
                    {option.warn ? (
                      <span
                        title="この曲は試聴だけに使えます。MP4を書き出すと無音になるので、公開する動画には別の曲を選んでください"
                        className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold text-ink-muted"
                      >
                        {option.warn}
                      </span>
                    ) : null}
                    {current === option.src ? (
                      <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                        使用中
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
              {/* One practical line. It used to explain where uploaded audio
                  comes from — 「入力ステージに音声をアップロードすると、ここに
                  並びます」 — which names a part of our screen and answers
                  nothing about the music (owner, 2026-08-30). What a person
                  choosing a track actually needs to know is what happens when
                  the film outlasts it. */}
              <p className="mt-2.5 text-[11px] text-ink-faint">
                動画が曲より長いときは、曲の頭から繰り返します。
              </p>
            </fieldset>

            <div className="mt-5 border-t border-hairline pt-4">
              {done ? (
                <p
                  role="status"
                  className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-800"
                >
                  {done}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {current ? (
                  <button
                    type="button"
                    onClick={() => void run(onTurnOff, "BGMをオフにしました")}
                    disabled={busy || Boolean(done)}
                    className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold transition hover:border-ink disabled:opacity-50"
                  >
                    BGMをオフにする
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    chosen
                      ? void run(() => onChoose(chosen), "BGMを変更しました")
                      : undefined
                  }
                  disabled={busy || !chosen || chosen === current || Boolean(done)}
                  title={chosen === current ? "この曲が使われています" : undefined}
                  className="ml-auto rounded-full bg-ink px-4 py-2 text-xs font-semibold text-paper transition hover:bg-accent disabled:opacity-50"
                >
                  {busy ? "保存中…" : "この曲にする"}
                </button>
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

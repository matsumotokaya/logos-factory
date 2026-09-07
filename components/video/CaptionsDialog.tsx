"use client";

// The subtitle control, built the same way as the music and voice ones.
//
// Three buttons in a row, three dots, and the same kind of question behind each:
// is this on, and is the played film up to date with the answer. What makes them
// a set is not that they are all optional — it is that BGM, subtitles and voice
// are everything the film emits BESIDES the pictures.
//
// Subtitles were mandatory until 2026-08-17, which made the pair asymmetric for
// no reason anyone could state: the narration has two outputs, spoken and shown,
// and only one of them could be declined. Now both can, and the words — which
// are the film's spine either way — go nowhere.
//
// There is nothing to choose here, only on or off, and that is why the dialog
// still earns its place: two things about switching them off are not guessable
// from a toggle, and both are said below.

import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { eventCmFilm } from "@/remotion/event-cm/film";
import type { EventCmBrief } from "@/remotion/event-cm/types";
import StatusDot from "./StatusDot";

export default function CaptionsDialog({
  brief,
  /** Whether the film currently speaks. Both off is legal and worth saying. */
  hasVoice,
  /** The on/off decision is not the one the played film has (§5). */
  unreflected,
  busy,
  onTurnOn,
  onTurnOff,
}: {
  brief: EventCmBrief;
  hasVoice: boolean;
  unreflected: boolean;
  busy: boolean;
  onTurnOn: () => Promise<boolean>;
  onTurnOff: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // The one derivation, as everywhere else: `eventCmFilm` already answers "does
  // this film show its words", so the dialog does not read the provenance note
  // itself and cannot disagree with the picture.
  const cards = eventCmFilm(brief).captions.length;
  const on = cards > 0;

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
        if (!next) setDone(null);
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
          字幕
          <StatusDot on={on} unreflected={unreflected} />
        </span>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Viewport className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6">
          <Dialog.Popup className="mx-auto mt-16 w-full max-w-lg rounded-2xl bg-paper p-5 shadow-2xl focus:outline-none">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Dialog.Title className="font-display text-base font-semibold">
                  字幕
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-[12px] text-ink-muted">
                  {on
                    ? `オン ・ ${cards}枚 ・ ナレーションを1枚28字まででカードに割ります`
                    : "オフ（映像に文字は出ません）"}
                </Dialog.Description>
                {unreflected ? (
                  <p className="mt-1.5 text-[12px] text-amber-700">
                    この切り替えは、まだ動画プレビューに反映していません。「動画を作り直す」を押すと入ります。
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

            {/* The two things a toggle cannot say. Both are about what does NOT
                change, which is exactly what a person is unsure of before
                pressing something labelled 「オフにする」. */}
            <ul className="mt-4 flex flex-col gap-2 text-[12px] text-ink-muted">
              <li>
                <span className="font-semibold text-ink">尺は変わりません。</span>{" "}
                各シーンの長さを決めているのはナレーションの文字数（読み上げがあればその実測）で、
                画面に出すかどうかとは別です。
              </li>
              <li>
                <span className="font-semibold text-ink">言葉は残ります。</span>{" "}
                絵コンテのナレーションも読み上げもそのままで、消えるのは映像上の表示だけです。
              </li>
            </ul>

            {/* Not a refusal — a film that neither speaks nor shows its words is
                a legitimate cut (a loop behind a booth). But it is also the one
                state where the narration is doing nothing a viewer can perceive
                while still deciding the length, so it is said out loud. */}
            {on && !hasVoice ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                この動画はボイスがオフです。字幕も切ると、書いたナレーションはどこにも出なくなります（尺だけを決めます）。
              </p>
            ) : null}

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-[11px] text-ink-faint" role="status">
                {done ??
                  "業務向けの動画は音を出さずに見られることが多いので、既定はオンです"}
              </p>
              {on ? (
                <button
                  type="button"
                  onClick={() => void run(onTurnOff, "字幕をオフにしました")}
                  disabled={busy}
                  className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold transition hover:border-ink disabled:opacity-50"
                >
                  字幕をオフにする
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void run(onTurnOn, "字幕をオンにしました")}
                  disabled={busy}
                  className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
                >
                  字幕をオンにする
                </button>
              )}
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

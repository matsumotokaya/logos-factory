"use client";

// One pipeline stage, opened over the deliverable instead of replacing it.
//
// Covering only part of the screen is the point: the film stays visible
// behind, so running a stage never feels like leaving it. Modelled on
// slide-factory's drawer, including the motion — it slides in from the right
// while the backdrop fades, transform and opacity only, so the video playing
// behind does not stutter.
//
// Closing is offered three ways (Esc, backdrop, ×) because the panel covers
// most of the screen; one exit would make it read as a trap.
//
// The exit animation is why this takes an `open` flag rather than being
// mounted and unmounted directly: the caller drops the stage immediately, but
// the panel still has an animation to play, so it stays rendered until
// `onExited` fires. Reduced motion collapses the duration to 0.01ms instead of
// removing the animation, so `animationend` still arrives.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export default function StageDrawer({
  title,
  description,
  open = true,
  onClose,
  onExited,
  children,
}: {
  title: string;
  description?: string;
  /** False once the caller has dropped this stage: play the exit animation. */
  open?: boolean;
  onClose: () => void;
  /** The exit animation finished — safe to stop rendering. */
  onExited?: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [exiting, setExiting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Derived-state adjustment during render: closing starts an exit, and
  // reopening mid-exit cancels it.
  if (open !== wasOpen) {
    setWasOpen(open);
    setExiting(!open);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink/40",
          exiting ? "drawer-fade-out" : "drawer-fade-in",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onAnimationEnd={() => {
          if (exiting) onExited?.();
        }}
        className={cn(
          // Two thirds of the screen: enough room for a stage's own work,
          // little enough that the deliverable stays on screen.
          "absolute inset-y-0 right-0 flex w-full md:w-2/3 flex-col overflow-y-auto",
          "border-l border-hairline bg-paper shadow-xl focus:outline-none",
          exiting ? "drawer-slide-out" : "drawer-slide-in",
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-hairline bg-paper px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
            {description ? (
              <p className="mt-1 text-pretty text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="shrink-0 rounded p-1 text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-6 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

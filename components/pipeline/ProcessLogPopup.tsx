"use client";

export type StepLevel = "info" | "success" | "warn";
export type StepEvent = { id: number; ts: string; message: string; level: StepLevel };

const LOG_MARKS: Record<StepLevel, { icon: string; className: string }> = {
  info: { icon: "·", className: "text-ink-faint" },
  success: { icon: "✓", className: "text-emerald-600" },
  warn: { icon: "⚠", className: "text-amber-600" },
};

export function ProcessLogLines({
  steps,
  working,
}: {
  steps: StepEvent[];
  working: boolean;
}) {
  return (
    <ol className="space-y-1.5 font-mono text-[11px] leading-relaxed">
      {steps.map((step) => (
        <li key={step.id} className="flex items-start gap-2">
          <span className="shrink-0 text-ink-faint">{step.ts}</span>
          <span className={`w-3 shrink-0 text-center ${LOG_MARKS[step.level].className}`}>
            {LOG_MARKS[step.level].icon}
          </span>
          <span className={step.level === "warn" ? "text-amber-700" : undefined}>
            {step.message}
          </span>
        </li>
      ))}
      {working ? (
        <li className="flex items-center gap-2 text-ink-muted">
          <span
            aria-hidden
            className="inline-block size-3 animate-spin rounded-full border-2 border-ink-faint border-t-ink"
          />
          <span>…</span>
        </li>
      ) : null}
    </ol>
  );
}

/** A stored step ({ts ISO, message, level}) as the log lines show it. */
export function toStepEvents(
  steps: { ts: string; message: string; level: StepLevel }[],
): StepEvent[] {
  return steps.map((step, index) => ({
    id: index,
    ts: new Date(step.ts).toLocaleTimeString("ja-JP", { hour12: false }),
    message: step.message,
    level: step.level,
  }));
}

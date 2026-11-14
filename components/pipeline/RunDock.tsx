"use client";

// The run column, drawn once by the management shell so it outlives every
// page under it. Runs started through lib/runs/store.ts are listed here for
// as long as they run — leave the page that started one and its card stays —
// and a page's own stage cards (RunOverlay) join the same column.

import { useSyncExternalStore } from "react";
import { dismissRun, getRuns, getServerRuns, subscribeRuns } from "@/lib/runs/store";
import { RUN_COLUMN_CLASS, RUN_DOCK_ID, RunCardView } from "./RunOverlay";

export default function RunDock() {
  const runs = useSyncExternalStore(subscribeRuns, getRuns, getServerRuns);
  return (
    <div id={RUN_DOCK_ID} className={RUN_COLUMN_CLASS}>
      {runs.map((run) => (
        <RunCardView
          key={run.id}
          run={{ ...run, link: run.href ? { href: run.href, label: "開く" } : null }}
          onDismiss={() => dismissRun(run.id)}
        />
      ))}
    </div>
  );
}

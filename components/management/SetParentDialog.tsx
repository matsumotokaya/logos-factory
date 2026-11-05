"use client";

// 「継承元を指定」 — which brand this one builds on, or none.
//
// A sub-brand is a brand that inherits from another (its colours, its type,
// its logo when it has none of its own). That is a pointer on the brand, not
// a folder it lives in, so it is set from a list rather than by dragging the
// row somewhere. The server refuses a cycle and a brand from another
// workspace; the list here already leaves those out.

import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import type { BrandSummary } from "@/lib/brand-hierarchy";

export default function SetParentDialog({
  open,
  onOpenChange,
  brand,
  brands,
  saving,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: { id: string; name: string; parentBrandId: string | null };
  /** Every brand in the workspace; the dialog removes the brand itself and its descendants. */
  brands: BrandSummary[];
  saving: boolean;
  error: string | null;
  onSave: (parentBrandId: string | null) => void;
}) {
  // Mounted per brand by the shell (it unmounts when closed), so the initial
  // value is the brand's current parent and never has to be re-synced.
  const [choice, setChoice] = useState<string>(brand.parentBrandId ?? "");

  // A brand cannot inherit from itself or from anything that inherits from it.
  const parentOf = new Map(brands.map((row) => [row.id, row.parentBrandId]));
  const descendsFrom = (candidate: string, ancestor: string) => {
    for (let cursor = parentOf.get(candidate) ?? null; cursor; cursor = parentOf.get(cursor) ?? null) {
      if (cursor === ancestor) return true;
    }
    return false;
  };
  const options = brands.filter(
    (row) => row.id !== brand.id && !descendsFrom(row.id, brand.id),
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-black/45" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <Dialog.Popup
            aria-busy={saving}
            className="w-full max-w-md rounded-2xl border border-hairline bg-white p-6 shadow-xl focus:outline-none"
          >
            <Dialog.Title className="text-balance font-display text-xl font-semibold text-ink">
              「{brand.name}」の継承元
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-pretty text-sm text-ink-muted">
              継承元を指定すると、このブランドはサブブランドになり、自分に無い色・書体・ロゴを継承元から受け取ります。指定しなければ独立したブランドです。
            </Dialog.Description>

            <form
              className="mt-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!saving) onSave(choice === "" ? null : choice);
              }}
            >
              <label htmlFor="set-parent-select" className="text-[11px] font-semibold text-ink-muted">
                継承元
              </label>
              <select
                id="set-parent-select"
                value={choice}
                onChange={(event) => setChoice(event.target.value)}
                disabled={saving}
                className="mt-1.5 w-full rounded-xl border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-ink"
              >
                <option value="">継承しない（独立したブランド）</option>
                {options.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              {error ? (
                <p role="alert" className="mt-3 text-pretty text-xs text-red-700">
                  {error}
                </p>
              ) : null}
              <div className="mt-5 flex items-center justify-end gap-2">
                <Dialog.Close
                  disabled={saving}
                  className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold hover:border-ink disabled:opacity-40"
                >
                  キャンセル
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-ink px-5 py-2 text-xs font-semibold text-white hover:bg-ink/85 disabled:opacity-30"
                >
                  {saving ? "保存しています…" : "保存"}
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

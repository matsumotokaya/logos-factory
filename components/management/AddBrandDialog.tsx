"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestAuthDialog } from "@/lib/auth";
import { authedFetch, AuthRequiredError } from "@/app/campaigns/campaign-ui";

// "ブランドを追加" from the bottom of the sidebar.
//
// The same move as the top page's hero — a URL goes in, a Brand stands up in
// the workspace (§19.3) — without leaving the management screen. It takes only
// a URL: files and pasted text stay on the top page, where the drop zone and
// the catalog give them room. The run itself lives on /campaigns/[jobId], as it
// does from the top page, so this dialog closes as soon as the job exists.

export default function AddBrandDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The workspace the pane is showing: the world the new Brand lands in. */
  organizationId: string;
  organizationName: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (nextOpen: boolean) => {
    if (!nextOpen && starting) return;
    if (!nextOpen) {
      setUrl("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const generate = async () => {
    setError(null);
    setStarting(true);
    try {
      const res = await authedFetch("/api/labs/campaign/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), organizationId }),
      });
      const json = ((await res.json().catch(() => null)) ?? {}) as {
        jobId?: string;
        error?: string;
      };
      if (!res.ok || !json.jobId) {
        // Same wording as the top page: the endpoint answers 404 to stay
        // undiscoverable, which is not what the user should read.
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          throw new Error("このアカウントでは、まだ生成をご利用いただけません。");
        }
        throw new Error(
          json.error ?? `生成を開始できませんでした (HTTP ${res.status})`,
        );
      }
      router.push(`/campaigns/${json.jobId}`);
    } catch (e) {
      setStarting(false);
      if (e instanceof AuthRequiredError) {
        requestAuthDialog("create", "generate");
        return;
      }
      setError(e instanceof Error ? e.message : "生成に失敗しました");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-black/45" />
        <Dialog.Viewport
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
          }}
        >
          <Dialog.Popup
            aria-busy={starting}
            className="w-full max-w-lg rounded-2xl border border-hairline bg-white p-6 shadow-xl focus:outline-none"
          >
            <Dialog.Title className="text-balance font-display text-xl font-semibold text-ink">
              ブランドを追加
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-pretty text-sm text-ink-muted">
              URLを入れると、「{organizationName}」にブランドが1つ立ちます。
              Organization、ブランドプロフィール、仮ロゴ、LPがまとめて登録されます。
            </Dialog.Description>

            <form
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (url.trim() && !starting) void generate();
              }}
            >
              <label htmlFor="add-brand-url" className="sr-only">
                ブランドのURL
              </label>
              <input
                id="add-brand-url"
                type="url"
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-service.example.com"
                disabled={starting}
                className="w-full rounded-xl border border-hairline bg-paper px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-ink disabled:opacity-60"
              />

              {error ? (
                <p role="alert" className="mt-3 text-pretty text-xs text-red-700">
                  {error}
                </p>
              ) : null}

              <div className="mt-5 flex items-center justify-end gap-2">
                <Dialog.Close
                  disabled={starting}
                  className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
                >
                  キャンセル
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={!url.trim() || starting}
                  className="rounded-full bg-ink px-5 py-2 text-xs font-semibold text-white hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {starting ? "開始しています…" : "ブランドを追加"}
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

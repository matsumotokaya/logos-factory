"use client";

// /campaigns top — the front door of CM Maker. Intake (URL / files / text)
// plus the bundled sample rendered as the pre-filled placeholder: you can see
// what a run produces before running one. Starting a generation navigates to
// the campaign's own detail page (/campaigns/[jobId]) where the run lives;
// past campaigns appear as cards linking to their detail pages.

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import heroBg from "@/public/campaigns/bg/simon-nilsen.jpg";
import SiteFooter from "@/components/SiteFooter";
import type {
  BrandBusinessSummary,
  BrandOrganizationSummary,
} from "@/lib/brand-hierarchy";
import { analyzeSvg } from "@/lib/svg";
import { createStoredLogo, repo } from "@/lib/store";
import { newLogoId } from "@/lib/id";
import { readCurrentWorkspaceId, writeCurrentWorkspaceId } from "@/lib/workspace";
import {
  requestAuthDialog,
  useAuth,
  type AuthDialogPurpose,
} from "@/lib/auth";
import {
  authedFetch,
  AuthRequiredError,
  formatDate,
  type JobSummary,
} from "./campaign-ui";

function nameFromFile(fileName: string): string {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!base) return "Brand";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.svg$/i.test(file.name);
}

function isSvgFile(file: File): boolean {
  return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
}

type UiFile = {
  id: string;
  name: string;
  kind: "pdf" | "image";
  mediaType: string;
  data: string; // base64, no data: prefix
};

const SAMPLES: { label: string; url: string }[] = [
  { label: "Anthropic", url: "https://www.anthropic.com" },
  { label: "Apple", url: "https://www.apple.com/jp/" },
  { label: "Google", url: "https://about.google/" },
];

function requestedBusiness(
  organizations: BrandOrganizationSummary[],
): { business: BrandBusinessSummary; organizationName: string } | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("brand") ?? params.get("business");
  if (!id) return null;
  for (const organization of organizations) {
    const business = organization.brands.find(
      (candidate) => candidate.id === id,
    );
    if (business) return { business, organizationName: organization.name };
  }
  return null;
}

const ACCEPTED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

async function fileToUiFile(file: File): Promise<UiFile | null> {
  if (!ACCEPTED.has(file.type)) return null;
  if (file.size > 4_500_000) return null;
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    id: `${file.name}-${file.size}-${Date.now()}`,
    name: file.name,
    kind: file.type === "application/pdf" ? "pdf" : "image",
    mediaType: file.type,
    data: btoa(binary),
  };
}

// Signing in with a provider leaves the page entirely and comes back to a
// freshly mounted component, so the source the visitor typed — and the fact
// that they had already asked to generate — would be gone. Park both for the
// duration of the round trip. Attachments stay behind: they are megabytes of
// base64 and would blow the session store, so a run that used them is resumed
// by hand.
const INTAKE_KEY = "logos:campaign-intake";

type ParkedIntake = {
  url: string;
  pastedText: string;
  hadFiles: boolean;
};

function parkIntake(intake: ParkedIntake) {
  try {
    window.sessionStorage.setItem(INTAKE_KEY, JSON.stringify(intake));
  } catch {
    // A full or unavailable store costs the visitor a retype, not the page.
  }
}

/** Reading is destructive: a reload must not replay a generation unasked. */
function takeParkedIntake(): ParkedIntake | null {
  try {
    const raw = window.sessionStorage.getItem(INTAKE_KEY);
    window.sessionStorage.removeItem(INTAKE_KEY);
    return raw ? (JSON.parse(raw) as ParkedIntake) : null;
  } catch {
    return null;
  }
}

function clearParkedIntake() {
  try {
    window.sessionStorage.removeItem(INTAKE_KEY);
  } catch {
    // Nothing to recover from; the entry is one-shot either way.
  }
}

/** The workspace menu's 「新しいワークスペース」 entry; never a real org_id. */
const NEW_WORKSPACE = "new";

async function loadCampaignCatalog(): Promise<{
  jobs: JobSummary[];
  organizations: BrandOrganizationSummary[];
}> {
  const [jobsResult, brandsResult] = await Promise.all([
    authedFetch("/api/labs/campaign/jobs?list=1"),
    authedFetch("/api/brands"),
  ]);
  const jobsJson = jobsResult.ok
    ? ((await jobsResult.json()) as { jobs?: JobSummary[] })
    : null;
  const brandsJson = brandsResult.ok
    ? ((await brandsResult.json()) as {
        organizations?: BrandOrganizationSummary[];
      })
    : null;
  return {
    jobs: jobsJson?.jobs ?? [],
    organizations: brandsJson?.organizations ?? [],
  };
}

export default function CampaignsTop() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [files, setFiles] = useState<UiFile[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [organizations, setOrganizations] = useState<
    BrandOrganizationSummary[] | null
  >(null);
  const [selectedBusiness, setSelectedBusiness] = useState<{
    business: BrandBusinessSummary;
    organizationName: string;
  } | null>(null);
  // An explicit pick from the workspace menu; null until the user touches it.
  const [workspaceChoice, setWorkspaceChoice] = useState<string | null>(null);
  const [catalogMigrationError, setCatalogMigrationError] = useState<
    string | null
  >(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { enabled, isSignedIn, loading: authLoading } = useAuth();
  // Hero-wide drag-and-drop: dropping a file anywhere over the hero works, not
  // just on the card. dragDepth de-flickers nested enter/leave events.
  const [heroDragging, setHeroDragging] = useState(false);
  const dragDepth = useRef(0);
  // Raster logos (PNG/JPEG/…) are recognized as logos, but their dedicated
  // presentation is still being built — show a "準備中" notice instead.
  const [rasterNotice, setRasterNotice] = useState(false);
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  // Shown from the moment an SVG logo is accepted until the presentation route
  // takes over — a loading bar bridges the parse/save/navigation gap.
  const [logoLoading, setLogoLoading] = useState(false);
  // A generation the visitor asked for before signing in, waiting for the
  // session to become a real account. A ref, not state: flipping it must not
  // be what schedules the run — the effect below is already re-run by the
  // restored source landing in `generate`.
  const pendingResume = useRef(false);

  // Pick up whatever a sign-in redirect left behind, before anything else can
  // touch the intake fields.
  /* eslint-disable react-hooks/set-state-in-effect --
     Reading the parked intake is a read from an external store, and it cannot
     happen during render: the server has no session storage, so seeding the
     initial state from it would make the first client render disagree with the
     server's HTML. This runs once on mount and the entry is one-shot. */
  useEffect(() => {
    const parked = takeParkedIntake();
    if (!parked) return;
    setUrl(parked.url);
    setPastedText(parked.pastedText);
    if (parked.pastedText) setShowPaste(true);
    if (parked.hadFiles) {
      // Resuming with less material than the visitor chose would quietly
      // generate the wrong thing, so this run waits for them.
      setFileNotice("添付したファイルをもう一度追加してください。");
      return;
    }
    pendingResume.current = true;
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Signing in from the dialog without leaving the page (email) keeps the
  // fields on screen, which makes the parked copy stale the moment the session
  // becomes an account. Drop it, or the next visit would replay it.
  useEffect(() => {
    if (isSignedIn) clearParkedIntake();
  }, [isSignedIn]);

  const hasSource =
    url.trim() !== "" || files.length > 0 || pastedText.trim() !== "";

  // Where the new Brand goes. Asked only when there is something to ask: with
  // no workspace the server makes one, and a selected Brand already has one.
  // The last workspace opened in brand management is the starting point, and
  // only while it is still one of the caller's (organizations loads on the
  // client, so localStorage is never read during the server render).
  const workspaceOptions = organizations ?? [];
  const askWorkspace = !selectedBusiness && workspaceOptions.length > 0;
  const rememberedWorkspace = askWorkspace ? readCurrentWorkspaceId() : null;
  const effectiveWorkspace =
    workspaceChoice ??
    (workspaceOptions.some((option) => option.id === rememberedWorkspace)
      ? rememberedWorkspace
      : workspaceOptions.length === 1
        ? workspaceOptions[0].id
        : null);
  const workspaceMissing = askWorkspace && !effectiveWorkspace;

  // The catalog lists brands the visitor owns, so it only appears once an
  // account exists. localStorage mode has no registered identity either.
  const showCatalog = enabled && !authLoading && isSignedIn;
  const catalogFallbackJobs = organizations?.length
    ? (jobs ?? []).filter((job) => !job.businessId)
    : (jobs ?? []);

  // PDF source material for the campaign pipeline (images are handled as logos
  // by openLogoFromImage, so they never reach here).
  const addFiles = useCallback(async (list: FileList | File[]) => {
    const added: UiFile[] = [];
    const skipped: string[] = [];
    for (const f of Array.from(list)) {
      const ui = await fileToUiFile(f);
      if (ui) added.push(ui);
      else skipped.push(f.name);
    }
    if (added.length) setFiles((prev) => [...prev, ...added].slice(0, 5));
    if (skipped.length) {
      setFileNotice(
        `${skipped.join("、")} は追加できませんでした（PDF・画像で各4.5MBまで）`,
      );
    } else if (added.length) {
      setFileNotice(null);
    }
  }, []);

  // True when the caller must stop — either auth is still settling, or the
  // visitor needs an account and the dialog is now open. onPrompt runs only in
  // that second case, which is the one that can navigate away from the page.
  const requireAccount = useCallback(
    (purpose: AuthDialogPurpose = "default", onPrompt?: () => void) => {
      if (!enabled) return false;
      if (authLoading) return true;
      if (isSignedIn) return false;
      onPrompt?.();
      requestAuthDialog("create", purpose);
      return true;
    },
    [enabled, authLoading, isSignedIn],
  );

  // An explicitly uploaded image is a logo. SVG opens its management-side
  // presentation editor; raster stays "準備中" until its dedicated mode ships.
  const openLogoFromImage = useCallback(
    async (file: File) => {
      setFileNotice(null);
      if (requireAccount()) return;
      if (!isSvgFile(file)) {
        setRasterNotice(true);
        return;
      }
      // Loading bar stays up through parse → save → navigation; the route
      // change unmounts this component, so we only clear it on failure.
      setLogoLoading(true);
      try {
        const source = await file.text();
        const data = analyzeSvg(source, file.name);
        // Re-uploading the same file opens the existing entry, never a dup.
        const existing = await repo.listLogos();
        const dup = existing.find((l) => l.data.svg === data.svg);
        if (dup) {
          router.push(`/logos/${dup.id}/presentation`);
          return;
        }
        const id = newLogoId();
        await repo.saveLogo(
          createStoredLogo({
            id,
            title: nameFromFile(file.name),
            role: existing.length === 0 ? "brand" : "other",
            data,
          }),
        );
        router.push(`/logos/${id}/presentation`);
      } catch (e) {
        setLogoLoading(false);
        setFileNotice(
          e instanceof Error ? e.message : "SVGを読み込めませんでした",
        );
      }
    },
    [requireAccount, router],
  );

  // Route dropped/selected files by intent: an image is a logo (→ editor),
  // anything else (PDF) is campaign source material.
  const acceptFiles = useCallback(
    (list: FileList | File[]) => {
      const items = Array.from(list);
      const image = items.find(isImageFile);
      if (image) {
        void openLogoFromImage(image);
        return;
      }
      void addFiles(items);
    },
    [openLogoFromImage, addFiles],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const initial = await loadCampaignCatalog();
        if (cancelled) return;
        setJobs(initial.jobs);
        setOrganizations(initial.organizations);
        setSelectedBusiness(requestedBusiness(initial.organizations));

        const hasLegacyJobs = initial.jobs.some(
          (job) => job.status === "done" && !job.businessId,
        );
        if (!hasLegacyJobs) return;

        const migrationResponse = await authedFetch("/api/brands/backfill", {
          method: "POST",
        });
        const migrationBody = (await migrationResponse
          .json()
          .catch(() => null)) as {
          migrated?: string[];
          failures?: Array<{ error: string }>;
        } | null;
        if (!migrationResponse.ok) {
          throw new Error(
            migrationBody?.failures?.[0]?.error ??
              "旧キャンペーンをOrganizationへ整理できませんでした",
          );
        }

        if ((migrationBody?.migrated?.length ?? 0) === 0) return;
        const refreshed = await loadCampaignCatalog();
        if (cancelled) return;
        setJobs(refreshed.jobs);
        setOrganizations(refreshed.organizations);
        setSelectedBusiness(requestedBusiness(refreshed.organizations));
      } catch {
        if (!cancelled) {
          setJobs((current) => current ?? []);
          setOrganizations((current) => current ?? []);
          setCatalogMigrationError(
            "旧キャンペーンは仮Organization内に表示しています。台帳への自動整理は次回もう一度試します。",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      const res = await authedFetch("/api/labs/campaign/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim() || undefined,
          pastedText: pastedText.trim() || undefined,
          files: files.map((f) => ({
            kind: f.kind,
            mediaType: f.mediaType,
            data: f.data,
          })),
          brandEntityId: selectedBusiness?.business.id,
          // Only what the form shows. Nothing is sent when the menu was not
          // shown, and the server then decides from the caller's memberships
          // (none: a new workspace, one: that one, more: it asks).
          ...(askWorkspace && effectiveWorkspace === NEW_WORKSPACE
            ? { newWorkspace: true }
            : askWorkspace && effectiveWorkspace
              ? { organizationId: effectiveWorkspace }
              : {}),
        }),
      });
      const json = ((await res.json().catch(() => null)) ?? {}) as {
        jobId?: string;
        brandId?: string;
        organizationId?: string | null;
        error?: string;
      };
      if (!res.ok || !json.brandId) {
        // The gate and the route both answer in the visitor's terms.
        throw new Error(
          json.error ?? `生成を開始できませんでした (HTTP ${res.status})`,
        );
      }
      // The brand page shows the workspace it is in, so make that the
      // current one — it may have just been created.
      if (json.organizationId) writeCurrentWorkspaceId(json.organizationId);
      // The brand exists already; its page follows the run.
      router.push(`/brands/${json.brandId}`);
    } catch (e) {
      setStarting(false);
      // No session at all: the next step is signing in, so open the dialog
      // rather than report it. An error banner here would be a dead end.
      if (e instanceof AuthRequiredError) {
        requestAuthDialog("create");
        return;
      }
      setError(e instanceof Error ? e.message : "生成に失敗しました");
    }
  }, [url, pastedText, files, selectedBusiness, askWorkspace, effectiveWorkspace, router]);

  // A generation parked before sign-in starts itself once the session is a
  // real account. If sign-in produced none (dialog dismissed, OAuth failed),
  // the source is back on screen and the button is the next step.
  useEffect(() => {
    if (!pendingResume.current || authLoading || !isSignedIn) return;
    pendingResume.current = false;
    void generate();
  }, [authLoading, isSignedIn, generate]);

  const requestGeneration = useCallback(() => {
    setError(null);
    // Signed out: send them to sign-in instead of telling them to. Providers
    // sign in by leaving the page, so the source and the intent are parked
    // first — coming back to an empty form is what made a refused generation
    // look like nothing had happened at all.
    if (
      requireAccount("generate", () =>
        parkIntake({
          url: url.trim(),
          pastedText: pastedText.trim(),
          hadFiles: files.length > 0,
        }),
      )
    ) {
      return;
    }
    void generate();
  }, [requireAccount, generate, url, pastedText, files]);

  return (
    <main>
      {/* Full-viewport hero: copy on the left, the intake as a macOS-style
          frosted glass card on the right, over a full-bleed photograph.
          The floating app header is cleared with top padding. */}
      <section
        id="create"
        className="relative flex min-h-dvh items-center overflow-hidden bg-[#101a3c]"
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          dragDepth.current += 1;
          setHeroDragging(true);
        }}
        onDragOver={(e) => {
          if (heroDragging) e.preventDefault();
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setHeroDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          dragDepth.current = 0;
          setHeroDragging(false);
          if (e.dataTransfer.files.length) acceptFiles(e.dataTransfer.files);
        }}
      >
        <Image
          src={heroBg}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          className="object-cover"
        />
        {/* Legibility scrim over the photo. */}
        <div aria-hidden className="absolute inset-0 bg-[#060b22]/40" />

        {/* Drag-anywhere feedback: a translucent veil (not a hard white flash)
            keeps the hero visible underneath. pointer-events-none so drag/drop
            events pass through to the section. The inner card stays opaque
            enough to read over whatever shows through. */}
        {heroDragging && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-white/50 backdrop-blur-[2px] transition-opacity">
            <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-ink/25 bg-white/75 px-14 py-10 text-center shadow-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="size-10 text-ink"
              >
                <path
                  d="M12 15V4m0 0L8 8m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div>
                <p className="text-lg font-semibold text-ink">ここにドロップ</p>
                <p className="mt-1 text-sm text-ink-muted">
                  ロゴ（SVG / PNG / JPEG）またはPDF資料
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 pt-28 pb-20 md:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16 lg:pt-32">
          {/* Left: title + pitch */}
          <header>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
              BRAND SYSTEM OF RECORD | LP, VIDEO, BRAND ASSETS
            </p>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-white md:text-4xl lg:text-[2.75rem] lg:leading-[1.2]">
              {/* inline-block per phrase: wrap between phrases, never mid-word */}
              <span className="inline-block">セールスページと紹介動画を、</span>
              <span className="inline-block">URLひとつから。</span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-pretty text-white/70 md:text-base">
              {/* Joined explicitly: a newline between JSX text becomes a space,
                  which reads as a stray gap mid-sentence in Japanese. */}
              {"URL・PDF・スクリーンショット・テキスト。内容がわかるものを渡すと、" +
                "ブランドを理解したうえで、セールスページ・紹介動画などのマーケティングアセットが" +
                "一式で出てきます。確定した内容はブランドの正本として貯まり、" +
                "次の成果物が速く正確になります。"}
            </p>
          </header>

          {/* Right: intake as a frosted glass card */}
          <section
            aria-label="ソースを追加"
            className="rounded-[28px] border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-2xl"
          >
            <h2 className="text-sm font-semibold text-white">ソースを追加</h2>
            {selectedBusiness ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/10 px-3 py-2">
                <p className="min-w-0 text-pretty text-[11px] text-white/70">
                  <span className="block truncate text-white/45">
                    {selectedBusiness.organizationName}
                  </span>
                  <span className="block truncate font-semibold text-white">
                    {selectedBusiness.business.name} のアセット
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedBusiness(null)}
                  className="shrink-0 text-[11px] text-white/55 transition-colors hover:text-white"
                >
                  選択解除
                </button>
              </div>
            ) : null}

            {/* URL row + samples */}
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-service.example.com"
              className="mt-4 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/60 focus:bg-white/15"
              disabled={starting}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-white/50">試しに:</span>
              {SAMPLES.map((s) => (
                <button
                  key={s.url}
                  type="button"
                  onClick={() => setUrl(s.url)}
                  className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/60 transition hover:border-white/60 hover:text-white"
                  disabled={starting}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Drop zone. Images route to the logo presentation, PDFs become
                campaign source. stopPropagation keeps the hero-wide handler
                from double-processing a drop that lands on the card. */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOver(false);
                setHeroDragging(false);
                dragDepth.current = 0;
                acceptFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`mt-4 cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
                dragOver
                  ? "border-white bg-white/15"
                  : "border-white/25 hover:border-white/50"
              }`}
            >
              <p className="text-sm text-white/70">
                ロゴや資料をドロップ、またはクリックして選択
              </p>
              <p className="mt-1 text-[11px] text-white/40">
                ロゴ（SVG / PNG / JPEG）→ プレゼン、PDF資料 → LP・動画の素材に
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="application/pdf,image/svg+xml,image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) acceptFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {fileNotice && (
              <p className="mt-3 rounded-lg border border-amber-300/40 bg-amber-500/15 px-4 py-2 text-[12px] text-amber-100">
                {fileNotice}
              </p>
            )}

            {files.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-[11px] text-white/80"
                  >
                    <span>{f.kind === "pdf" ? "📄" : "🖼"}</span>
                    <span className="max-w-[180px] truncate">{f.name}</span>
                    <button
                      type="button"
                      aria-label={`${f.name} を削除`}
                      onClick={() =>
                        setFiles((prev) => prev.filter((x) => x.id !== f.id))
                      }
                      className="text-white/40 hover:text-white"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Paste text */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowPaste((v) => !v)}
                className="text-[12px] text-white/60 underline-offset-2 hover:text-white hover:underline"
              >
                {showPaste
                  ? "テキスト貼り付けを閉じる"
                  : "コピーしたテキストを貼り付ける"}
              </button>
              {showPaste && (
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  rows={4}
                  placeholder="サービス概要・プレスリリース・紹介文などを貼り付け"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/60 focus:bg-white/15"
                  disabled={starting}
                />
              )}
            </div>

            {askWorkspace ? (
              <div className="mt-4">
                <label
                  htmlFor="campaign-workspace"
                  className="text-[12px] text-white/60"
                >
                  登録先のワークスペース
                </label>
                <select
                  id="campaign-workspace"
                  value={effectiveWorkspace ?? ""}
                  onChange={(e) => setWorkspaceChoice(e.target.value || null)}
                  disabled={starting}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none focus:border-white/60 focus:bg-white/15"
                >
                  {effectiveWorkspace ? null : (
                    <option value="" className="text-ink">
                      選んでください
                    </option>
                  )}
                  {workspaceOptions.map((option) => (
                    <option key={option.id} value={option.id} className="text-ink">
                      {option.name.trim() || "名称未設定のワークスペース"}
                    </option>
                  ))}
                  <option value={NEW_WORKSPACE} className="text-ink">
                    新しいワークスペース（サイトの会社名で作成）
                  </option>
                </select>
              </div>
            ) : showCatalog && organizations && !selectedBusiness ? (
              <p className="mt-4 text-pretty text-[12px] text-white/60">
                新しいワークスペースを作って登録します。名前はサイトから取った会社名になります。
              </p>
            ) : null}

            {error && (
              <p className="mt-4 rounded-lg border border-red-300/40 bg-red-500/20 px-4 py-2 text-[12px] text-red-100">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={requestGeneration}
              // Held while the session resolves: until then requireAccount can
              // neither let the run through nor open the dialog, so a press
              // would do nothing visible. Held too while a workspace is still
              // to be chosen — the server would only ask the same question.
              disabled={!hasSource || starting || authLoading || workspaceMissing}
              className="mt-5 w-full rounded-full bg-white px-8 py-3 text-sm font-semibold text-[#101a3c] transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {starting ? "開始しています…" : "LPと動画素材を生成"}
            </button>
            {starting && (
              <p className="mt-3 flex items-center justify-center gap-2 text-[12px] text-white/60">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                アセット詳細へ移動します…
              </p>
            )}
          </section>
        </div>

        {/* Below-the-fold cue: a simple vertical line with a bright segment
            travelling down it — no words, just the common scroll hint. Shown
            only when there is a catalog below to scroll to. */}
        {showCatalog && (
          <a
            href="#browse"
            aria-label="下にスクロール"
            className="group absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
          >
            <span className="relative block h-14 w-px overflow-hidden bg-white/20">
              <span className="scroll-cue-run absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-transparent to-white/80" />
            </span>
          </a>
        )}
      </section>

      {/* The brand catalog is personal inventory: guests have none, so the
          landing ends at the hero and the footer for them. */}
      {showCatalog && (
        <div id="browse" className="mx-auto max-w-6xl px-6 py-12 md:px-10">
          {/* The brand hierarchy is the primary navigation. Generated files are
            assets inside each Brand, not another required container. */}
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-ink-muted">
                  BRAND CATALOG
                </p>
                <h2 className="mt-1 text-balance font-display text-xl font-semibold">
                  あなたのブランド
                </h2>
              </div>
              <div className="flex max-w-lg flex-wrap items-center justify-end gap-3">
                <p className="text-pretty text-[11px] text-ink-muted">
                  Organizationの中に企業・事業ブランドと、ロゴ・LP・動画がまとまります。
                </p>
                <Link
                  href="/brands"
                  className="rounded-full border border-ink px-4 py-2 text-xs font-semibold hover:bg-ink hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  ブランド管理を開く
                </Link>
              </div>
            </div>

            <div className="mt-5 grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
              <aside className="rounded-2xl border border-hairline bg-white p-3 lg:sticky lg:top-24">
                <nav aria-label="ブランド階層">
                  <p className="px-2 py-1 text-[10px] font-semibold text-ink-faint">
                    会社・組織
                  </p>
                  {organizations === null ? (
                    <div
                      className="space-y-2 px-2 py-3"
                      aria-label="ブランドを読み込み中"
                    >
                      <span className="block h-3 w-2/3 rounded bg-ink/10" />
                      <span className="block h-3 w-1/2 rounded bg-ink/10" />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {organizations.map((organization) => (
                        <details key={organization.id} open className="group">
                          <summary className="cursor-pointer rounded-lg px-2 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                            <span className="text-pretty">
                              {organization.name}
                            </span>
                          </summary>
                          <ul className="mb-2 ml-3 border-l border-hairline pl-3">
                            {organization.brands.map((business) => (
                              <li key={business.id}>
                                <Link
                                  href={`/brands/${business.id}`}
                                  className="block truncate rounded-md px-2 py-1.5 text-xs text-ink-muted hover:bg-ink/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                >
                                  {business.name}
                                </Link>
                              </li>
                            ))}
                            {organization.brands.length === 0 ? (
                              <li className="px-2 py-1.5 text-pretty text-[10px] text-ink-faint">
                                ブランドはまだありません
                              </li>
                            ) : null}
                          </ul>
                        </details>
                      ))}
                      {catalogFallbackJobs.length > 0 ? (
                        <details open>
                          <summary className="cursor-pointer rounded-lg px-2 py-2 text-pretty text-sm font-semibold text-ink hover:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                            名称未設定のOrganization
                          </summary>
                          <ul className="mb-2 ml-3 border-l border-hairline pl-3">
                            {catalogFallbackJobs.map((job) => (
                              <li key={job.id}>
                                <a
                                  href={`#legacy-campaign-${job.id}`}
                                  className="block truncate rounded-md px-2 py-1.5 text-xs text-ink-muted hover:bg-ink/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                >
                                  {job.businessName ?? job.name}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  )}
                  <a
                    href="#create"
                    className="mt-2 block rounded-lg border border-dashed border-hairline px-3 py-2 text-center text-xs font-semibold text-ink-muted hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    ＋ URLから登録
                  </a>
                </nav>
              </aside>

              <div className="min-w-0 space-y-5">
                {(organizations ?? []).map((organization) => (
                  <article
                    id={`organization-${organization.id}`}
                    key={organization.id}
                    className="scroll-mt-24 rounded-2xl border border-hairline p-5 md:p-6"
                  >
                    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold">
                            {organization.name}
                          </h3>
                          {organization.status === "inferred" ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              未確認
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-pretty text-[11px] text-ink-muted">
                          {organization.description ||
                            organization.website ||
                            "組織情報はこれから補完されます"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-[10px] text-ink-faint">
                          オーガニゼーション
                        </span>
                      </div>
                    </header>

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {organization.brands.map((business) => (
                        <section
                          id={`business-${business.id}`}
                          key={business.id}
                          className="scroll-mt-24 rounded-xl bg-ink/[0.03] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">
                                {business.name}
                              </p>
                              <p className="mt-0.5 truncate text-[10px] text-ink-muted">
                                {business.kind === "corporate"
                                  ? "企業ブランド"
                                  : business.kind === "audience"
                                    ? "対象別ブランド"
                                    : business.industry || "事業ブランド"}
                              </p>
                            </div>
                            <span
                              className="flex shrink-0 gap-1.5"
                              aria-label="ブランドカラー"
                            >
                              {[business.primary, business.accent].map(
                                (color, index) => (
                                  <span
                                    key={index}
                                    className="size-4 rounded-full border border-hairline bg-white"
                                    style={
                                      color
                                        ? { backgroundColor: color }
                                        : undefined
                                    }
                                  />
                                ),
                              )}
                            </span>
                          </div>

                          <dl className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                            <div>
                              <dt className="text-ink-faint">ロゴ</dt>
                              <dd className="mt-0.5 tabular-nums">
                                {business.logoIds.length}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-ink-faint">アセット</dt>
                              <dd className="mt-0.5 tabular-nums">
                                {business.assets.length +
                                  business.logoIds.length}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-ink-faint">情報</dt>
                              <dd className="mt-0.5">
                                {business.status === "confirmed"
                                  ? "確認済み"
                                  : "仮登録"}
                              </dd>
                            </div>
                          </dl>

                          {business.campaigns.length > 0 ? (
                            <div className="mt-3 border-t border-hairline pt-3">
                              <p className="text-[10px] text-ink-faint">
                                最近のLP
                              </p>
                              {business.campaigns
                                .slice(0, 2)
                                .map((campaign) => (
                                  <Link
                                    key={campaign.id}
                                    href={`/brands/${business.id}/lp/${campaign.id}`}
                                    className="mt-1 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-white"
                                  >
                                    <span className="truncate">
                                      {campaign.name}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-ink-faint">
                                      {formatDate(campaign.createdAt)}
                                    </span>
                                  </Link>
                                ))}
                            </div>
                          ) : (
                            <p className="mt-3 border-t border-hairline pt-3 text-pretty text-[10px] text-ink-faint">
                              LPはまだありません。
                            </p>
                          )}

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Link
                              href={`/brands/${business.id}`}
                              className="rounded-full border border-hairline px-4 py-2 text-center text-[11px] font-semibold text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                            >
                              ブランド詳細を編集
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBusiness({
                                  business,
                                  organizationName: organization.name,
                                });
                                document
                                  .getElementById("create")
                                  ?.scrollIntoView();
                              }}
                              className="rounded-full border border-ink px-4 py-2 text-[11px] font-semibold transition-colors hover:bg-ink hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                            >
                              アセットを生成
                            </button>
                          </div>
                        </section>
                      ))}
                    </div>
                  </article>
                ))}

                {organizations !== null &&
                organizations.length === 0 &&
                catalogFallbackJobs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-hairline px-6 py-10 text-center">
                    <p className="text-balance text-sm font-semibold">
                      まだブランドが登録されていません
                    </p>
                    <p className="mx-auto mt-2 max-w-lg text-pretty text-[11px] text-ink-muted">
                      上でURLや資料を追加すると、Organization、ブランドプロフィール、仮ロゴ、LPがまとめて登録されます。
                    </p>
                    <a
                      href="#create"
                      className="mt-4 inline-block rounded-full bg-ink px-5 py-2 text-[11px] font-semibold text-white"
                    >
                      最初のブランドを登録する
                    </a>
                  </div>
                ) : null}

                {catalogFallbackJobs.length > 0 ? (
                  <article className="rounded-2xl border border-hairline p-5 md:p-6">
                    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-balance text-base font-semibold">
                            名称未設定のOrganization
                          </h3>
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            未確認
                          </span>
                        </div>
                        <p className="mt-1 text-pretty text-[11px] text-ink-muted">
                          運営会社をまだ特定できていない事業を、一時的にまとめています。
                        </p>
                        {catalogMigrationError ? (
                          <p
                            className="mt-2 text-pretty text-[11px] text-red-700"
                            role="status"
                          >
                            {catalogMigrationError}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[10px] text-ink-faint">
                        仮Organization
                      </span>
                    </header>

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {catalogFallbackJobs.map((job) => (
                        <Link
                          id={`legacy-campaign-${job.id}`}
                          key={job.id}
                          href={`/campaigns/${job.id}`}
                          className="scroll-mt-24 rounded-xl bg-ink/[0.03] p-4 hover:bg-ink/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate text-sm font-semibold">
                              {job.businessName ?? job.name}
                            </p>
                            <span className="shrink-0 text-[10px] text-ink-faint">
                              {job.status === "error" ? "エラー" : "整理中"}
                            </span>
                          </div>
                          <p className="mt-2 text-pretty text-[10px] text-ink-muted">
                            {job.catalogError
                              ? `${job.registrationScope === "organization" ? "Organization" : "ブランド"}登録を再試行中です`
                              : (job.organizationName ??
                                "運営Organizationは未確認です")}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </article>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      )}

      <SiteFooter />

      {/* Logo accepted → bridge the parse/save/navigation gap with a loading
          bar so the screen never looks frozen before the presentation opens. */}
      {logoLoading && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#060b22]/70 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label="ロゴを読み込んでいます"
        >
          <div className="w-[min(22rem,80vw)] text-center">
            <p className="text-sm font-medium text-white">
              ロゴを読み込んでいます…
            </p>
            <div className="relative mt-4 h-1 w-full overflow-hidden rounded-full bg-white/20">
              <span className="progress-indeterminate absolute left-0 top-0 h-full w-2/5 rounded-full bg-white" />
            </div>
          </div>
        </div>
      )}

      {/* Raster logo → recognized as a logo, but its presentation mode is not
          built yet. A dedicated animation is planned; until then, "準備中". */}
      {rasterNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
          role="dialog"
          aria-modal="true"
          aria-label="画像ロゴのプレゼンは準備中"
          onClick={() => setRasterNotice(false)}
        >
          <div
            className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-ink">
              画像ロゴのプレゼンは準備中です
            </p>
            <p className="mt-2 text-pretty text-sm text-ink-muted">
              PNG・JPEGのロゴ向けプレゼンテーションは近日公開予定です。今はSVGロゴでフルのブランドプレゼンをお試しいただけます。
            </p>
            <button
              type="button"
              onClick={() => setRasterNotice(false)}
              className="mt-5 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

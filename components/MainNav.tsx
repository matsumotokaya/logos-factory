"use client";

// The hamburger is the single product navigation. Guests only see Home;
// registered users also see product areas, and platform-authorized users see
// the internal Labs entrance. Account actions stay in Account.tsx.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { usePlatformAccess } from "@/lib/use-platform-access";
import { cn } from "@/lib/cn";

export default function MainNav({
  tone = "dark",
}: {
  tone?: "dark" | "light";
}) {
  const { dict } = useI18n();
  const { enabled, loading, isSignedIn } = useAuth();
  const { canAccessLabs } = usePlatformAccess();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: { href: string; label: string }[] = [
    { href: "/", label: dict.header.home },
  ];

  // localStorage mode has no registered identity, so it follows guest nav.
  if (enabled && !loading && isSignedIn) {
    items.push({ href: "/brands", label: "ブランド管理" });
    if (canAccessLabs) {
      items.push({ href: "/labs", label: dict.header.labs });
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex size-8 items-center justify-center rounded-full transition-colors",
          tone === "dark"
            ? "text-ink-muted hover:bg-ink/5 hover:text-ink"
            : "text-white/70 hover:bg-white/10 hover:text-white",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="size-5"
        >
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-hairline bg-paper py-1.5 shadow-lg"
        >
          {items.map((it) => (
            <Link
              key={it.href}
              role="menuitem"
              href={it.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-ink transition-colors hover:bg-ink/5"
            >
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

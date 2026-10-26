// Shared site footer. Every page can end with this: the wordmark, the standard
// legal/company menu, and the copyright line. Two tones so it can sit on the
// white product surface or under a dark landing section.

import Link from "next/link";
import { SERVICE_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";

const GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "プロダクト",
    links: [
      { href: "/", label: "ブランドを作る" },
      { href: "/brands", label: "ブランド管理" },
      { href: "/p/sample", label: "サンプルプレゼン" },
    ],
  },
  {
    title: "会社",
    links: [
      { href: "/company", label: "会社概要" },
      { href: "/contact", label: "お問い合わせ" },
      { href: "/pricing", label: "料金" },
    ],
  },
  {
    title: "規約",
    links: [
      { href: "/terms", label: "利用規約" },
      { href: "/privacy", label: "プライバシーポリシー" },
      { href: "/legal/tokushoho", label: "特定商取引法に基づく表記" },
    ],
  },
];

export default function SiteFooter({
  tone = "dark",
}: {
  /** "light" renders white text over a dark surface, matching AppHeader. */
  tone?: "dark" | "light";
}) {
  const light = tone === "light";

  return (
    <footer
      className={cn(
        "border-t",
        light ? "border-white/15 bg-transparent text-white" : "border-hairline bg-paper text-ink",
      )}
    >
      <div className="mx-auto max-w-6xl px-6 py-12 md:px-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_repeat(3,auto)] lg:gap-16">
          <div>
            <p className="font-display text-xl font-medium">
              {SERVICE_NAME}
              <span className="align-super text-[0.55em]">®</span>
            </p>
            <p
              className={cn(
                "mt-3 max-w-xs text-pretty text-xs leading-relaxed",
                light ? "text-white/60" : "text-ink-muted",
              )}
            >
              ソースを渡すだけで、ブランド・セールスページ・動画をまとめて生成し、
              ひとつの場所で管理する。
            </p>
          </div>

          {GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.14em]",
                  light ? "text-white/45" : "text-ink-faint",
                )}
              >
                {group.title}
              </p>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                        light
                          ? "text-white/70 hover:text-white focus-visible:outline-white"
                          : "text-ink-muted hover:text-ink focus-visible:outline-ink",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p
          className={cn(
            "mt-12 text-[10px]",
            light ? "text-white/40" : "text-ink-faint",
          )}
        >
          © {new Date().getFullYear()} {SERVICE_NAME}
        </p>
      </div>
    </footer>
  );
}

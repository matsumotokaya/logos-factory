// What a brand's own site actually yields — read only, nothing stored.
//
// The seeded deliverables are supposed to arrive already wearing the brand's
// colours. Before building anything on that promise it is worth knowing what
// the capture really returns for a given site, because "the palette is empty"
// and "the palette was never adopted" look identical from the database.
//
//   npm run brand:inspect-site -- --url https://example.com

import { captureSite } from "@/lib/site/capture";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? null) : null;
};

const list = (
  label: string,
  values: Array<{ hex: string; weight?: number; count?: number; share?: number }>,
) => {
  console.log(`\n${label} (${values.length})`);
  for (const value of values.slice(0, 8)) {
    const measure =
      value.weight !== undefined
        ? `weight ${value.weight}`
        : value.count !== undefined
          ? `count ${value.count}`
          : value.share !== undefined
            ? `share ${value.share.toFixed(3)}`
            : "";
    console.log(`  ${value.hex}  ${measure}`);
  }
};

async function main() {
  const url = flag("url");
  if (!url) throw new Error("--url <URL> が必要です");

  console.log(`capturing ${url} …`);
  const capture = await captureSite(url);
  if (!capture) {
    throw new Error("キャプチャできませんでした（playwright 未インストール、または到達不可）");
  }

  console.log(`\n■ ${capture.url}`);
  list("ロゴの色", capture.evidence.logoColors);
  list("操作要素の色", capture.evidence.interactive);
  list("背景色", capture.evidence.backgrounds);
  list("文字色", capture.evidence.texts);

  console.log("\nデザイントークン");
  for (const [key, value] of Object.entries(capture.designTokens)) {
    console.log(`  ${key}: ${value ?? "—"}`);
  }

  console.log("\n素材");
  console.log(`  ロゴSVG: ${capture.logoSvg ? `${capture.logoSvg.length}文字` : "なし"}`);
  console.log(`  ロゴ画像: ${capture.logoImage ? "あり" : "なし"}`);
  console.log(
    `  スクリーンショット: desktop ${capture.screenshots.desktop ? "○" : "×"} / full ${
      capture.screenshots.fullPage ? "○" : "×"
    } / mobile ${capture.screenshots.mobile ? "○" : "×"}`,
  );

  console.log(`\nロゴ候補（実画面 ${capture.logoCandidates.length}件）`);
  for (const c of capture.logoCandidates) {
    console.log(
      `  score ${c.score}  ${c.note}${c.svg ? "（SVG）" : ""}${c.src ? `\n    file: ${c.src}` : ""}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

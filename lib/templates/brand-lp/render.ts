import { SOCIAL_NETWORKS } from "@/lib/brand/profile";
import type { BrandLpBrief, LpSection } from "./brief-schema";
import { lpDesign, type LpDesign } from "./design";

// The brand LP, as one standalone HTML document.
//
// Pure: a brief and the addresses of its two files in, a string out. Colour,
// type and shape come from the kit through lpDesign(); the words come from
// the brief's content. Nothing here knows a brand by name, and nothing here
// invents a value — a missing section is left out, not filled.
//
// The page is deliberately small: a hero with one call to action, what the
// thing is, three features, the customers' voices, the call to action again.
// One composition, so that what differs between two brands' pages is the
// brand.
//
// Constraints:
//   - No <script>. The workspace shows the page in a sandboxed iframe, and a
//     page that needs script would look different there than anywhere else.
//   - One external request, the web fonts (design.ts). Images are addresses
//     the caller passes in.

export type LpAssets = {
  /** The logo as a URL or data URI, or null to set the name in type. */
  logo: string | null;
  /** The site's screen for the hero, or null to leave the hero typographic. */
  screen: string | null;
};

export type LpRenderOptions = {
  /** Outline the sections whose facts are not from the kit (workspace preview). */
  markGaps?: boolean;
  /** Open links that leave the page in a new tab (a preview inside a frame). */
  newTab?: boolean;
};

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Escaped text, with the writer's "\n" kept as a line break. */
const lines = (value: string) => value.split("\n").map((part) => esc(part.trim())).filter(Boolean).join("<br>");

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Only http(s) and in-page links leave the page; anything else goes nowhere. */
function safeHref(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) return esc(trimmed);
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? esc(url.href) : "#";
  } catch {
    return "#";
  }
}

function hostOf(website: string): string {
  try {
    return new URL(website).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Who said it. A voice with no name is signed with its role; with neither, unsigned. */
function whoHtml(voice: { name: string; role: string }): string {
  const name = voice.name.trim();
  const role = voice.role.trim();
  if (!name && !role) return "";
  return `<div class="who">
            ${name ? `<span class="avatar" aria-hidden="true">${esc(name.charAt(0))}</span>` : ""}
            <span><b>${esc(name || role)}</b>${name && role ? `<small>${esc(role)}</small>` : ""}</span>
          </div>`;
}

const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const QUOTE = `<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M0 24V13.6C0 5.9 4.3 1.3 12 0l1.2 3.4C9 4.6 7 7 6.8 10.4H13V24H0zm18 0V13.6C18 5.9 22.3 1.3 30 0l1.2 3.4C27 4.6 25 7 24.8 10.4H31V24H18z" fill="currentColor"/></svg>`;

function css(d: LpDesign, hasScreen: boolean, markGaps: boolean): string {
  const heroGround =
    d.hero.kind === "gradient"
      ? `linear-gradient(180deg, ${d.hero.stops.join(", ")})`
      : d.hero.kind === "tint"
        ? [
            `radial-gradient(56% 78% at 50% -8%, color-mix(in srgb, ${d.hero.stops[0]} 20%, transparent), transparent 72%)`,
            `radial-gradient(38% 56% at 88% 8%, color-mix(in srgb, ${d.hero.stops[1] ?? d.hero.stops[0]} 12%, transparent), transparent 70%)`,
            `radial-gradient(34% 50% at 8% 18%, color-mix(in srgb, ${d.hero.stops[0]} 8%, transparent), transparent 70%)`,
          ].join(", ")
        : "none";
  const glow = d.color.glow
    ? `radial-gradient(64% 96% at 50% 128%, color-mix(in srgb, ${d.color.glow} 58%, transparent), transparent 70%)`
    : "none";

  return `:root{
  --bg:${d.color.bg};--surface:${d.color.surface};--text:${d.color.text};--line:${d.color.line};
  --muted:color-mix(in srgb,var(--text) 66%,var(--bg));
  --rule:color-mix(in srgb,var(--text) 12%,var(--bg));
  --action:${d.color.action};--on-action:${d.color.onAction};--ink-accent:${d.color.inkAccent};
  --band:${d.color.band};--on-band:${d.color.onBand};--hero-ink:${d.hero.ink};
  --f-head:${d.font.heading};--f-body:${d.font.body};
  --w-head:${d.font.headingWeight};--w-body:${d.font.bodyWeight};--w-btn:${d.shape.buttonWeight};
  --lh:${d.font.lineHeight};--track:${d.font.tracking.toFixed(3)}em;
  --r-btn:${d.shape.buttonRadius};--r-card:${d.shape.cardRadius};--r-panel:${d.shape.panelRadius};
  --bw:${d.shape.borderWidth};--sh-card:${d.shape.cardShadow};--sh-btn:${d.shape.buttonShadow};
  --container:${d.shape.container}px;
  --pad:clamp(72px,10vw,128px);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;color-scheme:${d.dark ? "dark" : "light"}}
body{background:var(--bg);color:var(--text);font-family:var(--f-body);font-weight:var(--w-body);font-size:${d.font.bodySize}px;line-height:var(--lh);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;line-break:strict;overflow-wrap:anywhere;overflow-x:hidden}
h1,h2,h3{font-family:var(--f-head);font-weight:var(--w-head);letter-spacing:var(--track);font-feature-settings:"palt" 1;text-wrap:balance;word-break:auto-phrase;line-height:1.4}
p{text-wrap:pretty}
img,svg{display:block;max-width:100%}
a{color:inherit}
a:focus-visible{outline:2px solid var(--ink-accent);outline-offset:3px}
::selection{background:color-mix(in srgb,var(--ink-accent) 24%,transparent)}
.wrap{width:min(100% - 48px,var(--container));margin-inline:auto}
section{padding:var(--pad) 0}

.btn{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:0 2.1em;border-radius:var(--r-btn);background:var(--action);color:var(--on-action);font-family:var(--f-head);font-weight:var(--w-btn);font-size:1rem;letter-spacing:.03em;line-height:1.2;text-decoration:none;box-shadow:var(--sh-btn);transition:transform .2s ease,filter .2s ease}
.btn:hover{transform:translateY(-2px);filter:brightness(1.1)}
.btn.sm{min-height:40px;padding:0 1.4em;font-size:.875rem}
.btn.inv{background:var(--on-band);color:var(--band)}

.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 84%,transparent);-webkit-backdrop-filter:saturate(1.5) blur(16px);backdrop-filter:saturate(1.5) blur(16px)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:24px;height:72px}
.brand{display:flex;align-items:center;font-family:var(--f-head);font-weight:var(--w-head);font-size:1.2rem;letter-spacing:var(--track);text-decoration:none}
.brand img{height:30px;width:auto;max-width:200px;object-fit:contain}

.hero{position:relative;padding:12px 0 ${hasScreen ? "0" : "var(--pad)"};text-align:center}
.ground{position:absolute;z-index:0;top:0;${
    d.hero.kind === "gradient"
      ? "left:16px;right:16px;border-radius:var(--r-panel);"
      : "left:0;right:0;"
  }height:${hasScreen ? "calc(100% - clamp(72px,15vw,220px))" : "100%"};background:${heroGround}}
.hero .wrap{position:relative;z-index:1;padding-top:clamp(56px,8vw,104px);color:var(--hero-ink)}
.eyebrow{display:inline-flex;align-items:center;gap:.65em;padding:.5em 1.15em;border-radius:var(--r-btn);font-family:var(--f-head);font-size:.8125rem;font-weight:600;letter-spacing:.06em;line-height:1.4;${
    d.hero.kind === "gradient"
      ? "background:color-mix(in srgb,var(--bg) 72%,transparent);color:var(--text)"
      : "border:1px solid var(--rule);color:var(--muted)"
  }}
.eyebrow::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--ink-accent);flex:none}
.hero h1{margin:28px auto 0;max-width:17em;font-size:clamp(2.2rem,1.05rem + 4.7vw,4.25rem);line-height:1.26}
.lede{margin:26px auto 0;max-width:36em;font-size:clamp(1rem,.94rem + .4vw,1.1875rem);color:color-mix(in srgb,var(--hero-ink) 84%,transparent)}
.actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px 28px;margin-top:40px}
.more{font-family:var(--f-head);font-weight:600;font-size:.9375rem;text-decoration:none;display:inline-flex;align-items:center;gap:.5em}
.more::after{content:"↓";transition:transform .2s ease}
.more:hover::after{transform:translateY(3px)}
.shot{margin:clamp(48px,7vw,84px) auto 0;max-width:1040px;border-radius:min(var(--r-card),18px);overflow:hidden;background:var(--bg);border:1px solid color-mix(in srgb,var(--text) 10%,transparent);box-shadow:0 60px 120px -40px color-mix(in srgb,var(--text) 38%,transparent),0 24px 48px -24px color-mix(in srgb,var(--text) 22%,transparent)}
.chrome{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;height:42px;padding:0 16px;background:color-mix(in srgb,var(--text) 4%,var(--bg));border-bottom:1px solid var(--rule)}
.dots{display:flex;gap:7px}
.dots i{width:10px;height:10px;border-radius:50%;background:color-mix(in srgb,var(--text) 16%,var(--bg))}
.url{padding:.3em 1.4em;border-radius:6px;background:var(--bg);color:var(--muted);font-size:.75rem;line-height:1.5;letter-spacing:.01em}
.shot img{width:100%;height:auto;object-fit:cover;object-position:top}

.kicker{font-family:var(--f-head);font-size:.8125rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;line-height:1.4;color:var(--ink-accent)}
h2{margin-top:16px;font-size:clamp(1.65rem,1.1rem + 2.1vw,2.5rem)}
.head{max-width:44rem;margin-inline:auto;text-align:center}

.split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.12fr);gap:clamp(32px,6vw,80px);align-items:start}
.about{font-size:1.0625em}
.points{list-style:none;margin-top:36px;border-top:1px solid var(--rule)}
.points li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:16px;align-items:start;padding:18px 0;border-bottom:1px solid var(--rule);font-family:var(--f-head);font-weight:600;line-height:1.6}
.points svg{width:22px;height:22px;margin-top:.15em;color:var(--ink-accent)}

.features{background:var(--surface)}
.cards{list-style:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:clamp(40px,5vw,64px)}
.card{display:flex;flex-direction:column;padding:36px 32px 40px;border-radius:var(--r-card);background:var(--bg);border:var(--bw) solid var(--line);box-shadow:var(--sh-card)}
.no{display:flex;align-items:center;gap:12px;font-family:var(--f-head);font-size:.8125rem;font-weight:700;letter-spacing:.14em;line-height:1;color:var(--ink-accent)}
.no::after{content:"";height:1px;flex:1;background:var(--rule)}
.card h3{margin-top:28px;font-size:1.25rem;line-height:1.5}
.card p{margin-top:12px;font-size:.9375em;color:var(--muted)}

.quotes{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:24px;margin-top:clamp(40px,5vw,64px)}
.quote{display:flex;flex-direction:column;gap:24px;padding:36px 32px 32px;border-radius:var(--r-card);background:var(--surface)}
.quote>svg{width:28px;height:21px;color:var(--ink-accent)}
.quote blockquote{flex:1;font-size:1.03em}
.who{display:flex;align-items:center;gap:14px;padding-top:24px;border-top:1px solid var(--rule)}
.avatar{display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:${d.shape.avatarRadius};background:color-mix(in srgb,var(--ink-accent) 14%,var(--bg));color:var(--ink-accent);font-family:var(--f-head);font-weight:700;line-height:1}
.who b{display:block;font-family:var(--f-head);font-size:.9375rem;line-height:1.5}
.who small{display:block;font-size:.8125rem;line-height:1.5;color:var(--muted)}

.closing{padding:0 0 clamp(16px,2vw,24px)}
.band{position:relative;overflow:hidden;margin-inline:16px;padding:clamp(72px,11vw,136px) 24px;border-radius:var(--r-panel);background:var(--band);color:var(--on-band);text-align:center}
.band::before{content:"";position:absolute;inset:0;background:${glow};pointer-events:none}
.band>*{position:relative}
.band h2{margin:0 auto;max-width:18em;font-size:clamp(1.8rem,1.15rem + 2.8vw,3.1rem);line-height:1.34}
.band p{margin:22px auto 0;max-width:34em;color:color-mix(in srgb,var(--on-band) 78%,transparent)}
.band .btn{margin-top:40px}

.foot{padding:44px 0 56px;font-size:.8125rem;line-height:1.7;color:var(--muted)}
.foot .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px 40px}
.foot .brand{font-size:1rem;color:var(--text)}
.foot .brand img{height:24px}
.foot nav{display:flex;flex-wrap:wrap;gap:8px 22px}
.foot nav a{text-decoration:none}
.foot nav a:hover{color:var(--text)}
.legal{flex-basis:100%;padding-top:20px;border-top:1px solid var(--rule)}

${
    markGaps
      ? `[data-gap]{position:relative;outline:1.5px dashed #d97706;outline-offset:-10px}
[data-gap]::after{content:attr(data-gap);position:absolute;z-index:5;top:20px;left:20px;padding:.35em .9em;border-radius:999px;background:#fffbeb;color:#92400e;border:1px solid #fcd34d;font:600 11px/1.4 system-ui,sans-serif;letter-spacing:.02em}`
      : ""
  }

@media (prefers-reduced-motion:no-preference){
  .hero .eyebrow,.hero h1,.lede,.actions,.shot{animation:rise .9s cubic-bezier(.2,.7,.2,1) both}
  .hero h1{animation-delay:.06s}.lede{animation-delay:.14s}.actions{animation-delay:.22s}.shot{animation-delay:.32s;animation-duration:1.1s}
  @keyframes rise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
  @supports (animation-timeline:view()){
    .rv{animation:rise linear both;animation-timeline:view();animation-range:entry 0% entry 42%}
  }
}
@media print{*{animation:none!important}}
@media (max-width:860px){
  .split{grid-template-columns:1fr}
  .cards{grid-template-columns:1fr}
  .card{padding:30px 26px 32px}
}
@media (max-width:560px){
  .wrap{width:min(100% - 40px,var(--container))}
  .bar{height:60px}
  .brand img{height:24px}
  .ground{${d.hero.kind === "gradient" ? "left:8px;right:8px;" : ""}}
  .band{margin-inline:8px}
  .chrome{height:30px;padding:0 10px}
  .dots i{width:7px;height:7px}
  .url{font-size:.625rem;padding:.2em 1em}
  .btn{min-height:50px;width:100%}
  .btn.sm{width:auto}
  .actions{flex-direction:column}
}`;
}

export function renderBrandLp(
  brief: BrandLpBrief,
  assets: LpAssets,
  options: LpRenderOptions = {},
): string {
  const { kit, content, basis } = brief;
  const d = lpDesign(kit);
  const name = kit.brand.name;
  const host = hostOf(kit.brand.website);
  const out = options.newTab ? ` target="_blank" rel="noopener"` : "";
  const ctaHref = safeHref(content.cta.href);
  // In-page links stay in the page whatever the option says.
  const cta = `"${ctaHref}"${ctaHref.startsWith("#") ? "" : out}`;
  const markGaps = options.markGaps === true;

  const gap = (section: LpSection): string => {
    if (!markGaps || basis[section].origin === "kit") return "";
    return ` data-gap="${basis[section].origin === "sample" ? "仮の内容" : "推定から"}"`;
  };
  const brand = (cls = "brand") =>
    `<a class="${cls}" href="#top" aria-label="${esc(name)}">${
      assets.logo ? `<img src="${esc(assets.logo)}" alt="${esc(name)}">` : esc(name)
    }</a>`;

  const year = new Date(kit.snapshotAt).getFullYear();
  const text = (path: string): string | null => {
    const value = kit.values[path];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };
  const copyright = text("identity.copyright") ?? `© ${year} ${text("identity.legal_name") ?? name}`;
  const social = SOCIAL_NETWORKS.flatMap((network) => {
    const url = text(network.path);
    return url ? [{ label: network.label as string, url }] : [];
  });

  const shot = assets.screen
    ? `<figure class="shot">
      <div class="chrome"><span class="dots"><i></i><i></i><i></i></span><span class="url">${esc(host || name)}</span><span></span></div>
      <img src="${esc(assets.screen)}" alt="${esc(name)} の画面"${
        brief.visuals.screen?.width && brief.visuals.screen.height
          ? ` width="${brief.visuals.screen.width}" height="${brief.visuals.screen.height}"`
          : ""
      }>
    </figure>`
    : "";

  const voices =
    content.voices.items.length > 0
      ? `<section id="voices" class="voices"${gap("voices")}>
    <div class="wrap">
      <div class="head rv">
        <p class="kicker">Voices</p>
        <h2>${lines(content.voices.heading)}</h2>
      </div>
      <ul class="quotes">
        ${content.voices.items
          .map(
            (voice) => `<li class="quote rv">
          ${QUOTE}
          <blockquote>${esc(voice.quote)}</blockquote>
          ${whoHtml(voice)}
        </li>`,
          )
          .join("\n        ")}
      </ul>
    </div>
  </section>`
      : "";

  return `<!doctype html>
<html lang="${esc(brief.lang || "ja")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} — ${esc(content.hero.headline.replace(/\n/g, ""))}</title>
<meta name="description" content="${esc(content.hero.sub)}">
<meta name="theme-color" content="${d.color.bg}">
${
  d.font.href
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(d.font.href)}">`
    : ""
}
<style>
${css(d, assets.screen !== null, markGaps)}
</style>
</head>
<body>
<header class="top">
  <div class="wrap bar">
    ${brand()}
    <a class="btn sm" href=${cta}>${esc(content.cta.label)}</a>
  </div>
</header>

<main id="top">
  <section class="hero"${gap("hero")}>
    <div class="ground" aria-hidden="true"></div>
    <div class="wrap">
      ${content.hero.eyebrow ? `<p class="eyebrow">${esc(content.hero.eyebrow)}</p>` : ""}
      <h1>${lines(content.hero.headline)}</h1>
      <p class="lede">${esc(content.hero.sub)}</p>
      <div class="actions">
        <a class="btn" href=${cta}>${esc(content.cta.label)}</a>
        <a class="more" href="#overview">詳しく見る</a>
      </div>
      ${shot}
    </div>
  </section>

  <section id="overview"${gap("overview")}>
    <div class="wrap split">
      <div class="rv">
        <p class="kicker">About</p>
        <h2>${lines(content.overview.heading)}</h2>
      </div>
      <div class="rv">
        <p class="about">${esc(content.overview.body)}</p>
        ${
          content.overview.points.length > 0
            ? `<ul class="points">
          ${content.overview.points.map((point) => `<li>${CHECK}<span>${esc(point)}</span></li>`).join("\n          ")}
        </ul>`
            : ""
        }
      </div>
    </div>
  </section>

  <section id="features" class="features"${gap("features")}>
    <div class="wrap">
      <div class="head rv">
        <p class="kicker">Features</p>
        <h2>${lines(content.features.heading)}</h2>
      </div>
      <ol class="cards">
        ${content.features.items
          .map(
            (item, index) => `<li class="card rv">
          <span class="no">${pad2(index + 1)}</span>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.body)}</p>
        </li>`,
          )
          .join("\n        ")}
      </ol>
    </div>
  </section>

  ${voices}

  <section class="closing"${gap("closing")}>
    <div class="band rv">
      <h2>${lines(content.closing.headline)}</h2>
      ${content.closing.sub ? `<p>${esc(content.closing.sub)}</p>` : ""}
      <a class="btn inv" href=${cta}>${esc(content.cta.label)}</a>
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap">
    ${brand()}
    ${
      social.length > 0
        ? `<nav aria-label="ソーシャル">${social
            .map((item) => `<a href="${safeHref(item.url)}"${out || ` rel="noopener"`}>${esc(item.label)}</a>`)
            .join("")}</nav>`
        : ""
    }
    <p class="legal">${esc(copyright)}</p>
  </div>
</footer>
</body>
</html>
`;
}

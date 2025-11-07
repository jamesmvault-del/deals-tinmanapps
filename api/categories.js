// /api/categories.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Category renderer (SEO-first, referral-safe, adaptive CTA)
// v4.4 “Precision Clean Render”
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import { createCtaEngine } from "../lib/ctaEngine.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

const CATS = {
  software: "Software Deals",
  marketing: "Marketing & Sales Tools",
  productivity: "Productivity Boosters",
  ai: "AI & Automation Tools",
  courses: "Courses & Learning",
};

const ARCH = {
  software: "Trust & Reliability",
  marketing: "Opportunity & Growth",
  productivity: "Efficiency & Focus",
  ai: "Novelty & Innovation",
  courses: "Authority & Learning",
};

// ---------- Utility helpers ----------
function loadJsonSafe(file, fallback = []) {
  try {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}
function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function decodeHTML(str = "") {
  return str
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function fmtDateISO(dt) {
  try {
    return new Date(dt).toISOString();
  } catch {
    return new Date().toISOString();
  }
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}
function ctaFallback(slug) {
  const POOL = [
    "Discover more →",
    "Preview deal →",
    "Unlock offer →",
    "See details →",
    "Try it now →",
  ];
  const idx = hashStr(slug) % POOL.length;
  return POOL[idx];
}
function trackedUrl({ slug, cat, url }) {
  const masked = REF_PREFIX + encodeURIComponent(url);
  return `${SITE_ORIGIN}/api/track?deal=${encodeURIComponent(
    slug
  )}&cat=${encodeURIComponent(cat)}&redirect=${encodeURIComponent(masked)}`;
}
function imageFor(slug, provided) {
  if (provided) return provided;
  const guess = `https://appsumo2-cdn.appsumo.com/media/products/${slug}/logo.png`;
  return `${SITE_ORIGIN}/api/image-proxy?src=${encodeURIComponent(guess)}`;
}
function splitTitle(fullTitle = "") {
  const raw = decodeHTML(fullTitle.trim());
  const parts = raw.split(/\s*[-–—]\s*/);
  if (parts.length > 1 && parts[0] && parts[1]) {
    return { brand: parts[0].trim(), subtitle: parts.slice(1).join(" – ").trim() };
  }
  return { brand: raw, subtitle: "" };
}
function clamp(s, n = 40) {
  return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
}
function dedupeText(base, add) {
  if (!base || !add) return add;
  const normB = base.toLowerCase();
  const normA = add.toLowerCase();
  if (normA.includes(normB)) return add.replace(new RegExp(base, "i"), "").trim();
  return add;
}

// ---------- Main handler ----------
export default async function categories(req, res) {
  const cat = String(req.params.cat || "").toLowerCase();
  const title = CATS[cat];
  if (!title) return res.status(404).send("Category not found.");

  const deals = loadJsonSafe(`appsumo-${cat}.json`, []);
  const total = deals.length;
  const ctr = loadJsonSafe("ctr-insights.json", { totalClicks: 0 });

  let lastRefreshed = new Date();
  try {
    const stat = fs.statSync(path.join(DATA_DIR, `appsumo-${cat}.json`));
    lastRefreshed = stat.mtime;
  } catch {}

  const canonical = `${SITE_ORIGIN}/categories/${cat}`;
  const pageTitle = `${title} | AppSumo Lifetime Deals`;
  const pageDesc = `Browse ${total} live ${title.toLowerCase()} curated by an adaptive SEO + CTA engine — referral-safe, fast, and continuously learning.`;

  // ---------- Schema ----------
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Categories", item: `${SITE_ORIGIN}/categories` },
      { "@type": "ListItem", position: 2, name: title, item: canonical },
    ],
  };

  const engine = createCtaEngine();

  // ---------- Render cards ----------
  const cardsHtml = deals
    .map((d) => {
      const slug =
        d.slug ||
        d.url?.match(/products\/([^/]+)/)?.[1] ||
        d.title?.toLowerCase().replace(/\s+/g, "-") ||
        "deal";
      const { brand, subtitle: fromTitle } = splitTitle(d.title || slug);

      let subtitle = (d.seo?.subtitle || fromTitle || "").trim();
      subtitle = dedupeText(brand, subtitle);
      if (!subtitle) {
        try {
          subtitle = engine.generateSubtitle({ title: brand, category: cat });
        } catch {
          subtitle = "";
        }
      }
      subtitle = clamp(subtitle, 80);

      let ctaText = "";
      try {
        ctaText =
          (d.seo?.cta && d.seo.cta.trim()) ||
          engine.generate({ title: brand, slug, cat });
      } catch {
        ctaText = ctaFallback(slug);
      }
      ctaText = clamp(ctaText.replace(new RegExp(brand, "i"), "").trim(), 34);

      const img = imageFor(slug, d.image);
      const link = trackedUrl({ slug, cat, url: d.url });

      return `
      <article class="card" data-slug="${escapeHtml(slug)}" itemscope itemtype="https://schema.org/SoftwareApplication">
        <a class="media" href="${link}" aria-label="${escapeHtml(brand)}">
          <img src="${img}" alt="${escapeHtml(d.title)}" loading="lazy" />
        </a>
        <div class="card-body">
          <h3 class="title"><a href="${link}" class="title-link">${escapeHtml(brand)}</a></h3>
          ${
            subtitle
              ? `<div class="subtitle">${escapeHtml(subtitle)}</div>`
              : ``
          }
        </div>
        <div class="card-cta">
          <a class="cta" href="${link}" data-cta>${escapeHtml(ctaText)}</a>
        </div>
      </article>`;
    })
    .join("\n");

  const footerVisible = `${ARCH[cat]} • ${total} deals • Updated automatically`;
  const footerHidden = `This page indexes verified AppSumo lifetime deals for ${title.toLowerCase()} with referral integrity, CTR optimization, and structured metadata. Refreshed ${fmtDateISO(
    lastRefreshed
  )}. Total clicks recorded: ${Number(ctr.totalClicks || 0)}.`;

  // ---------- Final HTML ----------
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(pageTitle)}</title>
<link rel="canonical" href="${canonical}" />
<meta name="description" content="${escapeHtml(pageDesc)}" />
<meta property="og:title" content="${escapeHtml(pageTitle)}" />
<meta property="og:description" content="${escapeHtml(pageDesc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${SITE_ORIGIN}/assets/placeholder.webp" />
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1" />

<style>
  :root {
    --fg:#101326; --muted:#62697e; --card:#fff; --bg:#f7f8fb;
    --shadow:0 2px 10px rgba(10,14,29,.06);
    --shadow-hover:0 10px 24px rgba(10,14,29,.10);
    --brand:#2a63f6; --brand-dark:#1d4fe6; --ring:rgba(42,99,246,.35);
  }
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;}
  header{padding:28px 24px 12px;}
  h1{margin:0 0 6px;font-size:28px;}
  .sub{color:var(--muted);font-size:14px;}
  main{padding:12px 16px 36px;max-width:1200px;margin:0 auto;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px;}
  .card{background:var(--card);border-radius:16px;padding:14px;box-shadow:var(--shadow);border:1px solid rgba(16,19,38,.06);display:flex;flex-direction:column;min-height:320px;transition:transform .28s ease,box-shadow .28s ease,border-color .28s ease;}
  .card:hover{transform:translateY(-4px);box-shadow:var(--shadow-hover);border-color:rgba(42,99,246,.18);}
  .media{display:block;border-radius:12px;overflow:hidden;}
  .card img{width:100%;height:150px;object-fit:cover;background:#eef1f6;aspect-ratio:16/9;transition:transform .35s ease;}
  .card:hover img{transform:scale(1.015);}
  .card-body{flex:1;padding-top:8px;}
  .title{margin:2px 0 0;font-size:16px;line-height:1.35;}
  .subtitle{color:var(--muted);font-size:13px;line-height:1.45;margin:6px 0 12px;-webkit-line-clamp:3;overflow:hidden;text-overflow:ellipsis;}
  .cta{display:inline-flex;align-items:center;justify-content:center;height:44px;font-size:14px;text-decoration:none;width:100%;color:#fff;background:var(--brand);border-radius:10px;padding:0 14px;box-shadow:0 2px 0 rgba(42,99,246,.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .cta:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(42,99,246,.25);}
  footer{text-align:center;color:var(--muted);font-size:13px;padding:22px 16px 36px;}
</style>

<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="sub">${ARCH[cat]} • ${total} deals</div>
  </header>
  <main><section class="grid">${cardsHtml || `<p>No deals available right now.</p>`}</section></main>
  <footer><div class="visually-hidden">${escapeHtml(footerHidden)}</div>${escapeHtml(footerVisible)}</footer>
</body></html>`;

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  res.send(html);
}

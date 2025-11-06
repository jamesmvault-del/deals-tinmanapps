// /api/categories.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Category renderer (Authority GridLock+ v3.9)
// SEO-first, referral-safe, visually uniform, bleed-proof category layout.
//
// - True CSS Grid (media / body / CTA separated in grid rows)
// - Fixed image aspect ratio + height normalization
// - Subtitle 3-line clamp + min-height for alignment
// - Uniform card heights per row (perfect SEO layout stability)
//
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";

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

const CTA_POOL = [
  "Unlock deal →",
  "Get instant lifetime access →",
  "Explore what it replaces →",
  "Save hours every week →",
  "See real user results →",
  "Compare to your stack →",
];

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function loadJsonSafe(file, fallback = []) {
  try {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}
function fmtDateISO(dt) {
  try {
    return new Date(dt).toISOString();
  } catch {
    return new Date().toISOString();
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
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}
function ctaFor(slug) {
  const idx = hashStr(slug) % CTA_POOL.length;
  return CTA_POOL[idx];
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
  const raw = (fullTitle || "").trim();
  if (!raw) return { brand: "", subtitle: "" };
  const DASH_SEPS = [" — ", " – ", " —", " –"];
  for (const sep of DASH_SEPS) {
    const idx = raw.indexOf(sep);
    if (idx > 0 && idx < raw.length - sep.length) {
      const brand = raw.slice(0, idx).trim();
      const subtitle = raw.slice(idx + sep.length).trim();
      if (brand && subtitle) return { brand, subtitle };
    }
  }
  const hyIdx = raw.indexOf(" - ");
  if (hyIdx > 0 && hyIdx < raw.length - 3) {
    const brand = raw.slice(0, hyIdx).trim();
    const subtitle = raw.slice(hyIdx + 3).trim();
    if (brand && subtitle) return { brand, subtitle };
  }
  return { brand: raw, subtitle: "" };
}

// ───────────────────────────────────────────────────────────────────────────────
// Main handler
// ───────────────────────────────────────────────────────────────────────────────
export default async function categories(req, res) {
  const cat = String(req.params.cat || "").toLowerCase();
  const title = CATS[cat];
  if (!title) return res.status(404).send("Category not found.");

  const deals = loadJsonSafe(`appsumo-${cat}.json`, []);
  const total = deals.length;
  const ctr = loadJsonSafe("ctr-insights.json", {
    totalClicks: 0,
    byDeal: {},
    byCategory: {},
    recent: [],
  });

  let lastRefreshed = new Date();
  try {
    const stat = fs.statSync(path.join(DATA_DIR, `appsumo-${cat}.json`));
    lastRefreshed = stat.mtime;
  } catch {}

  const canonical = `${SITE_ORIGIN}/categories/${cat}`;
  const pageTitle = `${title} | AppSumo Lifetime Deals`;
  const pageDesc = `Browse ${total} live ${title.toLowerCase()} indexed automatically — referral-safe, fast, and SEO-optimized.`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Categories", item: `${SITE_ORIGIN}/categories` },
      { "@type": "ListItem", position: 2, name: title, item: canonical },
    ],
  };

  const SLICE = Math.min(30, total);
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${title} — AppSumo Deals`,
    url: canonical,
    hasPart: {
      "@type": "ItemList",
      itemListElement: deals.slice(0, SLICE).map((d, i) => {
        const slug =
          d.slug ||
          d.url?.match(/products\/([^/]+)/)?.[1] ||
          d.title?.toLowerCase().replace(/\s+/g, "-") ||
          "deal";
        return {
          "@type": "ListItem",
          position: i + 1,
          name: d.title,
          url: `${SITE_ORIGIN}/api/track?deal=${encodeURIComponent(
            slug
          )}&cat=${encodeURIComponent(cat)}&redirect=${encodeURIComponent(
            REF_PREFIX + encodeURIComponent(d.url)
          )}`,
        };
      }),
    },
  };

  const cardsHtml = deals
    .map((d) => {
      const slug =
        d.slug ||
        d.url?.match(/products\/([^/]+)/)?.[1] ||
        d.title?.toLowerCase().replace(/\s+/g, "-") ||
        "deal";
      const { brand, subtitle } = splitTitle(d.title || slug);
      const resolvedCta = d.seo?.cta || ctaFor(slug);
      const img = imageFor(slug, d.image);
      const link = trackedUrl({ slug, cat, url: d.url });

      return `
      <article class="card" data-slug="${escapeHtml(slug)}" itemscope itemtype="https://schema.org/SoftwareApplication">
        <a class="media" href="${link}" aria-label="${escapeHtml(brand)}">
          <div class="img-wrap">
            <img src="${img}" alt="${escapeHtml(d.title)}" loading="lazy" />
          </div>
        </a>
        <div class="card-body">
          <h3 class="title-wrap" itemprop="name">
            <a class="title" href="${link}">${escapeHtml(brand)}</a>
          </h3>
          ${
            subtitle
              ? `<div class="subtitle" itemprop="description">${escapeHtml(subtitle)}</div>`
              : ``
          }
        </div>
        <div class="card-cta">
          <a class="cta" href="${link}" data-cta>${escapeHtml(resolvedCta)}</a>
        </div>
      </article>`;
    })
    .join("\n");

  const footerVisible = `${ARCH[cat]} • ${total} deals • Updated automatically`;
  const footerHidden = `This page indexes verified AppSumo lifetime deals for ${title.toLowerCase()} with referral integrity, CTR optimization, and structured metadata. Refreshed ${fmtDateISO(
    lastRefreshed
  )}. Total clicks recorded: ${Number(ctr.totalClicks || 0)}.`;

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
    --fg:#101326; --muted:#62697e; --card:#ffffff; --bg:#f7f8fb;
    --shadow:0 2px 10px rgba(10,14,29,.06);
    --shadow-hover:0 10px 24px rgba(10,14,29,.10);
    --brand:#2a63f6; --brand-dark:#1d4fe6; --ring:rgba(42,99,246,.35);
  }
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;}
  header{padding:28px 24px 12px;}
  h1{margin:0 0 6px;font-size:28px;letter-spacing:-0.01em;}
  .sub{color:var(--muted);font-size:14px;}

  main{padding:12px 16px 36px;max-width:1200px;margin:0 auto;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;grid-auto-rows:1fr;}

  .card{
    background:var(--card);border-radius:16px;padding:14px;
    box-shadow:var(--shadow);border:1px solid rgba(16,19,38,.06);
    display:grid;grid-template-rows:auto 1fr auto;
    transition:transform .28s cubic-bezier(.22,.61,.36,1),box-shadow .28s ease,border-color .28s ease;
  }
  .card:hover{transform:translateY(-4px);box-shadow:var(--shadow-hover);border-color:rgba(42,99,246,.18);}

  .img-wrap{width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#eef1f6;}
  .card img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s ease;}
  .card:hover img{transform:scale(1.015);}

  .card-body{padding-top:8px;}
  .title-wrap{margin:2px 0 0;font-size:16px;line-height:1.35;}
  .title{text-decoration:none;color:inherit;}
  .title:focus-visible{outline:2px solid var(--ring);border-radius:6px;outline-offset:4px;}

  .subtitle{
    color:var(--muted);
    font-size:13px;
    line-height:1.45;
    margin:6px 0 12px;
    display:-webkit-box;
    -webkit-line-clamp:3;
    -webkit-box-orient:vertical;
    overflow:hidden;
    text-overflow:ellipsis;
    word-break:break-word;
    min-height:3.9em; /* visual alignment guarantee */
  }

  .card-cta{margin-top:auto;}
  .cta{
    display:inline-flex;align-items:center;justify-content:center;gap:8px;
    height:44px;font-size:14px;text-decoration:none;color:#fff;background:var(--brand);
    border-radius:10px;padding:0 14px;width:100%;
    transition:background .2s ease,transform .2s ease,box-shadow .2s ease;
    box-shadow:0 2px 0 rgba(42,99,246,.35);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  .card:hover .cta{transform:translateY(-1px);box-shadow:0 6px 18px rgba(42,99,246,.25);}
  .cta:active{transform:translateY(0);background:var(--brand-dark);}
  .cta:focus-visible{outline:2px solid var(--ring);outline-offset:3px;}

  footer{padding:22px 16px 36px;text-align:center;color:var(--muted);font-size:13px;}
  .visually-hidden{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}

  @media(prefers-reduced-motion:reduce){
    .card,.card img,.cta{transition:none!important;}
    .card:hover{transform:none!important;}
  }
</style>

<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
<script type="application/ld+json">${JSON.stringify(itemListLd)}</script>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="sub">${ARCH[cat]} • ${total} deals</div>
  </header>
  <main>
    <section class="grid" itemscope itemtype="https://schema.org/ItemList">
      ${cardsHtml || `<p>No deals available right now. Check back soon.</p>`}
    </section>
  </main>
  <footer>
    <div class="visually-hidden">${escapeHtml(footerHidden)}</div>
    ${footerVisible}
  </footer>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  res.send(html);
}

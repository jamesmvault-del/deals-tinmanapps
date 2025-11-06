// /api/categories.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Category renderer (SEO-first, referral-safe, adaptive CTA,
// subtitle support, hover CTR boost, reduced-motion aware).
//
// v3.6.8-r2 (Cross-engine Lockbox, Render-safe)
// - Removes stray label (syntax error) from v3.6.8
// - Keeps bleed-proof CTA structure and full SEO / animation logic intact
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
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
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
          <img src="${img}" alt="${escapeHtml(d.title)}" loading="lazy" />
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
  body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
  header{padding:28px 24px 12px;}
  h1{margin:0 0 6px;font-size:28px;letter-spacing:-0.01em;}
  .sub{color:var(--muted);font-size:14px;}
  main{padding:12px 16px 36px;max-width:1200px;margin:0 auto;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;}
  .card{background:var(--card);border-radius:16px;padding:14px;box-shadow:var(--shadow);border:1px solid rgba(16,19,38,.06);display:flex;flex-direction:column;transition:transform .28s cubic-bezier(.22,.61,.36,1),box-shadow .28s ease,border-color .28s ease;height:100%;}
  .card:hover{transform:translateY(-4px);box-shadow:var(--shadow-hover);border-color:rgba(42,99,246,.18);}
  .media{display:block;border-radius:12px;overflow:hidden;position:relative;}
  .media::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,0)60%,rgba(42,99,246,0.06)100%);opacity:0;transition:opacity .28s ease;}
  .card:hover .media::after{opacity:1;}
  .card img{width:100%;height:150px;object-fit:cover;background:#eef1f6;display:block;aspect-ratio:16/9;transition:transform .35s ease;}
  .card:hover img{transform:scale(1.015);}
  .card-body{flex:1;display:flex;flex-direction:column;padding-top:8px;min-height:calc(1lh * 4.8);}
  .title-wrap{margin:2px 0 0;font-size:16px;line-height:1.35;}
  .title{color:inherit;text-decoration:none;}
  .title:focus-visible{outline:2px solid var(--ring);border-radius:6px;outline-offset:4px;}
  .subtitle{color:var(--muted);font-size:13px;line-height:1.4;margin:4px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;word-break:break-word;max-height:calc(1.45em*2);}
  .card-cta{margin-top:auto;padding-top:12px;}
  .cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;line-height:1;font-size:14px;text-decoration:none;color:#fff;background:var(--brand);border-radius:10px;padding:0 14px;transition:background .2s ease,transform .2s ease,box-shadow .2s ease;box-shadow:0 2px 0 rgba(42,99,246,.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;}
  .card:hover .cta{transform:translateY(-1px);box-shadow:0 6px 18px rgba(42,99,246,.25);}
  .cta:active{transform:translateY(0);background:var(--brand-dark);box-shadow:0 2px 0 rgba(42,99,246,.35);}
  .cta:focus-visible{outline:2px solid var(--ring);outline-offset:3px;}
  footer{padding:22px 16px 36px;text-align:center;color:var(--muted);font-size:13px;}
  .visually-hidden{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}
  @media(prefers-reduced-motion:reduce){.card,.card img,.cta,.media::after{transition:none!important;}.card:hover{transform:none!important;}}
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
  <script>
    (function(){
      try{
        if(!("IntersectionObserver" in window))return;
        const seen=new Set();
        const io=new IntersectionObserver((entries)=>{
          for(const e of entries){
            if(!e.isIntersecting)continue;
            const card=e.target;
            const slug=card.getAttribute("data-slug")||"";
            if(seen.has(slug))continue;
            seen.add(slug);
            const btn=card.querySelector("[data-cta]");
            if(!btn){io.unobserve(card);continue;}
            const rm=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if(!rm&&btn.animate){
              btn.animate(
                [
                  {transform:"translateY(-2px)",boxShadow:"0 8px 22px rgba(42,99,246,.30)"},
                  {transform:"translateY(0)",boxShadow:"0 2px 0 rgba(42,99,246,.35)"}
                ],
                {duration:520,easing:"cubic-bezier(.22,.61,.36,1)"}
              );
            }
            io.unobserve(card);
          }
        },{threshold:0.55});
        document.querySelectorAll(".card").forEach(c=>io.observe(c));
      }catch(_){}
    })();
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  res.send(html);
}

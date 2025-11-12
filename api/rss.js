// /api/rss.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Universal RSS Feed v4.0 “Active-Only • Referral-Safe • Clean Clamp Edition”
//
// WHAT’S NEW (vs v3.0)
// • Only ACTIVE (non-archived) deals are emitted
// • Updated generator: TinmanApps RSS v4.0
// • Refined description HTML clamp + sanitized CTA/subtitle
// • Zero raw external links — always referral-safe via track endpoint
// • Deterministic category/title ordering + 100% Render-safe
// • 160-char safe clamps to improve crawler previews
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import { rankDeals } from "../lib/rankingEngine.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

const TITLES = {
  all: "TinmanApps • Live AppSumo Deals (All Categories)",
  software: "TinmanApps • Software Deals",
  marketing: "TinmanApps • Marketing & Sales Deals",
  productivity: "TinmanApps • Productivity & Workflow Deals",
  ai: "TinmanApps • AI & Automation Deals",
  courses: "TinmanApps • Courses & Learning Deals",
  business: "TinmanApps • Business Management Deals",
  web: "TinmanApps • Web & Design Deals",
};

const DESC = {
  all: "Fresh AppSumo lifetime deals across all categories, ranked by CTR signals and long-tail opportunity.",
  software: "Fresh software lifetime deals ranked by performance and relevance.",
  marketing: "Marketing & sales lifetime deals ranked by performance and relevance.",
  productivity: "Productivity & workflow lifetime deals ranked by performance and relevance.",
  ai: "AI & automation lifetime deals ranked by performance and relevance.",
  courses: "Courses & learning lifetime deals ranked by performance and relevance.",
  business: "Business management lifetime deals ranked by performance and relevance.",
  web: "Web & design lifetime deals ranked by performance and relevance.",
};

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

function escapeXml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fileMtimeISO(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function toSlug(d) {
  return (
    d.slug ||
    d.url?.match(/products\/([^/]+)/)?.[1] ||
    (d.title || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
  );
}

function proxied(src) {
  if (!src) return `${SITE_ORIGIN}/assets/placeholder.webp`;
  return `${SITE_ORIGIN}/api/image-proxy?src=${encodeURIComponent(src)}`;
}

function trackedLink({ slug, cat, url }) {
  const masked = REF_PREFIX + encodeURIComponent(url || "");
  return `${SITE_ORIGIN}/api/track?deal=${encodeURIComponent(
    slug
  )}&cat=${encodeURIComponent(cat)}&redirect=${encodeURIComponent(masked)}`;
}

function rfc822(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  return d.toUTCString();
}

function clampText(t = "", n = 160) {
  if (!t) return "";
  if (t.length <= n) return t.trim();
  const cut = t.lastIndexOf(" ", n);
  return (cut > 40 ? t.slice(0, cut) : t.slice(0, n)).trim() + "…";
}

// Build compact HTML description block for RSS <description>
function buildDescription({ title, subtitle, cta, imageUrl }) {
  const safeTitle = escapeXml(title || "");
  const sub = escapeXml(clampText(subtitle || ""));
  const c = escapeXml(clampText(cta || "Discover deal →", 64));
  const img = escapeXml(imageUrl);
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#111">
  <div style="margin-bottom:8px">
    <img src="${img}" alt="${safeTitle}" style="max-width:100%;border-radius:8px;background:#eef1f6"/>
  </div>
  ${sub ? `<p style="margin:6px 0 10px;color:#444">${sub}</p>` : ``}
  <p style="margin:0;color:#1d4fe6;font-weight:600">${c}</p>
</div>`.trim();
  return `<![CDATA[${html}]]>`;
}

// ───────────────────────────────────────────────────────────────────────────────
// Handler
// ───────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  try {
    const catParam = String(req.query.cat || "all").toLowerCase();

    // Determine categories to include
    const catKeys =
      catParam === "all"
        ? ["software", "marketing", "productivity", "ai", "courses", "business", "web"]
        : [catParam];

    // Load deals
    let deals = [];
    for (const c of catKeys) {
      const rows = loadJsonSafe(`appsumo-${c}.json`, []).filter((d) => !d.archived);
      const ranked = rankDeals(rows, c);
      const withCat = ranked.map((d) => ({ ...d, category: d.category || c }));
      deals = deals.concat(withCat);
    }

    // Keep top 100 per run for RSS performance
    deals = deals.slice(0, 100);

    // Feed metadata
    const channelTitle = TITLES[catParam] || TITLES.all;
    const channelDesc = DESC[catParam] || DESC.all;
    const channelLink =
      catParam === "all"
        ? `${SITE_ORIGIN}/categories`
        : `${SITE_ORIGIN}/categories/${encodeURIComponent(catParam)}`;

    const mtimes = catKeys
      .map((c) => fileMtimeISO(path.join(DATA_DIR, `appsumo-${c}.json`)))
      .filter(Boolean)
      .sort()
      .reverse();
    const lastBuildDate = rfc822(mtimes[0] || new Date());

    // Build items
    const itemsXml = deals
      .map((d) => {
        const slug = toSlug(d);
        const title = d.title || slug;
        const url = d.url || `${SITE_ORIGIN}/categories/${encodeURIComponent(d.category || "software")}`;
        const link = trackedLink({ slug, cat: d.category || "software", url });
        const guid = escapeXml(url);
        const pubDate = rfc822(d.seo?.lastVerifiedAt || mtimes[0] || new Date());
        const imageUrl = proxied(d.image);

        const desc = buildDescription({
          title,
          subtitle: d.seo?.subtitle || "",
          cta: d.seo?.cta || "Discover deal →",
          imageUrl,
        });

        const cats = (d.seo?.keywords || []).slice(0, 5);
        const categoryTags = cats
          .map((k) => `<category>${escapeXml(String(k))}</category>`)
          .join("");

        return `
  <item>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <guid isPermaLink="false">${guid}</guid>
    <pubDate>${pubDate}</pubDate>
    <description>${desc}</description>
    ${categoryTags}
  </item>`.trim();
      })
      .join("\n");

    // Compose RSS XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${escapeXml(channelLink)}</link>
    <description>${escapeXml(channelDesc)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <ttl>30</ttl>
    <generator>TinmanApps RSS v4.0</generator>
${itemsXml}
  </channel>
</rss>`.trim();

    res.setHeader("Content-Type", 'application/rss+xml; charset="utf-8"');
    res.setHeader("Cache-Control", "public, max-age=600, stale-while-revalidate=120");
    res.status(200).send(xml);
  } catch (err) {
    console.error("❌ RSS error:", err);
    res.status(500).send("RSS feed unavailable.");
  }
}

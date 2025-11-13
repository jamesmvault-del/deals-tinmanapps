// /lib/feedNormalizer.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Feed Normalizer v6.0
// “Deterministic • Referral-Safe • CTA-Clean • Semantic-Optimised Pipeline”
//
// PURPOSE:
// • Provide the CTA Engine with perfectly normalised, context-rich inputs
// • Strip *all* legacy CTA/subtitle fields (CTA Engine v11+ owns generation)
// • Normalise titles, descriptions, images, categories and slugs
// • Fully align with ingestion rules from updateFeed v11.1
// • Enforce correct referral bundle fields: sourceUrl, masked, trackPath, referralUrl
// • Guarantee zero raw external referral leakage
// • Deterministic, idempotent, zero randomness
//
// FLOW:
// updateFeed → feedNormalizer (THIS FILE) → master-cron (CTA) → seoIntegrity → mergeHistory
// ───────────────────────────────────────────────────────────────────────────────

import path from "path";
import fs from "fs";

// Prefixes (strict)
const PLACEHOLDER_IMG = "https://deals.tinmanapps.com/assets/placeholder.webp";
const REF_PREFIX = process.env.REF_PREFIX || "https://appsumo.8odi.net/9L0P95?u=";
const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function safe(val, fallback = null) {
  if (val === undefined || val === null) return fallback;
  const s = String(val).trim();
  return s === "" ? fallback : s;
}

function slugify(t = "") {
  return String(t || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .trim();
}

function titleCase(t = "") {
  return String(t || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Semantic description cleaning — strict, CTA-safe
function sanitizeDescription(desc = "") {
  return String(desc || "")
    .replace(/<\/?[^>]+>/g, " ") // strip HTML
    .replace(/&nbsp;|&amp;|&quot;|&lt;|&gt;/g, " ")
    .replace(/[“”«»„]/g, '"')
    .replace(/[‘’‛‹›]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\.{3,}/g, "…")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim() || null;
}

// Title cleaning
function sanitizeTitle(t = "") {
  return String(t || "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\b(ai|gpt|llm)\b/gi, (m) => m.toUpperCase())
    .trim();
}

// ───────────────────────────────────────────────────────────────────────────────
// REFERRAL BUNDLE: Always deterministic, always internal
// ───────────────────────────────────────────────────────────────────────────────
function buildReferralBundle({ slug, category, sourceUrl }) {
  if (!sourceUrl) {
    return {
      sourceUrl: null,
      masked: null,
      trackPath: null,
      referralUrl: null,
    };
  }

  const masked = REF_PREFIX + encodeURIComponent(sourceUrl);

  const trackPath = `/api/track?deal=${encodeURIComponent(
    slug
  )}&cat=${encodeURIComponent(category)}&redirect=${encodeURIComponent(masked)}`;

  return {
    sourceUrl,
    masked,
    trackPath,
    referralUrl: `${SITE_ORIGIN}${trackPath}`,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN — normalizeFeed()
// Deterministic, removes legacy SEO fields, builds referral bundle, CTA-clean.
// ───────────────────────────────────────────────────────────────────────────────
export function normalizeFeed(rawFeed = []) {
  if (!Array.isArray(rawFeed)) {
    console.warn("⚠️ [FeedNormalizer] Non-array input received.");
    return [];
  }

  const now = new Date().toISOString();
  const seen = new Set();

  const normalized = rawFeed
    .map((item) => {
      if (!item) return null;

      // 1️⃣ Title
      let title =
        safe(item.title) ||
        safe(item.name) ||
        (item.slug ? item.slug.replace(/[-_]/g, " ") : "Untitled");
      title = titleCase(sanitizeTitle(title));

      // 2️⃣ Slug (canonical)
      let slug = safe(item.slug) || slugify(title);
      slug = slugify(slug || title);

      // 3️⃣ Category
      const category = safe(item.category, "software").toLowerCase();

      // 4️⃣ Source URL (raw AppSumo) — never exposed publicly
      const sourceUrl =
        safe(item.sourceUrl) ||
        safe(item.url) ||
        safe(item.product_url) ||
        null;

      // 5️⃣ Referral bundle (masked + trackPath + referralUrl)
      const referral = buildReferralBundle({ slug, category, sourceUrl });

      // 6️⃣ Image (never null)
      const image =
        safe(item.image) ||
        safe(item.thumbnail) ||
        safe(item.img) ||
        PLACEHOLDER_IMG;

      // 7️⃣ Description
      const description = sanitizeDescription(
        item.description || item.desc || ""
      );

      // 8️⃣ Strip legacy SEO (CTA/subtitle) — CTA Engine v11 owns generation
      const seo = {
        cta: null,
        subtitle: null,
      };

      return {
        title,
        slug,
        category,
        url: referral.sourceUrl, // internal canonical
        sourceUrl: referral.sourceUrl,
        masked: referral.masked,
        trackPath: referral.trackPath,
        referralUrl: referral.referralUrl,
        image,
        description,
        seo,
        normalizedAt: now,
      };
    })
    .filter(Boolean)
    .filter((v) => {
      const key = `${v.slug.toLowerCase()}::${v.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  console.log(
    `✅ [FeedNormalizer v6.0] ${normalized.length} entries normalised — CTA-ready, fully referral-secure.`
  );

  return normalized;
}

// ───────────────────────────────────────────────────────────────────────────────
// Batch Utility — normalise feed-cache.json
// ───────────────────────────────────────────────────────────────────────────────
export function normalizeFeedFile(feedPath = path.resolve("./data/feed-cache.json")) {
  if (!fs.existsSync(feedPath)) {
    console.warn("⚠️ [FeedNormalizer] feed-cache.json not found");
    return;
  }
  const raw = JSON.parse(fs.readFileSync(feedPath, "utf8"));
  const normalized = normalizeFeed(raw);
  fs.writeFileSync(feedPath, JSON.stringify(normalized, null, 2), "utf8");
  console.log("✅ [FeedNormalizer] feed-cache.json normalised + saved");
}

export default { normalizeFeed, normalizeFeedFile };

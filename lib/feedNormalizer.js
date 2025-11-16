// /lib/feedNormalizer.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Feed Normalizer v7.0
// “Perfect Normalizer • Referral-Guard Aligned • CTA-Ready • Deterministic”
/*
PURPOSE
• Provide the ENTIRE system with faultless ingestion-ready deal objects.
• Enforce the canonical fields expected by:
     - CTA Engine v11.2+
     - CTA Evolver v4.2+
     - Learning Governor v4.1+
     - Ranking Engine v4+
     - Insight Pulse v6+
     - SEO Integrity v6+
     - Sitemap v10+
• Ensure ZERO raw referral leakage (masked + trackPath only).
• Ensure deterministic slug/category/title/image normalization.
• Strip ANY legacy CTA/subtitle from ingestion.
• Prevent malformed objects from poisoning CTA/SEO/ranking.

FLOW
updateFeed → feedNormalizer v7 → master-cron → CTA Engine → SEO Integrity
*/
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

// Constants
const PLACEHOLDER_IMG = "https://deals.tinmanapps.com/assets/placeholder.webp";
const REF_PREFIX =
  process.env.REF_PREFIX || "https://appsumo.8odi.net/9L0P95?u=";
const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") ||
  "https://deals.tinmanapps.com";

export const FEED_NORMALIZER_VERSION = "v7.0";

// ───────────────────────────────────────────────────────────────────────────────
// Helpers (strict + deterministic)
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

function sanitizeDescription(desc = "") {
  return (
    String(desc || "")
      .replace(/<\/?[^>]+>/g, " ")
      .replace(/&nbsp;|&amp;|&quot;|&lt;|&gt;/g, " ")
      .replace(/[“”«»„]/g, '"')
      .replace(/[‘’‛‹›]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/\.{3,}/g, "…")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

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

function isExternalUrl(u = "") {
  return /^https?:\/\//i.test(String(u || ""));
}

// Validate + canonicalize sourceUrl (ReferralGuard safe)
function normalizeSourceUrl(item) {
  const raw =
    safe(item.sourceUrl) ||
    safe(item.url) ||
    safe(item.product_url) ||
    safe(item.link) ||
    null;

  if (!raw || !isExternalUrl(raw)) return null;
  return raw;
}

function normalizeCategory(raw) {
  const base = safe(raw, "software");
  return String(base).toLowerCase().trim() || "software";
}

// ───────────────────────────────────────────────────────────────────────────────
// REFERRAL BUNDLE — “Absolutely Referral-Safe”
// ───────────────────────────────────────────────────────────────────────────────
function buildReferralBundle({ slug, category, sourceUrl }) {
  // No product URL → no referral bundle (ReferralGuard will handle)
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
// MAIN — normalizeFeed (deterministic, idempotent, CTA-safe)
// ───────────────────────────────────────────────────────────────────────────────
export function normalizeFeed(rawFeed = []) {
  if (!Array.isArray(rawFeed)) {
    console.warn("⚠️ [FeedNormalizer v7] Non-array input received.");
    return [];
  }

  const now = new Date().toISOString();
  const seen = new Set();

  let total = 0;
  let dropped = 0;
  let noSource = 0;

  const normalized = rawFeed
    .map((item) => {
      total++;
      if (!item) {
        dropped++;
        return null;
      }

      // 1️⃣ Title
      let title =
        safe(item.title) ||
        safe(item.name) ||
        (item.slug ? item.slug.replace(/[-_]/g, " ") : "Untitled");

      title = titleCase(sanitizeTitle(title));

      // 2️⃣ Slug (canonical)
      let slug = safe(item.slug) || slugify(title);
      slug = slugify(slug || title);
      if (!slug) {
        dropped++;
        return null;
      }

      // 3️⃣ Category
      const category = normalizeCategory(item.category);

      // 4️⃣ Source URL
      const sourceUrl = normalizeSourceUrl(item);
      if (!sourceUrl) noSource++;

      // 5️⃣ Referral bundle
      const referral = buildReferralBundle({ slug, category, sourceUrl });

      // 6️⃣ Image (placeholder-safe)
      const image =
        safe(item.image) ||
        safe(item.thumbnail) ||
        safe(item.img) ||
        PLACEHOLDER_IMG;

      // 7️⃣ Description
      const description = sanitizeDescription(
        item.description || item.desc || ""
      );

      // 8️⃣ CTA-safe SEO container
      const seo = {
        cta: null,
        subtitle: null,
      };

      const normalizedItem = {
        title,
        slug,
        category,
        url: referral.sourceUrl,
        sourceUrl: referral.sourceUrl,
        masked: referral.masked,
        trackPath: referral.trackPath,
        referralUrl: referral.referralUrl,
        image,
        description,
        seo,
        normalizedAt: now,
      };

      // Make 100% sure no undefined survives
      for (const key of Object.keys(normalizedItem)) {
        if (normalizedItem[key] === undefined) normalizedItem[key] = null;
      }

      return normalizedItem;
    })
    .filter(Boolean)
    .filter((v) => {
      const key = `${v.slug.toLowerCase()}::${v.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  console.log(
    `✅ [FeedNormalizer v7.0] total=${total}, normalized=${normalized.length}, dropped=${dropped}, noSource=${noSource} — CTA-ready, referral-secure, deterministic.`
  );

  return normalized;
}

// ───────────────────────────────────────────────────────────────────────────────
// Batch normaliser (for CLI / manual rebuilds)
// ───────────────────────────────────────────────────────────────────────────────
export function normalizeFeedFile(
  feedPath = path.resolve("./data/feed-cache.json")
) {
  if (!fs.existsSync(feedPath)) {
    console.warn("⚠️ [FeedNormalizer v7] feed-cache.json not found");
    return;
  }
  const raw = JSON.parse(fs.readFileSync(feedPath, "utf8"));
  const normalized = normalizeFeed(raw);
  fs.writeFileSync(feedPath, JSON.stringify(normalized, null, 2), "utf8");
  console.log("✅ [FeedNormalizer v7] feed-cache.json normalized + saved");
}

export default { normalizeFeed, normalizeFeedFile };

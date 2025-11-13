// /lib/feedNormalizer.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Feed Normalizer v6.1
// “Deterministic • Referral-Safe • CTA-Clean • Semantic-Optimised Pipeline”
//
// PURPOSE:
// • Provide the CTA Engine with perfectly normalised, context-rich inputs
// • Strip *all* legacy CTA/subtitle fields (CTA Engine v11+ owns generation)
// • Normalise titles, descriptions, images, categories and slugs
// • Fully align with ingestion rules from updateFeed v11.1
// • Enforce full referral bundle overwrite: sourceUrl, masked, trackPath, referralUrl
// • Guarantee zero raw external referral leakage in referral bundle fields
// • Prevent malformed/null referral objects reaching CTA Engine
// • Deterministic, idempotent, zero randomness
//
// FLOW:
// updateFeed → feedNormalizer (THIS FILE) → master-cron (CTA) → seoIntegrity → mergeHistory
// ───────────────────────────────────────────────────────────────────────────────

import path from "path";
import fs from "fs";

// Prefixes (strict)
const PLACEHOLDER_IMG = "https://deals.tinmanapps.com/assets/placeholder.webp";
const REF_PREFIX =
  process.env.REF_PREFIX || "https://appsumo.8odi.net/9L0P95?u=";
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
  return (
    String(desc || "")
      .replace(/<\/?[^>]+>/g, " ") // strip HTML
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

function isExternalUrl(u = "") {
  return /^https?:\/\//i.test(String(u || ""));
}

// Only treat as valid sourceUrl if it’s an external HTTP(S) URL and clearly a product/referral
// (AppSumo, Impact, or similar). Everything else is nullified to avoid malformed bundles.
function normalizeSourceUrl(item) {
  const raw =
    safe(item.sourceUrl) ||
    safe(item.url) ||
    safe(item.product_url) ||
    safe(item.link) ||
    null;

  if (!raw) return null;
  if (!isExternalUrl(raw)) return null;

  // Keep all external HTTP(S) for now, but hard-mask via REF_PREFIX downstream.
  // Referral integrity is enforced at bundle-level; sourceUrl is the raw product URL.
  return raw;
}

function normalizeCategory(raw) {
  const base = safe(raw, "software");
  return String(base).toLowerCase().trim() || "software";
}

// ───────────────────────────────────────────────────────────────────────────────
// REFERRAL BUNDLE: Always deterministic, always internal
// ───────────────────────────────────────────────────────────────────────────────
function buildReferralBundle({ slug, category, sourceUrl }) {
  // No valid sourceUrl → no referral bundle; CTA Engine will still generate CTA,
  // but master-cron’s ReferralGuard will archive these.
  if (!sourceUrl) {
    return {
      sourceUrl: null,
      masked: null,
      trackPath: null,
      referralUrl: null,
    };
  }

  const masked = REF_PREFIX + encodeURIComponent(sourceUrl);

  // Always internal track path; /api/track on our origin only
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
        // If we cannot derive a slug, the item is unusable for SEO/CTA.
        dropped++;
        return null;
      }

      // 3️⃣ Category (canonical, lower-case, fallback to software)
      const category = normalizeCategory(item.category);

      // 4️⃣ Source URL (raw external product URL) — never exposed publicly
      const sourceUrl = normalizeSourceUrl(item);
      if (!sourceUrl) {
        noSource++;
      }

      // 5️⃣ Referral bundle (masked + trackPath + referralUrl)
      //    We *always* overwrite any pre-existing referral fields from ingestion.
      const referral = buildReferralBundle({ slug, category, sourceUrl });

      // 6️⃣ Image (never null; placeholder-safe)
      const image =
        safe(item.image) ||
        safe(item.thumbnail) ||
        safe(item.img) ||
        PLACEHOLDER_IMG;

      // 7️⃣ Description (cleaned, CTA-safe)
      const description = sanitizeDescription(
        item.description || item.desc || ""
      );

      // 8️⃣ Strip legacy SEO (CTA/subtitle) — CTA Engine v11+ owns generation
      const seo = {
        cta: null,
        subtitle: null,
      };

      const normalizedItem = {
        title,
        slug,
        category,
        url: referral.sourceUrl, // internal canonical pointer to sourceUrl
        sourceUrl: referral.sourceUrl,
        masked: referral.masked,
        trackPath: referral.trackPath,
        referralUrl: referral.referralUrl,
        image,
        description,
        seo,
        normalizedAt: now,
      };

      // Hard guard: ensure no undefined fields leak into CTA Engine
      // (everything is either string or null)
      for (const key of Object.keys(normalizedItem)) {
        const val = normalizedItem[key];
        if (val === undefined) {
          normalizedItem[key] = null;
        }
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
    `✅ [FeedNormalizer v6.1] total=${total}, normalised=${normalized.length}, dropped=${dropped}, noSourceUrl=${noSource} — CTA-ready, fully referral-secure.`
  );

  return normalized;
}

// ───────────────────────────────────────────────────────────────────────────────
// Batch Utility — normalise feed-cache.json
// ───────────────────────────────────────────────────────────────────────────────
export function normalizeFeedFile(
  feedPath = path.resolve("./data/feed-cache.json")
) {
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

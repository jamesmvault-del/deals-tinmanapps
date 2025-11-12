// /lib/feedNormalizer.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Feed Normalizer v4.4
// “Referral-Lock • Canonical-Slug • Deterministic Preservation Edition”
//
// PURPOSE:
// • Strict Mode A (zero category overrides)
// • Repairs title → slug consistency deterministically
// • NEVER modifies CTA/subtitle (downstream responsibility)
// • PRESERVES referralMask URLs ONLY — blocks raw external URLs
// • Sanitises description + trims whitespace from all string fields
// • Ensures canonical fields for regeneration pipeline:
//     normalizeFeed → regenerateSeo → ctaEngine → seoIntegrity → mergeHistory
// • Zero randomness, zero inference, zero guessing
// • Fully Render-safe + master-cron-safe
// ───────────────────────────────────────────────────────────────────────────────

import path from "path";
import fs from "fs";

// ───────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────
const slugify = (t = "") =>
  t
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .trim();

const titleCase = (t = "") =>
  t
    .replace(/[-_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

function safe(val, fallback = null) {
  return val === undefined || val === null || val === "" ? fallback : String(val).trim();
}

function sanitizeDescription(desc = "") {
  return String(desc || "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim() || null;
}

// ───────────────────────────────────────────────
// Referral Governor — Hard Enforcement
// All referral URLs must be masked (created upstream by appsumo-proxy)
// Here we verify, sanitize, and enforce no leakage.
// ───────────────────────────────────────────────
const MASK_PREFIX = "https://tinmanapps.com/r?url=";
function enforceMask(url) {
  if (!url) return null;
  const u = String(url).trim();
  return u.startsWith(MASK_PREFIX) ? u : null;
}

// ───────────────────────────────────────────────
// Main Normalizer — STRICT PRESERVATION
// ───────────────────────────────────────────────
export function normalizeFeed(rawFeed = []) {
  if (!Array.isArray(rawFeed)) {
    console.warn("⚠️ [FeedNormalizer] Non-array input.");
    return [];
  }

  const seen = new Set();
  const now = new Date().toISOString();

  const normalized = rawFeed
    .map((item) => {
      if (!item) return null;

      // 1️⃣ Title repair
      let title =
        item.title ||
        item.name ||
        (item.slug ? item.slug.replace(/[-_]/g, " ") : "Untitled");
      title = titleCase(String(title).trim());

      // 2️⃣ Slug repair (canonical + deterministic)
      let slug = item.slug || slugify(item.title || title);
      if (!slug) slug = slugify(title);

      // 3️⃣ STRICT CATEGORY — no inference / no override
      const category = safe(item.category, "software");

      // 4️⃣ URL + Referral (referral MUST be masked)
      const url = safe(item.url || item.link || item.product_url, null);
      const referralUrl = enforceMask(item.referralUrl);

      // 5️⃣ Image repair (fallback = placeholder)
      const image =
        safe(item.image, null) ||
        safe(item.thumbnail, null) ||
        safe(item.img, null) ||
        "https://deals.tinmanapps.com/assets/placeholder.webp";

      // 6️⃣ Description sanitisation
      const description = sanitizeDescription(item.description || item.desc || "");

      // 7️⃣ Preserve CTA/subtitle if they exist (no regeneration here)
      const seo =
        item.seo && typeof item.seo === "object"
          ? {
              cta: safe(item.seo.cta, null),
              subtitle: safe(item.seo.subtitle, null),
            }
          : {
              cta: null,
              subtitle: null,
            };

      // 8️⃣ Compose normalized entry
      return {
        title,
        slug,
        category,
        url,
        referralUrl,
        image,
        description,
        seo,
        normalizedAt: now,
      };
    })
    .filter(Boolean)
    .filter((v) => {
      // 9️⃣ Deduplicate deterministically (slug + title)
      const key = `${v.slug.toLowerCase()}::${v.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  console.log(`✅ [FeedNormalizer v4.4] Normalized ${normalized.length} entries`);
  return normalized;
}

// ───────────────────────────────────────────────
// Batch Utility — for feed-cache.json
// ───────────────────────────────────────────────
export function normalizeFeedFile(feedPath = path.resolve("./data/feed-cache.json")) {
  if (!fs.existsSync(feedPath)) {
    console.warn("⚠️ [FeedNormalizer] feed-cache.json not found");
    return;
  }

  const raw = JSON.parse(fs.readFileSync(feedPath, "utf8"));
  const normalized = normalizeFeed(raw);
  fs.writeFileSync(feedPath, JSON.stringify(normalized, null, 2), "utf8");
  console.log("✅ [FeedNormalizer] feed-cache.json normalized + saved");
}

export default { normalizeFeed, normalizeFeedFile };

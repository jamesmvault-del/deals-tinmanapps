// /lib/feedNormalizer.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Feed Normalizer v5.0
// “Semantic-Optimized • Context-Clean • Deterministic Input Pipeline”
//
// PURPOSE:
// • Cleanses & standardizes titles / descriptions for CTA Engine v10+
// • Flattens punctuation (– — … → . , etc.) and removes stray HTML
// • Repairs slug deterministically with safe ASCII normalization
// • PRESERVES full descriptive context (never truncates)
// • NEVER generates or modifies CTA/subtitle (delegated downstream)
// • Strict referral-mask enforcement (no raw external URLs)
// • Canonical normalization flow:
//     updateFeed → aggregate → normalizeFeed (THIS FILE)
//     → cleanseFeed → regenerateSeo → seoIntegrity → mergeHistory
// • Deterministic, zero randomness, fully Render-safe
// ───────────────────────────────────────────────────────────────────────────────

import path from "path";
import fs from "fs";

// ───────────────────────────────────────────────
// Core Helpers
// ───────────────────────────────────────────────
const slugify = (t = "") =>
  t
    .toLowerCase()
    .normalize("NFKD") // handle diacritics
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
  if (val === undefined || val === null) return fallback;
  const s = String(val).trim();
  return s === "" ? fallback : s;
}

// ───────────────────────────────────────────────
// Semantic Cleaners
// ───────────────────────────────────────────────

// More aggressive cleaner: strips markup, control chars, and weird punctuation
function sanitizeDescription(desc = "") {
  return String(desc || "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;|&amp;|&quot;|&lt;|&gt;/g, " ")
    .replace(/[“”«»„]/g, '"')
    .replace(/[‘’‛‹›]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\.{3,}/g, "…")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim() || null;
}

// Title cleaner — flatten punctuation but retain meaning
function sanitizeTitle(t = "") {
  return String(t || "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\b(ai|gpt|llm)\b/gi, (m) => m.toUpperCase()) // keep AI/GPT uppercase
    .trim();
}

// ───────────────────────────────────────────────
// Referral Governor — absolute lock
// ───────────────────────────────────────────────
const MASK_PREFIX = "https://tinmanapps.com/r?url=";
function enforceMask(url) {
  if (!url) return null;
  const u = String(url).trim();
  return u.startsWith(MASK_PREFIX) ? u : null;
}

// ───────────────────────────────────────────────
// Main Normalizer
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

      // 1️⃣ Title normalization (semantic + title-case)
      let title =
        item.title ||
        item.name ||
        (item.slug ? item.slug.replace(/[-_]/g, " ") : "Untitled");
      title = titleCase(sanitizeTitle(title));

      // 2️⃣ Slug repair (canonical deterministic)
      let slug = item.slug || slugify(title);
      if (!slug) slug = slugify(title);

      // 3️⃣ Strict category (no inference)
      const category = safe(item.category, "software").toLowerCase();

      // 4️⃣ URL & referral enforcement
      const url = safe(item.url || item.link || item.product_url, null);
      const referralUrl = enforceMask(item.referralUrl);

      // 5️⃣ Image repair (retain placeholders)
      const image =
        safe(item.image, null) ||
        safe(item.thumbnail, null) ||
        safe(item.img, null) ||
        "https://deals.tinmanapps.com/assets/placeholder.webp";

      // 6️⃣ Description sanitization (context preserved)
      const description = sanitizeDescription(
        item.description || item.desc || ""
      );

      // 7️⃣ SEO passthrough (CTA/subtitle untouched)
      const seo =
        item.seo && typeof item.seo === "object"
          ? {
              cta: safe(item.seo.cta, null),
              subtitle: safe(item.seo.subtitle, null),
            }
          : { cta: null, subtitle: null };

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
      const key = `${v.slug.toLowerCase()}::${v.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  console.log(
    `✅ [FeedNormalizer v5.0] ${normalized.length} entries normalized — semantic cleanup + CTA-safe context ready`
  );
  return normalized;
}

// ───────────────────────────────────────────────
// Batch Utility — feed-cache.json normalization
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

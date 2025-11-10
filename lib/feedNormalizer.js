// /lib/feedNormalizer.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Feed Normalizer v3.0 “Deterministic Preservation Edition”
//
// STRICT MODE A — ZERO CATEGORY OVERRIDES
// • Preserves category exactly as updateFeed.js produced it
// • Repairs title → slug consistency
// • Never infers categories from keywords
// • Preserves all referral URLs
// • Ensures no null-breaking fields
// • Fully Render-safe + master-cron safe
// ───────────────────────────────────────────────────────────────────────────────

import path from "path";
import fs from "fs";

// ─────────────── Utility Helpers ───────────────
const slugify = (t = "") =>
  t
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .trim();

const capitalizeTitle = (t = "") =>
  t
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s{2,}/g, " ")
    .trim();

function safe(val, fallback = null) {
  return val === undefined || val === null || val === "" ? fallback : val;
}

// ─────────────── Main Normalizer (STRICT PRESERVATION) ───────────────
export function normalizeFeed(rawFeed = []) {
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
      title = capitalizeTitle(String(title).trim());

      // 2️⃣ Slug repair — deterministic
      let slug = item.slug || slugify(item.title || title);
      if (!slug) slug = slugify(title);

      // 3️⃣ STRICT CATEGORY PRESERVATION
      //    Never infer / never overwrite
      const category = safe(item.category, "software");

      // 4️⃣ SEO preservation
      const seo =
        item.seo && typeof item.seo === "object"
          ? {
              cta: safe(item.seo.cta, null),
              subtitle: safe(item.seo.subtitle, null),
            }
          : { cta: null, subtitle: null };

      // 5️⃣ Referral link + image preservation
      const link = item.link || item.url || item.product_url || null;
      const referralUrl = safe(item.referralUrl, link);
      const image =
        item.image ||
        item.thumbnail ||
        item.img ||
        "https://deals.tinmanapps.com/assets/placeholder.webp";

      // 6️⃣ Compose normalized entry
      return {
        title,
        slug,
        category,
        link,
        referralUrl,
        image,
        description: safe(item.description, null),
        seo,
        normalizedAt: now,
      };
    })
    .filter(Boolean)
    .filter((v) => {
      // 7️⃣ Dedupe by slug AND title (case-insensitive)
      const key = v.slug.toLowerCase() + "::" + v.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  console.log(`✅ [FeedNormalizer] Normalized ${normalized.length} entries`);
  return normalized;
}

// ─────────────── Optional Batch Utility ───────────────
export function normalizeFeedFile(feedPath = path.resolve("./data/feed-cache.json")) {
  if (!fs.existsSync(feedPath)) {
    console.warn("⚠️ [FeedNormalizer] feed-cache.json not found, skipping");
    return;
  }

  const raw = JSON.parse(fs.readFileSync(feedPath, "utf8"));
  const normalized = normalizeFeed(raw);
  fs.writeFileSync(feedPath, JSON.stringify(normalized, null, 2), "utf8");
  console.log("✅ [FeedNormalizer] Feed cache normalized and saved");
}

export default { normalizeFeed, normalizeFeedFile };

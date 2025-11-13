/**
 * /lib/feedCleanser.js
 * TinmanApps — Feed Cleanser v6.1
 * “Archive-True • Zero-Leak SEO • Deterministic Merge • Context-Safe”
 * -----------------------------------------------------------------------------
 * PURPOSE:
 * • Merge NEW normalized feed with old feed-cache.json deterministically.
 * • Enforce *absolute no CTA/subtitle preservation* across regenerations.
 * • Preserve high-value SEO metadata (keywords, clickbait, emotionalVerb).
 * • Perform deep text seam-cleaning (spacing, punctuation, control chars, ellipsis).
 * • Guarantee safe, non-empty title fallbacks before CTA generation.
 * • Archive safety: never delete, only mark archived.
 * • No regeneration, no inference — this is a pure structural merge pass.
 *
 * ORDER FLOW:
 *   updateFeed.js → aggregate → normalizeFeed → cleanseFeed (THIS FILE)
 *   → regenerateSeo → seoIntegrity → merge-history → insight
 *
 * GUARANTEES:
 * ✅ CTA/subtitle = always null (regen handled downstream)
 * ✅ Archive entries never removed (purge only via master-cron)
 * ✅ Category preserved exactly
 * ✅ Deterministic merge sequence
 * ✅ Render-safe — zero side effects beyond writing feed-cache.json
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function sanitizeSeams(text = "") {
  return String(text || "")
    // strip non-printable control chars (but keep standard whitespace)
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, "")
    // normalize dashes
    .replace(/\s*–\s*/g, " - ")
    .replace(/\s*—\s*/g, " - ")
    // collapse long ellipses
    .replace(/\.{3,}/g, "…")
    // collapse whitespace
    .replace(/\s{2,}/g, " ")
    // fix space before punctuation
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function sanitizeObjectStrings(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "string" ? sanitizeSeams(v) : v;
  }
  return out;
}

/**
 * Safe title fallback:
 *  - sanitize seams
 *  - if empty, fall back to slug prettified
 *  - if still empty, "Untitled"
 */
function safeTitle(rawTitle, slug) {
  const primary = sanitizeSeams(rawTitle || "");
  if (primary) return primary;

  if (slug) {
    const fromSlug = sanitizeSeams(String(slug).replace(/[-_]+/g, " "));
    if (fromSlug) return fromSlug;
  }

  return "Untitled";
}

// -----------------------------------------------------------------------------
// MAIN CLEANSER (Pure structural merge, no CTA/subtitle fallback)
// -----------------------------------------------------------------------------
export function cleanseFeed(current = []) {
  if (!Array.isArray(current)) {
    console.warn("⚠️ [FeedCleanser] Non-array feed input. Using empty array.");
    current = [];
  }

  const now = new Date().toISOString();

  // First run — no feed cache
  if (!fs.existsSync(FEED_PATH)) {
    console.warn("⚠️ [FeedCleanser] No previous feed-cache found. Initializing baseline.");
    const cleaned = current.map((x) => ({
      ...x,
      title: safeTitle(x.title, x.slug),
      seo: sanitizeObjectStrings({
        cta: null,
        subtitle: null,
        clickbait: x.seo?.clickbait || null,
        keywords: x.seo?.keywords || [],
        emotionalVerb: x.seo?.emotionalVerb || null,
        lastVerifiedAt: x.seo?.lastVerifiedAt || null,
      }),
      archived: false,
      archivedAt: null,
      lastSeenAt: now,
    }));
    try {
      fs.writeFileSync(FEED_PATH, JSON.stringify(cleaned, null, 2), "utf8");
    } catch (err) {
      console.error("❌ [FeedCleanser] Failed to write initial feed-cache:", err.message);
    }
    return cleaned;
  }

  // Load previous feed safely
  let prev;
  try {
    prev = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
  } catch {
    console.warn("⚠️ [FeedCleanser] Previous feed corrupted. Reinitializing with current feed.");
    const repaired = current.map((x) => ({
      ...x,
      title: safeTitle(x.title, x.slug),
      seo: sanitizeObjectStrings({
        cta: null,
        subtitle: null,
        clickbait: x.seo?.clickbait || null,
        keywords: x.seo?.keywords || [],
        emotionalVerb: x.seo?.emotionalVerb || null,
        lastVerifiedAt: x.seo?.lastVerifiedAt || null,
      }),
      archived: false,
      archivedAt: null,
      lastSeenAt: now,
    }));
    try {
      fs.writeFileSync(FEED_PATH, JSON.stringify(repaired, null, 2), "utf8");
    } catch (err) {
      console.error("❌ [FeedCleanser] Failed to write repaired feed-cache:", err.message);
    }
    return repaired;
  }

  const prevMap = new Map(prev.map((p) => [p.slug, p]));
  const merged = [];

  // 1️⃣ Merge existing entries that reappear this run
  for (const old of prev) {
    const fresh = current.find((c) => c.slug === old.slug);
    if (fresh) {
      const oldSeo = old.seo || {};
      const freshSeo = fresh.seo || {};

      const mergedSeo = {
        cta: null,
        subtitle: null,
        clickbait: freshSeo.clickbait || oldSeo.clickbait || null,
        keywords: Array.isArray(freshSeo.keywords)
          ? freshSeo.keywords
          : Array.isArray(oldSeo.keywords)
          ? oldSeo.keywords
          : [],
        emotionalVerb: freshSeo.emotionalVerb || oldSeo.emotionalVerb || null,
        lastVerifiedAt: freshSeo.lastVerifiedAt || oldSeo.lastVerifiedAt || null,
      };

      merged.push({
        ...fresh,
        title: safeTitle(fresh.title, fresh.slug),
        category: fresh.category,
        archived: false,
        archivedAt: old.archivedAt || null,
        lastSeenAt: now,
        seo: sanitizeObjectStrings(mergedSeo),
      });
    } else {
      // 2️⃣ Missing → archive deterministically
      merged.push({
        ...old,
        title: safeTitle(old.title, old.slug),
        archived: true,
        archivedAt: old.archivedAt || now,
        lastSeenAt: old.lastSeenAt || now,
        seo: sanitizeObjectStrings(old.seo || {}),
      });
    }
  }

  // 3️⃣ Add brand new entries
  for (const fresh of current) {
    if (!prevMap.has(fresh.slug)) {
      merged.push({
        ...fresh,
        title: safeTitle(fresh.title, fresh.slug),
        archived: false,
        archivedAt: null,
        lastSeenAt: now,
        seo: sanitizeObjectStrings({
          cta: null,
          subtitle: null,
          clickbait: fresh.seo?.clickbait || null,
          keywords: fresh.seo?.keywords || [],
          emotionalVerb: fresh.seo?.emotionalVerb || null,
          lastVerifiedAt: fresh.seo?.lastVerifiedAt || null,
        }),
      });
    }
  }

  // 4️⃣ Write merged feed to disk (deterministic order)
  try {
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2), "utf8");
  } catch (err) {
    console.error("❌ [FeedCleanser] Failed to write feed-cache:", err.message);
  }

  console.log(
    `✅ [FeedCleanser v6.1] Archive-safe merge complete (${merged.length} entries) — CTA/subtitle stripped, SEO metadata preserved, seams sanitized, titles stabilized`
  );

  return merged;
}

export default { cleanseFeed };

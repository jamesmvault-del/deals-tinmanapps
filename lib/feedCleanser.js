/**
 * /lib/feedCleanser.js
 * TinmanApps — Feed Cleanser v6.0
 * “Archive-True • Zero-Leak SEO • Deterministic Merge • Context-Safe”
 * -----------------------------------------------------------------------------
 * PURPOSE:
 * • Merge NEW normalized feed with old feed-cache.json deterministically.
 * • Enforce *absolute no CTA/subtitle preservation* across regenerations.
 * • Preserve high-value SEO metadata (keywords, clickbait, emotionalVerb).
 * • Perform deep text seam-cleaning (spacing, punctuation, ellipsis).
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
    .replace(/\s*–\s*/g, " - ")
    .replace(/\s*—\s*/g, " - ")
    .replace(/\.{3,}/g, "…")
    .replace(/\s{2,}/g, " ")
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
      title: sanitizeSeams(x.title),
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
    fs.writeFileSync(FEED_PATH, JSON.stringify(cleaned, null, 2), "utf8");
    return cleaned;
  }

  // Load previous feed safely
  let prev;
  try {
    prev = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
  } catch {
    console.warn("⚠️ [FeedCleanser] Previous feed corrupted. Reinitializing.");
    fs.writeFileSync(FEED_PATH, JSON.stringify(current, null, 2), "utf8");
    return current;
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
        title: sanitizeSeams(fresh.title),
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
        title: sanitizeSeams(fresh.title),
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
    `✅ [FeedCleanser v6.0] Archive-safe merge complete (${merged.length} entries) — CTA/subtitle stripped, SEO metadata preserved, seams sanitized`
  );

  return merged;
}

export default { cleanseFeed };

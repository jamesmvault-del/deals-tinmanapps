/**
 * /lib/feedCleanser.js
 * TinmanApps — Feed Cleanser v5.0
 * “Absolute Regeneration • Zero-Leak SEO • Deterministic Archive Guardian”
 * -----------------------------------------------------------------------------
 * PURPOSE:
 * • Merge NEW normalized feed with old feed-cache.json
 * • Protect archive integrity (no deletion, deterministic archival)
 * • Ensure CTA + subtitle are ALWAYS regenerated (never preserved)
 * • Preserve ALL other SEO fields (keywords, clickbait, emotionalVerb)
 * • Guard against missing runs, partial runs, corrupt cache
 * • Render-safe (no headless dependencies)
 *
 * ORDER FLOW:
 *   updateFeed.js → aggregate → normalizeFeed → cleanseFeed (THIS FILE)
 *   → regenerateSeo → seoIntegrity → merge-history → insight
 *
 * NON-NEGOTIABLE RULES:
 * ✅ NO CTA resurrection
 * ✅ NO subtitle resurrection
 * ✅ Archive entries NEVER removed (only auto-purged by master-cron rules)
 * ✅ Category must remain EXACT from previous stages
 * ✅ Deterministic, world-class SEO hygiene
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

// CTA + subtitle must ALWAYS be regenerated
function isRegenMode() {
  return true;
}

// -----------------------------------------------------------------------------
// MAIN CLEANSER
// -----------------------------------------------------------------------------
export function cleanseFeed(current = []) {
  if (!Array.isArray(current)) {
    console.warn("⚠️ [FeedCleanser] Non-array feed. Using empty array.");
    current = [];
  }

  const now = new Date().toISOString();
  const regen = isRegenMode();

  // First run — no cache exists
  if (!fs.existsSync(FEED_PATH)) {
    console.warn("⚠️ [FeedCleanser] No previous feed-cache found. Initializing.");
    fs.writeFileSync(FEED_PATH, JSON.stringify(current, null, 2), "utf8");
    return current;
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

  // -----------------------------------------------------------------------------
  // 1) Merge existing entries that appear again this run
  // -----------------------------------------------------------------------------
  for (const old of prev) {
    const fresh = current.find((c) => c.slug === old.slug);

    if (fresh) {
      const oldSeo = old.seo || {};
      const freshSeo = fresh.seo || {};

      const mergedSeo = {
        // CTA + subtitle ALWAYS null so master-cron regenerates them
        cta: null,
        subtitle: null,

        // Keep high-value fields
        clickbait: freshSeo.clickbait || oldSeo.clickbait || null,
        keywords: freshSeo.keywords || oldSeo.keywords || [],
        emotionalVerb: freshSeo.emotionalVerb || oldSeo.emotionalVerb || null,
        lastVerifiedAt: freshSeo.lastVerifiedAt || oldSeo.lastVerifiedAt || null,
      };

      merged.push({
        ...fresh,              // preserves category, slug, title, link, image
        archived: false,
        lastSeenAt: now,
        archivedAt: old.archivedAt || null,
        seo: mergedSeo,
      });
    }

    // -----------------------------------------------------------------------------
    // 2) Missing from fresh feed → archive it (never delete)
    // -----------------------------------------------------------------------------
    else {
      merged.push({
        ...old,
        archived: true,
        archivedAt: old.archivedAt || now,
        lastSeenAt: old.lastSeenAt || now,
        seo: old.seo || {},
      });
    }
  }

  // -----------------------------------------------------------------------------
  // 3) Add brand new entries
  // -----------------------------------------------------------------------------
  for (const fresh of current) {
    if (!prevMap.has(fresh.slug)) {
      merged.push({
        ...fresh,
        archived: false,
        archivedAt: null,
        lastSeenAt: now,
        seo: {
          cta: null,
          subtitle: null,
          clickbait: fresh.seo?.clickbait || null,
          keywords: fresh.seo?.keywords || [],
          emotionalVerb: fresh.seo?.emotionalVerb || null,
          lastVerifiedAt: fresh.seo?.lastVerifiedAt || null,
        },
      });
    }
  }

  // -----------------------------------------------------------------------------
  // 4) Save merged feed
  // -----------------------------------------------------------------------------
  try {
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2), "utf8");
  } catch (err) {
    console.error("❌ [FeedCleanser] Failed to write feed-cache:", err.message);
  }

  console.log(
    `✅ [FeedCleanser] Archive-safe merge complete (${merged.length} entries) — CTA/subtitle regen enforced`
  );

  return merged;
}

export default { cleanseFeed };

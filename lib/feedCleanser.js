/**
 * /lib/feedCleanser.js
 * TinmanApps — Feed Cleanser v3.4
 * “Full Regeneration • Archive Guardian • Zero-Leak SEO Edition”
 * -----------------------------------------------------------------------------
 * PURPOSE
 * • Merge NEW normalized feed with old feed-cache.json
 * • Preserve ALL SEO history EXCEPT CTA + subtitle (which must ALWAYS regenerate)
 * • NEVER resurrect broken or outdated CTA/subtitle fields
 * • Maintain archive integrity, timestamps, learning fields and keyword history
 * • Protect against feed drops, empty runs, corruption or partial updates
 *
 * KEY PRINCIPLES (non-negotiable):
 * ✅ CTA + subtitle are ALWAYS regenerated every master-cron run
 * ✅ No past CTA/subtitle is EVER merged back (zero contamination)
 * ✅ No duplication, no conflicts, no stale phrases reappearing
 * ✅ Archive logic ALWAYS preserved (items never deleted, only archived)
 * ✅ Render-safe (ephemeral FS), deterministic behaviour
 *
 * ORDER OF OPERATIONS:
 *   1) normalizeFeed()    — shape + repair raw entries
 *   2) cleanseFeed()      — safe merge with archive rules (THIS FILE)
 *   3) regenerateSeo()    — CTA + subtitle regeneration (for ALL items)
 *   4) ensureSeoIntegrity()
 * -----------------------------------------------------------------------------
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

// ───────────────────────────────────────────────────────────────────────────────
// CTA + SUBTITLE REGENERATION IS ALWAYS ON
// (Your architecture requires fresh regeneration every run for SEO freshness,
//  no stale text, no duplication, no garbage legacy output.)
// ───────────────────────────────────────────────────────────────────────────────

function isRegenMode() {
  return true; // Forced regeneration globally
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN CLEANSER
// ───────────────────────────────────────────────────────────────────────────────

export function cleanseFeed(current = []) {
  if (!Array.isArray(current)) {
    console.warn("⚠️ [FeedCleanser] Non-array feed received. Using empty array.");
    current = [];
  }

  const now = new Date().toISOString();
  const regen = isRegenMode();

  // Fresh initialization if missing
  if (!fs.existsSync(FEED_PATH)) {
    console.warn("⚠️ [FeedCleanser] No previous feed-cache found. Initializing fresh.");
    fs.writeFileSync(FEED_PATH, JSON.stringify(current, null, 2), "utf8");
    return current;
  }

  // Load previous feed
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

  // ───────────────────────────────────────────────────────────────────────────
  // 1) Merge existing entries (with regeneration of CTA/subtitle)
  // ───────────────────────────────────────────────────────────────────────────
  for (const old of prev) {
    const fresh = current.find((c) => c.slug === old.slug);

    if (fresh) {
      const oldSeo = old.seo || {};
      const freshSeo = fresh.seo || {};

      // NEVER preserve CTA or subtitle — always wipe them before regeneration
      const mergedSeo = {
        cta: null,
        subtitle: null,

        // All other SEO fields ARE preserved
        clickbait: freshSeo.clickbait || oldSeo.clickbait || null,
        keywords: freshSeo.keywords || oldSeo.keywords || [],
        emotionalVerb: freshSeo.emotionalVerb || oldSeo.emotionalVerb || null,

        lastVerifiedAt: freshSeo.lastVerifiedAt || oldSeo.lastVerifiedAt || null,
      };

      merged.push({
        ...fresh,
        archived: false,
        lastSeenAt: now,
        archivedAt: old.archivedAt || null,
        seo: mergedSeo,
      });
    } else {
      // Missing from fresh feed → archive, never delete
      merged.push({
        ...old,
        archived: true,
        archivedAt: old.archivedAt || now,
        lastSeenAt: old.lastSeenAt || now,
        seo: old.seo || {},
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2) Add brand new entries (fresh SEO fully regenerated later)
  // ───────────────────────────────────────────────────────────────────────────
  for (const fresh of current) {
    if (!prevMap.has(fresh.slug)) {
      merged.push({
        ...fresh,
        archived: false,
        lastSeenAt: now,
        archivedAt: null,
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

  // ───────────────────────────────────────────────────────────────────────────
  // 3) Save merged result
  // ───────────────────────────────────────────────────────────────────────────
  try {
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2), "utf8");
  } catch (err) {
    console.error("❌ [FeedCleanser] Failed writing feed-cache:", err.message);
  }

  console.log(
    `✅ [FeedCleanser] Archive-safe merge complete (${merged.length} entries) — CTA/subtitle regeneration enforced`
  );

  return merged;
}

export default { cleanseFeed };

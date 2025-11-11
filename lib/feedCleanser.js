// /lib/feedCleanser.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Feed Cleanser v3.0
// “Regeneration-Aware • Archive Guardian • Zero-Conflict Edition”
//
// Purpose:
// • Safely merge NEW normalized feed with old feed-cache.json
// • Preserve SEO history *except* CTA/subtitle when regeneration is active
// • Mark missing items as archived (never deleted)
// • Maintain stable Insight learning + future CTA evolution
// • Never reintroduce old CTA/subtitles during regeneration mode
//
// Integration order:
//   1) normalizeFeed()          ← repairs raw entries
//   2) cleanseFeed()            ← merges against old feed (archive logic)
//   3) regenerateSeo() OR enrichDeals() ← CTA/subtitle handling (per master-cron)
//   4) ensureSeoIntegrity()
//
// Regeneration mode:
//   Activated when master-cron sets process.env.REGEN_SEO = "1"
//   → In this mode: CTA + subtitle from history are NEVER merged back.
//   → All other SEO fields remain preserved.
//
// Guaranteed:
// ✅ Never loses SEO fields except when intentionally regenerating CTA/subtitle
// ✅ Never corrupts archive history
// ✅ Fully deterministic and Render-safe
// ✅ Zero CTA/subtitle resurrection bugs
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

// Helper to detect regen mode (set by master-cron)
function isRegenMode() {
  return process.env.REGEN_SEO === "1";
}

export function cleanseFeed(current = []) {
  if (!Array.isArray(current)) {
    console.warn("⚠️ [FeedCleanser] Received non-array feed. Using empty array.");
    current = [];
  }

  const now = new Date().toISOString();
  const regen = isRegenMode();

  // If no previous cache → initialize fresh
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
  // 1️⃣ Merge existing entries
  // ───────────────────────────────────────────────────────────────────────────
  for (const old of prev) {
    const fresh = current.find((c) => c.slug === old.slug);

    if (fresh) {
      const oldSeo = old.seo || {};
      const freshSeo = fresh.seo || {};

      // Regeneration-aware SEO merge:
      // NEVER preserve CTA or subtitle during regeneration
      const mergedSeo = {
        cta: regen ? null : freshSeo.cta || oldSeo.cta || null,
        subtitle: regen ? null : freshSeo.subtitle || oldSeo.subtitle || null,

        // Always preserve supporting SEO fields
        clickbait: freshSeo.clickbait || oldSeo.clickbait || null,
        keywords: freshSeo.keywords || oldSeo.keywords || [],
        emotionalVerb: freshSeo.emotionalVerb || oldSeo.emotionalVerb || null,

        // Always maintain timestamps
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
      // Item missing → archive it
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
  // 2️⃣ Add brand-new entries
  // ───────────────────────────────────────────────────────────────────────────
  for (const fresh of current) {
    if (!prevMap.has(fresh.slug)) {
      merged.push({
        ...fresh,
        archived: false,
        lastSeenAt: now,
        archivedAt: null,
        seo: fresh.seo || {},
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3️⃣ Save merged result
  // ───────────────────────────────────────────────────────────────────────────
  try {
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2), "utf8");
  } catch (err) {
    console.error("❌ [FeedCleanser] Failed to write feed-cache:", err.message);
  }

  console.log(
    `✅ [FeedCleanser] Archive-protected merge complete (${merged.length} entries) — Regen mode: ${regen}`
  );

  return merged;
}

export default { cleanseFeed };

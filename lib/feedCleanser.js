// /lib/feedCleanser.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Feed Cleanser v1.0 “Archive Guardian”
//
// Purpose:
// Compares current normalized feed against previous saved cache.
// Flags missing products as archived while preserving SEO data and timestamps.
// Ensures full historical integrity for Insight and CTA Evolver learning.
//
// Integration: Run after normalizeFeed() but before enrichDeals().
//
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

export function cleanseFeed(current = []) {
  if (!fs.existsSync(FEED_PATH)) {
    console.warn("⚠️ [FeedCleanser] No previous feed-cache found. Creating fresh.");
    fs.writeFileSync(FEED_PATH, JSON.stringify(current, null, 2), "utf8");
    return current;
  }

  const prev = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
  const now = new Date().toISOString();

  const currentSlugs = new Set(current.map((d) => d.slug));
  const merged = [];

  // 1️⃣ Preserve or update existing entries
  for (const old of prev) {
    const found = current.find((c) => c.slug === old.slug);
    if (found) {
      merged.push({
        ...found,
        archived: false,
        lastSeenAt: now,
        seo: {
          ...(old.seo || {}),
          ...(found.seo || {}),
        },
      });
    } else {
      merged.push({
        ...old,
        archived: true,
        archivedAt: old.archivedAt || now,
      });
    }
  }

  // 2️⃣ Add any brand-new entries
  for (const fresh of current) {
    if (!prev.find((p) => p.slug === fresh.slug)) {
      merged.push({
        ...fresh,
        archived: false,
        lastSeenAt: now,
      });
    }
  }

  // 3️⃣ Save merged dataset
  fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2), "utf8");
  console.log(
    `✅ [FeedCleanser] Feed merged with archive protection (${merged.length} entries total)`
  );

  return merged;
}

export default { cleanseFeed };

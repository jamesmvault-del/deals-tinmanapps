// /lib/proxyCache.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — ProxyCache v5.0
// “Referential Consistency • Deterministic Category Integrity Edition”
//
// PURPOSE:
// • Ensures all category silos (appsumo-*.json) always exist
// • Ensures feed-cache.json always exists + always valid JSON
// • Provides deterministic in-memory cache for master-cron + insight engine
// • NEVER fetches external data
// • NEVER merges or mutates SEO
// • Compatible with strict Render ESM loader
//
// This is a pure integrity shield. Nothing more, nothing less.
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../data");
const FEED_CACHE_PATH = path.join(DATA_DIR, "feed-cache.json");

// MUST MATCH updateFeed.js category output exactly
const CATEGORY_FILES = [
  "appsumo-ai.json",
  "appsumo-marketing.json",
  "appsumo-productivity.json",
  "appsumo-software.json",
  "appsumo-courses.json",
  "appsumo-business.json",
  "appsumo-web.json",
  "appsumo-ecommerce.json",
  "appsumo-creative.json",
];

// Shared in-memory cache for rankingEngine, insights, etc.
export const CACHE = {
  fetchedAt: null,
  categories: {},
  meta: {
    totalDeals: 0,
    lastRefreshStatus: null,
    prevCounts: {},
    prevKeywords: {}
  }
};

// ───────────────────────────────────────────────────────────────────────────────
// Safe JSON loader (never throws)
// ───────────────────────────────────────────────────────────────────────────────
function safeReadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Ensures category silo exists and is valid JSON array
// ───────────────────────────────────────────────────────────────────────────────
function ensureValidSilo(filename) {
  const full = path.join(DATA_DIR, filename);

  // Missing silo → create empty
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, "[]", "utf8");
    console.log(`⚠️ [ProxyCache] Missing silo repaired: ${filename}`);
    return [];
  }

  const parsed = safeReadJSON(full);

  // Corrupt silo → wipe to []
  if (!Array.isArray(parsed)) {
    fs.writeFileSync(full, "[]", "utf8");
    console.log(`⚠️ [ProxyCache] Corrupt silo repaired: ${filename}`);
    return [];
  }

  return parsed;
}

// ───────────────────────────────────────────────────────────────────────────────
// backgroundRefresh()
// Pure integrity validation — never modifies SEO, CTA, or categories
// Called on every master-cron execution
// ───────────────────────────────────────────────────────────────────────────────
export async function backgroundRefresh() {
  console.log("🔍 [ProxyCache] Running background integrity sync…");

  try {
    let total = 0;
    const categoryMap = {};

    // Validate ALL category silo files
    for (const file of CATEGORY_FILES) {
      const name = file.replace("appsumo-", "").replace(".json", "");
      const contents = ensureValidSilo(file);
      categoryMap[name] = contents;
      total += contents.length;
    }

    // Validate feed-cache.json
    if (!fs.existsSync(FEED_CACHE_PATH)) {
      fs.writeFileSync(FEED_CACHE_PATH, "[]", "utf8");
      console.log("⚠️ [ProxyCache] feed-cache.json missing → baseline created.");
    } else {
      const parsed = safeReadJSON(FEED_CACHE_PATH);
      if (!Array.isArray(parsed)) {
        fs.writeFileSync(FEED_CACHE_PATH, "[]", "utf8");
        console.log("⚠️ [ProxyCache] feed-cache.json corrupt → repaired.");
      }
    }

    // Assign in-memory cache
    CACHE.categories = categoryMap;
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.totalDeals = total;
    CACHE.meta.lastRefreshStatus = "ok";

    console.log(`✅ [ProxyCache] Integrity sync complete (${total} entries)`);

    return { status: "ok", totalEntries: total };
  } catch (err) {
    console.error("❌ [ProxyCache] Integrity sync error:", err.message);
    CACHE.meta.lastRefreshStatus = `error: ${err.message}`;
    return { status: "error", message: err.message };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Manual refresh passthrough
// ───────────────────────────────────────────────────────────────────────────────
export async function manualRefresh() {
  const base = await backgroundRefresh();
  return { status: "manual refresh complete", ...base };
}

// Dual export for Render strict ESM loader
export default {
  CACHE,
  backgroundRefresh,
  manualRefresh,
};

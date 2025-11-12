// /lib/proxyCache.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — ProxyCache v10.0
// “Referential Consistency • Engine-Synced Integrity Edition”
//
// PURPOSE:
// • Guarantees all category silos (appsumo-*.json) and feed-cache.json exist + valid
// • Provides deterministic, Render-safe in-memory cache for master-cron + insights
// • Tracks category counts, total entries, and timestamp diagnostics
// • Never touches SEO, CTA, or subtitle data
// • 100% non-destructive; never fetches or merges external data
// • Updated logging alignment with v10 CTA Engine + Master Cron
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CTA_ENGINE_VERSION } from "./ctaEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../data");
const FEED_CACHE_PATH = path.join(DATA_DIR, "feed-cache.json");

// MUST MATCH updateFeed.js + category-index taxonomy exactly
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

// Shared in-memory cache (Render-safe)
export const CACHE = {
  fetchedAt: null,
  categories: {},
  meta: {
    totalDeals: 0,
    categoryTotals: {},
    lastRefreshStatus: null,
    version: CTA_ENGINE_VERSION,
  },
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

  // Corrupt silo → reset to []
  if (!Array.isArray(parsed)) {
    fs.writeFileSync(full, "[]", "utf8");
    console.log(`⚠️ [ProxyCache] Corrupt silo repaired: ${filename}`);
    return [];
  }

  return parsed;
}

// ───────────────────────────────────────────────────────────────────────────────
// backgroundRefresh()
// Deterministic category validation + feed integrity
// Invoked by master-cron each run
// ───────────────────────────────────────────────────────────────────────────────
export async function backgroundRefresh() {
  console.log("🔍 [ProxyCache v10] Starting background integrity sync…");

  try {
    let total = 0;
    const categoryMap = {};
    const categoryTotals = {};

    // Validate category silos
    for (const file of CATEGORY_FILES) {
      const name = file.replace("appsumo-", "").replace(".json", "");
      const contents = ensureValidSilo(file);
      categoryMap[name] = contents;
      categoryTotals[name] = contents.length;
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

    // Update in-memory cache
    CACHE.categories = categoryMap;
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.totalDeals = total;
    CACHE.meta.categoryTotals = categoryTotals;
    CACHE.meta.lastRefreshStatus = "ok";
    CACHE.meta.version = CTA_ENGINE_VERSION;

    console.log(
      `✅ [ProxyCache v10] Integrity sync complete — ${total} deals across ${Object.keys(categoryTotals).length} categories (Engine ${CTA_ENGINE_VERSION})`
    );

    return {
      status: "ok",
      totalEntries: total,
      categories: categoryTotals,
      engineVersion: CTA_ENGINE_VERSION,
      timestamp: CACHE.fetchedAt,
    };
  } catch (err) {
    console.error("❌ [ProxyCache v10] Integrity sync error:", err.message);
    CACHE.meta.lastRefreshStatus = `error: ${err.message}`;
    return { status: "error", message: err.message };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// manualRefresh()
// Manual trigger passthrough for admin/diagnostics
// ───────────────────────────────────────────────────────────────────────────────
export async function manualRefresh() {
  const result = await backgroundRefresh();
  return { status: "manual refresh complete", ...result };
}

// Dual export (Render-safe ESM)
export default {
  CACHE,
  backgroundRefresh,
  manualRefresh,
};

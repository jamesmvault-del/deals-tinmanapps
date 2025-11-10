// /lib/proxyCache.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — ProxyCache v4.1 “Deterministic Export-Stable Edition”
//
// PURPOSE:
// • Ensures ALL category silos always exist (appsumo-*.json)
// • Ensures feed-cache.json always exists & is valid JSON
// • ZERO external calls — all data comes from updateFeed.js
// • Provides a deterministic local cache layer for master-cron & insight.js
// • Exports both named + default exports to satisfy strict Render ESM loader
//
// NOTE: This is an internal stability layer. No fetching, no merging,
// no CTA work. Pure integrity enforcement only.
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../data");
const FEED_CACHE_PATH = path.join(DATA_DIR, "feed-cache.json");

// ✅ Category silo names (must match updateFeed.js output)
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

// ✅ Shared in-memory cache (used by insight.js, rankingEngine, category pages)
export const CACHE = {
  fetchedAt: null,
  categories: {},        // { ai: [...], marketing: [...], ... }
  meta: {
    totalDeals: 0,
    lastRefreshStatus: null,
    prevCounts: {},
    prevKeywords: {}
  }
};

// ───────────────────────────────────────────────────────────────────────────────
// Safe JSON loader
// ───────────────────────────────────────────────────────────────────────────────
function safeRead(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Ensure silo exists & valid
// ───────────────────────────────────────────────────────────────────────────────
function ensureValidSilo(filename) {
  const full = path.join(DATA_DIR, filename);

  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, "[]");
    console.log(`⚠️ [ProxyCache] Missing category silo repaired: ${filename}`);
    return [];
  }

  const parsed = safeRead(full);
  if (!Array.isArray(parsed)) {
    fs.writeFileSync(full, "[]");
    console.log(`⚠️ [ProxyCache] Corrupt category silo repaired: ${filename}`);
    return [];
  }

  return parsed;
}

// ───────────────────────────────────────────────────────────────────────────────
// backgroundRefresh()
// Pure integrity validator. Never fetches. Never merges. Never deletes.
// Called by master-cron.js.
// ───────────────────────────────────────────────────────────────────────────────
export async function backgroundRefresh() {
  console.log("🔍 [ProxyCache] Running background integrity sync…");

  try {
    let total = 0;
    const cats = {};

    // ✅ Validate all category silos
    for (const file of CATEGORY_FILES) {
      const name = file.replace("appsumo-", "").replace(".json", "");
      const data = ensureValidSilo(file);
      cats[name] = data;
      total += data.length;
    }

    // ✅ Ensure feed-cache.json exists & valid
    if (!fs.existsSync(FEED_CACHE_PATH)) {
      fs.writeFileSync(FEED_CACHE_PATH, "[]");
      console.log("⚠️ [ProxyCache] feed-cache.json missing → created baseline.");
    } else {
      const parsed = safeRead(FEED_CACHE_PATH);
      if (!Array.isArray(parsed)) {
        fs.writeFileSync(FEED_CACHE_PATH, "[]");
        console.log("⚠️ [ProxyCache] feed-cache.json corrupt → repaired.");
      }
    }

    // ✅ Populate shared memory cache
    CACHE.categories = cats;
    CACHE.fetchedAt = new Date().toISOString();
    CACHE.meta.totalDeals = total;
    CACHE.meta.lastRefreshStatus = "ok";

    console.log(`✅ [ProxyCache] Integrity sync complete (${total} entries)`);

    return { status: "ok", totalEntries: total };
  } catch (err) {
    console.error("❌ [ProxyCache] Integrity sync error:", err);
    CACHE.meta.lastRefreshStatus = `error: ${err.message}`;
    return { status: "error", message: err.message };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Manual refresh passthrough
// ───────────────────────────────────────────────────────────────────────────────
export async function manualRefresh() {
  const out = await backgroundRefresh();
  return { status: "manual refresh complete", ...out };
}

// ✅ Dual export for maximum compatibility with Render’s strict ESM
export default {
  CACHE,
  backgroundRefresh,
  manualRefresh
};

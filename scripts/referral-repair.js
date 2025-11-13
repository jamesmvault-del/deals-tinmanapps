/**
 * /scripts/referral-repair.js
 * TinmanApps — Referral Repair Engine v2.0
 * “Zero Raw URLs • Absolute Referral Purity • Deterministic Self-Healing”
 * ───────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 *   Enforces TOTAL REFERRAL HYGIENE inside referral-map.json:
 *
 *   Repairs:
 *     • malformed or unsafe slug
 *     • missing/unsafe/malformed category
 *     • missing/malformed sourceUrl
 *     • ANY masked URL not equal to REF_PREFIX + encodeURIComponent(sourceUrl)
 *     • ANY trackPath not strictly internal (/api/track?... only)
 *     • forbids ANY external link in trackPath or masked
 *     • cleans archived → boolean
 *
 *   ZERO raw external URLs survive this pass.
 *   100% offline, deterministic, safe for Render cron.
 *
 * OUTPUT
 *   Writes to:
 *       /data/referral-map.json
 *       /data/referral-map-prev.json
 * ───────────────────────────────────────────────────────────────────────────────
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

const MAP_FILE = path.join(DATA_DIR, "referral-map.json");
const PREV_FILE = path.join(DATA_DIR, "referral-map-prev.json");

// Safe static referral prefix
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// Allowed categories (deterministic, lower-case)
const VALID_CATS = new Set([
  "ai",
  "marketing",
  "courses",
  "productivity",
  "business",
  "web",
  "ecommerce",
  "creative",
  "software",
]);

// Utility
function loadJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

function normaliseSlug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function trackPathFor(slug, cat) {
  return `/api/track?deal=${encodeURIComponent(slug)}&cat=${encodeURIComponent(cat)}`;
}

function maskedUrlFor(url) {
  return REF_PREFIX + encodeURIComponent(url || "");
}

// Safety checkers
function isInternalTrackPath(v = "") {
  return typeof v === "string" && v.startsWith("/api/track");
}

function isExternal(v = "") {
  return /^https?:\/\//i.test(v);
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

(function main() {
  console.log("────────────────────────────────────────────────────────");
  console.log(" TinmanApps — Referral Repair Engine v2.0");
  console.log("────────────────────────────────────────────────────────\n");

  const map = loadJsonSafe(MAP_FILE);
  if (!map) {
    console.error("❌ ERROR: referral-map.json not found.");
    process.exit(1);
  }

  const repaired = { items: {} };
  const items = map.items || {};

  let repairCount = 0;
  const itemCount = Object.keys(items).length;

  for (const [rawSlug, entry] of Object.entries(items)) {
    const fixed = { ...entry };

    // 1. Slug normalisation
    const cleanSlug = normaliseSlug(rawSlug);
    if (cleanSlug !== rawSlug) repairCount++;

    // 2. Category validation
    let cat = String(fixed.category || "").toLowerCase().trim();
    if (!VALID_CATS.has(cat)) {
      cat = "software";
      fixed.category = cat;
      repairCount++;
    } else {
      fixed.category = cat;
    }

    // 3. sourceUrl sanity (raw URL allowed ONLY here)
    //    If malformed or unsafe, we null it (do not guess)
    const src = isNonEmptyString(fixed.sourceUrl) ? fixed.sourceUrl.trim() : "";
    if (!src || !isExternal(src)) {
      // We accept only real external product URLs as sourceUrl
      fixed.sourceUrl = "";
      repairCount++;
    }

    // 4. masked URL (must ALWAYS be correctly generated)
    const correctMasked = maskedUrlFor(fixed.sourceUrl || "");
    if (fixed.masked !== correctMasked) {
      fixed.masked = correctMasked;
      repairCount++;
    }

    // 5. trackPath (must ALWAYS be internal + correct)
    const correctTrack = trackPathFor(cleanSlug, cat);
    if (!isInternalTrackPath(fixed.trackPath) || fixed.trackPath !== correctTrack) {
      fixed.trackPath = correctTrack;
      repairCount++;
    }

    // 6. Hard block ANY raw affiliate URLs
    // (We never store them directly in masked/track inside the map)
    if (isExternal(fixed.masked) && !fixed.masked.startsWith(REF_PREFIX)) {
      fixed.masked = correctMasked;
      repairCount++;
    }
    if (isExternal(fixed.trackPath)) {
      fixed.trackPath = correctTrack;
      repairCount++;
    }

    // 7. archived sanity
    if (typeof fixed.archived !== "boolean") {
      fixed.archived = false;
      repairCount++;
    }

    repaired.items[cleanSlug] = fixed;
  }

  // Save repaired map + snapshot
  saveJson(MAP_FILE, repaired);
  saveJson(PREV_FILE, repaired);

  console.log("✅ Referral Repair complete.");
  console.log(`🛠️ Items repaired: ${repairCount}`);
  console.log(`📦 Total items:   ${itemCount}`);
  console.log("📌 referral-map.json updated.");
  console.log("📌 referral-map-prev.json updated.\n");
})();

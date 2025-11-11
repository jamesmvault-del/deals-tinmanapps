/**
 * /scripts/referral-repair.js
 * TinmanApps — Referral Repair Engine v1.0
 * “Self-Healing • Auto-Normalisation • Referral Continuity Guard”
 * ───────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 *   Ensures referral-map.json stays internally correct:
 *
 *   Repairs:
 *     • missing slug
 *     • malformed slug (uppercases, spaces, bad chars)
 *     • missing masked URL
 *     • missing or malformed trackPath
 *     • missing category
 *     • missing sourceUrl
 *     • inconsistent archived flags
 *
 *   NEVER calls external URLs — fully offline and deterministic.
 *
 * OUTPUT
 *   Writes a repaired map to:
 *       /data/referral-map.json
 *
 *   And updates previous snapshot at:
 *       /data/referral-map-prev.json
 *
 * HOW TO RUN
 *   node scripts/referral-repair.js
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

// Referral prefix (static, encoded later)
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

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
    .trim()
    .replace(/\s+/g, "-");
}

function trackPathFor(slug, cat) {
  return `/api/track?deal=${encodeURIComponent(slug)}&cat=${encodeURIComponent(cat)}`;
}

function maskedUrlFor(url) {
  return REF_PREFIX + encodeURIComponent(url || "");
}

(function main() {
  console.log("────────────────────────────────────────────────────────");
  console.log(" TinmanApps — Referral Repair Engine v1.0");
  console.log("────────────────────────────────────────────────────────\n");

  const map = loadJsonSafe(MAP_FILE);
  if (!map) {
    console.error("❌ ERROR: referral-map.json not found.");
    process.exit(1);
  }

  const repaired = { items: {} };
  const items = map.items || {};

  let repairCount = 0;
  let itemCount = Object.keys(items).length;

  for (const [rawSlug, entry] of Object.entries(items)) {
    const fixed = { ...entry };

    // 1. Normalise slug
    const cleanSlug = normaliseSlug(rawSlug);
    if (cleanSlug !== rawSlug) {
      repairCount++;
    }

    // 2. Ensure category
    if (!fixed.category) {
      fixed.category = "software"; // deterministic fallback
      repairCount++;
    }

    // 3. Ensure sourceUrl
    if (!fixed.sourceUrl) {
      fixed.sourceUrl = "";
      repairCount++;
    }

    // 4. Masked URL (always built from sourceUrl)
    const correctMasked = maskedUrlFor(fixed.sourceUrl);
    if (fixed.masked !== correctMasked) {
      fixed.masked = correctMasked;
      repairCount++;
    }

    // 5. trackPath
    const correctTrack = trackPathFor(cleanSlug, fixed.category);
    if (fixed.trackPath !== correctTrack) {
      fixed.trackPath = correctTrack;
      repairCount++;
    }

    // 6. archived should be boolean
    if (typeof fixed.archived !== "boolean") {
      fixed.archived = false;
      repairCount++;
    }

    repaired.items[cleanSlug] = fixed;
  }

  // Write repaired map
  saveJson(MAP_FILE, repaired);

  // Update snapshot
  saveJson(PREV_FILE, repaired);

  console.log("✅ Repair completed.");
  console.log(`🛠️ Items repaired: ${repairCount}`);
  console.log(`📦 Total items:   ${itemCount}`);
  console.log("✅ referral-map.json updated.");
  console.log("✅ referral-map-prev.json updated.\n");
})();

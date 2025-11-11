/**
 * /scripts/referral-check.js
 * TinmanApps — Referral Integrity Auditor v1.0
 * “Source-of-Truth Validation • Deterministic • Zero-Network Mode”
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES
 * • Reads referral-map.json (built via referral-map.js)
 * • Validates internal consistency for every deal:
 *     - slug structure
 *     - category validity
 *     - masked referral URL structure
 *     - /api/track link integrity
 *     - archived vs active correctness
 * • Emits a full integrity report to STDOUT
 *
 * WHY
 * • Ensures your referral ecosystem remains PURE + RELIABLE
 * • Prevents silent failures, malformed slugs, broken track paths
 *
 * HOW TO USE
 *   node scripts/referral-check.js
 *
 * REQUIRED FILES
 *   /data/referral-map.json   (created by referral-map.js)
 *
 * ZERO EXTERNAL CALLS — completely offline.
 * ───────────────────────────────────────────────────────────────────────────────
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ───────────────────────────────────────────────────────────────────────────────
// Paths
// ───────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const REF_MAP_FILE = path.join(DATA_DIR, "referral-map.json");

// ───────────────────────────────────────────────────────────────────────────────
// Config (must match system-wide values)
// ───────────────────────────────────────────────────────────────────────────────
const VALID_CATEGORIES = new Set([
  "ai",
  "marketing",
  "productivity",
  "software",
  "courses",
  "business",
  "web",
  "ecommerce",
  "creative",
]);

// ───────────────────────────────────────────────────────────────────────────────
// Utility
// ───────────────────────────────────────────────────────────────────────────────
function loadJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function isValidSlug(s) {
  return /^[a-z0-9-]{2,100}$/i.test(String(s).trim());
}

function isValidUrl(u) {
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

function checkTrackPath(tp) {
  if (!tp) return false;
  try {
    const u = new URL(tp);
    return (
      u.searchParams.has("deal") &&
      u.searchParams.has("cat") &&
      u.searchParams.has("redirect")
    );
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN
// ───────────────────────────────────────────────────────────────────────────────
(function main() {
  console.log("────────────────────────────────────────────────────────");
  console.log(" TinmanApps — Referral Integrity Auditor v1.0");
  console.log("────────────────────────────────────────────────────────");

  // Load map
  const map = loadJsonSafe(REF_MAP_FILE);
  if (!map) {
    console.error(`❌ ERROR: referral-map.json not found at ${REF_MAP_FILE}`);
    console.error(`   Run: node scripts/referral-map.js`);
    process.exit(1);
  }

  const items = map.items || {};
  const slugs = Object.keys(items);

  console.log(`Loaded referral-map.json`);
  console.log(`Total deals found: ${slugs.length}`);
  console.log("────────────────────────────────────────────────────────\n");

  const warnings = [];
  let ok = 0;

  // CHECK EACH ENTRY
  for (const slug of slugs) {
    const d = items[slug];
    const tag = `[${slug}]`;

    // 1. Slug validity
    if (!isValidSlug(slug)) {
      warnings.push(`${tag} ⚠️ Invalid slug format`);
    }

    // 2. Category match
    if (!VALID_CATEGORIES.has(d.category)) {
      warnings.push(`${tag} ⚠️ Invalid category: ${d.category}`);
    }

    // 3. Source URL
    if (!isValidUrl(d.sourceUrl)) {
      warnings.push(`${tag} ⚠️ Invalid sourceUrl: ${d.sourceUrl}`);
    }

    // 4. Masked URL
    if (!isValidUrl(d.masked)) {
      warnings.push(`${tag} ⚠️ Invalid masked URL: ${d.masked}`);
    } else if (!String(d.masked).startsWith(map.refPrefix)) {
      warnings.push(`${tag} ⚠️ Masked URL prefix mismatch`);
    }

    // 5. Track URL
    if (!checkTrackPath(d.trackPath)) {
      warnings.push(`${tag} ⚠️ Malformed trackPath: ${d.trackPath}`);
    }

    // 6. Active/Archived sanity check
    if (d.archived !== true && d.archived !== false) {
      warnings.push(`${tag} ⚠️ archived field is not boolean`);
    }

    // Everything OK?
    if (warnings.length === 0) ok++;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OUTPUT RESULTS
  // ─────────────────────────────────────────────────────────────────────────────

  if (warnings.length === 0) {
    console.log("✅ ALL GOOD — Referral ecosystem is perfect ✅");
    console.log(`Deals validated: ${slugs.length}`);
  } else {
    console.log(`⚠️ Integrity warnings: ${warnings.length}`);
    console.log("────────────────────────────────────────────────────────");
    for (const w of warnings) console.log(w);
    console.log("────────────────────────────────────────────────────────");
  }

  console.log("\nSummary:");
  console.log(`✅ Passed: ${ok}`);
  console.log(`⚠️ With warnings: ${warnings.length}`);
  console.log(`🧮 Total deals validated: ${slugs.length}`);
  console.log("────────────────────────────────────────────────────────");

  process.exit(0);
})();

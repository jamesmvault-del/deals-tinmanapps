/**
 * /scripts/referral-diff.js
 * TinmanApps — Referral Diff Engine v1.0
 * “Change Detection • Referral Integrity Monitor • Zero-Network Mode”
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES
 * • Compares the NEW referral-map.json against the PREVIOUS snapshot
 *   stored at: /data/referral-map-prev.json
 *
 * • Detects:
 *     - new deals added
 *     - deals removed
 *     - category changes
 *     - masked URL changes
 *     - sourceUrl changes
 *     - trackPath changes
 *     - archived/unarchived transitions
 *
 * • Produces a full diff report in STDOUT
 *
 * HOW TO USE
 *   node scripts/referral-diff.js
 *
 * IMPORTANT
 *   After running referral-map.js, the new map overwrites referral-map.json.
 *   referral-diff.js compares that to referral-map-prev.json.
 *
 *   After a clean diff, referral-map-prev.json is auto-updated.
 *
 * ZERO NETWORK — This never checks live AppSumo links.
 * COMPLETELY OFFLINE — deterministic and safe.
 * ───────────────────────────────────────────────────────────────────────────────
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");

const NEW_MAP = path.join(DATA_DIR, "referral-map.json");
const PREV_MAP = path.join(DATA_DIR, "referral-map-prev.json");

// Utilities
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

// Main
(function main() {
  console.log("────────────────────────────────────────────────────────");
  console.log(" TinmanApps — Referral Diff Engine v1.0");
  console.log("────────────────────────────────────────────────────────\n");

  const newMap = loadJsonSafe(NEW_MAP);
  if (!newMap) {
    console.error("❌ ERROR: referral-map.json not found.");
    process.exit(1);
  }

  let prevMap = loadJsonSafe(PREV_MAP);

  // If no previous map exists, create one and exit clean
  if (!prevMap) {
    console.log("⚠️ No previous map found — creating baseline snapshot…");
    saveJson(PREV_MAP, newMap);
    console.log("✅ referral-map-prev.json baseline created.");
    process.exit(0);
  }

  const newItems = newMap.items || {};
  const prevItems = prevMap.items || {};

  const newSlugs = new Set(Object.keys(newItems));
  const prevSlugs = new Set(Object.keys(prevItems));

  const added = [];
  const removed = [];
  const changed = [];

  // Detect added
  for (const slug of newSlugs) {
    if (!prevSlugs.has(slug)) added.push(slug);
  }

  // Detect removed
  for (const slug of prevSlugs) {
    if (!newSlugs.has(slug)) removed.push(slug);
  }

  // Detect property changes
  for (const slug of newSlugs) {
    if (!prevSlugs.has(slug)) continue;

    const a = newItems[slug];
    const b = prevItems[slug];

    const diffs = {};

    if (a.category !== b.category) diffs.category = [b.category, a.category];
    if (a.sourceUrl !== b.sourceUrl) diffs.sourceUrl = [b.sourceUrl, a.sourceUrl];
    if (a.masked !== b.masked) diffs.masked = [b.masked, a.masked];
    if (a.trackPath !== b.trackPath) diffs.trackPath = [b.trackPath, a.trackPath];
    if (a.archived !== b.archived) diffs.archived = [b.archived, a.archived];

    if (Object.keys(diffs).length > 0) {
      changed.push({ slug, diffs });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRINT RESULTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("✅ Diff Results");
  console.log("────────────────────────────────────────────────────────");

  console.log(`New items added: ${added.length}`);
  if (added.length) {
    for (const s of added) console.log(`  ➕ ${s}`);
    console.log("");
  }

  console.log(`Items removed: ${removed.length}`);
  if (removed.length) {
    for (const s of removed) console.log(`  ➖ ${s}`);
    console.log("");
  }

  console.log(`Items changed: ${changed.length}`);
  if (changed.length) {
    for (const { slug, diffs } of changed) {
      console.log(`  🔄 ${slug}`);
      for (const [key, [oldV, newV]] of Object.entries(diffs)) {
        console.log(`     ${key}:`);
        console.log(`       old → ${oldV}`);
        console.log(`       new → ${newV}`);
      }
    }
    console.log("");
  }

  // Summary
  console.log("────────────────────────────────────────────────────────");
  console.log("Summary:");
  console.log(`🆕 Added:   ${added.length}`);
  console.log(`🗑️ Removed: ${removed.length}`);
  console.log(`🔄 Changed: ${changed.length}`);
  console.log(`🧮 Total:   ${Object.keys(newItems).length}`);
  console.log("────────────────────────────────────────────────────────\n");

  // Update snapshot
  saveJson(PREV_MAP, newMap);
  console.log("✅ referral-map-prev.json updated to current snapshot.");
})();

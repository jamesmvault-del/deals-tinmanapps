/**
 * /scripts/referral-repair.js
 * TinmanApps — Referral Repair Engine v3.1
 * “Canonical Slug • Zero Raw Product URLs • Deterministic Self-Healing”
 * ───────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 *   Enforces TOTAL REFERRAL HYGIENE inside referral-map.json:
 *
 *   Repairs:
 *     • malformed or unsafe slug (canonical NFKD slug, identical to referral-map.js)
 *     • missing/unsafe/malformed category
 *     • missing/malformed sourceUrl (raw product URL allowed ONLY here)
 *     • ANY masked URL not equal to REF_PREFIX + encodeURIComponent(sourceUrl)
 *     • ANY trackPath not strictly internal via SITE_ORIGIN + /api/track
 *       (deal, cat, redirect={masked})
 *     • forbids ANY raw product URLs in masked or trackPath
 *     • enforces that entries with missing sourceUrl are archived and non-routable
 *     • cleans archived → boolean
 *
 *   ZERO raw product URLs survive this pass outside sourceUrl.
 *   ZERO invalid masked/trackPath chains survive (fallback chains rebuilt).
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

// Env-aligned origins
const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

// Safe static referral prefix (AppSumo Impact masked base)
const REF_PREFIX =
  process.env.REF_PREFIX || "https://appsumo.8odi.net/9L0P95?u=";

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

// Canonical slug — MUST MATCH referral-map.js / feedNormalizer.js
function canonicalSlug(s = "") {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .trim();
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

function isExternal(v = "") {
  return /^https?:\/\//i.test(String(v || ""));
}

// trackPath is considered “internal” if it is either:
//   • absolute:  `${SITE_ORIGIN}/api/track?...`
//   • legacy:    `/api/track?...`
function isInternalTrackPath(v = "") {
  if (!isNonEmptyString(v)) return false;
  const val = String(v).trim();
  if (val.startsWith("/api/track")) return true;
  if (val.startsWith(SITE_ORIGIN + "/api/track")) return true;
  return false;
}

// For masked URLs, we ONLY ever allow REF_PREFIX + encodeURIComponent(sourceUrl).
// If no valid sourceUrl, we return an empty string and let the entry be archived and non-routable.
function maskedUrlFor(url) {
  if (!isNonEmptyString(url)) return "";
  return REF_PREFIX + encodeURIComponent(url || "");
}

// Canonical trackPath builder aligned with referral-map v3.1.
// If masked is empty, we do not build a track path at all (non-routable archived entry).
function trackPathFor(slug, cat, masked) {
  if (!isNonEmptyString(masked)) return "";
  const s = encodeURIComponent(slug || "");
  const c = encodeURIComponent(cat || "software");
  const redirect = encodeURIComponent(masked || "");
  return `${SITE_ORIGIN}/api/track?deal=${s}&cat=${c}&redirect=${redirect}`;
}

// Hard guard: any URL that is not under REF_PREFIX is treated as “raw product”
// for the purposes of masked / trackPath fields.
function isRawProductUrl(v = "") {
  const val = String(v || "");
  if (!isExternal(val)) return false;
  // Allowed affiliate base for masked:
  if (val.startsWith(REF_PREFIX)) return false;
  return true;
}

(function main() {
  console.log("────────────────────────────────────────────────────────");
  console.log(" TinmanApps — Referral Repair Engine v3.1");
  console.log("────────────────────────────────────────────────────────\n");

  const map = loadJsonSafe(MAP_FILE);
  if (!map) {
    console.error("❌ ERROR: referral-map.json not found.");
    process.exit(1);
  }

  const repaired = { ...map, items: {} };
  const items = map.items || {};

  let repairCount = 0;
  let slugFixes = 0;
  let catFixes = 0;
  let sourceNullified = 0;
  let maskedRepaired = 0;
  let trackRepaired = 0;
  let rawUrlStripped = 0;
  let archivedFixed = 0;

  const itemEntries = Object.entries(items);
  const itemCount = itemEntries.length;

  // For recomputing aggregates
  const catSet = new Set();

  for (const [rawSlug, entry] of itemEntries) {
    const fixed = { ...entry };

    // 1. Slug normalisation (canonical global slug)
    const cleanSlug = canonicalSlug(rawSlug || fixed.slug || "");
    if (cleanSlug !== rawSlug) {
      slugFixes++;
      repairCount++;
    }

    // 2. Category validation
    let cat = String(fixed.category || "").toLowerCase().trim();
    if (!VALID_CATS.has(cat)) {
      cat = "software";
      catFixes++;
      repairCount++;
    }
    fixed.category = cat;
    catSet.add(cat);

    // 3. sourceUrl sanity (raw external product URL allowed ONLY here)
    //    If malformed, non-external, or clearly not HTTP(S), we null it (no guessing),
    //    and force the entry into archived + non-routable state.
    const rawSrc = isNonEmptyString(fixed.sourceUrl) ? fixed.sourceUrl.trim() : "";
    const srcIsExternal = isExternal(rawSrc);
    const sourceUrl = srcIsExternal ? rawSrc : "";

    if (sourceUrl !== fixed.sourceUrl) {
      fixed.sourceUrl = sourceUrl;
      sourceNullified++;
      repairCount++;
    }

    // If we *still* have no valid sourceUrl, this entry cannot safely route anywhere.
    // We hard-archive it and blank masked + trackPath so no broken chains survive.
    if (!isNonEmptyString(sourceUrl)) {
      if (fixed.masked || fixed.trackPath) {
        fixed.masked = "";
        fixed.trackPath = "";
        rawUrlStripped++;
        repairCount++;
      }
      if (fixed.archived !== true) {
        fixed.archived = true;
        archivedFixed++;
        repairCount++;
      }

      repaired.items[cleanSlug] = fixed;
      continue;
    }

    // 4. masked URL (must ALWAYS be REF_PREFIX + encodeURIComponent(sourceUrl))
    const correctMasked = maskedUrlFor(sourceUrl);
    if (fixed.masked !== correctMasked) {
      fixed.masked = correctMasked;
      maskedRepaired++;
      repairCount++;
    }

    // 5. trackPath (must ALWAYS be SITE_ORIGIN/api/track?deal=...&cat=...&redirect={masked})
    const correctTrack = trackPathFor(cleanSlug, cat, correctMasked);
    if (!isInternalTrackPath(fixed.trackPath) || fixed.trackPath !== correctTrack) {
      fixed.trackPath = correctTrack;
      trackRepaired++;
      repairCount++;
    }

    // 6. Hard block ANY raw product URLs from masked/trackPath
    if (isRawProductUrl(fixed.masked)) {
      fixed.masked = correctMasked;
      rawUrlStripped++;
      repairCount++;
    }
    if (isRawProductUrl(fixed.trackPath)) {
      fixed.trackPath = correctTrack;
      rawUrlStripped++;
      repairCount++;
    }

    // 7. archived sanity (ensure boolean; do not un-archive here)
    if (typeof fixed.archived !== "boolean") {
      fixed.archived = false;
      archivedFixed++;
      repairCount++;
    }

    repaired.items[cleanSlug] = fixed;
  }

  // Recompute top-level aggregates deterministically from repaired.items
  const repairedItems = repaired.items || {};
  const repairedSlugs = Object.keys(repairedItems);
  const total = repairedSlugs.length;

  let archivedCount = 0;
  for (const slug of repairedSlugs) {
    const item = repairedItems[slug];
    if (item.archived === true) archivedCount++;
    if (item.category) catSet.add(String(item.category).toLowerCase().trim());
  }
  const activeCount = total - archivedCount;

  repaired.total = total;
  repaired.categories = Array.from(catSet).sort((a, b) => a.localeCompare(b));
  repaired.generatedAt = new Date().toISOString();

  // Save repaired map + snapshot
  saveJson(MAP_FILE, repaired);
  saveJson(PREV_FILE, repaired);

  console.log("✅ Referral Repair complete.");
  console.log(`🛠️ Items scanned     : ${itemCount}`);
  console.log(`🛠️ Items total (post) : ${total}`);
  console.log(`🧱 Slug fixes         : ${slugFixes}`);
  console.log(`🧱 Category fixes     : ${catFixes}`);
  console.log(`🧱 Source nullified   : ${sourceNullified} (invalid/missing sourceUrl)`);
  console.log(`🧱 Masked repaired    : ${maskedRepaired}`);
  console.log(`🧱 TrackPath repaired : ${trackRepaired}`);
  console.log(`🧱 Raw URLs stripped  : ${rawUrlStripped} (from masked/trackPath)`);
  console.log(`🧱 Archived fixed     : ${archivedFixed}`);
  console.log(`📦 Active deals       : ${activeCount}`);
  console.log(`📦 Archived deals     : ${archivedCount}`);
  console.log("📌 referral-map.json updated.");
  console.log("📌 referral-map-prev.json updated.\n");
})();

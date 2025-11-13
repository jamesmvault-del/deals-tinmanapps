/**
 * /scripts/referral-repair.js
 * TinmanApps — Referral Repair Engine v3.0
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
 *     • cleans archived → boolean
 *
 *   ZERO raw product URLs survive this pass outside sourceUrl.
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

function maskedUrlFor(url) {
  return REF_PREFIX + encodeURIComponent(url || "");
}

// Canonical trackPath builder aligned with referral-map v3.0
function trackPathFor(slug, cat, masked) {
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
  console.log(" TinmanApps — Referral Repair Engine v3.0");
  console.log("────────────────────────────────────────────────────────\n");

  const map = loadJsonSafe(MAP_FILE);
  if (!map) {
    console.error("❌ ERROR: referral-map.json not found.");
    process.exit(1);
  }

  const repaired = { ...map, items: {} };
  const items = map.items || {};

  let repairCount = 0;
  const itemCount = Object.keys(items).length;

  for (const [rawSlug, entry] of Object.entries(items)) {
    const fixed = { ...entry };

    // 1. Slug normalisation (canonical global slug)
    const cleanSlug = canonicalSlug(rawSlug);
    if (cleanSlug !== rawSlug) repairCount++;

    // 2. Category validation
    let cat = String(fixed.category || "").toLowerCase().trim();
    if (!VALID_CATS.has(cat)) {
      cat = "software";
      repairCount++;
    }
    fixed.category = cat;

    // 3. sourceUrl sanity (raw external product URL allowed ONLY here)
    //    If malformed, non-external, or clearly not HTTP(S), we null it (no guessing).
    const rawSrc = isNonEmptyString(fixed.sourceUrl) ? fixed.sourceUrl.trim() : "";
    const srcIsExternal = isExternal(rawSrc);
    const sourceUrl = srcIsExternal ? rawSrc : "";
    if (sourceUrl !== fixed.sourceUrl) {
      fixed.sourceUrl = sourceUrl;
      repairCount++;
    }

    // 4. masked URL (must ALWAYS be REF_PREFIX + encodeURIComponent(sourceUrl))
    const correctMasked = maskedUrlFor(sourceUrl);
    if (fixed.masked !== correctMasked) {
      fixed.masked = correctMasked;
      repairCount++;
    }

    // 5. trackPath (must ALWAYS be SITE_ORIGIN/api/track?deal=...&cat=...&redirect={masked})
    const correctTrack = trackPathFor(cleanSlug, cat, correctMasked);
    if (!isInternalTrackPath(fixed.trackPath) || fixed.trackPath !== correctTrack) {
      fixed.trackPath = correctTrack;
      repairCount++;
    }

    // 6. Hard block ANY raw product URLs from masked/trackPath
    if (isRawProductUrl(fixed.masked)) {
      fixed.masked = correctMasked;
      repairCount++;
    }
    if (isRawProductUrl(fixed.trackPath)) {
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

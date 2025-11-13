/**
 * /scripts/referral-map.js
 * TinmanApps — Referral Map Builder v3.1
 * “Global Canonical Slug • Masked Integrity • Zero Raw Leakage”
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES
 * • Scans /data/appsumo-*.json silos (active + archived)
 * • Builds the canonical slug → referral map (sourceUrl → maskedUrl → trackPath)
 * • ALWAYS regenerates masked + trackPath from sourceUrl using REF_PREFIX + SITE_ORIGIN
 * • Uses the unified canonicalSlug() (NFKD, ASCII-safe) shared across the system
 * • Ensures trackPath uses ONLY canonical slugs and valid categories
 * • Deterministic ordering + Render-safe, idempotent on every run
 *
 * WHY
 * • 1:1 canonical source for referral resolution used by /api/track
 * • Prevent slug drift between updateFeed → normalizeFeed → referral-map → CTA engine
 *
 * GUARANTEES
 * • No raw URLs leak into any field except sourceUrl
 * • Slugs are canonical and stable across all pipelines
 * • Categories are canonical and constrained to VALID_CATS
 * • Deterministic build output even under malformed silo data
 *
 * HOW TO RUN
 *   node scripts/referral-map.js
 *
 * ENV
 *   SITE_URL   (optional) → e.g. https://deals.tinmanapps.com
 *   REF_PREFIX (optional) → affiliate base, e.g. https://appsumo.8odi.net/9L0P95?u=
 * ───────────────────────────────────────────────────────────────────────────────
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ───────────────────────────────────────────────
// Paths / Env
// ───────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const OUT_FILE = path.join(DATA_DIR, "referral-map.json");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

const REF_PREFIX =
  process.env.REF_PREFIX || "https://appsumo.8odi.net/9L0P95?u=";

// Allowed canonical categories aligned with whole system
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

// ───────────────────────────────────────────────
// Global Canonical Slug Normaliser
// (MUST MATCH unified slug logic used in updateFeed + feedNormalizer + referral-repair)
// ───────────────────────────────────────────────
function canonicalSlug(t = "") {
  return String(t || "")
    .toLowerCase()
    .normalize("NFKD") // handle diacritics
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .trim();
}

// Deterministic fallback hash
function hashStr(s = "") {
  let h = 0;
  const t = String(s);
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// Extract slug from URL, then canonicalise it
function slugFromUrl(u = "", fallback = "") {
  try {
    const m = String(u).match(/\/products\/([^/]+)\/?$/i);
    if (m) return canonicalSlug(m[1]);
  } catch {
    // ignore and fall through
  }

  const base = fallback || "";
  const s = canonicalSlug(base);
  return s || `deal-${hashStr(u)}`;
}

function readJsonSafe(file, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function listCategoryFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
}

// Only ever build masked URLs from sourceUrl — we NEVER trust existing masked fields
function maskedReferral(sourceUrl) {
  return REF_PREFIX + encodeURIComponent(sourceUrl || "");
}

// Only ever build trackPath from canonical slug + category + masked
function buildTrackPath({ slug, cat, masked }) {
  const redirect = encodeURIComponent(masked);
  const s = encodeURIComponent(slug);
  const c = encodeURIComponent(cat);
  return `${SITE_ORIGIN}/api/track?deal=${s}&cat=${c}&redirect=${redirect}`;
}

// Derive a canonical slug from silo entry + URL using unified rules
function deriveCanonicalSlug(entry, sourceUrl) {
  const fromSlug = entry.slug ? canonicalSlug(entry.slug) : "";
  const fromTitle = entry.title ? canonicalSlug(entry.title) : "";

  // Priority: existing slug → title → URL
  if (fromSlug) return fromSlug;
  if (fromTitle) return fromTitle;
  return slugFromUrl(sourceUrl);
}

// Canonicalise category against VALID_CATS
function canonicalCategory(entryCat, fileCat) {
  let category =
    (entryCat || fileCat || "software").toString().toLowerCase().trim();
  if (!VALID_CATS.has(category)) category = "software";
  return category;
}

// ───────────────────────────────────────────────
// MASTER BUILDER
// ───────────────────────────────────────────────
function buildReferralMap() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const files = listCategoryFiles();
  if (!files.length) {
    return {
      generatedAt: new Date().toISOString(),
      site: SITE_ORIGIN,
      refPrefix: REF_PREFIX,
      total: 0,
      categories: [],
      items: {},
      notes: "No silos present. Run updateFeed.js first.",
    };
  }

  const items = new Map();
  const catSet = new Set();

  for (const file of files) {
    const fileCat = file.replace("appsumo-", "").replace(".json", "");
    catSet.add(fileCat);

    const data = readJsonSafe(path.join(DATA_DIR, file), []);
    if (!Array.isArray(data)) continue;

    for (const d of data) {
      // We ONLY trust raw product URL fields here; any existing masked/trackPath
      // in the silo are ignored and rebuilt in this script.
      const sourceUrl = d.url || d.link || d.product_url || null;
      if (!sourceUrl) continue;

      // Canonical slug (global logic)
      const slug = deriveCanonicalSlug(d, sourceUrl);

      // Canonical category
      const category = canonicalCategory(d.category, fileCat);

      // ALWAYS rebuild masked + trackPath from sourceUrl + canonical slug/category
      const masked = maskedReferral(sourceUrl);
      const trackPath = buildTrackPath({ slug, cat: category, masked });

      const entry = {
        slug,
        category,
        sourceUrl,
        masked,
        trackPath,
        archived: !!d.archived,
        firstSeenAt: d.firstSeenAt || null,
        lastSeenAt: d.lastSeenAt || null,
        lastmodAt: d.lastmodAt || null,
      };

      // Resolve conflicts → latest lastSeenAt wins (deterministic, time-aware)
      if (items.has(slug)) {
        const prev = items.get(slug);
        const prevTime = prev.lastSeenAt ? Date.parse(prev.lastSeenAt) : 0;
        const currTime = entry.lastSeenAt ? Date.parse(entry.lastSeenAt) : 0;
        if (currTime >= prevTime) items.set(slug, entry);
      } else {
        items.set(slug, entry);
      }
    }
  }

  // Deterministic ordering by slug
  const ordered = Array

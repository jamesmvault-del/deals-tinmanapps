/**
 * /scripts/referral-map.js
 * TinmanApps — Referral Map Builder v2.0
 * “Canonical Slug Authority • Masked Integrity • Zero Raw Leakage”
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES
 * • Scans /data/appsumo-*.json silos (active + archived)
 * • Builds the canonical slug → referral map (sourceUrl → maskedUrl → trackPath)
 * • Enforces strict slug normalisation identical to feedNormalizer.js
 * • Ensures masked referral integrity (REF_PREFIX + encodeURIComponent(sourceUrl))
 * • Ensures trackPath uses ONLY canonical slugs
 * • Deterministic ordering + Render-safe
 * 
 * WHY
 * • 1:1 canonical source for referral resolution used by /api/track
 * • Prevent slug drift between updateFeed → normalizeFeed → referral-map
 * 
 * GUARANTEES
 * • No raw URLs leak into any field except sourceUrl
 * • Slugs are canonical and stable
 * • Deterministic build output
 * • Infallible even with malformed silo data
 * 
 * HOW TO RUN
 *   node scripts/referral-map.js
 * 
 * ENV
 *   SITE_URL (optional)  → e.g. https://deals.tinmanapps.com
 *   REF_PREFIX (optional)
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
  process.env.REF_PREFIX ||
  "https://appsumo.8odi.net/9L0P95?u=";

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
  "software"
]);

// ───────────────────────────────────────────────
// Canonical Slug Normaliser
// (MUST MATCH normalizeFeed.js EXACTLY)
// ───────────────────────────────────────────────
function canonicalSlug(t = "") {
  return String(t || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

// Deterministic fallback hash
function hashStr(s = "") {
  let h = 0;
  const t = String(s);
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// Extract slug from URL, canonicalise it after
function slugFromUrl(u = "", fallback = "") {
  try {
    const m = String(u).match(/\/products\/([^/]+)\/?$/i);
    if (m) return canonicalSlug(m[1]);
  } catch {}
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

function maskedReferral(sourceUrl) {
  return REF_PREFIX + encodeURIComponent(sourceUrl || "");
}

function buildTrackPath({ slug, cat, masked }) {
  const redirect = encodeURIComponent(masked);
  const s = encodeURIComponent(slug);
  const c = encodeURIComponent(cat);
  return `${SITE_ORIGIN}/api/track?deal=${s}&cat=${c}&redirect=${redirect}`;
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
      notes: "No silos present. Run updateFeed.js first."
    };
  }

  const items = new Map();
  const categories = [];

  for (const file of files) {
    const cat = file.replace("appsumo-", "").replace(".json", "");
    categories.push(cat);

    const data = readJsonSafe(path.join(DATA_DIR, file), []);
    if (!Array.isArray(data)) continue;

    for (const d of data) {
      const sourceUrl = d.url || d.link || d.product_url || null;
      if (!sourceUrl) continue;

      // Canonical slug ALWAYS wins
      const slugInput =
        d.slug ||
        (d.title ? d.title.toLowerCase().replace(/[^\w\s-]/g, "") : null) ||
        slugFromUrl(sourceUrl);

      const slug = canonicalSlug(slugInput) || slugFromUrl(sourceUrl);

      // Canonical category
      let category = (d.category || cat || "software").toLowerCase().trim();
      if (!VALID_CATS.has(category)) category = "software";

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
        lastmodAt: d.lastmodAt || null
      };

      // Resolve conflicts → latest lastSeenAt wins
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
  const ordered = Array.from(items.values()).sort((a, b) =>
    a.slug.localeCompare(b.slug)
  );

  const keyed = {};
  for (const row of ordered) keyed[row.slug] = row;

  return {
    generatedAt: new Date().toISOString(),
    site: SITE_ORIGIN,
    refPrefix: REF_PREFIX,
    total: ordered.length,
    categories: categories.sort((a, b) => a.localeCompare(b)),
    items: keyed
  };
}

// ───────────────────────────────────────────────
// MAIN
// ───────────────────────────────────────────────
(function main() {
  try {
    const map = buildReferralMap();
    fs.writeFileSync(OUT_FILE, JSON.stringify(map, null, 2), "utf8");

    const archived = Object.values(map.items).filter((x) => x.archived).length;
    const active = map.total - archived;

    console.log("────────────────────────────────────────────────────────");
    console.log(" Referral Map Builder v2.0 — Canonical Slug Authority");
    console.log("────────────────────────────────────────────────────────");
    console.log(` Output        : ${OUT_FILE}`);
    console.log(` SITE_URL      : ${SITE_ORIGIN}`);
    console.log(` REF_PREFIX    : ${REF_PREFIX}`);
    console.log(` Silos scanned : ${map.categories.length}`);
    console.log(` Deals total   : ${map.total}`);
    console.log(` ├─ active     : ${active}`);
    console.log(` └─ archived   : ${archived}`);
    console.log(" Status        : ✅ referral-map.json written");
    console.log("────────────────────────────────────────────────────────");
    process.exit(0);
  } catch (err) {
    console.error("❌ referral-map failed:", err?.message || err);
    process.exit(1);
  }
})();

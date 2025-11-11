/**
 * /scripts/referral-map.js
 * TinmanApps — Referral Map Builder v1.0
 * “Direct Masked Integrity • Deterministic • Render-Safe • Zero Deps”
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES
 * • Scans /data/appsumo-*.json silos
 * • Builds a single referral map for ALL known deals (active + archived)
 * • For each deal, constructs a masked referral URL using REF_PREFIX
 * • Emits /data/referral-map.json with deterministic structure
 *
 * WHY
 * • Central source of truth for masked referral targets
 * • Stable for /api/track, category pages, and any future endpoints
 *
 * GUARANTEES
 * • No network calls, no external deps
 * • Deterministic output ordering
 * • Slug-safe, category-pure, referral-safe
 *
 * HOW TO RUN
 *   node scripts/referral-map.js
 *
 * ENV (optional)
 *   SITE_URL   → used only to show a ready-to-use /api/track path in the JSON
 *   REF_PREFIX → override masked affiliate base (default: AppSumo Impact code)
 *                Example: https://appsumo.8odi.net/9L0P95?u=
 * ───────────────────────────────────────────────────────────────────────────────
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ───────────────────────────────────────────────────────────────────────────────
// Paths / Env
// ───────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const OUT_FILE = path.join(DATA_DIR, "referral-map.json");

const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";

// Keep this aligned with the rest of the system (categories.js, updateFeed.js).
const REF_PREFIX =
  process.env.REF_PREFIX ||
  "https://appsumo.8odi.net/9L0P95?u="; // masked affiliate base

// ───────────────────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────────────────
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJsonSafe(file, fallback = null) {
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

function toSlugFromUrl(u = "", fallbackTitle = "") {
  try {
    const m = String(u).match(/\/products\/([^/]+)\/?$/i);
    if (m) return m[1];
  } catch {}
  const base =
    fallbackTitle ||
    String(u).toLowerCase().replace(/[^\w\s-]/g, "").trim() ||
    "";
  return base.replace(/\s+/g, "-") || `deal-${hashStr(u)}`;
}

function baseUrl(d) {
  return d?.url || d?.link || d?.product_url || null;
}

function hashStr(s = "") {
  let h = 0;
  const t = String(s);
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function maskedReferral(rawUrl) {
  return REF_PREFIX + encodeURIComponent(rawUrl);
}

function buildTrackPath({ slug, cat, masked }) {
  // Provided as a convenience (clients can also construct this on the fly)
  const redirect = encodeURIComponent(masked);
  const s = encodeURIComponent(slug);
  const c = encodeURIComponent(cat);
  return `${SITE_ORIGIN}/api/track?deal=${s}&cat=${c}&redirect=${redirect}`;
}

// ───────────────────────────────────────────────────────────────────────────────
// Core: build map
// ───────────────────────────────────────────────────────────────────────────────
function buildReferralMap() {
  ensureDir(DATA_DIR);

  const files = listCategoryFiles();
  if (!files.length) {
    return {
      generatedAt: new Date().toISOString(),
      site: SITE_ORIGIN,
      refPrefix: REF_PREFIX,
      total: 0,
      items: {},
      categories: [],
      notes:
        "No appsumo-*.json files found. Run scripts/updateFeed.js first to populate silos.",
    };
  }

  // Items keyed by slug; latest lastSeenAt wins for conflicts
  const items = new Map();
  const categories = [];

  for (const file of files) {
    const cat = file.replace(/^appsumo-/, "").replace(/\.json$/, "");
    categories.push(cat);

    const full = path.join(DATA_DIR, file);
    const data = readJsonSafe(full, []);
    if (!Array.isArray(data)) continue;

    for (const d of data) {
      const raw = baseUrl(d);
      if (!raw) continue;

      const slug =
        d.slug ||
        toSlugFromUrl(raw, (d.title || "").toLowerCase().replace(/[^\w\s-]/g, ""));

      const masked = maskedReferral(raw);
      const trackPath = buildTrackPath({ slug, cat, masked });

      const entry = {
        slug,
        category: (d.category || cat || "software").toLowerCase(),
        sourceUrl: raw,
        masked,
        trackPath, // convenience path ready to use
        archived: !!d.archived,
        firstSeenAt: d.firstSeenAt || null,
        lastSeenAt: d.lastSeenAt || null,
        lastmodAt: d.lastmodAt || null,
      };

      // Conflict resolution: keep the one with the newest lastSeenAt (or newest by file order)
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

  // Emit as object keyed by slug for O(1) lookup at runtime
  const keyed = {};
  for (const row of ordered) keyed[row.slug] = row;

  return {
    generatedAt: new Date().toISOString(),
    site: SITE_ORIGIN,
    refPrefix: REF_PREFIX,
    total: ordered.length,
    categories: categories.sort((a, b) => a.localeCompare(b)),
    items: keyed,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────────
(function main() {
  try {
    const map = buildReferralMap();
    fs.writeFileSync(OUT_FILE, JSON.stringify(map, null, 2), "utf8");

    const activeFiles = listCategoryFiles().length;
    const archivedCount = Object.values(map.items).filter((x) => x.archived)
      .length;
    const activeCount = map.total - archivedCount;

    console.log("────────────────────────────────────────────────────────");
    console.log(" Referral Map Builder — Direct Masked Integrity (Option A)");
    console.log("────────────────────────────────────────────────────────");
    console.log(` Data dir      : ${DATA_DIR}`);
    console.log(` Output        : ${OUT_FILE}`);
    console.log(` SITE_URL      : ${SITE_ORIGIN}`);
    console.log(` REF_PREFIX    : ${REF_PREFIX}`);
    console.log(` Silos scanned : ${activeFiles}`);
    console.log(` Deals total   : ${map.total}`);
    console.log(` ├─ active     : ${activeCount}`);
    console.log(` └─ archived   : ${archivedCount}`);
    console.log(" Status        : ✅ referral-map.json written");
    console.log("────────────────────────────────────────────────────────");
    process.exit(0);
  } catch (err) {
    console.error("❌ referral-map failed:", err?.message || err);
    process.exit(1);
  }
})();

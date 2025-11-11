// /scripts/validate.js
// TinmanApps — Data Integrity Validator v1.0
// “Strict Level 1: errors halt, warnings surface — Render-safe, zero deps”
// ───────────────────────────────────────────────────────────────────────────────
// What this checks (per file in /data):
// 1) JSON parseable
// 2) Filename is appsumo-<cat>.json for known cats (ai, marketing, productivity, software,
//    courses, business, web, ecommerce, creative)
// 3) Each deal minimal shape:
//    • slug (string, kebab-ish)  • title (string > 0)  • url (https)
//    • archived (boolean)        • image (string)      • category matches file
// 4) Referral integrity (if referralUrl present):
//    • must be a same-origin /api/track url (from SITE_URL) with a `redirect` query param
//    • redirect must point to masked affiliate base (REF_PREFIX) — never raw
// 5) Image integrity:
//    • image should be proxied via /api/image-proxy or be a placeholder on our origin
// 6) Slug uniqueness inside a file
// 7) lastmodAt / firstSeenAt / lastSeenAt, if present, must be valid ISO dates
// 8) SEO presence (cta/subtitle): warn if missing (renderer will clamp anyway)
// 9) URL canonicality: url must look like https://appsumo.com/products/<slug>/
//
// Exit codes:
// • 0 = OK (no errors; warnings may exist)
// • 1 = FAILED (>=1 error)
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../data");

// Environment-derived constants
const SITE_ORIGIN =
  process.env.SITE_URL?.replace(/\/$/, "") || "https://deals.tinmanapps.com";
const REF_PREFIX = "https://appsumo.8odi.net/9L0P95?u=";

// Known categories (must match writers/renderers)
const KNOWN_CATS = new Set([
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
// Utilities
// ───────────────────────────────────────────────────────────────────────────────
const isIso = (s) => {
  if (!s || typeof s !== "string") return false;
  const d = new Date(s);
  return !isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}T/.test(s);
};

const looksLikeHttps = (s) => typeof s === "string" && /^https?:\/\//i.test(s);

const looksLikeAppSumoProduct = (u) =>
  typeof u === "string" && /^https?:\/\/[^/]*appsumo\.com\/products\/[^/]+\/?$/i.test(u);

const looksLikeSlug = (s) =>
  typeof s === "string" && s.length > 0 && /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/.test(s);

const sameOrigin = (u) => {
  try {
    return new URL(u).origin === SITE_ORIGIN;
  } catch {
    return false;
  }
};

const parseJsonSafe = (filePath) => {
  try {
    const txt = fs.readFileSync(filePath, "utf8");
    return [JSON.parse(txt), null];
  } catch (e) {
    return [null, e.message];
  }
};

function toRel(p) {
  return path.relative(process.cwd(), p).replace(/\\/g, "/");
}

function logHeader(title) {
  console.log("\n" + title);
  console.log("─".repeat(title.length));
}

function fail(msg) {
  console.log("❌ " + msg);
}
function warn(msg) {
  console.log("⚠️  " + msg);
}
function ok(msg) {
  console.log("✅ " + msg);
}

// ───────────────────────────────────────────────────────────────────────────────
function validateReferralUrl(deal, fileCat, idx, errs, warns) {
  const { referralUrl, url, slug } = deal;

  // referralUrl is optional in category files (renderer rebuilds), warn if missing.
  if (!referralUrl) {
    warns.push(`deal[${idx}] ${slug || "(no-slug)"}: referralUrl missing (renderer will compute)`);
    return;
  }
  if (!looksLikeHttps(referralUrl)) {
    errs.push(`deal[${idx}] ${slug || "(no-slug)"}: referralUrl not https`);
    return;
  }
  if (!sameOrigin(referralUrl)) {
    errs.push(
      `deal[${idx}] ${slug || "(no-slug)"}: referralUrl must be same-origin (${SITE_ORIGIN})`
    );
    return;
  }
  let parsed;
  try {
    parsed = new URL(referralUrl);
  } catch {
    errs.push(`deal[${idx}] ${slug || "(no-slug)"}: referralUrl not a valid URL`);
    return;
  }
  if (parsed.pathname !== "/api/track") {
    errs.push(`deal[${idx}] ${slug || "(no-slug)"}: referralUrl must use /api/track`);
  }
  const redirect = parsed.searchParams.get("redirect");
  if (!redirect) {
    errs.push(`deal[${idx}] ${slug || "(no-slug)"}: referralUrl missing redirect param`);
  } else {
    // redirect must be masked with our REF_PREFIX
    const decoded = decodeURIComponent(redirect);
    if (!decoded.startsWith(REF_PREFIX)) {
      errs.push(
        `deal[${idx}] ${slug || "(no-slug)"}: redirect not masked with REF_PREFIX (expected to start with ${REF_PREFIX})`
      );
    }
  }

  // Optional: category in track URL
  const catParam = parsed.searchParams.get("cat");
  if (!catParam || catParam.toLowerCase() !== fileCat) {
    warns.push(
      `deal[${idx}] ${slug || "(no-slug)"}: track 'cat' param missing or mismatched (have: ${catParam}; file: ${fileCat})`
    );
  }

  // Optional: ensure we never leak raw affiliate in any other field accidentally
  for (const k of ["title", "description", "image"]) {
    const v = deal[k];
    if (typeof v === "string" && v.includes("appsumo.8odi.net")) {
      errs.push(
        `deal[${idx}] ${slug || "(no-slug)"}: raw affiliate base found in field '${k}' (must only appear inside redirect param of referralUrl)`
      );
    }
  }
}

function validateImage(deal, idx, errs, warns) {
  const { image } = deal;
  if (!image) {
    warns.push(`deal[${idx}] ${deal.slug || "(no-slug)"}: image missing`);
    return;
  }
  if (!looksLikeHttps(image)) {
    errs.push(`deal[${idx}] ${deal.slug || "(no-slug)"}: image not https`);
    return;
  }
  // Should be proxied via our origin or be our placeholder
  const allowed =
    image.startsWith(`${SITE_ORIGIN}/api/image-proxy`) ||
    image.startsWith(`${SITE_ORIGIN}/assets/`) ||
    image.startsWith("data:image/"); // in case of inlined placeholders
  if (!allowed) {
    warns.push(
      `deal[${idx}] ${deal.slug || "(no-slug)"}: image not proxied via /api/image-proxy or local asset (OK but suboptimal for cache/referral integrity)`
    );
  }
}

function validateDates(deal, idx, errs, warns) {
  for (const key of ["lastmodAt", "firstSeenAt", "lastSeenAt"]) {
    if (deal[key] != null && !isIso(deal[key])) {
      warns.push(`deal[${idx}] ${deal.slug || "(no-slug)"}: ${key} not ISO datetime`);
    }
  }
}

function validateSeo(deal, idx, warns) {
  if (!deal.seo || typeof deal.seo !== "object") {
    warns.push(`deal[${idx}] ${deal.slug || "(no-slug)"}: seo object missing`);
    return;
  }
  if (!deal.seo.cta) {
    warns.push(`deal[${idx}] ${deal.slug || "(no-slug)"}: seo.cta missing`);
  }
  if (!deal.seo.subtitle) {
    warns.push(`deal[${idx}] ${deal.slug || "(no-slug)"}: seo.subtitle missing`);
  }
}

function validateUrl(deal, idx, errs, warns) {
  const { url, slug } = deal;
  if (!url) {
    errs.push(`deal[${idx}] ${slug || "(no-slug)"}: url missing`);
    return;
  }
  if (!looksLikeHttps(url)) {
    errs.push(`deal[${idx}] ${slug || "(no-slug)"}: url not https`);
  }
  if (!looksLikeAppSumoProduct(url)) {
    warns.push(`deal[${idx}] ${slug || "(no-slug)"}: url not canonical AppSumo product page`);
  }
}

function validateMinimalShape(deal, fileCat, idx, errs, warns) {
  if (!deal.title || typeof deal.title !== "string") {
    warns.push(`deal[${idx}] (no-slug): title missing or empty`);
  }
  if (!looksLikeSlug(deal.slug || "")) {
    warns.push(`deal[${idx}] ${deal.slug || "(no-slug)"}: slug missing or not kebab-case`);
  }
  if (typeof deal.archived !== "boolean") {
    warns.push(`deal[${idx}] ${deal.slug || "(no-slug)"}: archived must be boolean`);
  }
  if (!deal.category || String(deal.category).toLowerCase() !== fileCat) {
    warns.push(
      `deal[${idx}] ${deal.slug || "(no-slug)"}: category mismatch (have: ${deal.category}; file: ${fileCat})`
    );
  }
}

function validateFile(filePath) {
  const rel = toRel(filePath);
  const base = path.basename(filePath);

  const m = base.match(/^appsumo\-([a-z0-9-]+)\.json$/i);
  if (!m) {
    return {
      file: rel,
      errors: [`Invalid filename "${base}" (expected appsumo-<cat>.json)`],
      warnings: [],
      count: 0,
      active: 0,
    };
  }
  const fileCat = m[1].toLowerCase();

  const errors = [];
  const warnings = [];

  if (!KNOWN_CATS.has(fileCat)) {
    warnings.push(`Unknown category "${fileCat}" (not in known taxonomy)`);
  }

  const [json, parseErr] = parseJsonSafe(filePath);
  if (parseErr) {
    errors.push(`JSON parse error: ${parseErr}`);
    return { file: rel, errors, warnings, count: 0, active: 0 };
  }

  if (!Array.isArray(json)) {
    errors.push("Top-level is not an array");
    return { file: rel, errors, warnings, count: 0, active: 0 };
  }

  const slugs = new Set();
  let activeCount = 0;

  json.forEach((deal, idx) => {
    if (deal && deal.archived === false) activeCount++;

    validateMinimalShape(deal, fileCat, idx, errors, warnings);
    validateUrl(deal, idx, errors, warnings);
    validateReferralUrl(deal, fileCat, idx, errors, warnings);
    validateImage(deal, idx, errors, warnings);
    validateDates(deal, idx, errors, warnings);
    validateSeo(deal, idx, warnings);

    // slug uniqueness
    const s = deal.slug || `__missing_${idx}__`;
    if (slugs.has(s)) {
      errors.push(`Duplicate slug "${s}" at index ${idx}`);
    } else {
      slugs.add(s);
    }
  });

  return {
    file: rel,
    errors,
    warnings,
    count: json.length,
    active: activeCount,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  logHeader("TinmanApps — Data Integrity Validator (Strict Level 1)");

  if (!fs.existsSync(DATA_DIR)) {
    fail(`Missing data directory: ${toRel(DATA_DIR)}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"))
    .map((f) => path.join(DATA_DIR, f))
    .sort();

  if (files.length === 0) {
    warn("No appsumo-*.json files found — nothing to validate.");
    process.exit(0);
  }

  let totalDeals = 0;
  let totalActive = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const f of files) {
    const { file, errors, warnings, count, active } = validateFile(f);
    totalDeals += count;
    totalActive += active;
    totalErrors += errors.length;
    totalWarnings += warnings.length;

    console.log(`\n📄 ${file}`);
    if (errors.length) {
      errors.forEach((e) => fail(e));
    } else {
      ok("no errors");
    }
    if (warnings.length) {
      warnings.forEach((w) => warn(w));
    } else {
      ok("no warnings");
    }
    console.log(`— items: ${count}, active: ${active}`);
  }

  logHeader("Summary");
  console.log(`Files: ${files.length}`);
  console.log(`Deals: ${totalDeals} (active: ${totalActive})`);
  console.log(`Warnings: ${totalWarnings}`);
  console.log(`Errors: ${totalErrors}`);

  if (totalErrors > 0) {
    fail("Validation failed (errors present).");
    process.exit(1);
  } else {
    ok("Validation passed (no errors).");
    process.exit(0);
  }
}

main().catch((err) => {
  fail(`Validator crashed: ${err?.message || err}`);
  process.exit(1);
});

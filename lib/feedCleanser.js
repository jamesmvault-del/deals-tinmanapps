/**
 * /lib/feedCleanser.js
 * TinmanApps — Feed Cleanser v6.2
 * “Archive-True • Zero-Leak SEO • Seam-Deduped • Title-Stable”
 * -----------------------------------------------------------------------------
 * PURPOSE:
 * • Merge NEW normalized feed with old feed-cache.json deterministically.
 * • Enforce *absolute no CTA/subtitle preservation* across regenerations.
 * • Preserve high-value SEO metadata (keywords, clickbait, emotionalVerb).
 * • Perform deep text seam-cleaning (spacing, punctuation, control chars, ellipsis).
 * • De-duplicate repeated sentences/phrases in titles and descriptions.
 * • Guarantee safe, non-empty title fallbacks before CTA generation.
 * • Archive safety: never delete, only mark archived.
 * • No regeneration, no inference — this is a pure structural merge pass.
 *
 * ORDER FLOW:
 *   updateFeed.js → aggregate → normalizeFeed → cleanseFeed (THIS FILE)
 *   → regenerateSeo → seoIntegrity → merge-history → insight
 *
 * GUARANTEES:
 * ✅ CTA/subtitle = always null (regen handled downstream)
 * ✅ Archive entries never removed (purge only via master-cron)
 * ✅ Category preserved exactly
 * ✅ Deterministic merge sequence
 * ✅ Seam-cleaned, de-duplicated titles/descriptions (stable inputs to CTA engine)
 * ✅ Render-safe — zero side effects beyond writing feed-cache.json
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function sanitizeSeams(text = "") {
  return String(text || "")
    // strip non-printable control chars (but keep standard whitespace)
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, "")
    // normalize dashes
    .replace(/\s*–\s*/g, " - ")
    .replace(/\s*—\s*/g, " - ")
    // collapse long ellipses
    .replace(/\.{3,}/g, "…")
    // collapse whitespace
    .replace(/\s{2,}/g, " ")
    // fix space before punctuation
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Basic sentence-level de-duplication:
 *  - split into sentences based on ., !, ?
 *  - normalise seams
 *  - keep first occurrence of each unique sentence (case-insensitive)
 *  - rejoin deterministically
 */
function dedupeText(text = "") {
  const cleaned = sanitizeSeams(text);
  if (!cleaned) return cleaned;

  const sentences = [];
  let buffer = "";
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    buffer += ch;
    if (/[.!?]/.test(ch)) {
      const trimmed = buffer.trim();
      if (trimmed) sentences.push(trimmed);
      buffer = "";
    }
  }
  if (buffer.trim()) {
    sentences.push(buffer.trim());
  }

  const seen = new Set();
  const result = [];

  for (const s of sentences) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(s);
  }

  // Word-level adjacent dedupe inside each sentence
  const dedupedSentences = result.map((s) => {
    const parts = s.split(/\s+/);
    const compact = [];
    let prev = null;
    for (const part of parts) {
      if (part === prev) continue;
      compact.push(part);
      prev = part;
    }
    return compact.join(" ");
  });

  return dedupedSentences.join(" ");
}

function sanitizeObjectStrings(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      out[k] = dedupeText(v);
    } else if (Array.isArray(v)) {
      // De-duplicate and seam-clean keyword arrays, etc.
      const seen = new Set();
      const cleanedArr = [];
      for (const item of v) {
        const s = typeof item === "string" ? sanitizeSeams(item) : item;
        if (typeof s === "string") {
          const key = s.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          cleanedArr.push(s);
        } else if (s != null) {
          cleanedArr.push(s);
        }
      }
      out[k] = cleanedArr;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Safe title fallback:
 *  - seam-clean + de-duplicate
 *  - if empty, fall back to slug prettified
 *  - if still empty, "Untitled"
 */
function safeTitle(rawTitle, slug) {
  const primary = dedupeText(rawTitle || "");
  if (primary) return primary;

  if (slug) {
    const fromSlug = dedupeText(String(slug).replace(/[-_]+/g, " "));
    if (fromSlug) return fromSlug;
  }

  return "Untitled";
}

/**
 * Stable description:
 *  - prefer fresh description, fallback to old
 *  - seam-clean + de-duplicate
 *  - allow null if truly empty
 */
function stableDescription(freshDesc, oldDesc) {
  const candidate = freshDesc || oldDesc || "";
  const cleaned = dedupeText(candidate);
  return cleaned || null;
}

// -----------------------------------------------------------------------------
// MAIN CLEANSER (Pure structural merge, no CTA/subtitle fallback)
// -----------------------------------------------------------------------------
export function cleanseFeed(current = []) {
  if (!Array.isArray(current)) {
    console.warn("⚠️ [FeedCleanser] Non-array feed input. Using empty array.");
    current = [];
  }

  const now = new Date().toISOString();

  // First run — no feed cache
  if (!fs.existsSync(FEED_PATH)) {
    console.warn(
      "⚠️ [FeedCleanser] No previous feed-cache found. Initializing baseline."
    );
    const cleaned = current.map((x) => ({
      ...x,
      title: safeTitle(x.title, x.slug),
      description: stableDescription(x.description, null),
      seo: sanitizeObjectStrings({
        cta: null,
        subtitle: null,
        clickbait: x.seo?.clickbait || null,
        keywords: x.seo?.keywords || [],
        emotionalVerb: x.seo?.emotionalVerb || null,
        lastVerifiedAt: x.seo?.lastVerifiedAt || null,
      }),
      archived: false,
      archivedAt: null,
      lastSeenAt: now,
    }));
    try {
      fs.writeFileSync(FEED_PATH, JSON.stringify(cleaned, null, 2), "utf8");
    } catch (err) {
      console.error(
        "❌ [FeedCleanser] Failed to write initial feed-cache:",
        err.message
      );
    }
    return cleaned;
  }

  // Load previous feed safely
  let prev;
  try {
    prev = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
  } catch {
    console.warn(
      "⚠️ [FeedCleanser] Previous feed corrupted. Reinitializing with current feed."
    );
    const repaired = current.map((x) => ({
      ...x,
      title: safeTitle(x.title, x.slug),
      description: stableDescription(x.description, null),
      seo: sanitizeObjectStrings({
        cta: null,
        subtitle: null,
        clickbait: x.seo?.clickbait || null,
        keywords: x.seo?.keywords || [],
        emotionalVerb: x.seo?.emotionalVerb || null,
        lastVerifiedAt: x.seo?.lastVerifiedAt || null,
      }),
      archived: false,
      archivedAt: null,
      lastSeenAt: now,
    }));
    try {
      fs.writeFileSync(FEED_PATH, JSON.stringify(repaired, null, 2), "utf8");
    } catch (err) {
      console.error(
        "❌ [FeedCleanser] Failed to write repaired feed-cache:",
        err.message
      );
    }
    return repaired;
  }

  const prevMap = new Map(prev.map((p) => [p.slug, p]));
  const merged = [];

  // 1️⃣ Merge existing entries that reappear this run
  for (const old of prev) {
    const fresh = current.find((c) => c.slug === old.slug);
    if (fresh) {
      const oldSeo = old.seo || {};
      const freshSeo = fresh.seo || {};

      const mergedSeo = {
        cta: null,
        subtitle: null,
        clickbait: freshSeo.clickbait || oldSeo.clickbait || null,
        keywords: Array.isArray(freshSeo.keywords)
          ? freshSeo.keywords
          : Array.isArray(oldSeo.keywords)
          ? oldSeo.keywords
          : [],
        emotionalVerb: freshSeo.emotionalVerb || oldSeo.emotionalVerb || null,
        lastVerifiedAt: freshSeo.lastVerifiedAt || oldSeo.lastVerifiedAt || null,
      };

      merged.push({
        ...fresh,
        title: safeTitle(fresh.title, fresh.slug),
        description: stableDescription(fresh.description, old.description),
        category: fresh.category,
        archived: false,
        archivedAt: old.archivedAt || null,
        lastSeenAt: now,
        seo: sanitizeObjectStrings(mergedSeo),
      });
    } else {
      // 2️⃣ Missing → archive deterministically
      const oldSeo = old.seo || {};
      const archivedSeo = {
        cta: null,
        subtitle: null,
        clickbait: oldSeo.clickbait || null,
        keywords: Array.isArray(oldSeo.keywords) ? oldSeo.keywords : [],
        emotionalVerb: oldSeo.emotionalVerb || null,
        lastVerifiedAt: oldSeo.lastVerifiedAt || null,
      };

      merged.push({
        ...old,
        title: safeTitle(old.title, old.slug),
        description: stableDescription(old.description, null),
        archived: true,
        archivedAt: old.archivedAt || now,
        lastSeenAt: old.lastSeenAt || now,
        seo: sanitizeObjectStrings(archivedSeo),
      });
    }
  }

  // 3️⃣ Add brand new entries
  for (const fresh of current) {
    if (!prevMap.has(fresh.slug)) {
      merged.push({
        ...fresh,
        title: safeTitle(fresh.title, fresh.slug),
        description: stableDescription(fresh.description, null),
        archived: false,
        archivedAt: null,
        lastSeenAt: now,
        seo: sanitizeObjectStrings({
          cta: null,
          subtitle: null,
          clickbait: fresh.seo?.clickbait || null,
          keywords: fresh.seo?.keywords || [],
          emotionalVerb: fresh.seo?.emotionalVerb || null,
          lastVerifiedAt: fresh.seo?.lastVerifiedAt || null,
        }),
      });
    }
  }

  // 4️⃣ Write merged feed to disk (deterministic order)
  // Keep deterministic ordering by slug to stabilise diffs.
  merged.sort((a, b) => {
    const sa = String(a.slug || "").toLowerCase();
    const sb = String(b.slug || "").toLowerCase();
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
  });

  try {
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2), "utf8");
  } catch (err) {
    console.error("❌ [FeedCleanser] Failed to write feed-cache:", err.message);
  }

  console.log(
    `✅ [FeedCleanser v6.2] Archive-safe merge complete (${merged.length} entries) — CTA/subtitle stripped, SEO metadata preserved, seams cleaned, titles/descriptions de-duplicated and stabilised`
  );

  return merged;
}

export default { cleanseFeed };

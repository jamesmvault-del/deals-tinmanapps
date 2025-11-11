// /api/master-cron.js
/**
 * TinmanApps Master Cron v7.0
 * “Absolute Regeneration • Sanitised • Deterministic • CTA Engine v7.0”
 * ───────────────────────────────────────────────────────────────────────────────
 * ✅ ALWAYS regenerates CTA + subtitle using CTA Engine v7.0 (never reuses)
 * ✅ scripts/updateFeed.js ALWAYS runs first
 * ✅ sanitize → normalizeFeed → cleanseFeed → regenerateSEO → finalSanitize
 * ✅ SEO Integrity v4.3 (clean keywords, no fragments)
 * ✅ feed-cache.json purged only when ?force=1
 * ✅ Insight Pulse runs silently after merge
 * ✅ ZERO restoration from history (CTA/subtitle NEVER resurrected)
 * ✅ 100% Render-safe; deterministic and stable
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { execSync } from "child_process";

import { backgroundRefresh } from "../lib/proxyCache.js";
import { createCtaEngine } from "../lib/ctaEngine.js";
import { normalizeFeed } from "../lib/feedNormalizer.js";
import { ensureSeoIntegrity } from "../lib/seoIntegrity.js";
import { cleanseFeed } from "../lib/feedCleanser.js";
import insightHandler from "./insight.js";

// ─────────────────────────────────────────── Info / Paths ─────────────────────────────────────────
const CTA_ENGINE_VERSION = "7.0";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

// ─────────────────────────────────────────── Helpers ───────────────────────────────────────────
function smartTitle(slug = "") {
  return String(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// Local sanitiser (master-cron scoped)
function sanitizeText(input = "") {
  const s = String(input ?? "")
    .replace(/\u2013|\u2014/g, "-")         // en/em dashes → hyphen
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\(undefined\)/gi, "")
    .trim();
  return s;
}

// Ensures every item ALWAYS has CTA + subtitle after regen
function ensureMinimalSeo(items) {
  return items.map((d) => {
    const title = sanitizeText(d.title?.trim?.() || smartTitle(d.slug));
    const cta = sanitizeText(d.seo?.cta) || "Discover this deal →";
    const subtitle =
      sanitizeText(d.seo?.subtitle) ||
      "A clean, fast overview to help you evaluate this offer.";
    return { ...d, title, seo: { ...(d.seo || {}), cta, subtitle } };
  });
}

// Final emergency sanitiser (removes fragments / tidies punctuation)
function finalSanitize(items) {
  return items.map((d) => ({
    ...d,
    title: sanitizeText(d.title),
    seo: {
      ...d.seo,
      cta: sanitizeText(d.seo?.cta),
      subtitle: sanitizeText(d.seo?.subtitle),
    },
  }));
}

// ───────────────────────────────────────── Merge with History (NO CTA RESTORE) ───────────────────
function mergeWithHistory(newFeed) {
  if (!fs.existsSync(FEED_PATH)) return newFeed;

  const prev = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
  const prevBySlug = new Map(prev.map((x) => [x.slug, x]));

  const now = new Date().toISOString();
  const DAY_MS = 24 * 60 * 60 * 1000;

  let archived = 0;
  let purged = 0;

  const merged = newFeed.map((item) => {
    const old = prevBySlug.get(item.slug);
    const oldSeo = old?.seo || {};
    return {
      ...item,
      seo: {
        cta: item.seo?.cta || null,           // regenerated → NEVER restored
        subtitle: item.seo?.subtitle || null, // regenerated → NEVER restored
        clickbait: oldSeo.clickbait || null,
        keywords: oldSeo.keywords || [],
        lastVerifiedAt: now,
      },
      archived: false,
    };
  });

  // Bring forward previously seen items that have disappeared → archived
  for (const old of prev) {
    if (!merged.find((x) => x.slug === old.slug)) {
      archived++;
      merged.push({ ...old, archived: true });
    }
  }

  const cutoff = Date.now() - 30 * DAY_MS;
  const cleaned = merged.filter((x) => {
    if (!x.archived) return true;
    const t = x.seo?.lastVerifiedAt
      ? new Date(x.seo.lastVerifiedAt).getTime()
      : Date.now();
    const keep = t > cutoff;
    if (!keep) purged++;
    return keep;
  });

  console.log(`🧬 [History] archived=${archived}, purged=${purged}, final=${cleaned.length}`);
  return cleaned;
}

// ───────────────────────────────────────── Aggregator ────────────────────────────────────────────
function aggregateCategoryFeeds() {
  ensureDir(DATA_DIR);

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));

  let aggregated = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
      aggregated = aggregated.concat(data);
      console.log(`✅ Loaded ${data.length} → ${file}`);
    } catch (err) {
      console.warn(`⚠️ Failed to parse ${file}: ${err.message}`);
    }
  }

  fs.writeFileSync(FEED_PATH, JSON.stringify(aggregated, null, 2));
  return aggregated;
}

// ───────────────────────────────────────── Regeneration (ALWAYS) ───────────────────────────────
function regenerateSeo(allDeals) {
  const engine = createCtaEngine();

  return allDeals.map((d) => {
    const category = (d.category || "software").toLowerCase();
    const title = sanitizeText(d.title?.trim?.() || smartTitle(d.slug));
    const slug = d.slug || sha1(title);

    const cta = sanitizeText(engine.generate({ title, cat: category, slug }));
    const subtitle = sanitizeText(
      engine.generateSubtitle({ title, category, slug })
    );

    return {
      ...d,
      seo: { ...d.seo, cta, subtitle },
    };
  });
}

// ───────────────────────────────────────── HANDLER ───────────────────────────────────────────────
export default async function handler(req, res) {
  const force = req.query.force === "1";
  const start = Date.now();

  try {
    console.log("🔁 [Cron] Starting deterministic refresh:", new Date().toISOString());

    // 1) Run updateFeed.js FIRST
    const updateFeedPath = path.join(__dirname, "../scripts/updateFeed.js");
    console.log("⚙️ updateFeed.js running…");
    try {
      execSync(`node "${updateFeedPath}"`, { stdio: "inherit" });
      console.log("✅ updateFeed.js complete");
    } catch (e) {
      console.warn("⚠️ updateFeed.js error:", e.message);
    }

    // 2) Optional purge
    if (force && fs.existsSync(FEED_PATH)) {
      fs.unlinkSync(FEED_PATH);
      console.log("🧹 feed-cache.json purged (force=1)");
    }

    // 3) Proxy cache refresh (integrity)
    await backgroundRefresh();
    console.log("✅ backgroundRefresh OK");

    // 4) Aggregate all category silos
    const raw = aggregateCategoryFeeds();
    console.log(`📦 Raw aggregated: ${raw.length}`);

    // 5) Normalize
    const normalized = normalizeFeed(raw);
    console.log(`🧼 Normalized: ${normalized.length}`);

    // 6) Dedupe
    const seen = new Set();
    const deduped = normalized.filter((d) => {
      const key = sha1(d.slug || d.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`📑 Deduped: ${deduped.length}`);

    // 7) Cleanse (archive-aware)
    const cleansed = cleanseFeed(deduped);
    console.log(`🧹 Cleansed: ${cleansed.length}`);

    // 8) ALWAYS regenerate CTA + subtitle
    let enriched = regenerateSeo(cleansed);
    console.log(`✨ Regenerated CTA + subtitle (${enriched.length})`);

    // 9) ensure minimal SEO
    enriched = ensureMinimalSeo(enriched);

    // 10) SEO Integrity
    const verified = ensureSeoIntegrity(enriched);
    console.log(`🔎 SEO Integrity checked: ${verified.length}`);

    // 11) FINAL emergency sanitiser
    const sanitized = finalSanitize(verified);

    // 12) History merge (NO restoration)
    const merged = mergeWithHistory(sanitized);
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2));
    console.log(`🧬 Final merged feed: ${merged.length}`);

    // 13) Insight Pulse
    await insightHandler(
      { query: { silent: "1" } },
      { json: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) }
    );

    const duration = Date.now() - start;

    return res.json({
      message: "Self-healing refresh complete",
      duration,
      total: merged.length,
      previousRun: new Date().toISOString(),
      steps: [
        "updateFeed",
        "purge(feed-cache-only)",
        "background-refresh",
        "aggregate",
        "normalize",
        "dedupe",
        "cleanse",
        `regenerate-seo(v${CTA_ENGINE_VERSION})`,
        "seo-integrity",
        "final-sanitise",
        "merge-history",
        "insight",
      ],
      engineVersion: CTA_ENGINE_VERSION,
      regenerated: true,
    });
  } catch (err) {
    console.error("❌ [Cron Fatal]:", err);
    return res.status(500).json({ error: "Cron failed", details: err.message });
  }
}

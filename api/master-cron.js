/**
 * /api/master-cron.js
 * TinmanApps Master Cron v4.6
 * “Always-Regenerate • Archive-Deterministic • Category-Pure”
 * ───────────────────────────────────────────────────────────────────────────────
 * ✅ Runs scripts/updateFeed.js FIRST (absolute path, Render-safe)
 * ✅ Never deletes category files (appsumo-*.json)
 * ✅ Optional purge ONLY deletes feed-cache.json (never categories)
 * ✅ Aggregates appsumo-*.json → feed-cache.json (raw)
 * ✅ normalizeFeed() → cleanseFeed() → REGENERATE (CTA+subtitle) → ensureSeoIntegrity()
 * ✅ Merge history NEVER restores CTA/subtitle (zero-leak)
 * ✅ Insight refresh at the end (silent)
 * ✅ Deterministic, zero-drama ops, referral-integrity aligned
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
const CTA_ENGINE_VERSION = "6.3"; // informational (engine selection is deterministic)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");

// ─────────────────────────────────────────── Helpers ───────────────────────────────────────────
function smartTitle(slug = "") {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
function sha1(str) {
  return crypto.createHash("sha1").update(String(str)).digest("hex");
}
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function ensureIntegrity(items) {
  return items.map((d) => {
    const title = d.title?.trim?.().length > 2 ? d.title : smartTitle(d.slug);
    const cta = d.seo?.cta?.trim?.() ? d.seo.cta : "Discover this offer →";
    const subtitle =
      d.seo?.subtitle?.trim?.()
        ? d.seo.subtitle
        : "Explore a fresh deal designed to streamline your workflow.";
    return { ...d, title, seo: { ...(d.seo || {}), cta, subtitle } };
  });
}

// ───────────────────────────────────────── Merge with History ─────────────────────────────────────
function mergeWithHistory(newFeed, { preserveCTA = true, preserveSubtitle = true } = {}) {
  if (!fs.existsSync(FEED_PATH)) return newFeed;

  const oldFeed = JSON.parse(fs.readFileSync(FEED_PATH, "utf8"));
  const map = new Map(oldFeed.map((x) => [x.slug, x]));

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  let updated = 0;
  let reused = 0;
  let archived = 0;

  const merged = newFeed.map((item) => {
    const prev = map.get(item.slug);
    const oldSeo = prev?.seo || {};

    const finalSeo = {
      cta: preserveCTA ? item.seo?.cta || oldSeo.cta || null : item.seo?.cta || null,
      subtitle: preserveSubtitle ? item.seo?.subtitle || oldSeo.subtitle || null : item.seo?.subtitle || null,
      clickbait: item.seo?.clickbait || oldSeo.clickbait || null,
      keywords: item.seo?.keywords || oldSeo.keywords || [],
      emotionalVerb: item.seo?.emotionalVerb || oldSeo.emotionalVerb || null,
      lastVerifiedAt: item.seo?.lastVerifiedAt || oldSeo.lastVerifiedAt || null,
    };

    if (item.seo?.cta || item.seo?.subtitle) updated++;
    else reused++;

    return { ...item, seo: finalSeo, archived: false };
  });

  for (const old of oldFeed) {
    if (!merged.find((x) => x.slug === old.slug)) {
      merged.push({ ...old, archived: true });
      archived++;
    }
  }

  const cutoff = now - 30 * DAY_MS;
  const cleaned = merged.filter((x) => {
    if (!x.archived) return true;
    const t = x.seo?.lastVerifiedAt ? new Date(x.seo.lastVerifiedAt).getTime() : now;
    return t > cutoff;
  });

  console.log(
    `🧩 [Merge] updated=${updated}, reused=${reused}, archived=${archived}, purged=${merged.length - cleaned.length}`
  );
  return cleaned;
}

// ───────────────────────────────────────── Aggregator ────────────────────────────────────────────
function aggregateCategoryFeeds() {
  ensureDir(DATA_DIR);

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));
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

// ───────────────────────────────────────── Regeneration (Always On) ───────────────────────────────
function regenerateSeo(allDeals) {
  const engine = createCtaEngine();

  return allDeals.map((d) => {
    const category = (d.category || "software").toLowerCase();
    const title = d.title?.trim?.() || smartTitle(d.slug);
    const slug = d.slug || sha1(title);

    // Deterministic, category-pure generation
    const cta = engine.generate({ title, cat: category, slug });
    const subtitle = engine.generateSubtitle({ title, category, slug });

    const prevSeo = d.seo || {};
    return {
      ...d,
      seo: {
        ...prevSeo,
        cta,
        subtitle,
      },
    };
  });
}

// ───────────────────────────────────────── Handler ───────────────────────────────────────────────
export default async function handler(req, res) {
  const force = req.query.force === "1";
  const start = Date.now();

  try {
    console.log("🔁 [Cron] Starting self-healing refresh:", new Date().toISOString());

    // 🔒 Enforce regeneration semantics globally for this run
    // (Cleanser v3.4 already forces CTA/subtitle wipe; env flag is for clarity in logs)
    process.env.REGEN_SEO = "1";

    // 1) Update category source files
    const updateFeedPath = path.join(__dirname, "../scripts/updateFeed.js");
    console.log("⚙️ Running updateFeed.js…");
    try {
      execSync(`node "${updateFeedPath}"`, { stdio: "inherit" });
      console.log("✅ updateFeed.js completed.");
    } catch (err) {
      console.warn("⚠️ updateFeed.js error:", err.message);
    }

    // 2) Optional purge of feed-cache.json ONLY
    if (force) {
      if (fs.existsSync(FEED_PATH)) fs.unlinkSync(FEED_PATH);
      console.log("🧹 Purged feed-cache.json (force=1)");
    }

    // 3) Background builder refresh
    await backgroundRefresh();
    console.log("✅ backgroundRefresh() OK");

    // 4) Aggregate categories → raw feed
    const raw = aggregateCategoryFeeds();
    console.log(`📦 Aggregated: ${raw.length}`);

    // 5) Normalize
    const normalized = normalizeFeed(raw);
    console.log(`🧹 Normalized: ${normalized.length}`);

    // 6) Deduplicate (slug/title hash)
    const seen = new Set();
    const deduped = normalized.filter((item) => {
      const key = sha1(item.slug || item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`📑 Deduped: ${deduped.length}`);

    // 7) Cleanse vs previous cache (archive guardian) BEFORE regeneration
    const cleansed = cleanseFeed(deduped);
    console.log(`🛡️  Cleansed (archive-aware): ${cleansed.length}`);

    // 8) ALWAYS regenerate CTA + subtitle for ALL deals (world-class freshness)
    let enriched = regenerateSeo(cleansed);
    console.log(`✨ Regenerated CTA + subtitle for ${enriched.length} deals (engine v${CTA_ENGINE_VERSION})`);

    // 9) SEO integrity (clickbait, keywords, entropy)
    enriched = ensureIntegrity(enriched);
    const verified = ensureSeoIntegrity(enriched);
    console.log(`🔎 SEO Integrity OK: ${verified.length}`);

    // 10) Merge with SEO history — NEVER restore CTA/subtitle
    const merged = mergeWithHistory(verified, {
      preserveCTA: false,
      preserveSubtitle: false,
    });
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2));
    console.log(`🧬 Final merged: ${merged.length}`);

    // 11) Silent Insight refresh
    await insightHandler(
      { query: { silent: "1" } },
      { json: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) }
    );
    console.log("🧠 Insight updated");

    const duration = Date.now() - start;

    res.json({
      message: "Self-healing refresh complete",
      duration,
      total: merged.length,
      previousRun: new Date().toISOString(),
      steps: [
        "updateFeed(auto-run)",
        "purge(feed-cache-only)",
        "background-refresh",
        "category-aggregate",
        "normalize",
        "dedupe",
        "cleanse",
        `regenerate-seo(v${CTA_ENGINE_VERSION})`,
        "seo-integrity",
        "merge-history(no-cta-subtitle-restore)",
        "insight",
      ],
      engineVersion: CTA_ENGINE_VERSION,
      regenerated: true,
    });
  } catch (err) {
    console.error("❌ [Cron Error]:", err);
    res.status(500).json({ error: "Cron failed", details: err.message });
  }
}

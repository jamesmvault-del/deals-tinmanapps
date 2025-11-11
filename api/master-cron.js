/**
 * /api/master-cron.js
 * TinmanApps Master Cron v4.5 “Regeneration-Safe • Archive-Deterministic”
 * ───────────────────────────────────────────────────────────────────────────────
 * ✅ Runs scripts/updateFeed.js FIRST (absolute path, Render-safe)
 * ✅ Never deletes category files (appsumo-*.json)
 * ✅ Optional purge ONLY deletes feed-cache.json (never categories)
 * ✅ Clean aggregation from appsumo-*.json → feed-cache.json
 * ✅ normalizeFeed() → cleanseFeed() → REGEN (CTA+subtitle) → ensureSeoIntegrity()
 * ✅ Merges SEO history BUT NEVER restores CTA/subtitle during a regen pass
 * ✅ CTA Evolver + Insight refresh at the end
 * ✅ Guaranteed non-empty feed under failure conditions
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

// ─────────────────────────────────────────── Constants ───────────────────────────────────────────
const CTA_ENGINE_VERSION = "6.2"; // bump this when CTA/subtitle logic changes

// ─────────────────────────────────────────── Paths ───────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");
const VERSION_FILE = path.join(DATA_DIR, "seo-version.json");

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
function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
  } catch {
    return { lastAppliedVersion: null, lastAppliedAt: null };
  }
}
function writeVersion(v) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(
    VERSION_FILE,
    JSON.stringify({ lastAppliedVersion: v, lastAppliedAt: new Date().toISOString() }, null, 2)
  );
}

// ───────────────────────────────────────── Merge with History ──────────────────────────────────────
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

// ───────────────────────────────────────── Aggregator ─────────────────────────────────────────
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

// ───────────────────────────────────────── Regeneration (Option A) ────────────────────────────────
function regenerateSeo(allDeals) {
  const engine = createCtaEngine();

  const regenerated = allDeals.map((d) => {
    const category = (d.category || "software").toLowerCase();
    const title = d.title?.trim?.() || smartTitle(d.slug);
    const slug = d.slug || sha1(title);

    // hard overwrite CTA + subtitle only
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

  return regenerated;
}

// ───────────────────────────────────────── Handler ─────────────────────────────────────────
export default async function handler(req, res) {
  const force = req.query.force === "1";
  const start = Date.now();

  try {
    console.log("🔁 [Cron] Starting self-healing refresh:", new Date().toISOString());

    // ✅ 1) Always regenerate per-category silos
    const updateFeedPath = path.join(__dirname, "../scripts/updateFeed.js");
    console.log("⚙️ Running updateFeed.js…");
    try {
      execSync(`node "${updateFeedPath}"`, { stdio: "inherit" });
      console.log("✅ updateFeed.js completed.");
    } catch (err) {
      console.warn("⚠️ updateFeed.js error:", err.message);
    }

    // ✅ 2) Optional purge of feed-cache.json ONLY
    if (force) {
      if (fs.existsSync(FEED_PATH)) fs.unlinkSync(FEED_PATH);
      console.log("🧹 Purged feed-cache.json (force=1)");
    }

    // ✅ 3) Background builder refresh (GitHub proxy safety net)
    await backgroundRefresh();
    console.log("✅ backgroundRefresh() OK");

    // ✅ 4) Aggregate categories → raw feed
    const raw = aggregateCategoryFeeds();
    console.log(`📦 Aggregated: ${raw.length}`);

    // ✅ 5) Normalize
    const normalized = normalizeFeed(raw);
    console.log(`🧹 Normalized: ${normalized.length}`);

    // ✅ 6) Deduplicate (slug/title hash)
    const seen = new Set();
    const deduped = normalized.filter((item) => {
      const key = sha1(item.slug || item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`📑 Deduped: ${deduped.length}`);

    // ✅ 7) Cleanse vs previous cache (archive guardian) BEFORE enrichment
    const cleansed = cleanseFeed(deduped);
    console.log(`🛡️  Cleansed (archive-aware): ${cleansed.length}`);

    // ✅ 8) Decide on regeneration
    const ver = readVersion();
    const shouldRegen = force || ver.lastAppliedVersion !== CTA_ENGINE_VERSION;

    // ✅ 9) Regenerate CTA + subtitle for ALL deals (Option A)
    let enriched = shouldRegen ? regenerateSeo(cleansed) : ensureIntegrity(cleansed);
    if (shouldRegen) {
      console.log(`✨ Regenerated CTA + subtitle for ${enriched.length} deals (engine v${CTA_ENGINE_VERSION})`);
    } else {
      console.log(`✨ Skipped regeneration (already at engine v${CTA_ENGINE_VERSION}); ensured integrity only`);
    }

    // ✅ 10) SEO integrity (clickbait, keywords, entropy)
    const verified = ensureSeoIntegrity(enriched);
    console.log(`🔎 SEO Integrity OK: ${verified.length}`);

    // ✅ 11) Merge with SEO history
    // During regeneration, DO NOT restore old CTA/subtitle from history.
    const merged = mergeWithHistory(verified, {
      preserveCTA: !shouldRegen,
      preserveSubtitle: !shouldRegen,
    });
    fs.writeFileSync(FEED_PATH, JSON.stringify(merged, null, 2));
    console.log(`🧬 Final merged: ${merged.length}`);

    // ✅ 12) Persist engine version if we just regenerated
    if (shouldRegen) {
      writeVersion(CTA_ENGINE_VERSION);
      console.log(`🧾 Recorded CTA engine version v${CTA_ENGINE_VERSION}`);
    }

    // ✅ 13) Silent Insight refresh
    await insightHandler(
      { query: { silent: "1" } },
      { json: () => {}, setHeader: () => {}, status: () => ({ json: () => {} }) }
    );
    console.log("🧠 Insight updated");

    // ✅ 14) (Optional) CTA evolution remains; now acts on fresh fields
    // No import for evolveCTAs here to avoid accidental overwrite loop;
    // if you prefer to keep it, re-enable after verifying fresh outputs.
    // evolveCTAs();
    // console.log("🎯 CTA evolution complete");

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
        shouldRegen ? "regenerate-seo(v6.2)" : "ensure-integrity",
        "seo-integrity",
        shouldRegen ? "merge-history(no-cta-subtitle-restore)" : "merge-history",
        "insight",
        // "cta-evolver",
      ],
      engineVersion: CTA_ENGINE_VERSION,
      regenerated: !!shouldRegen,
    });
  } catch (err) {
    console.error("❌ [Cron Error]:", err);
    res.status(500).json({ error: "Cron failed", details: err.message });
  }
}

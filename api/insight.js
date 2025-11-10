// /api/insight.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Insight Pulse v4.0 “Entropy + Churn Diagnostics”
// Purpose:
// • Reads local category silos (appsumo-*.json) and/or feed-cache.json
// • Correlates with CTR to surface momentum + long-tail opportunities
// • Measures CTA/subtitle diversity (entropy) and category health
// • Tracks churn (added/removed slugs) vs previous snapshot
// • Supports silent mode (?silent=1) for master-cron
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { CACHE } from "../lib/proxyCache.js";

const DATA_DIR = path.resolve("./data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");
const CTR_PATH = path.join(DATA_DIR, "ctr-insights.json");
const SNAP_PATH = path.join(DATA_DIR, "insight-latest.json");

// ───────────────────────────── Helpers ─────────────────────────────
function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function listCategoryFiles() {
  try {
    return fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));
  } catch {
    return [];
  }
}

function loadLocalSilos() {
  const files = listCategoryFiles();
  const silos = {};
  for (const file of files) {
    const cat = file.replace(/^appsumo-/, "").replace(/\.json$/, "");
    silos[cat] = loadJson(path.join(DATA_DIR, file), []);
  }
  return silos;
}

function fallbackSilosFromCache() {
  // minimal mapping from proxyCache to silo shape
  const cats = CACHE.categories || {};
  const out = {};
  for (const [cat, deals] of Object.entries(cats)) {
    out[cat] = (deals || []).map((d) => ({
      title: d.title || "Untitled",
      slug:
        (d.title || "")
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-") || "untitled",
      category: cat,
      seo: {},
      archived: false,
      url: d.url || null,
      referralUrl: d.referralUrl || null,
    }));
  }
  return out;
}

function aggregateFromFeed(feed) {
  const out = {};
  for (const d of feed) {
    const cat = (d.category || "software").toLowerCase();
    if (!out[cat]) out[cat] = [];
    out[cat].push(d);
  }
  return out;
}

function tokenizeTitles(items) {
  const titles = items.map((d) => (d.title || "").toLowerCase()).join(" ");
  const words = titles.split(/\W+/).filter((w) => w.length > 2);
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return { words, freq, uniqueCount: Object.keys(freq).length };
}

function entropy(uniqueCount, totalWords) {
  if (!totalWords) return 0;
  const n = Math.max(1, totalWords);
  return +(Math.min(1, uniqueCount / n).toFixed(3));
}

function diversity(items, keyPath) {
  const vals = items
    .map((d) => {
      const seo = d.seo || {};
      return keyPath === "cta" ? seo.cta : seo.subtitle;
    })
    .filter(Boolean);
  if (!vals.length) return 0;
  const set = new Set(vals);
  return +((set.size / vals.length).toFixed(2));
}

function rarityMap(freq) {
  const out = {};
  for (const [w, f] of Object.entries(freq)) out[w] = 1 / (f + 1);
  return out;
}

function risingKeywords(currentFreq = {}, prevFreq = {}) {
  const rise = [];
  for (const [w, c] of Object.entries(currentFreq)) {
    const p = prevFreq[w] || 0;
    const delta = c - p;
    if (delta > 0) rise.push([w, delta / (p + 1)]);
  }
  return rise.sort((a, b) => b[1] - a[1]);
}

function healthFromSignals({ ctaEntropy, subEntropy, churnRate }) {
  // simple ruleset
  if (ctaEntropy < 0.45 || subEntropy < 0.45) return "critical";
  if (churnRate > 0.35) return "warn";
  return "good";
}

function slugsSet(items) {
  const s = new Set();
  for (const d of items) if (d.slug) s.add(String(d.slug).toLowerCase());
  return s;
}

// ───────────────────────────── Handler ─────────────────────────────
export default async function handler(req, res) {
  const t0 = Date.now();
  const silent = req?.query?.silent === "1";

  // 1) Load inputs (prefer local silos; fall back to feed-cache; then CACHE)
  let silos = loadLocalSilos();

  if (!Object.keys(silos).length) {
    const feed = loadJson(FEED_PATH, []);
    if (Array.isArray(feed) && feed.length) {
      silos = aggregateFromFeed(feed);
    } else {
      silos = fallbackSilosFromCache();
    }
  }

  const ctr = loadJson(CTR_PATH, { byDeal: {}, byCategory: {}, recent: [] });
  const prevSnap = loadJson(SNAP_PATH, {
    analysedAt: null,
    categories: {},
    _freqByCat: {},
    _slugsByCat: {},
  });

  // 2) Analyse per-category
  const categories = {};
  const globalCTAs = [];
  const globalSubs = [];
  const globalFreq = {};
  const globalSlugs = new Set();

  for (const [cat, itemsRaw] of Object.entries(silos)) {
    // sanitize items (ensure basic shape)
    const items = (itemsRaw || []).map((d) => ({
      title: d.title || "Untitled",
      slug:
        d.slug ||
        (d.title || "")
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-"),
      category: (d.category || cat).toLowerCase(),
      seo: d.seo || {},
      archived: !!d.archived,
      url: d.url || d.link || null,
      referralUrl: d.referralUrl || null,
      image: d.image || null,
    }));

    const active = items.filter((d) => !d.archived);
    const archived = items.filter((d) => d.archived);

    // token stats
    const { words, freq, uniqueCount } = tokenizeTitles(active);
    for (const [w, f] of Object.entries(freq)) {
      globalFreq[w] = (globalFreq[w] || 0) + f;
    }

    // entropy & diversity
    const titleEntropy = entropy(uniqueCount, words.length);
    const ctaEntropy = diversity(active, "cta");
    const subEntropy = diversity(active, "subtitle");

    // momentum & scarcity
    const prevCount = prevSnap?.categories?.[cat]?.totalDeals || 0;
    const totalDeals = active.length;
    const momentum = +(Math.min(1, prevCount ? totalDeals / prevCount : 0.5).toFixed(3));
    const scarcity = +(Math.max(0, 1 - Math.min(1, totalDeals / 1200)).toFixed(3));

    // CTR correlation (simple heuristic)
    const ctrBoost =
      Object.keys(ctr.byDeal || {}).some((slug) =>
        active.some((a) => String(slug).toLowerCase() === String(a.slug).toLowerCase())
      ) ? 1.15 : 1.0;

    // rarity & weighted scores
    const rarity = rarityMap(freq);
    const prevFreq = prevSnap?._freqByCat?.[cat] || {};
    const risers = risingKeywords(freq, prevFreq);

    const weighted = {};
    for (const w of Object.keys(freq)) {
      const rk = rarity[w] || 0;
      const rise =
        (risers.find(([kw]) => kw === w)?.[1] || 0.25) + 0.1; // small default
      weighted[w] = rk * rise * ctrBoost;
    }

    const sorted = Object.entries(weighted).sort((a, b) => b[1] - a[1]);
    const topKeywords = sorted.slice(0, 10).map(([w]) => w);
    const longTail = sorted
      .filter(([w, score]) => score > 0.02 && w.length > 6)
      .slice(0, 20)
      .map(([w]) => w.replace(/[^a-z0-9]/gi, ""));

    // churn (compare slugs)
    const prevSlugsSet = new Set(
      Object.keys(prevSnap?._slugsByCat?.[cat] || {}).map((k) => k.toLowerCase())
    );
    const currSlugsSet = slugsSet(active);
    const added = [];
    const removed = [];

    for (const s of currSlugsSet) if (!prevSlugsSet.has(s)) added.push(s);
    for (const s of prevSlugsSet) if (!currSlugsSet.has(s)) removed.push(s);

    const churnBase = Math.max(1, currSlugsSet.size + prevSlugsSet.size);
    const churnRate = +((added.length + removed.length) / churnBase).toFixed(2);

    // health
    const health = healthFromSignals({ ctaEntropy, subEntropy, churnRate });

    // collect globals
    globalCTAs.push(
      ...active.map((d) => (d.seo?.cta ? String(d.seo.cta) : null)).filter(Boolean)
    );
    globalSubs.push(
      ...active.map((d) => (d.seo?.subtitle ? String(d.seo.subtitle) : null)).filter(Boolean)
    );
    for (const s of currSlugsSet) globalSlugs.add(s);

    categories[cat] = {
      totalDeals,
      archivedDeals: archived.length,
      titleEntropy, // 0..1
      ctaEntropy,   // 0..1 (unique/total)
      subEntropy,   // 0..1 (unique/total)
      momentum,     // vs previous snapshot (bounded 0..1)
      scarcity,     // fewer items → closer to 1
      boost: +((titleEntropy * 0.4 + momentum * 0.3 + scarcity * 0.2 + 0.1).toFixed(3)),
      topKeywords,
      longTail,
      churn: { added, removed, churnRate },
      sample: active.slice(0, 3).map((d) => ({
        slug: d.slug,
        title: d.title,
        cta: d.seo?.cta || null,
        subtitle: d.seo?.subtitle || null,
      })),
    };
  }

  // 3) Global metrics
  const global = {
    totalCategories: Object.keys(categories).length,
    totalActiveDeals: Array.from(globalSlugs).length,
    ctaEntropy: globalCTAs.length
      ? +(new Set(globalCTAs).size / globalCTAs.length).toFixed(2)
      : 0,
    subtitleEntropy: globalSubs.length
      ? +(new Set(globalSubs).size / globalSubs.length).toFixed(2)
      : 0,
    topRisingKeywords: Object.entries(globalFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([w, f]) => ({ word: w, freq: f })),
  };

  // 4) Build snapshot (include hidden fields to improve next run)
  const analysedAt = new Date().toISOString();
  const durationMs = Date.now() - t0;

  const _freqByCat = {};
  const _slugsByCat = {};
  for (const [cat, items] of Object.entries(silos)) {
    const active = (items || []).filter((d) => !d.archived);
    const { freq } = tokenizeTitles(active);
    _freqByCat[cat] = freq;
    const set = {};
    for (const d of active) if (d.slug) set[String(d.slug).toLowerCase()] = 1;
    _slugsByCat[cat] = set;
  }

  const result = {
    source: "Insight Pulse v4.0",
    analysedAt,
    durationMs,
    categories,
    global,
    // hidden fields for next-diff (not used by UI; safe to persist)
    _freqByCat,
    _slugsByCat,
  };

  // 5) Persist snapshot
  try {
    fs.writeFileSync(SNAP_PATH, JSON.stringify(result, null, 2), "utf8");
  } catch (e) {
    if (!silent) console.warn("⚠️ Unable to persist insight snapshot:", e.message);
  }

  // 6) Respond
  res.json(result);
}

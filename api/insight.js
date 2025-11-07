// /api/insight.js
// v3 — Momentum + Long-Tail Discovery Engine
// Learns from live category feeds and CTR data to discover keyword trends,
// low-competition long-tails, and conversion-weighted SEO signals.

import fs from "fs";
import path from "path";
import { CACHE } from "../lib/proxyCache.js";

const DATA_DIR = path.resolve("./data");
const CTR_PATH = path.join(DATA_DIR, "ctr-insights.json");

function loadJsonSafe(p, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  const start = Date.now();
  const now = new Date().toISOString();

  const ctr = loadJsonSafe(CTR_PATH, { byDeal: {} });
  const cats = CACHE.categories || {};
  const prevKeywords = CACHE.meta.prevKeywords || {};
  const summary = {};
  const globalMomentum = {};

  for (const [cat, deals] of Object.entries(cats)) {
    if (!Array.isArray(deals) || !deals.length) continue;

    // Gather and clean text corpus
    const titles = deals.map((d) => d.title || "").join(" ").toLowerCase();
    const words = titles.split(/\W+/).filter((w) => w.length > 3);
    const unique = new Set(words);

    // Frequency map
    const freq = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;

    // Novelty entropy
    const novelty = unique.size / (words.length || 1);

    // Momentum: compare with last run
    const prev = CACHE.meta.prevCounts?.[cat] || 0;
    const momentum = prev ? Math.min(1, deals.length / prev) : 0.5;

    // Scarcity signal
    const scarcity = 1 - Math.min(1, deals.length / 1000);

    // Archetype tone
    const archetype =
      cat === "ai"
        ? "Novelty & Innovation"
        : cat === "marketing"
        ? "Opportunity & Growth"
        : cat === "courses"
        ? "Authority & Learning"
        : cat === "productivity"
        ? "Efficiency & Focus"
        : "Trust & Reliability";

    // Derive keyword momentum
    const prevFreq = prevKeywords[cat] || {};
    const keywordMomentum = {};
    for (const [word, count] of Object.entries(freq)) {
      const prevCount = prevFreq[word] || 0;
      const delta = count - prevCount;
      if (delta > 0) keywordMomentum[word] = delta / (prevCount + 1);
    }

    // Compute rarity (inverse popularity)
    const rarity = Object.fromEntries(
      Object.entries(freq).map(([w, f]) => [w, 1 / (f + 1)])
    );

    // Weighted importance (rarity × momentum × CTR correlation)
    const weighted = {};
    for (const w of Object.keys(freq)) {
      const ctrWeight = Object.keys(ctr.byDeal || {}).some((deal) =>
        deal.toLowerCase().includes(w)
      )
        ? 1.2
        : 1;
      weighted[w] = (rarity[w] || 0) * ((keywordMomentum[w] || 0.5) + 0.1) * ctrWeight;
    }

    // Sort and extract top & long-tail keywords
    const sorted = Object.entries(weighted).sort((a, b) => b[1] - a[1]);
    const topKeywords = sorted.slice(0, 10).map(([w]) => w);
    const longTail = sorted
      .filter(([w, score]) => score > 0.02 && w.length > 6)
      .slice(0, 20)
      .map(([w]) => w.replace(/[^a-z0-9]/gi, ""));

    // Composite SEO "boost" score
    const boost = Number((novelty * 0.4 + momentum * 0.3 + scarcity * 0.2 + 0.1).toFixed(3));

    summary[cat] = {
      totalDeals: deals.length,
      novelty: Number(novelty.toFixed(3)),
      momentum: Number(momentum.toFixed(3)),
      scarcity: Number(scarcity.toFixed(3)),
      archetype,
      boost,
      topKeywords,
      longTail,
      keywordMomentum
    };

    globalMomentum[cat] = freq;
  }

  // Cache for next cycle
  CACHE.meta.prevCounts = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, v.length]));
  CACHE.meta.prevKeywords = globalMomentum;

  const result = {
    source: "Insight Pulse v3",
    analysedAt: now,
    durationMs: Date.now() - start,
    categories: summary
  };

  // Persist snapshot for evolver reference
  fs.writeFileSync(
    path.join(DATA_DIR, "insight-latest.json"),
    JSON.stringify(result, null, 2)
  );

  res.json(result);
}

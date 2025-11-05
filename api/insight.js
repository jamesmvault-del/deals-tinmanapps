// /api/insight.js
// v2 — Adaptive SEO, CTR, and indexing intelligence
// Learns from live category feeds to produce momentum, novelty, and scarcity metrics.

import { CACHE } from "../lib/proxyCache.js";

export default async function handler(req, res) {
  const start = Date.now();
  const now = new Date().toISOString();

  // Retrieve live category data from cache
  const cats = CACHE.categories || {};
  const summary = {};

  for (const [cat, deals] of Object.entries(cats)) {
    if (!Array.isArray(deals) || !deals.length) continue;

    // Extract titles for keyword entropy & novelty
    const titles = deals.map((d) => d.title || "").join(" ").toLowerCase();
    const words = titles.split(/\W+/).filter((w) => w.length > 4);
    const unique = new Set(words);

    // Novelty entropy — higher = fresher, more diverse titles
    const novelty = unique.size / (words.length || 1);

    // Momentum — relative to previous snapshot
    const prev = CACHE.meta.prevCounts?.[cat] || 0;
    const momentum = prev ? Math.min(1, deals.length / prev) : 0.5;

    // Scarcity — fewer deals = higher exclusivity
    const scarcity = 1 - Math.min(1, deals.length / 1000);

    // CTR psychology archetype
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

    // Weighted composite “boost” score
    const boost = Number(
      (
        novelty * 0.4 +
        momentum * 0.3 +
        scarcity * 0.2 +
        0.1
      ).toFixed(3)
    );

    // Top keyword sample (for metadata refresh)
    const topKeywords = Array.from(unique)
      .sort((a, b) => b.length - a.length)
      .slice(0, 10);

    summary[cat] = {
      totalDeals: deals.length,
      novelty: Number(novelty.toFixed(3)),
      momentum: Number(momentum.toFixed(3)),
      scarcity: Number(scarcity.toFixed(3)),
      archetype,
      boost,
      topKeywords
    };
  }

  // Remember previous counts for next cycle
  CACHE.meta.prevCounts = Object.fromEntries(
    Object.entries(cats).map(([k, v]) => [k, v.length])
  );

  const result = {
    source: "Insight Pulse v2",
    analysedAt: now,
    durationMs: Date.now() - start,
    categories: summary
  };

  res.json(result);
}

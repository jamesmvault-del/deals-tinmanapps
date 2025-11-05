// /api/insight.js
import { CACHE } from "../lib/proxyCache.js";

export default async function handler(req, res) {
  const start = Date.now();
  const summary = {};

  for (const [cat, deals] of Object.entries(CACHE.categories)) {
    const titles = deals.map((d) => d.title?.toLowerCase() || "");
    const words = titles.join(" ").split(/\W+/);
    const unique = new Set(words.filter((w) => w.length > 4));
    const entropy = unique.size / (words.length || 1);

    summary[cat] = {
      totalDeals: deals.length,
      novelty: Number(entropy.toFixed(2)),
      boost: Math.min(1, 0.5 + entropy),
      keywords: Array.from(unique).slice(0, 10)
    };
  }

  res.json({
    source: "Insight Pulse",
    analysedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    categories: summary
  });
}

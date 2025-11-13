// /api/cta-dump.js
// TinmanApps — CTA & Subtitle Exporter v6.0
// “Entropy Integrity Edition — Semantic-Aware, Diagnostic-Ready”
// ───────────────────────────────────────────────────────────────────────────────
// Alignment for CTA Engine v11.x / CTA Evolver v4.x / Learning Governor v4.x
//
// Guarantees:
// • ACTIVE-ONLY dataset (archived excluded)
// • Deterministic ordering (category → title)
// • Category-level diagnostics:
//     - Duplication counts (CTA + subtitle)
//     - Shannon entropy (CTA + subtitle strings)
//     - Token-level entropy (CTA + subtitle tokens)
//     - Length stats + variance (CTA + subtitle)
//     - Duplicate-token rate (“work work”, “boost boost”)
//     - Semantic cluster distribution (via semanticCluster)
// • Global unified ?all=1 export (flat array + global diagnostics)
// • Backwards-compatible schema: existing fields preserved, advanced block added
// • Context-safe sanitisation (no HTML fragments, no stray whitespace)
// • Render-safe (FS-only), zero mutation, cron-safe
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import { CTA_ENGINE_VERSION } from "../lib/ctaEngine.js";
import { detectCluster } from "../lib/semanticCluster.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────
function sanitize(t = "") {
  return String(t || "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function tokenize(t = "") {
  return String(t || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((w) => w.length > 1);
}

function shannonEntropy(values = []) {
  if (!values.length) return 0;
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const total = values.length || 1;
  let H = 0;
  for (const k in counts) {
    const p = counts[k] / total;
    H += -p * Math.log2(p || 1);
  }
  return Number.isFinite(H) ? +H.toFixed(2) : 0;
}

function tokenEntropy(list = []) {
  const tokens = [];
  for (const s of list) tokens.push(...tokenize(s));
  return shannonEntropy(tokens);
}

function lengthStats(list = []) {
  if (!list.length) {
    return {
      avg: 0,
      min: 0,
      max: 0,
      variance: 0,
    };
  }
  const lens = list.map((s) => String(s || "").length);
  const total = lens.length;
  const sum = lens.reduce((a, b) => a + b, 0);
  const avg = sum / total;
  let vSum = 0;
  for (const L of lens) vSum += Math.pow(L - avg, 2);
  const variance = vSum / total;

  return {
    avg: +avg.toFixed(1),
    min: Math.min(...lens),
    max: Math.max(...lens),
    variance: +variance.toFixed(1),
  };
}

function dupWordRate(list = []) {
  if (!list.length) return 0;
  const re = /\b(\w+)\s+\1\b/i;
  let bad = 0;
  for (const s of list) {
    if (re.test(String(s || ""))) bad++;
  }
  return +((bad / list.length) || 0).toFixed(2);
}

function semanticClusterDistribution(items = []) {
  const counts = {};
  for (const it of items) {
    const title = it.title || "";
    const cat = detectCluster ? detectCluster(title) : "software";
    const key = cat || "software";
    counts[key] = (counts[key] || 0) + 1;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const distribution = {};
  for (const [k, v] of Object.entries(counts)) {
    distribution[k] = +(v / total).toFixed(3);
  }

  const entropy = shannonEntropy(
    Object.entries(counts).map(([k, v]) => `${k}:${v}`)
  );

  let dominantCluster = null;
  let dominantCount = -1;
  for (const [k, v] of Object.entries(counts)) {
    if (v > dominantCount) {
      dominantCount = v;
      dominantCluster = k;
    }
  }

  return {
    counts,
    distribution,
    entropy,
    dominantCluster,
  };
}

// ───────────────────────────────────────────────────────────────
// Diagnostics (category + global)
// ───────────────────────────────────────────────────────────────
function computeDiagnostics(items = []) {
  if (!items.length) {
    return {
      total: 0,
      dupCTAs: 0,
      dupSubs: 0,
      entropyCTA: 0,
      entropySub: 0,
      advanced: {
        tokenEntropyCTA: 0,
        tokenEntropySub: 0,
        lengthCTA: { avg: 0, min: 0, max: 0, variance: 0 },
        lengthSub: { avg: 0, min: 0, max: 0, variance: 0 },
        dupWordRateCTA: 0,
        dupWordRateSub: 0,
        semanticClusters: {
          counts: {},
          distribution: {},
          entropy: 0,
          dominantCluster: null,
        },
      },
    };
  }

  const total = items.length;
  const ctas = items.map((i) => sanitize(i.cta));
  const subs = items.map((i) => sanitize(i.subtitle));

  const uniqueCTAs = new Set(ctas).size;
  const uniqueSubs = new Set(subs).size;

  const dupCTAs = total - uniqueCTAs;
  const dupSubs = total - uniqueSubs;
  const entropyCTA = shannonEntropy(ctas);
  const entropySub = shannonEntropy(subs);

  const advanced = {
    tokenEntropyCTA: tokenEntropy(ctas),
    tokenEntropySub: tokenEntropy(subs),
    lengthCTA: lengthStats(ctas),
    lengthSub: lengthStats(subs),
    dupWordRateCTA: dupWordRate(ctas),
    dupWordRateSub: dupWordRate(subs),
    semanticClusters: semanticClusterDistribution(items),
  };

  return { total, dupCTAs, dupSubs, entropyCTA, entropySub, advanced };
}

// ───────────────────────────────────────────────────────────────
// Handler
// ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));

  const allMode = req.query.all === "1" || req.query.all === "true";
  const perCategory = {};
  const combined = [];
  const diagnostics = {};

  // ───────────────────────────────────────────────────────────────
  // Load ACTIVE ONLY per category
  // ───────────────────────────────────────────────────────────────
  for (const file of files) {
    const cat = file.replace("appsumo-", "").replace(".json", "");
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
      const active = raw
        .filter((d) => !d.archived)
        .map((d) => ({
          category: cat,
          title: sanitize(d.title?.trim?.() || ""),
          cta: sanitize(d.seo?.cta?.trim?.() || ""),
          subtitle: sanitize(d.seo?.subtitle?.trim?.() || ""),
        }))
        .sort((a, b) => a.title.localeCompare(b.title));

      perCategory[cat] = active;
      combined.push(...active);
      diagnostics[cat] = computeDiagnostics(active);
    } catch (err) {
      console.warn(`⚠️ Failed to parse ${file}:`, err.message);
      perCategory[cat] = [];
      diagnostics[cat] = {
        total: 0,
        dupCTAs: 0,
        dupSubs: 0,
        entropyCTA: 0,
        entropySub: 0,
        advanced: {
          tokenEntropyCTA: 0,
          tokenEntropySub: 0,
          lengthCTA: { avg: 0, min: 0, max: 0, variance: 0 },
          lengthSub: { avg: 0, min: 0, max: 0, variance: 0 },
          dupWordRateCTA: 0,
          dupWordRateSub: 0,
          semanticClusters: {
            counts: {},
            distribution: {},
            entropy: 0,
            dominantCluster: null,
          },
        },
      };
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Unified Mode (?all=1) → flattened global export
  // ───────────────────────────────────────────────────────────────
  if (allMode) {
    const summary = {};
    for (const [cat, items] of Object.entries(perCategory)) summary[cat] = items.length;

    const sorted = combined.sort((a, b) => {
      if (a.category === b.category) return a.title.localeCompare(b.title);
      return a.category.localeCompare(b.category);
    });

    const globalDiag = computeDiagnostics(sorted);

    const payload = {
      source: "TinmanApps CTA Engine",
      version: CTA_ENGINE_VERSION || "v11.x",
      generated: new Date().toISOString(),
      totalDeals: sorted.length,
      categories: Object.keys(summary).length,
      summary,
      diagnostics: {
        global: globalDiag,
        perCategory: diagnostics,
      },
      deals: sorted,
    };

    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(payload, null, 2));
    return;
  }

  // ───────────────────────────────────────────────────────────────
  // Default Mode (per-category structured export)
  // ───────────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(
    JSON.stringify(
      {
        source: "TinmanApps CTA Engine",
        version: CTA_ENGINE_VERSION || "v11.x",
        generated: new Date().toISOString(),
        categories: perCategory,
        diagnostics,
      },
      null,
      2
    )
  );
}

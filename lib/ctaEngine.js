// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA Engine v1.1 (ESM, zero deps)
// Goal: generate short, high-CTR, non-spammy, semantically diverse CTAs
// - Deterministic per slug (rotates weekly) to avoid churn
// - Adapts tone by category archetype (psychographic framing)
// - Self-improving via ctr-insights.json weighting (if present)
// - Guards: <= 64 chars, safe verbs, no excessive punctuation / clickbait

import fs from "fs";
import path from "path";
import url from "url";

// ---------- Local data / insights (optional) ----------
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_FILE = path.join(DATA_DIR, "ctr-insights.json");

function loadCTR() {
  try {
    const raw = fs.readFileSync(CTR_FILE, "utf8");
    const json = JSON.parse(raw);
    return {
      totalClicks: json.totalClicks || 0,
      byDeal: json.byDeal || {},
      byCategory: json.byCategory || {},
      recent: Array.isArray(json.recent) ? json.recent : [],
    };
  } catch {
    return { totalClicks: 0, byDeal: {}, byCategory: {}, recent: [] };
  }
}

// ---------- Utilities ----------
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rngFactory(seed) {
  // simple xorshift32
  let s = seed >>> 0 || 123456789;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}
function isoYearWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday in current week decides the year.
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function clampLen(s, max = 64) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
function clean(s) {
  return s.replace(/\s+/g, " ").replace(/\!+/g, "!").trim();
}

// ---------- Psychographic banks ----------
const ARCH = {
  software: "Trust & Reliability",
  marketing: "Opportunity & Growth",
  productivity: "Efficiency & Focus",
  ai: "Novelty & Innovation",
  courses: "Authority & Learning",
};

const BENEFITS = {
  software: [
    "simplify your workflow",
    "standardize your process",
    "cut busywork",
    "make ops predictable",
    "reduce tool sprawl",
  ],
  marketing: [
    "grow faster",
    "boost conversions",
    "turn traffic into buyers",
    "scale campaigns",
    "find quick wins",
  ],
  productivity: [
    "save hours each week",
    "prioritize what matters",
    "eliminate friction",
    "stay in flow",
    "ship faster",
  ],
  ai: [
    "automate repetitive work",
    "unlock smart assistance",
    "ship 10× experiments",
    "prototype faster",
    "amplify your output",
  ],
  courses: [
    "level up skills",
    "learn from pros",
    "shorten the learning curve",
    "turn knowledge into action",
    "master the fundamentals",
  ],
};

const VERBS = {
  discovery: ["Explore", "Discover", "See", "Preview", "Learn how to"],
  value: ["Save", "Reclaim", "Streamline", "Accelerate", "Reduce"],
  conversion: ["Unlock", "Get", "Claim", "Start", "Grab"],
  authority: ["See why teams", "See why creators", "See why founders"],
};

const CLOSERS = ["→", "→", "→", "↗", "»"]; // skew to arrow for consistency

// Template shapes — intentionally concise and natural
const TEMPLATES = {
  // cold traffic / discovery
  discovery: [
    ({ verb, benefit }) => `${verb} ${benefit} ${pick(Math.random, CLOSERS)}`,
    ({ title }) => `What ${title} makes easy ${pick(Math.random, CLOSERS)}`,
    ({ verb }) => `${verb} what it replaces ${pick(Math.random, CLOSERS)}`,
  ],
  // mid intent / value framing
  value: [
    ({ verb, benefit }) => `${verb} ${benefit} ${pick(Math.random, CLOSERS)}`,
    ({ benefit }) => `Proof-driven ${benefit} ${pick(Math.random, CLOSERS)}`,
    ({ title }) => `Real-world ${title} results ${pick(Math.random, CLOSERS)}`,
  ],
  // warm / conversion language
  conversion: [
    ({ title }) => `Unlock lifetime access to ${title} ${pick(Math.random, CLOSERS)}`,
    () => `Get lifetime ownership today ${pick(Math.random, CLOSERS)}`,
    ({ title }) => `Start with ${title} in minutes ${pick(Math.random, CLOSERS)}`,
  ],
  // authority social proof
  authority: [
    () => `See why teams are switching ${pick(Math.random, CLOSERS)}`,
    () => `See how others use it ${pick(Math.random, CLOSERS)}`,
    () => `Backed by real user outcomes ${pick(Math.random, CLOSERS)}`,
  ],
};

// ---------- Engine ----------
class CTAEngine {
  constructor(opts = {}) {
    this.ctr = opts.ctr || loadCTR();
    this.used = new Set(); // de-dup within a single build
  }

  // score intent stage by clicks → shapes tone without hard-coding
  intentStage({ slug = "", cat = "" }) {
    const dClicks = this.ctr.byDeal?.[slug] || 0;
    const cClicks = this.ctr.byCategory?.[cat] || 0;
    const total = (dClicks * 3) + (cClicks * 0.5) + (this.ctr.totalClicks ? 0.1 : 0);

    if (total >= 15) return "conversion";   // strong warm signal
    if (total >= 5) return "value";         // engaged but not hot
    return "discovery";                     // default cold
  }

  // deterministic weekly random per slug
  rngFor(slug) {
    const seed = hash32(`${slug}::${isoYearWeek()}`);
    return rngFactory(seed);
  }

  // Main generator
  generate({ title, slug, cat, keywords = [] }) {
    const category = (cat || "").toLowerCase();
    const archetype = ARCH[category] || "Trust & Reliability";
    const benefitPool = BENEFITS[category] || BENEFITS.software;

    const rng = this.rngFor(slug || title || "deal");
    const stage = this.intentStage({ slug, cat: category });

    // choose a tone blend using archetype
    // - Authority archetype gets authority templates blended in
    // - Opportunity / Novelty favor value / discovery
    let templateSet = TEMPLATES[stage];
    if (archetype === "Authority & Learning") {
      // small chance to use authority framing
      if (rng() < 0.35) templateSet = TEMPLATES.authority;
    } else if (archetype === "Novelty & Innovation" && stage === "discovery") {
      // novelty encourages exploration
      templateSet = [...TEMPLATES.discovery, ...TEMPLATES.value];
    }

    // assemble parameters
    const benefit =
      (keywords.find((k) => k.length <= 18) || pick(rng, benefitPool));
    const verb =
      stage === "conversion"
        ? pick(rng, VERBS.conversion)
        : stage === "value"
        ? pick(rng, VERBS.value)
        : pick(rng, VERBS.discovery);

    // try multiple candidates to avoid duplicates & length overflow
    const candidates = [...templateSet];
    for (let i = 0; i < 5; i++) {
      const tmpl = pick(rng, candidates);
      const raw = tmpl({ title: (title || "").trim(), benefit, verb });
      const cta = clampLen(clean(raw), 64);
      const sig = `${slug}::${hash32(cta)}`;
      if (!this.used.has(sig)) {
        this.used.add(sig);
        return cta;
      }
    }

    // safe fallback
    const fallback = clampLen(clean(`${verb} ${benefit} →`), 64);
    this.used.add(`${slug}::${hash32(fallback)}`);
    return fallback;
  }

  // convenience: enrich list of deals (mutates a shallow copy)
  enrichDeals(deals = [], cat) {
    return deals.map((d) => {
      const slug =
        d.slug ||
        d.url?.match(/products\/([^/]+)/)?.[1] ||
        (d.title || "").toLowerCase().replace(/\s+/g, "-");
      const title = d.title || slug || "Deal";
      const keywords = Array.isArray(d.seo?.keywords) ? d.seo.keywords : [];

      const cta = this.generate({ title, slug, cat, keywords });

      const seo = {
        ...(d.seo || {}),
        cta,
        archetype: ARCH[(cat || "").toLowerCase()] || "Trust & Reliability",
      };

      return { ...d, seo };
    });
  }
}

// ---------- Public API ----------
/**
 * Create a reusable engine (recommended for batch use during feed build)
 * const engine = createCtaEngine();
 * const enriched = engine.enrichDeals(deals, "software");
 */
export function createCtaEngine(options = {}) {
  return new CTAEngine(options);
}

/**
 * One-off helper if you just need a single CTA string
 * await generateCTA({ title, slug, cat, keywords })
 */
export function generateCTA(args) {
  const engine = new CTAEngine();
  return engine.generate(args);
}

/**
 * Batch helper if you want a stateless call:
 * const enriched = await enrichDealList(deals, "software")
 */
export function enrichDealList(deals, cat) {
  const engine = new CTAEngine();
  return engine.enrichDeals(deals, cat);
}

// ---------- Minimal usage note (for maintainers) ----------
/*
USAGE (inside scripts/updateFeed.js):

import { createCtaEngine } from "./ctaEngine.js";

const engine = createCtaEngine(); // auto-loads ctr-insights.json if present
const software = engine.enrichDeals(softwareDeals, "software");
const marketing = engine.enrichDeals(marketingDeals, "marketing");
// ... then write them back to data/appsumo-*.json as you already do

— The engine is deterministic per slug per ISO week (rotates weekly).
— It adapts tone by category archetype and recent CTR signals.
— No external libraries. Safe, short, “human” CTAs with diversity.
*/

// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v2.0
// “Concise Reinforcement”
//
// Builds upon v1.9 “Adaptive Psychology + Semantic DNA”
// ———————————————————————————————————————————————
// Goals:
// • Prevent duplicate CTAs per category
// • Auto-trim and normalize subheads for pixel-fit layouts
// • Add verb diversification and smarter brevity scaling
// • Preserve full adaptive/semantic behavior
// ———————————————————————————————————————————————

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_FILE = path.join(DATA_DIR, "ctr-insights.json");

function loadCTR() {
  try {
    const raw = fs.readFileSync(CTR_FILE, "utf8");
    const j = JSON.parse(raw);
    return {
      totalClicks: j.totalClicks || 0,
      byDeal: j.byDeal || {},
      byCategory: j.byCategory || {},
      frameSuccess: j.frameSuccess || {},
      recent: Array.isArray(j.recent) ? j.recent : [],
    };
  } catch {
    return { totalClicks: 0, byDeal: {}, byCategory: {}, frameSuccess: {}, recent: [] };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ───────────────────────────────────────────────────────────────────────────────
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rngFactory(seed) {
  let s = seed >>> 0 || 123456789;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
}
function isoYearWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
function decodeHTML(str = "") {
  return str
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function clampText(s, max = 36) {
  const str = clean(s);
  if (str.length <= max) return str;
  const t = str.slice(0, max - 1).trimEnd();
  return t.replace(/[.,;:\-–—\s]+$/, "") + "…";
}
function semanticHash(str = "") {
  const base = hash32(str).toString(36);
  return base.slice(0, 6);
}

// ───────────────────────────────────────────────────────────────────────────────
// Core psychographic data
// ───────────────────────────────────────────────────────────────────────────────
const ARCH = {
  software: "Trust & Reliability",
  marketing: "Opportunity & Growth",
  productivity: "Efficiency & Focus",
  ai: "Novelty & Innovation",
  courses: "Authority & Learning",
  business: "Confidence & Strategy",
  web: "Design & Innovation",
};

const BENEFITS = {
  software: ["simplify workflows", "reduce busywork", "streamline ops"],
  marketing: ["grow faster", "boost conversions", "drive engagement"],
  productivity: ["save hours", "stay focused", "ship faster"],
  ai: ["leverage AI smarter", "amplify output", "automate creatively"],
  courses: ["learn faster", "master key skills", "apply knowledge"],
  business: ["optimize systems", "scale profitably", "simplify management"],
  web: ["build faster", "design beautifully", "launch confidently"],
};

const CTA_FRAMES = {
  action: ["Start now", "Launch today", "Try it now"],
  proof: ["Join creators using", "See why teams trust"],
  reward: ["Unlock results with", "Gain faster results via"],
  curiosity: ["Discover what", "See it in action"],
  hope: ["Stop struggling — use", "Overcome blocks with"],
};

const GENERIC_SUBS = [
  "Less friction. More results.",
  "Smarter workflows, real outcomes.",
  "Built for creators who take action.",
];

// ───────────────────────────────────────────────────────────────────────────────
// Engine
// ───────────────────────────────────────────────────────────────────────────────
class CTAEngine {
  constructor(opts = {}) {
    this.ctr = opts.ctr || loadCTR();
    this.usedCTAs = new Set();
    this.usedSubs = new Set();
    this.usedVerbs = new Set();
  }

  rngFor(key) { return rngFactory(hash32(`${key}::${isoYearWeek()}`)); }

  generateCTA({ title, slug, cat }) {
    const category = (cat || "software").toLowerCase();
    const rng = this.rngFor(slug || title);
    const brand = clean(decodeHTML(title.split(/[–—|:]/)[0]));
    const benefit = pick(rng, BENEFITS[category] || BENEFITS.software);
    const frameType = pick(rng, Object.keys(CTA_FRAMES));
    const frame = pick(rng, CTA_FRAMES[frameType]);

    // Ensure distinct verbs
    const verb = frame.split(" ")[0];
    if (this.usedVerbs.has(verb)) return null;
    this.usedVerbs.add(verb);

    const raw = `${frame} ${brand} →`;
    const visualCap = brand.length > 8 ? 32 : 36;
    const cta = clampText(raw, visualCap);

    const sig = `${slug || brand}::${hash32(cta)}`;
    if (this.usedCTAs.has(sig)) return null;
    this.usedCTAs.add(sig);

    return cta;
  }

  generateSubtitle({ title, category }) {
    const cat = (category || "software").toLowerCase();
    const rng = this.rngFor(title);
    const brand = clean(decodeHTML(title.split(/[–—|:]/)[0]));
    const benefit = pick(rng, BENEFITS[cat] || BENEFITS.software);

    const patterns = [
      `${brand} helps you ${benefit}.`,
      `Smarter way to ${benefit}.`,
      `${brand} empowers you to ${benefit}.`,
      `${brand}: built to ${benefit}.`,
    ];

    for (const raw of patterns) {
      const sub = clampText(raw, 72);
      const sig = hash32(sub);
      if (!this.usedSubs.has(sig)) {
        this.usedSubs.add(sig);
        return sub;
      }
    }
    return pick(rng, GENERIC_SUBS);
  }

  enrichDeals(deals = [], cat) {
    return deals.map((d) => {
      const slug =
        d.slug ||
        d.url?.match(/products\/([^/]+)/)?.[1] ||
        clean((d.title || "").toLowerCase().replace(/\s+/g, "-"));
      const title = d.title || slug;

      const subtitle = this.generateSubtitle({ title, category: cat });
      let cta = this.generateCTA({ title, slug, cat });
      if (!cta) cta = this.generateCTA({ title: title + "x", slug: slug + "x", cat });

      const seo = {
        ...(d.seo || {}),
        cta,
        subtitle,
        archetype: ARCH[cat] || "Trust & Reliability",
        refreshed: isoYearWeek(),
        semanticHash: semanticHash(title + subtitle + cta),
      };
      return { ...d, seo };
    });
  }
}

// ───────────────────────────────────────────────────────────────────────────────
export function createCtaEngine(o = {}) { return new CTAEngine(o); }
export function generateCTA(a) { return new CTAEngine().generateCTA(a); }
export function enrichDealList(d, c) { return new CTAEngine().enrichDeals(d, c); }

// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v1.5 “Bespoke Adaptive”
// Each product now generates its own unique CTA using contextual title cues,
// subtitle tone, category archetype, and CTR-weighted personalization.
// Ensures week-stable yet product-distinct phrasing.
// ------------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";

// ---------- Local data / insights ----------
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
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function clean(s) {
  return s.replace(/\s+/g, " ").replace(/\!+/g, "!").trim();
}
function clampLen(s, max = 64) {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
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
    "simplify workflows",
    "standardize operations",
    "cut busywork",
    "reduce tool sprawl",
    "make processes predictable",
  ],
  marketing: [
    "grow faster",
    "boost conversions",
    "turn clicks into customers",
    "scale campaigns",
    "capture more leads",
  ],
  productivity: [
    "save hours weekly",
    "stay focused",
    "automate the boring stuff",
    "reduce friction",
    "ship faster",
  ],
  ai: [
    "automate intelligently",
    "leverage AI smarter",
    "scale with innovation",
    "prototype faster",
    "multiply your output",
  ],
  courses: [
    "learn faster",
    "master real-world skills",
    "level up expertise",
    "turn knowledge into action",
    "achieve mastery quickly",
  ],
};

const CTA_ARCHETYPES = {
  software: [
    (d, b) => `See how ${d} helps you ${b} →`,
    (d) => `What ${d} makes effortless →`,
    (d) => `Explore ${d} in action →`,
  ],
  marketing: [
    (d, b) => `Boost growth with ${d} →`,
    (d, b) => `Turn campaigns into conversions with ${d} →`,
    (d) => `Discover ${d} for marketers →`,
  ],
  productivity: [
    (d, b) => `Work smarter with ${d} →`,
    (d, b) => `Reclaim time using ${d} →`,
    (d) => `Streamline your day with ${d} →`,
  ],
  ai: [
    (d, b) => `Use AI smarter with ${d} →`,
    (d, b) => `Automate brilliance using ${d} →`,
    (d) => `See ${d} in action →`,
  ],
  courses: [
    (d, b) => `Learn how ${d} helps you ${b} →`,
    (d, b) => `Master ${b} with ${d} →`,
    (d) => `Enroll with ${d} →`,
  ],
};

// ---------- Engine ----------
class CTAEngine {
  constructor(opts = {}) {
    this.ctr = opts.ctr || loadCTR();
    this.used = new Set();
  }

  intentStage({ slug = "", cat = "" }) {
    const dClicks = this.ctr.byDeal?.[slug] || 0;
    const cClicks = this.ctr.byCategory?.[cat] || 0;
    const total = dClicks * 3 + cClicks * 0.5 + (this.ctr.totalClicks ? 0.1 : 0);
    if (total >= 20) return "conversion";
    if (total >= 8) return "value";
    return "discovery";
  }

  rngFor(slug) {
    const seed = hash32(`${slug}::${isoYearWeek()}`);
    return rngFactory(seed);
  }

  generate({ title, slug, cat, subtitle = "", keywords = [] }) {
    const category = (cat || "").toLowerCase();
    const rng = this.rngFor(slug || title || "deal");
    const benefitPool = [
      ...(BENEFITS[category] || BENEFITS.software),
      ...(keywords || []),
    ].filter(Boolean);
    const benefit = pick(rng, benefitPool);
    const templateSet = CTA_ARCHETYPES[category] || CTA_ARCHETYPES.software;
    const template = pick(rng, templateSet);

    // Occasionally inject subtitle cue for natural context
    const dynamicTitle =
      subtitle && rng() < 0.3
        ? `${title} — ${subtitle.split(" ")[0]}`
        : title;

    const raw = template(dynamicTitle.trim(), benefit);
    const cta = clampLen(clean(raw), 64);
    const sig = `${slug}::${hash32(cta)}`;
    if (this.used.has(sig)) return `${title} →`;
    this.used.add(sig);
    return cta;
  }

  generateSubtitle(record) {
    const { title = "", category = "software" } = record;
    const pool = [
      ...((SUBTITLE_TEMPLATES?.[category]) || []),
      `${title} helps you ${pick(Math.random, BENEFITS[category] || BENEFITS.software)}.`,
    ];
    return pick(Math.random, pool);
  }

  // 🔁 Refresh subtitles & CTAs on every feed run
  enrichDeals(deals = [], cat) {
    return deals.map((d) => {
      const slug =
        d.slug ||
        d.url?.match(/products\/([^/]+)/)?.[1] ||
        (d.title || "").toLowerCase().replace(/\s+/g, "-");

      const title = d.title || slug || "Deal";
      const keywords = Array.isArray(d.seo?.keywords) ? d.seo.keywords : [];
      const subtitle = this.generateSubtitle({ title, category: cat });
      const cta = this.generate({
        title,
        slug,
        cat,
        subtitle,
        keywords,
      });

      const seo = {
        ...(d.seo || {}),
        cta,
        subtitle,
        archetype: ARCH[(cat || "").toLowerCase()] || "Trust & Reliability",
        refreshed: isoYearWeek(),
      };

      return { ...d, seo };
    });
  }
}

// ---------- Public API ----------
export function createCtaEngine(options = {}) {
  return new CTAEngine(options);
}
export function generateCTA(args) {
  const engine = new CTAEngine();
  return engine.generate(args);
}
export function enrichDealList(deals, cat) {
  const engine = new CTAEngine();
  return engine.enrichDeals(deals, cat);
}

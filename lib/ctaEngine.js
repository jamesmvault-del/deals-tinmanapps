// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v1.6 “Precision Adaptive”
// Fixes: CTA length enforcement + Bespoke, context-driven subheadings per product
// Adds: dynamic brevity trimming, unique CTA diversification, keyword-aware subtitles.

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
function clampLen(s, max = 46) {
  if (s.length <= max) return s;
  const truncated = s.slice(0, max - 1).trimEnd();
  return truncated.replace(/[.,;:\-–—\s]+$/, "") + "…";
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
    "multiply output",
  ],
  courses: [
    "learn faster",
    "master real-world skills",
    "level up expertise",
    "turn knowledge into action",
    "achieve mastery quickly",
  ],
};

// ---------- Subheading templates ----------
const SUBTITLE_TEMPLATES = {
  software: [
    "Tools that make your operations seamless.",
    "Empower your workflow with precision automation.",
    "Smarter systems built for reliability.",
    "Modern software that runs your business smoother.",
    "Practical tech that saves you time daily.",
  ],
  marketing: [
    "Drive growth and build your brand effortlessly.",
    "Tools that convert traffic into customers.",
    "Smarter ways to capture and nurture leads.",
    "Grow your audience with confidence.",
    "Scale your marketing results with less effort.",
  ],
  productivity: [
    "Do more with less effort — every single day.",
    "Focus, execute, and reclaim your time.",
    "Reduce friction and stay in your flow state.",
    "Simplify your day and maximize results.",
    "Tools designed to help you finish faster.",
  ],
  ai: [
    "Smarter automation built for modern teams.",
    "Turn AI into your personal advantage.",
    "Innovate faster with smart automation.",
    "AI tools that amplify your productivity.",
    "Future-proof your business with intelligent tech.",
  ],
  courses: [
    "Learn from the best and act with confidence.",
    "Upgrade your skills with guided learning.",
    "Knowledge you can apply right away.",
    "Practical lessons built for real results.",
    "Master what matters — faster.",
  ],
};

// ---------- CTA templates ----------
const CTA_ARCHETYPES = {
  software: [
    (d, b) => `See how ${d} simplifies ${b} →`,
    (d, b) => `Explore ${d} — ${b} made simple →`,
    (d) => `Use ${d} to streamline work →`,
  ],
  marketing: [
    (d, b) => `Boost sales with ${d} →`,
    (d, b) => `See ${d} turn clicks into results →`,
    (d) => `Grow faster using ${d} →`,
  ],
  productivity: [
    (d, b) => `Work smarter with ${d} →`,
    (d, b) => `Reclaim hours using ${d} →`,
    (d) => `Simplify tasks with ${d} →`,
  ],
  ai: [
    (d, b) => `Automate with ${d} →`,
    (d, b) => `Use ${d} to ${b} →`,
    (d) => `Try ${d} in action →`,
  ],
  courses: [
    (d, b) => `Master ${b} with ${d} →`,
    (d) => `Start learning with ${d} →`,
    (d, b) => `Upgrade skills with ${d} →`,
  ],
};

// ---------- Engine ----------
class CTAEngine {
  constructor(opts = {}) {
    this.ctr = opts.ctr || loadCTR();
    this.used = new Set();
  }

  rngFor(slug) {
    const seed = hash32(`${slug}::${isoYearWeek()}`);
    return rngFactory(seed);
  }

  // CTA generator with dynamic brevity
  generate({ title, slug, cat, subtitle = "", keywords = [] }) {
    const category = (cat || "").toLowerCase();
    const rng = this.rngFor(slug || title || "deal");
    const benefitPool = [
      ...(BENEFITS[category] || BENEFITS.software),
      ...(keywords || []),
    ].filter(Boolean);
    const benefit = pick(rng, benefitPool);
    const templateSet = CTA_ARCHETYPES[category] || CTA_ARCHETYPES.software;
    let raw = pick(rng, templateSet)(title.trim(), benefit);

    // shorten if necessary
    let cta = clean(raw)
      .replace(/\s+/g, " ")
      .replace(/[–—]+/g, "-")
      .trim();
    cta = clampLen(cta, 44).replace(/[.,"'!;:]+$/, "");

    // ensure uniqueness within session
    const sig = `${slug}::${hash32(cta)}`;
    if (this.used.has(sig)) {
      const shortAlt = clampLen(`${title} →`, 44);
      this.used.add(sig);
      return shortAlt;
    }
    this.used.add(sig);
    return cta;
  }

  // Bespoke subtitle generator per product
  generateSubtitle(record) {
    const { title = "", category = "software", seo = {} } = record;
    const keywords = Array.isArray(seo.keywords) ? seo.keywords : [];
    const baseTemplate = SUBTITLE_TEMPLATES[category] || SUBTITLE_TEMPLATES.software;

    // Mix context from title + category benefits
    const benefit =
      pick(Math.random, BENEFITS[category] || BENEFITS.software);
    const keyword = keywords.length ? pick(Math.random, keywords) : benefit;

    const templates = [
      `${title} helps you ${keyword}.`,
      `${title} makes it easy to ${benefit}.`,
      `Empower your workflow with ${title}.`,
      `Discover how ${title} enhances ${keyword}.`,
      pick(Math.random, baseTemplate),
    ];

    return clampLen(clean(pick(Math.random, templates)), 72);
  }

  enrichDeals(deals = [], cat) {
    return deals.map((d) => {
      const slug =
        d.slug ||
        d.url?.match(/products\/([^/]+)/)?.[1] ||
        (d.title || "").toLowerCase().replace(/\s+/g, "-");

      const title = d.title || slug || "Deal";
      const keywords = Array.isArray(d.seo?.keywords) ? d.seo.keywords : [];
      const subtitle = this.generateSubtitle({ title, category: cat, seo: d.seo });
      const cta = this.generate({ title, slug, cat, subtitle, keywords });

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

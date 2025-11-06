// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v1.3
// Adds intelligent subtitle generation (SEO + CTR boost)
// Retains adaptive, CTR-weighted, deterministic CTA logic.

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

// Archetype-based subheading templates
const SUBTITLE_TEMPLATES = {
  software: [
    "Run your business smarter with AI-powered efficiency.",
    "Simplify your daily workflow — everything in one place.",
    "Modern tools built to save you time and boost output.",
    "Empower your team with seamless automation.",
    "Smarter software that pays for itself in time saved.",
  ],
  marketing: [
    "Grow your audience faster with data-driven insights.",
    "Automate campaigns, capture leads, and convert with ease.",
    "Turn engagement into revenue — effortlessly.",
    "Marketing tools that make every click count.",
    "Stand out, sell more, and scale faster.",
  ],
  productivity: [
    "Stay focused and achieve more every day.",
    "Work smarter, not longer — automate the boring stuff.",
    "Tools that help you save hours and reduce stress.",
    "Maximize your output with minimal effort.",
    "Reclaim your time and focus on what matters.",
  ],
  ai: [
    "Harness artificial intelligence to scale your impact.",
    "Smarter automation for creators and businesses.",
    "Turn AI into your competitive edge.",
    "Leverage machine intelligence to do more with less.",
    "Future-proof your workflow with cutting-edge AI.",
  ],
  courses: [
    "Learn practical skills you can apply today.",
    "Level up your expertise with step-by-step guidance.",
    "Master in-demand skills from proven creators.",
    "Build your career with actionable learning.",
    "Turn knowledge into results — faster.",
  ],
};

const VERBS = {
  discovery: ["Explore", "Discover", "See", "Preview", "Learn how to"],
  value: ["Save", "Reclaim", "Streamline", "Accelerate", "Reduce"],
  conversion: ["Unlock", "Get", "Claim", "Start", "Grab"],
  authority: ["See why teams", "See why creators", "See why founders"],
};
const CLOSERS = ["→", "→", "→", "↗", "»"];

const TEMPLATES = {
  discovery: [
    ({ verb, benefit }) => `${verb} ${benefit} ${pick(Math.random, CLOSERS)}`,
    ({ title }) => `What ${title} makes easy ${pick(Math.random, CLOSERS)}`,
    ({ verb }) => `${verb} what it replaces ${pick(Math.random, CLOSERS)}`,
  ],
  value: [
    ({ verb, benefit }) => `${verb} ${benefit} ${pick(Math.random, CLOSERS)}`,
    ({ benefit }) => `Proof-driven ${benefit} ${pick(Math.random, CLOSERS)}`,
    ({ title }) => `Real-world ${title} results ${pick(Math.random, CLOSERS)}`,
  ],
  conversion: [
    ({ title }) => `Unlock lifetime access to ${title} ${pick(Math.random, CLOSERS)}`,
    () => `Get lifetime ownership today ${pick(Math.random, CLOSERS)}`,
    ({ title }) => `Start with ${title} in minutes ${pick(Math.random, CLOSERS)}`,
  ],
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
    this.used = new Set();
  }

  intentStage({ slug = "", cat = "" }) {
    const dClicks = this.ctr.byDeal?.[slug] || 0;
    const cClicks = this.ctr.byCategory?.[cat] || 0;
    const total = (dClicks * 3) + (cClicks * 0.5) + (this.ctr.totalClicks ? 0.1 : 0);
    if (total >= 15) return "conversion";
    if (total >= 5) return "value";
    return "discovery";
  }

  rngFor(slug) {
    const seed = hash32(`${slug}::${isoYearWeek()}`);
    return rngFactory(seed);
  }

  generate({ title, slug, cat, keywords = [] }) {
    const category = (cat || "").toLowerCase();
    const archetype = ARCH[category] || "Trust & Reliability";
    const benefitPool = BENEFITS[category] || BENEFITS.software;
    const rng = this.rngFor(slug || title || "deal");
    const stage = this.intentStage({ slug, cat: category });
    let templateSet = TEMPLATES[stage];

    if (archetype === "Authority & Learning" && rng() < 0.35) {
      templateSet = TEMPLATES.authority;
    } else if (archetype === "Novelty & Innovation" && stage === "discovery") {
      templateSet = [...TEMPLATES.discovery, ...TEMPLATES.value];
    }

    const benefit = (keywords.find((k) => k.length <= 18) || pick(rng, benefitPool));
    const verb =
      stage === "conversion"
        ? pick(rng, VERBS.conversion)
        : stage === "value"
        ? pick(rng, VERBS.value)
        : pick(rng, VERBS.discovery);

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
    const fallback = clampLen(clean(`${verb} ${benefit} →`), 64);
    this.used.add(`${slug}::${hash32(fallback)}`);
    return fallback;
  }

  generateSubtitle(record) {
    const { title = "", category = "software" } = record;
    const parts = title.split(/\s*[-–—]\s*/);
    if (parts.length > 1 && parts[1].length > 6) {
      return parts.slice(1).join(" – ").trim();
    }
    const pool = SUBTITLE_TEMPLATES[category] || SUBTITLE_TEMPLATES.software;
    return pick(Math.random, pool);
  }

  // 🔁 Always refresh subtitles & CTAs on every run
  enrichDeals(deals = [], cat) {
    return deals.map((d) => {
      const slug =
        d.slug ||
        d.url?.match(/products\/([^/]+)/)?.[1] ||
        (d.title || "").toLowerCase().replace(/\s+/g, "-");

      const title = d.title || slug || "Deal";
      const keywords = Array.isArray(d.seo?.keywords) ? d.seo.keywords : [];
      const cta = this.generate({ title, slug, cat, keywords });
      const subtitle = this.generateSubtitle({ title, category: cat });

      const seo = {
        ...(d.seo || {}),
        cta,
        subtitle,
        archetype: ARCH[(cat || "").toLowerCase()] || "Trust & Reliability",
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

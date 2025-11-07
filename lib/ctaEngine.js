// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v1.9
// “Adaptive Psychology + Semantic DNA”
// ———————————————————————————————————————————————
// Mission: self-learning, psychologically adaptive CTAs and SEO-unique subtitles
// Built for zero duplication, ethical persuasion, and referral-safe presentation.
// ———————————————————————————————————————————————

import fs from "fs";
import path from "path";
import url from "url";

// ---------- Local data ----------
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
      frameSuccess: j.frameSuccess || {}, // new frame-based learning
      recent: Array.isArray(j.recent) ? j.recent : [],
    };
  } catch {
    return { totalClicks: 0, byDeal: {}, byCategory: {}, frameSuccess: {}, recent: [] };
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
function clampLen(s, max = 38) {
  const str = clean(s);
  if (str.length <= max) return str;
  const t = str.slice(0, max - 1).trimEnd();
  return t.replace(/[.,;:\-–—\s]+$/, "") + "…";
}
function clampVisual(s, max = 34) {
  // soft visual width scoring (approx 0.9 per glyph average)
  const width = s.length * 0.9;
  return width <= max ? s : clampLen(s, max);
}
function decodeHTML(str = "") {
  return str
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function mergeUnique(a = [], b = []) {
  const s = new Set([...(a || []), ...(b || [])].map(clean).filter(Boolean));
  return Array.from(s);
}
function semanticHash(str = "") {
  const base = hash32(str).toString(36);
  return base.slice(0, 6);
}

// ---------- Psychographic constants ----------
const ARCH = {
  software: "Trust & Reliability",
  marketing: "Opportunity & Growth",
  productivity: "Efficiency & Focus",
  ai: "Novelty & Innovation",
  courses: "Authority & Learning",
};

// ---------- CTA frames (psychological archetypes) ----------
const CTA_FRAMES = {
  action: [
    (b, ben) => `Start now with ${b} →`,
    (b, ben) => `Try ${b} today →`,
    (b, ben) => `Launch with ${b} →`,
  ],
  proof: [
    (b, ben) => `Join creators using ${b} →`,
    (b, ben) => `See why teams trust ${b} →`,
  ],
  reward: [
    (b, ben) => `Unlock ${ben} with ${b} →`,
    (b, ben) => `Gain results faster via ${b} →`,
  ],
  curiosity: [
    (b, ben) => `Discover what ${b} can do →`,
    (b, ben) => `See ${b} in action →`,
  ],
  hope: [
    (b, ben) => `Stop struggling — use ${b} →`,
    (b, ben) => `Overcome blocks with ${b} →`,
  ],
};

// ---------- Benefit banks ----------
const BENEFITS = {
  software: ["simplify workflows", "reduce busywork", "streamline ops"],
  marketing: ["grow faster", "boost conversions", "drive engagement"],
  productivity: ["save hours", "stay focused", "ship faster"],
  ai: ["leverage AI smarter", "amplify output", "automate creatively"],
  courses: ["learn faster", "master key skills", "apply knowledge"],
};

// ---------- Subtitle patterns ----------
const SUBTITLES = {
  software: [
    (b, ben) => `${b} helps you ${ben}.`,
    (b, ben) => `Smarter tools to ${ben}.`,
  ],
  marketing: [
    (b, ben) => `${b} lets marketers ${ben}.`,
    (b, ben) => `Grow your brand — ${b} helps you ${ben}.`,
  ],
  productivity: [
    (b, ben) => `Achieve focus and ${ben} with ${b}.`,
    (b, ben) => `Organize better — ${b} helps you ${ben}.`,
  ],
  ai: [
    (b, ben) => `${b} empowers you to ${ben}.`,
    (b, ben) => `Amplify creativity and ${ben} using ${b}.`,
  ],
  courses: [
    (b, ben) => `Learn to ${ben} with ${b}.`,
    (b, ben) => `Gain mastery — ${b} teaches you to ${ben}.`,
  ],
};
const GENERIC_SUBS = [
  "Less friction. More results.",
  "Modern workflows, real outcomes.",
  "Built for creators who take action.",
];

// ---------- Engine ----------
class CTAEngine {
  constructor(opts = {}) {
    this.ctr = opts.ctr || loadCTR();
    this.usedCTAs = new Set();
    this.usedSubs = new Set();
  }

  rngFor(key) { return rngFactory(hash32(`${key}::${isoYearWeek()}`)); }

  weightedFramePool(rng, category) {
    const frames = Object.keys(CTA_FRAMES);
    const weights = frames.map((f) => {
      const base = 1;
      const bias = this.ctr.frameSuccess?.[f]?.score || 0;
      return base + bias * 0.3;
    });
    // Weighted random
    const total = weights.reduce((a, b) => a + b, 0);
    const roll = rng() * total;
    let acc = 0;
    for (let i = 0; i < frames.length; i++) {
      acc += weights[i];
      if (roll <= acc) return frames[i];
    }
    return pick(rng, frames);
  }

  generateSubtitle({ title, category = "software" }) {
    const cat = category.toLowerCase();
    const rng = this.rngFor(title);
    const brand = clean(decodeHTML(title.split(/[–—|:]/)[0]));
    const benefit = pick(rng, BENEFITS[cat] || BENEFITS.software);
    const template = pick(rng, SUBTITLES[cat] || SUBTITLES.software);
    for (let i = 0; i < 5; i++) {
      const raw = template(brand, benefit);
      const sub = clampLen(raw, 72);
      const sig = hash32(sub);
      if (!this.usedSubs.has(sig)) {
        this.usedSubs.add(sig);
        return sub;
      }
    }
    const fallback = pick(rng, GENERIC_SUBS);
    return clampLen(fallback, 72);
  }

  generate({ title, slug, cat }) {
    const category = (cat || "software").toLowerCase();
    const rng = this.rngFor(slug || title);
    const brand = clean(decodeHTML(title.split(/[–—|:]/)[0]));
    const benefit = pick(rng, BENEFITS[category] || BENEFITS.software);
    const frame = this.weightedFramePool(rng, category);
    const pool = CTA_FRAMES[frame] || CTA_FRAMES.action;

    for (let i = 0; i < 8; i++) {
      const raw = pick(rng, pool)(brand, benefit);
      const cta = clampVisual(clean(raw), 34);
      const sig = `${slug}::${hash32(cta)}`;
      if (!this.usedCTAs.has(sig)) {
        this.usedCTAs.add(sig);
        return cta;
      }
    }
    return clampVisual(`Try ${brand} →`, 34);
  }

  enrichDeals(deals = [], cat) {
    return deals.map((d) => {
      const slug =
        d.slug ||
        d.url?.match(/products\/([^/]+)/)?.[1] ||
        clean((d.title || "").toLowerCase().replace(/\s+/g, "-"));
      const title = d.title || slug;
      const subtitle = this.generateSubtitle({ title, category: cat });
      const cta = this.generate({ title, slug, cat });
      const semantic = semanticHash(title + subtitle + cta);
      const seo = {
        ...(d.seo || {}),
        cta,
        subtitle,
        archetype: ARCH[cat] || "Trust & Reliability",
        refreshed: isoYearWeek(),
        semanticHash: semantic,
      };
      return { ...d, seo };
    });
  }
}

// ---------- Public API ----------
export function createCtaEngine(o = {}) { return new CTAEngine(o); }
export function generateCTA(a) { return new CTAEngine().generate(a); }
export function enrichDealList(d, c) { return new CTAEngine().enrichDeals(d, c); }

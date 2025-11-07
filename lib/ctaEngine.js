// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v1.8
// “Semantic SEO + CTR Fusion”
// Fixes: thin/duplicated subtitles, generic CTAs, weak category semantics.
// Adds: category-keyword fusion, CTR-biased template weighting,
//       per-page de-duplication, smarter brand/keyword extraction,
//       stricter clamps (CTA 38, Subtitle 72), safer sanitization.

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
      recent: Array.isArray(j.recent) ? j.recent : [],
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
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
}
function isoYearWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
function clampLen(s, max) {
  const str = clean(s);
  if (str.length <= max) return str;
  const t = str.slice(0, max - 1).trimEnd();
  return t.replace(/[.,;:\-–—\s]+$/, "") + "…";
}

// Words that reduce perceived quality or leak affiliate context.
// (We intentionally keep domain terms like “software” in subtitles if meaningful,
//  but still sanitize in CTAs.)
const BAD_CTA = /\b(appsumo|exclusive|deal|offer|coupon|discount)\b/i;
const SANITIZE_CTA = (s) => clean(s).replace(BAD_CTA, "").replace(/\s{2,}/g, " ").trim();
const SANITIZE_SUB = (s) => clean(s);

// ---------- Psychographic banks ----------
const ARCH = {
  software: "Trust & Reliability",
  marketing: "Opportunity & Growth",
  productivity: "Efficiency & Focus",
  ai: "Novelty & Innovation",
  courses: "Authority & Learning",
};

const BENEFITS = {
  software: ["simplify workflows","reduce busywork","streamline ops","save admin time","cut tool sprawl"],
  marketing: ["grow faster","boost conversions","scale campaigns","capture more leads","drive engagement"],
  productivity: ["save hours","stay focused","ship faster","reduce friction","automate tasks"],
  ai: ["leverage AI smarter","prototype faster","amplify output","automate creatively","scale innovation"],
  courses: ["learn faster","master key skills","apply knowledge","level up expertise","achieve mastery"],
};

// Category → canonical keyword to weave into subtitles for SEO coherence
const CATEGORY_KEYWORD = {
  software: "software",
  marketing: "marketing",
  productivity: "productivity",
  ai: "AI",
  courses: "courses",
};

// ---------- Subtitle templates (category-keyword fused) ----------
const SUBTITLE_TEMPLATES = {
  software: [
    (brand, kw, ben) => `Streamline ${kw} with ${brand}.`,
    (brand, kw, ben) => `Modern ${kw} to ${ben} — ${brand}.`,
    (brand, kw, ben) => `Reduce busywork: ${brand} ${kw} that works.`,
    (brand, kw, ben) => `Smarter ${kw} for teams — ${brand}.`,
    (brand, kw, ben) => `Ship faster with ${brand} ${kw}.`,
  ],
  marketing: [
    (brand, kw, ben) => `Grow your ${kw} results with ${brand}.`,
    (brand, kw, ben) => `Convert more with ${brand} ${kw}.`,
    (brand, kw, ben) => `Scale campaigns faster — ${brand} ${kw}.`,
    (brand, kw, ben) => `Engage and convert — ${brand} ${kw}.`,
    (brand, kw, ben) => `Build demand with ${brand} ${kw}.`,
  ],
  productivity: [
    (brand, kw, ben) => `Save hours each week — ${brand} ${kw}.`,
    (brand, kw, ben) => `Focus on what matters with ${brand} ${kw}.`,
    (brand, kw, ben) => `Automate tasks and ${ben} — ${brand}.`,
    (brand, kw, ben) => `Organize, simplify, execute — ${brand} ${kw}.`,
    (brand, kw, ben) => `Reduce friction with ${brand} ${kw}.`,
  ],
  ai: [
    (brand, kw, ben) => `Amplify output with ${brand} ${kw}.`,
    (brand, kw, ben) => `Prototype faster using ${brand} ${kw}.`,
    (brand, kw, ben) => `Automate creatively — ${brand} ${kw}.`,
    (brand, kw, ben) => `Scale innovation via ${brand} ${kw}.`,
    (brand, kw, ben) => `Leverage ${kw} smarter with ${brand}.`,
  ],
  courses: [
    (brand, kw, ben) => `Learn ${kw} faster with ${brand}.`,
    (brand, kw, ben) => `Master key skills — ${brand} ${kw}.`,
    (brand, kw, ben) => `Apply knowledge quickly with ${brand} ${kw}.`,
    (brand, kw, ben) => `Level up expertise through ${brand} ${kw}.`,
    (brand, kw, ben) => `Practical ${kw} training by ${brand}.`,
  ],
};

const GENERIC_SUBS = [
  "Smarter systems for busy teams.",
  "Less friction. More results.",
  "Built to help you ship faster.",
  "Modern workflows without the busywork.",
];

// ---------- CTA templates (grammar-safe, concise) ----------
const CTA_TEMPLATES_BASE = [
  (b, ben) => `See ${b} in action →`,
  (b, ben) => `Try ${b} now →`,
  (b, ben) => `Discover ${b} →`,
  (b, ben) => `Boost productivity with ${b} →`,
  (b, ben) => `How ${b} helps you ${ben} →`,
];

// Additional CTA templates per archetype to widen variance
const CTA_TEMPLATES_BY_CAT = {
  courses: [
    (b, ben) => `Start learning with ${b} →`,
    (b, ben) => `Master it with ${b} →`,
    (b, ben) => `Begin your course with ${b} →`,
  ],
  marketing: [
    (b, ben) => `Grow with ${b} →`,
    (b, ben) => `Increase conversions via ${b} →`,
  ],
  productivity: [
    (b, ben) => `Save hours with ${b} →`,
    (b, ben) => `Organize work using ${b} →`,
  ],
  ai: [
    (b, ben) => `Build faster with ${b} →`,
    (b, ben) => `Leverage AI via ${b} →`,
  ],
  software: [
    (b, ben) => `Scale operations with ${b} →`,
    (b, ben) => `Simplify workflows with ${b} →`,
  ],
};

// ---------- Keyword helpers ----------
function extractBrand(title = "") {
  const t = clean(title);
  // Split on “–—|:” and spaces; prefer first capitalized token/phrase
  const m = t.split(/[–—|:]/)[0].trim();
  // If starts with a known short descriptor, keep next token too (e.g., "Lean Six Sigma")
  return m.length > 2 ? m : t.split(/\s+/)[0];
}

function inferKeywordFromTitle(title = "", fallback = "") {
  const t = clean(title).toLowerCase();
  const hits = [
    { rx: /\bno[-\s]?code\b/, kw: "no-code" },
    { rx: /\bspreadsheet|sheets?\b/, kw: "spreadsheets" },
    { rx: /\bemail|newsletter|inbox\b/, kw: "email" },
    { rx: /\bdesign|icons?|illustrations?\b/, kw: "design" },
    { rx: /\bvideo|reels?|shorts?\b/, kw: "video" },
    { rx: /\bautomation|workflow|process\b/, kw: "automation" },
    { rx: /\bfinance|profit|pricing|roi\b/, kw: "finance" },
    { rx: /\bai|gpt|models?\b/, kw: "AI" },
    { rx: /\bcourse|training|class|lessons?\b/, kw: "courses" },
    { rx: /\bcrm|leads?|pipeline\b/, kw: "CRM" },
    { rx: /\bkanban|tasks?|project\b/, kw: "project management" },
  ];
  for (const h of hits) if (h.rx.test(t)) return h.kw;
  return fallback || "";
}

function mergeUnique(a = [], b = []) {
  const s = new Set([...(a || []), ...(b || [])].map(clean).filter(Boolean));
  return Array.from(s);
}

// ---------- Engine ----------
class CTAEngine {
  constructor(opts = {}) {
    this.ctr = opts.ctr || loadCTR();
    // Track duplicates across a render cycle
    this.usedCTAs = new Set();
    this.usedSubs = new Set();
  }

  rngFor(slugOrTitle) {
    return rngFactory(hash32(`${slugOrTitle}::${isoYearWeek()}`));
  }

  // Weighted template pool based on CTR insights
  templatePoolFor(category, dealKey, rng) {
    const base = [...CTA_TEMPLATES_BASE, ...(CTA_TEMPLATES_BY_CAT[category] || [])];

    // Bias templates that previously performed well
    const weights = new Map(base.map((t, i) => [i, 1]));

    const catInsights = this.ctr.byCategory?.[category];
    if (catInsights?.boostedCTAIndex != null && weights.has(catInsights.boostedCTAIndex)) {
      weights.set(catInsights.boostedCTAIndex, (weights.get(catInsights.boostedCTAIndex) || 1) + 2);
    }
    const dealInsights = this.ctr.byDeal?.[dealKey];
    if (dealInsights?.boostedCTAIndex != null && weights.has(dealInsights.boostedCTAIndex)) {
      weights.set(dealInsights.boostedCTAIndex, (weights.get(dealInsights.boostedCTAIndex) || 1) + 2);
    }

    // Turn weights into a sampling list
    const expanded = [];
    weights.forEach((w, i) => { for (let k = 0; k < w; k++) expanded.push(base[i]); });
    return expanded.length ? expanded : base;
  }

  generateSubtitle({ title = "", category = "software", keywords = [] }) {
    const brand = extractBrand(title);
    const cat = (category || "software").toLowerCase();
    const kwCanonical = CATEGORY_KEYWORD[cat] || "software";
    // Try to infer a more specific keyword from title or provided keywords
    const inferred = inferKeywordFromTitle(title, kwCanonical);
    const kw = inferred || kwCanonical;

    const benefit = pick(Math.random, BENEFITS[cat] || ["get more done"]);
    const templates = SUBTITLE_TEMPLATES[cat] || SUBTITLE_TEMPLATES.software;
    const rng = this.rngFor(`${title}::${cat}::subtitle`);

    for (let i = 0; i < 8; i++) {
      const raw = pick(rng, templates)(brand, kw, benefit);
      const sub = clampLen(SANITIZE_SUB(raw), 72);
      const sig = hash32(sub);
      if (!this.usedSubs.has(sig)) {
        this.usedSubs.add(sig);
        return sub;
      }
    }
    // Fallbacks
    const generic = pick(Math.random, GENERIC_SUBS);
    const fallback = `${generic} ${brand}.`;
    const sub = clampLen(SANITIZE_SUB(fallback), 72);
    this.usedSubs.add(hash32(sub));
    return sub;
  }

  generate({ title, slug, cat, keywords = [] }) {
    const category = (cat || "").toLowerCase() || "software";
    const dealKey = (slug || title || "").toLowerCase();
    const rng = this.rngFor(slug || title);
    const benefitPool = mergeUnique(BENEFITS[category] || [], keywords || []);
    const benefit = (benefitPool.length ? pick(rng, benefitPool) : "get results")
      .replace(/\bwith\b/gi, "")
      .trim();
    const brand = extractBrand(title || slug || "This");

    const pool = this.templatePoolFor(category, dealKey, rng);

    for (let i = 0; i < 8; i++) {
      const raw = pick(rng, pool)(brand, benefit);
      let cta = clampLen(SANITIZE_CTA(raw), 38);
      if (!cta || BAD_CTA.test(cta)) continue;
      const sig = `${dealKey}::${hash32(cta)}`;
      if (!this.usedCTAs.has(sig)) {
        this.usedCTAs.add(sig);
        return cta;
      }
    }
    // Hard fallback
    const fallback = clampLen(`Explore ${brand} →`, 38);
    this.usedCTAs.add(`${dealKey}::${hash32(fallback)}`);
    return fallback;
  }

  enrichDeals(deals = [], cat) {
    return deals.map((d) => {
      const slug =
        d.slug ||
        d.url?.match(/products\/([^/]+)/)?.[1] ||
        clean((d.title || "").toLowerCase().replace(/\s+/g, "-"));
      const title = d.title || slug;
      const keywords = Array.isArray(d.seo?.keywords) ? d.seo.keywords : [];
      const subtitle = this.generateSubtitle({ title, category: cat, keywords });
      const cta = this.generate({ title, slug, cat, keywords });
      const seo = {
        ...(d.seo || {}),
        cta,
        subtitle,
        archetype: ARCH[cat] || "Trust & Reliability",
        refreshed: isoYearWeek(),
        // subtle semantic hint for search engines that parse JSON blobs
        intent: CATEGORY_KEYWORD[cat] || "software",
      };
      return { ...d, seo };
    });
  }
}

// ---------- Public API ----------
export function createCtaEngine(o = {}) { return new CTAEngine(o); }
export function generateCTA(a) { return new CTAEngine().generate(a); }
export function enrichDealList(d, c) { return new CTAEngine().enrichDeals(d, c); }

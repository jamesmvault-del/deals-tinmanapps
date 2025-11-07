
// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v1.7 “Precision+Contextual Intelligence”
// Fixes: illogical CTAs + repetitive subtitles + overflow
// Adds: grammar-safe CTA templates, domain-aware subheadings, strict 38-char clamp.

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
function clean(s) { return s.replace(/\s+/g, " ").trim(); }
function clampLen(s, max = 38) {
  if (s.length <= max) return s;
  const t = s.slice(0, max - 1).trimEnd();
  return t.replace(/[.,;:\-–—\s]+$/, "") + "…";
}
const BAD = /\b(appsumo|software|exclusive|deal|offer|coupon|discount)\b/i;
const SANITIZE = s => clean(s).replace(BAD, "").replace(/\s{2,}/g, " ").trim();

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

// ---------- Domain-specific subtitle cues ----------
const DOMAIN_RULES = [
  { rx: /(calendar|schedule|meeting|booking)/i, lines: [
    "Scheduling made effortless and smart.","Book meetings without the back-and-forth.","Streamline appointments for your team."
  ]},
  { rx: /(email|campaign|newsletter|inbox)/i, lines: [
    "Send campaigns that actually convert.","Automate follow-ups and boost opens.","Smarter outreach, less manual work."
  ]},
  { rx: /(card|cardclan|postcard)/i, lines: [
    "Delight clients with personalized cards.","Send thoughtful cards at real scale.","Build relationships that stand out."
  ]},
  { rx: /(content|social|video|caption|yapper)/i, lines: [
    "Create scroll-stopping content easily.","Turn ideas into ready-to-post assets.","Keep your feed active effortlessly."
  ]},
  { rx: /(project|task|kanban|board|manage|pm)/i, lines: [
    "Plan and ship projects without friction.","Keep every task visible and on track.","Achieve clarity across your workflow."
  ]},
  { rx: /(automation|agent|workflow|ops|process)/i, lines: [
    "Automate repeatable work reliably.","Build smart workflows that scale.","Run processes on autopilot."
  ]},
  { rx: /(invoice|billing|payment|checkout)/i, lines: [
    "Simplify payments and get paid faster.","Frictionless billing for modern teams.","Handle payments with zero hassle."
  ]}
];
const GENERIC_SUBS = [
  "Modern tools that save you time.","Smarter systems for busy teams.","Less friction. More results."
];

// ---------- CTA templates (grammar-safe, concise) ----------
const CTA_TEMPLATES = [
  (b, ben) => `See ${b} in action →`,
  (b, ben) => `Try ${b} now →`,
  (b, ben) => `Discover ${b} →`,
  (b, ben) => `Boost productivity with ${b} →`,
  (b, ben) => `How ${b} helps you ${ben} →`,
];

// ---------- Engine ----------
class CTAEngine {
  constructor(opts = {}) { this.ctr = opts.ctr || loadCTR(); this.used = new Set(); }

  rngFor(slug) { return rngFactory(hash32(`${slug}::${isoYearWeek()}`)); }

  generateSubtitle({ title = "", category = "software" }) {
    const t = SANITIZE(title);
    const rule = DOMAIN_RULES.find(r => r.rx.test(t));
    if (rule) return pick(Math.random, rule.lines);
    const pool = (BENEFITS[category] || []).map(b => b[0].toUpperCase() + b.slice(1) + ".");
    return pick(Math.random, [...GENERIC_SUBS, ...pool]);
  }

  generate({ title, slug, cat, keywords = [] }) {
    const category = (cat || "").toLowerCase();
    const rng = this.rngFor(slug || title);
    const benefit = pick(rng, [...(BENEFITS[category]||[]), ...(keywords||[])]).replace(/\bwith\b/gi,"").trim();
    const brand = title.split(/\s|–|—/)[0].trim();
    for (let i = 0; i < 5; i++) {
      const raw = pick(rng, CTA_TEMPLATES)(brand, benefit);
      let cta = clampLen(SANITIZE(raw), 38);
      if (!cta || BAD.test(cta)) continue;
      const sig = `${slug}::${hash32(cta)}`;
      if (!this.used.has(sig)) { this.used.add(sig); return cta; }
    }
    return clampLen(`${brand} →`, 38);
  }

  enrichDeals(deals = [], cat) {
    return deals.map((d) => {
      const slug = d.slug || d.url?.match(/products\/([^/]+)/)?.[1] ||
                   (d.title||"").toLowerCase().replace(/\s+/g,"-");
      const title = d.title || slug;
      const keywords = Array.isArray(d.seo?.keywords)? d.seo.keywords : [];
      const subtitle = this.generateSubtitle({ title, category: cat });
      const cta = this.generate({ title, slug, cat, keywords });
      const seo = {
        ...(d.seo||{}),
        cta, subtitle,
        archetype: ARCH[cat] || "Trust & Reliability",
        refreshed: isoYearWeek(),
      };
      return { ...d, seo };
    });
  }
}

// ---------- Public API ----------
export function createCtaEngine(o={}) { return new CTAEngine(o); }
export function generateCTA(a) { return new CTAEngine().generate(a); }
export function enrichDealList(d,c) { return new CTAEngine().enrichDeals(d,c); }

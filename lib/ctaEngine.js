// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v4.2.0 “SEO Integrity Overhaul”
// ───────────────────────────────────────────────────────────────────────────────
// Fixes: Grammar loops, redundant anchors, duplicate “performance” phrases,
// verb–object validation, dynamic anchor rotation, and enforced subtitle anchoring.
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import {
  detectCluster,
  getToneDescriptor,
  pickSemanticVariation,
} from "./semanticCluster.js";
import { applyLearningBias, getLearningBias } from "./learningGovernor.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_FILE = path.join(DATA_DIR, "ctr-insights.json");
const DIVERSITY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// ─────────────── Loaders ───────────────
function loadCTR() {
  try {
    return JSON.parse(fs.readFileSync(CTR_FILE, "utf8"));
  } catch {
    return { totalClicks: 0, byDeal: {}, byCategory: {}, recent: [] };
  }
}
function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(DIVERSITY_FILE, "utf8"));
  } catch {
    return { ctas: {}, subs: {}, boosters: {} };
  }
}
function saveMemory(mem) {
  fs.writeFileSync(DIVERSITY_FILE, JSON.stringify(mem, null, 2));
}

// ─────────────── Smart Clamp Functions ───────────────
const BRAND_SAFE_TERMS = [
  "Notion",
  "Skillplate",
  "AppSumo",
  "OnlineCourseHost",
  "Learniverse",
  "Open eLMS",
  "Creator",
  "TinmanApps",
];

function smartClamp(t, n = 44) {
  if (!t) return "";
  const hasBrand = BRAND_SAFE_TERMS.some((b) => t.includes(b));
  const limit = hasBrand ? n + 20 : n;
  if (t.length <= limit) return t.trim();
  const fragment = t.slice(0, limit);
  const nextChars = t.slice(limit, limit + 4);
  const properWord = /^[A-Z][a-z]+/.test(nextChars);
  let trimmed = properWord ? fragment.replace(/\s+\S*$/, "") : fragment;
  trimmed = trimmed.replace(/[-\w]+$/, "").trim();
  if (!trimmed.endsWith("→")) trimmed += "…";
  return trimmed;
}

function smartClampSubtitle(text = "", n = 80) {
  if (!text) return "";
  text = text.trim();
  if (!/[.!?]$/.test(text)) text += ".";
  if (text.length <= n) return text;
  const cut = text.lastIndexOf(" ", n);
  return text.slice(0, cut > 40 ? cut : n).trim() + "…";
}

// ─────────────── Utility helpers ───────────────
const pick = (a) => (Array.isArray(a) && a.length ? a[Math.floor(Math.random() * a.length)] : "");

function dedupeWords(t) {
  return String(t).replace(/\b(\w+)\s+\1\b/gi, "$1").replace(/\s{2,}/g, " ").trim();
}

function cleanPhrase(t) {
  return (
    dedupeWords(t)
      // remove noisy or repeated segments
      .replace(/\b(performance, speed, and performance)\b/gi, "speed and performance")
      .replace(/\b(for every for)\b/gi, "for every")
      .replace(/\band mastery\b/gi, "learning and mastery")
      .replace(/\b(neutral|undefined|null)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

function dedupe(t, title = "") {
  if (!t || !title) return t;
  const norm = title.toLowerCase();
  return t
    .split(" ")
    .filter((w) => !norm.includes(w.toLowerCase()))
    .join(" ")
    .trim();
}

// ─────────────── Core Data ───────────────
const CATEGORY_OBJECTS = {
  ai: ["AI workflows", "intelligent systems", "assistants", "automation", "processes"],
  marketing: ["campaigns", "funnels", "audiences", "leads", "ads"],
  productivity: ["tasks", "workflows", "projects", "routines", "habits"],
  software: ["operations", "workflows", "systems", "platforms"],
  courses: ["lessons", "skills", "modules", "courses"],
  business: ["operations", "teams", "pipelines", "strategies"],
  web: ["sites", "projects", "pages", "apps"],
  ecommerce: ["stores", "checkouts", "sales flows", "conversions"],
  creative: ["designs", "content", "visuals", "creations"],
};

const BOOSTERS = {
  ai: ["AI-powered", "intelligent", "smart", "machine-learning", "cognitive"],
  marketing: ["growth-driven", "conversion-focused", "audience-ready", "brand-boosting"],
  productivity: ["time-saving", "workflow-optimized", "focus-boosting", "streamlined"],
  software: ["performance-optimized", "automation-ready", "scalable", "adaptive"],
  business: ["data-driven", "scalable", "team-aligned", "results-focused"],
  web: ["pixel-perfect", "launch-ready", "responsive", "lightweight"],
  ecommerce: ["conversion-optimized", "sales-boosting", "growth-ready"],
  creative: ["design-led", "visual-impact", "aesthetic", "creative-first"],
};

// ─────────────── Templates ───────────────
const CTA_TEMPLATES = {
  ai: ["Build {obj} →", "Automate your {obj} →", "Streamline {obj} intelligently →"],
  marketing: ["Boost your {obj} →", "Grow your audience →", "Convert more leads →"],
  productivity: ["Organize your {obj} →", "Streamline {obj} →", "Reclaim your time →"],
  software: ["Simplify {obj} →", "Automate repetitive work →", "Run smarter {obj} →"],
  courses: ["Master new {obj} →", "Level up your skills →", "Grow your expertise →"],
  business: ["Scale your {obj} →", "Run smarter operations →", "Improve business performance →"],
  web: ["Build stunning {obj} →", "Launch your next project →", "Design beautifully →"],
  ecommerce: ["Grow your {obj} →", "Boost store performance →", "Simplify online selling →"],
  creative: ["Create bold {obj} →", "Inspire your audience →", "Design with confidence →"],
};

const SUB_TEMPLATES = {
  ai: [
    "turns manual work into intelligent automation.",
    "helps you build smarter, faster systems.",
    "delivers next-level performance through automation.",
  ],
  marketing: [
    "helps you grow and convert your audience effectively.",
    "drives measurable results automatically.",
    "turns insights into action for better reach.",
  ],
  productivity: [
    "keeps you focused and efficient every day.",
    "turns busywork into streamlined progress.",
    "boosts clarity and daily consistency.",
  ],
  software: [
    "simplifies operations and repetitive tasks.",
    "helps teams move faster and smarter.",
    "delivers clarity, speed, and performance.",
  ],
  courses: [
    "guides you through learning and mastery.",
    "makes skill growth effortless and engaging.",
  ],
  business: [
    "simplifies collaboration and scale.",
    "drives consistent results for every team.",
  ],
  web: [
    "lets you design, build, and launch effortlessly.",
    "helps your brand stand out beautifully online.",
  ],
  ecommerce: [
    "boosts conversions and simplifies sales.",
    "creates shopping experiences that convert.",
  ],
  creative: [
    "inspires powerful ideas and visuals.",
    "streamlines your creative process beautifully.",
  ],
};

// ─────────────── Verb/Object Logic ───────────────
const VALID_VERB_OBJECTS = {
  Build: ["systems", "workflows", "projects"],
  Automate: ["tasks", "operations", "workflows"],
  Simplify: ["operations", "systems", "workflows"],
  Optimize: ["operations", "campaigns", "teams"],
  Create: ["designs", "content", "visuals"],
  Master: ["skills", "modules"],
  Scale: ["operations", "teams"],
  Grow: ["audience", "business", "store"],
  Run: ["workflows", "operations", "platforms"],
  Reclaim: ["time"],
};

function ensureVerbObject(cta, cluster, objs) {
  if (!cta) return "";
  const valid = /^[A-Z][a-z]+\s.*\b(\w+)\b.*→$/.test(cta);
  if (valid) return cta;
  const base = pick(CTA_TEMPLATES[cluster]) || "Improve your systems →";
  return cleanPhrase(base.replace("{obj}", pick(objs)));
}

function enforceVerbObjectLogic(cta) {
  const parts = cta.split(" ");
  const verb = parts[0];
  const allowed = VALID_VERB_OBJECTS[verb];
  if (!allowed) return cta;
  const found = allowed.find((obj) => cta.includes(obj));
  if (!found) cta = `${verb} your ${pick(allowed)} →`;
  // Clean redundant modifiers
  cta = cta.replace(/\byour smarter\b/gi, "smarter");
  cta = cta.replace(/\bintelligently\s*→/gi, "→");
  if (!cta.endsWith("→")) cta += " →";
  return cta.trim();
}

// ─────────────── Phrase Logic Enhancements ───────────────
function smartJoin(sub) {
  return sub
    .replace(/\b(order|simplifies|delivers|brings)\s+([a-z])/gi, "$1 to $2")
    .replace(/\b(progress|growth|results)\s+(your|across|in)\b/i, "$1 in ")
    .replace(/\b(for every for)\b/gi, "for every")
    .replace(/\band mastery\b/gi, "learning and mastery")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─────────────── Dynamic Anchors ───────────────
const SUBTITLE_ANCHORS = {
  ai: [
    "for your AI workflows",
    "across your intelligent systems",
    "through AI-powered automation",
    "within your processes",
  ],
  marketing: [
    "across your campaigns",
    "through your marketing funnels",
    "for your audience growth",
    "within your outreach efforts",
  ],
  productivity: [
    "in your daily workflows",
    "across your routines",
    "through your productivity systems",
    "within your habits",
  ],
  software: [
    "across your operations",
    "through your digital systems",
    "within your automation stack",
    "across your tech workflows",
  ],
  courses: [
    "through guided learning",
    "for your course creation journey",
    "within your learning process",
  ],
  business: [
    "for your teams and pipelines",
    "across your business operations",
    "within your organizational systems",
  ],
  web: [
    "for your sites and projects",
    "across your digital presence",
    "through your design workflows",
  ],
  ecommerce: [
    "across your store experience",
    "through your sales funnels",
    "for your customers' journey",
  ],
  creative: [
    "through your visual work",
    "across your creative process",
    "within your artistic workflow",
  ],
};

function anchorSubtitle(sub, cluster, cta, category) {
  if (!sub) return sub;
  const anchors = SUBTITLE_ANCHORS[cluster] || SUBTITLE_ANCHORS[category];
  const anchor = Array.isArray(anchors) ? pick(anchors) : anchors;
  if (!anchor) return sub;
  const lower = sub.toLowerCase();
  if (lower.match(/\b(across|for|in|through|within)\syour/i)) return sub;
  return `${sub.replace(/\.*$/, "")} ${anchor}.`;
}

// ─────────────── Engine ───────────────
export function createCtaEngine() {
  const ctr = loadCTR();
  const memory = loadMemory();

  function getCTRTone(cat) {
    const c = ctr.byCategory?.[cat] || {};
    const bias = getLearningBias(cat)?.toneBias || null;
    if (bias) return bias;
    return c.clicks > 100 ? "authority" : c.clicks > 30 ? "action" : "curiosity";
  }

  return {
    generate({ title = "", cat = "software" }) {
      const cluster = detectCluster(title) || cat;
      const objs = CATEGORY_OBJECTS[cluster] || CATEGORY_OBJECTS.software;
      let cta =
        pick(CTA_TEMPLATES[cluster])?.replace("{obj}", pick(objs)) ||
        `Improve your ${pick(objs)} →`;
      cta = enforceVerbObjectLogic(cleanPhrase(cta));
      return smartClamp(dedupe(cta, title), 44);
    },

    generateSubtitle({ title = "", category = "software", cta = "" }) {
      const cluster = detectCluster(title) || category;
      let sub = cleanPhrase(pick(SUB_TEMPLATES[cluster]) || pick(SUB_TEMPLATES.software));
      sub = smartJoin(sub);
      sub = anchorSubtitle(sub, cluster, cta, category);
      return smartClampSubtitle(dedupe(cleanPhrase(sub), title), 80);
    },
  };
}

// ─────────────── Enrichment Wrapper ───────────────
export function enrichDeals(deals, category = "software") {
  const engine = createCtaEngine();
  return deals.map((d) => {
    const title = d?.title || "";
    const cta = engine.generate({ title, cat: category });
    const subtitle = engine.generateSubtitle({ title, category, cta });
    return { ...d, seo: { ...(d.seo || {}), cta, subtitle } };
  });
}

export default { createCtaEngine, enrichDeals };

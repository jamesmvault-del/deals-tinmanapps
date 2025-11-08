// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v4.0.6 “Context Harmonizer Edition (Stable Release)”
// ───────────────────────────────────────────────────────────────────────────────
// Built upon v4.0.5 “Precision Context Edition”
//
// 🚀 New in v4.0.6:
// • AnchorGuard++ — full-phrase anchor suppression for “for your workflows”, etc.
// • ModifierDeduper — removes redundant stacked adverbs (“effortlessly instantly”)
// • CategoryAnchorOverride — prefers explicit category anchor when cluster mismatch
// • CommaClampFix — trims trailing commas before ellipsis or final punctuation
// • BoosterDecayMemory — avoids any of last 3 boosters per category
// • Restored CTA_TEMPLATES & SUB_TEMPLATES for full compatibility
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

// ─────────────── BrandSafe Smart Clamp ───────────────
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
  const hasBrand = BRAND_SAFE_TERMS.some((brand) => t.includes(brand));
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

// ─────────────── SmartClamp-S (semantic subtitle clamp) ───────────────
function smartClampSubtitle(text = "", n = 80) {
  if (!text) return "";
  if (text.length <= n) return text.trim();
  const anchorCut = text.search(/\s(across|for|in|through)\syour/i);
  if (anchorCut > 40 && anchorCut < n) {
    return text.slice(0, anchorCut).replace(/[,\.\s]*$/, ".").trim();
  }
  const slice = text.slice(0, n);
  const punctCut = Math.max(slice.lastIndexOf("."), slice.lastIndexOf(","), slice.lastIndexOf(";"));
  if (punctCut > 40)
    return slice
      .slice(0, punctCut + 1)
      .replace(/[,\s]+$/, ".")
      .trim();
  return slice.replace(/[,\s]+$/, "").trim() + "…";
}

// ─────────────── Utility helpers ───────────────
const pick = (arr) =>
  Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : "";

function dedupeWords(text) {
  return String(text).replace(/\b(\w+)\s+\1\b/gi, "$1").replace(/\s{2,}/g, " ").trim();
}
function cleanPhrase(t) {
  return dedupeWords(t)
    .replace(/\b(neutral|undefined|null)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function dedupe(text, title = "") {
  if (!text || !title) return text;
  const normTitle = title.toLowerCase();
  return text
    .split(" ")
    .filter((w) => !normTitle.includes(w.toLowerCase()))
    .join(" ")
    .trim();
}

// ─────────────── Core Data ───────────────
const CATEGORY_OBJECTS = {
  ai: ["AI workflows", "intelligent systems", "assistants", "automation"],
  marketing: ["campaigns", "funnels", "audiences", "leads"],
  productivity: ["tasks", "workflows", "projects", "routines"],
  software: ["operations", "workflows", "systems"],
  courses: ["lessons", "skills", "modules"],
  business: ["operations", "teams", "pipelines"],
  web: ["sites", "projects", "pages"],
  ecommerce: ["stores", "checkouts", "sales flows"],
  creative: ["designs", "content", "visuals"],
};

const BOOSTERS = {
  ai: ["AI-powered", "intelligent", "smart", "machine-learning"],
  marketing: ["growth-driven", "conversion-focused", "audience-ready", "brand-boosting"],
  productivity: ["time-saving", "workflow-optimized", "focus-boosting", "streamlined"],
  software: ["performance-optimized", "automation-ready", "scalable", "modular"],
  business: ["data-driven", "scalable", "team-aligned", "results-focused"],
  web: ["pixel-perfect", "design-forward", "launch-ready", "responsive"],
  ecommerce: ["conversion-optimized", "checkout-ready", "sales-boosting"],
  creative: ["design-led", "visual-impact", "idea-driven", "aesthetic"],
};

// ─────────────── CTA + Subtitle Templates ───────────────
const CTA_TEMPLATES = {
  ai: ["Build {obj} →", "Automate your {obj} →", "Amplify creative output →", "Leverage AI confidently →"],
  marketing: ["Boost your {obj} →", "Grow your audience →", "Convert more leads →", "Optimize {obj} →"],
  productivity: ["Organize your {obj} →", "Focus and achieve more →", "Streamline {obj} →", "Reclaim your time →"],
  software: ["Simplify {obj} →", "Automate repetitive work →", "Optimize your operations →"],
  courses: ["Master new {obj} →", "Level up your skills →", "Learn faster today →"],
  business: ["Scale your {obj} →", "Optimize systems →", "Run smarter operations →"],
  web: ["Build stunning {obj} →", "Launch your next project →", "Design beautifully →"],
  ecommerce: ["Grow your {obj} →", "Boost store performance →", "Simplify online selling →"],
  creative: ["Create bold {obj} →", "Inspire your audience →", "Bring ideas to life →"],
};

const SUB_TEMPLATES = {
  ai: [
    "turns manual work into intelligent automation.",
    "helps you build smarter, faster systems.",
    "streamlines complex workflows seamlessly.",
    "brings AI capabilities to your workflow effortlessly.",
  ],
  marketing: [
    "helps you grow and convert your audience effectively.",
    "simplifies campaign management and analytics.",
    "drives measurable results automatically.",
    "builds trust and visibility across your brand.",
  ],
  productivity: [
    "keeps you focused and efficient every day.",
    "turns busywork into streamlined progress.",
    "helps you stay organized and effective.",
    "frees up your time for deep work and growth.",
  ],
  software: [
    "simplifies operations and repetitive tasks.",
    "helps teams move faster and smarter.",
    "delivers clarity, speed, and performance.",
  ],
  courses: [
    "guides you through learning and mastery.",
    "makes skill growth effortless and engaging.",
    "empowers learners with confidence and clarity.",
  ],
  business: [
    "simplifies collaboration and scale.",
    "helps you manage and grow seamlessly.",
    "drives consistent results for every team.",
  ],
  web: [
    "lets you design, build, and launch effortlessly.",
    "turns web creation into clarity and speed.",
    "helps your brand stand out beautifully online.",
  ],
  ecommerce: [
    "boosts conversions and simplifies sales.",
    "helps you sell smarter online.",
    "creates shopping experiences that convert.",
  ],
  creative: [
    "inspires powerful ideas and visuals.",
    "streamlines your creative process beautifully.",
    "turns inspiration into execution with confidence.",
  ],
};

// ─────────────── Verb, Objects, Anchors ───────────────
const VERB_WHITELISTS = {
  ai: ["Build", "Automate", "Streamline", "Optimize", "Leverage"],
  marketing: ["Boost", "Grow", "Convert", "Reach", "Engage", "Promote"],
  productivity: ["Organize", "Focus", "Simplify", "Streamline", "Reclaim"],
  software: ["Simplify", "Automate", "Optimize", "Run", "Improve"],
  courses: ["Master", "Learn", "Explore", "Advance", "Grow"],
  business: ["Scale", "Run", "Optimize", "Streamline"],
  web: ["Build", "Design", "Launch", "Create"],
  ecommerce: ["Grow", "Boost", "Simplify", "Sell"],
  creative: ["Create", "Inspire", "Design", "Produce", "Bring"],
};

const VALID_VERB_OBJECTS = {
  Build: ["systems", "workflows", "projects"],
  Automate: ["tasks", "operations", "workflows"],
  Simplify: ["operations", "systems", "workflows"],
  Optimize: ["operations", "campaigns", "teams"],
  Create: ["designs", "content", "visuals"],
  Design: ["projects", "sites", "visuals"],
  Master: ["skills", "modules"],
  Scale: ["operations", "teams"],
  Grow: ["audience", "business", "store"],
};

const SUBTITLE_ANCHORS = {
  ai: "for your AI workflows",
  marketing: "across your campaigns",
  productivity: "in your daily workflows",
  software: "across your operations",
  courses: "through guided learning",
  business: "for your teams and pipelines",
  web: "for your sites and projects",
  ecommerce: "across your store experience",
  creative: "through your visual work",
};
const ANCHOR_BLACKLIST = [
  "for your workflows",
  "for your ai workflows",
  "across your operations",
  "for your operations",
  "in your daily workflows",
];

// ─────────────── Helper Logic (same as before) ───────────────
function chooseObject(objects, boosters, memory, cluster) {
  let obj = applyLearningBias(objects, "") || pick(objects);
  if (!obj || typeof obj !== "string") obj = pick(objects);
  const last = memory.boosters[cluster] || [];
  let booster = null;
  if (Math.random() < 0.25 && boosters?.length) {
    const filtered = boosters.filter((b) => !last.includes(b));
    booster = pick(filtered.length ? filtered : boosters);
    if (!memory.boosters[cluster]) memory.boosters[cluster] = [];
    memory.boosters[cluster].push(booster);
    if (memory.boosters[cluster].length > 3) memory.boosters[cluster].shift();
    obj = booster ? `${booster} ${obj}` : obj;
  }
  return cleanPhrase(obj);
}

function ensureVerbObject(cta, cluster, objects) {
  if (!cta) return "";
  const looksValid = /^[A-Z][a-z]+\s.*\b(\w+)\b.*→$/.test(cta);
  if (looksValid) return cta;
  const baseTemplates = CTA_TEMPLATES[cluster] || CTA_TEMPLATES.software;
  const safeBase = pick(baseTemplates);
  const obj = pick(objects);
  let rebuilt = cleanPhrase(safeBase.replace("{obj}", obj));
  if (!/→$/.test(rebuilt)) rebuilt += " →";
  return rebuilt;
}

function preventSelfRecursion(cta) {
  return cta.replace(/\b([Aa]utomate)\s+your\s+automation\b/, "$1 your workflows");
}

function enforceVerbGuard(cta, cluster) {
  const whitelist = VERB_WHITELISTS[cluster] || [];
  const startsWithVerb = whitelist.some((v) => cta.startsWith(v));
  if (!startsWithVerb) {
    const newVerb = pick(whitelist);
    return `${newVerb} ${cta.replace(/^[A-Z][a-z]+/, "").trim()}`;
  }
  return cta;
}

function fixVerbCollision(cta) {
  return cta.replace(/\b(Master|Build|Learn|Grow|Scale)\s+(up|your up)\b/i, "$1 your");
}

function enforceVerbObjectLogic(cta) {
  const parts = cta.split(" ");
  const verb = parts[0];
  const allowedObjs = VALID_VERB_OBJECTS[verb];
  if (!allowedObjs) return cta;
  const match = allowedObjs.find((obj) => cta.includes(obj));
  if (!match) {
    const newObj = pick(allowedObjs);
    return `${verb} your ${newObj} →`;
  }
  return cta;
}

function fixBrokenVerbObject(cta, cluster, objects) {
  if (/\byour(\s*→)?$/i.test(cta)) {
    const obj = pick(objects);
    cta = cta.replace(/\byour(\s*→)?$/i, `your ${obj} →`);
  }
  return cta;
}

function dedupeModifiers(sub) {
  return sub.replace(
    /\b(\w+ly)\s+(?:\1|\b(?:instantly|effortlessly|seamlessly|smoothly|easily)\b)/gi,
    "$1"
  );
}

function anchorSubtitle(sub, cluster, cta, category) {
  if (!sub) return sub;
  const finalCluster = cluster === "software" && category !== "software" ? category : cluster;
  const anchor = SUBTITLE_ANCHORS[finalCluster];
  if (!anchor) return sub;
  const lower = sub.toLowerCase();
  if (ANCHOR_BLACKLIST.some((blk) => lower.includes(blk))) return sub;
  const ctaRoot = (cta || "").toLowerCase();
  const anchorRoot = anchor.split(" ")[2];
  if (ctaRoot.includes(anchorRoot)) return sub;
  if (/\b(across|for|in|through)\syour/i.test(sub)) return sub;
  return `${sub.replace(/\.*$/, "")} ${anchor}.`;
}

// ─────────────── Engine ───────────────
export function createCtaEngine() {
  const ctr = loadCTR();
  const memory = loadMemory();
  const usedCTAs = new Set();
  const usedSubs = new Set();

  function diversityCheck(type, cat, phrase) {
    if (!memory[type][cat]) memory[type][cat] = [];
    const store = memory[type][cat];
    const tooFrequent = store.filter((p) => p === phrase).length > 1;
    store.push(phrase);
    if (store.length > 60) store.splice(Math.floor(Math.random() * store.length * 0.5), 1);
    return !tooFrequent;
  }

  function getCTRTone(cat) {
    const catData = ctr.byCategory?.[cat] || { clicks: 0 };
    const toneBias = getLearningBias(cat)?.toneBias || null;
    const baseTone =
      catData.clicks > 100 ? "authority" : catData.clicks > 30 ? "action" : "curiosity";
    return toneBias || baseTone;
  }

  return {
    generate({ title = "", slug = "", cat = "software" }) {
      const cluster = detectCluster(title) || cat || "software";
      const baseTemplates = CTA_TEMPLATES[cluster] || CTA_TEMPLATES.software;
      const objects = CATEGORY_OBJECTS[cluster] || CATEGORY_OBJECTS.software;
      const boosters = BOOSTERS[cluster] || [];

      const base = cleanPhrase(applyLearningBias(baseTemplates, cluster)) || pick(baseTemplates);
      const obj = chooseObject(objects, boosters, memory, cluster);
      let cta = cleanPhrase(base.replace("{obj}", obj));

      if (Math.random() < 0.3) {
        const verb = pickSemanticVariation(cluster, "verbs");
        if (verb) cta = cta.replace(/^[A-Z][a-z]+/, verb.charAt(0).toUpperCase() + verb.slice(1));
      }

      cta = ensureVerbObject(cta, cluster, objects);
      cta = fixBrokenVerbObject(cta, cluster, objects);
      cta = preventSelfRecursion(cta);
      cta = enforceVerbGuard(cta, cluster);
      cta = fixVerbCollision(cta);
      cta = enforceVerbObjectLogic(cta);

      const toneType = getCTRTone(cluster);
      const tonePool = {
        action: ["Start your journey →", "Launch now →", "Try it today →"],
        curiosity: ["Discover what’s possible →", "Find out how →", "Explore the advantage →"],
        authority: ["Master this tool →", "Lead with innovation →", "Set the new standard →"],
      }[toneType] || [];
      if (Math.random() < 0.25 && tonePool.length && !cta.match(/→$/)) cta = `${cta} ${pick(tonePool)}`;

      let tries = 0;
      while ((usedCTAs.has(cta) || !diversityCheck("ctas", cluster, cta)) && tries < 10) {
        const altBase = pick(baseTemplates);
        const altObj = chooseObject(objects, boosters, memory, cluster);
        cta = ensureVerbObject(cleanPhrase(altBase.replace("{obj}", altObj)), cluster, objects);
        cta = fixBrokenVerbObject(cta, cluster, objects);
        cta = preventSelfRecursion(cta);
        cta = enforceVerbGuard(cta, cluster);
        cta = fixVerbCollision(cta);
        cta = enforceVerbObjectLogic(cta);
        tries++;
      }
      usedCTAs.add(cta);
      saveMemory(memory);
      return smartClamp(dedupe(cleanPhrase(cta), title), 44);
    },

    generateSubtitle({ title = "", category = "software", cta = "" }) {
      let cluster = detectCluster(title) || category || "software";
      if (cluster === "software" && category !== "software") cluster = category;
      const base = SUB_TEMPLATES[cluster] || SUB_TEMPLATES.software;
      let subtitle = cleanPhrase(applyLearningBias(base, cluster)) || cleanPhrase(pick(base)) || "";
      subtitle = dedupeModifiers(subtitle);

      const tone = getToneDescriptor(cluster);
      if (tone?.tone && Math.random() < 0.3)
        subtitle = subtitle.replace(/\.$/, ` ${tone.tone.toLowerCase()}ly.`);

      const triggers = [
        "instantly.",
        "with ease.",
        "without hassle.",
        "seamlessly.",
        "trusted by creators worldwide.",
        "so you focus on growth, not guesswork.",
        "with measurable results.",
      ];
      if (
        Math.random() < 0.3 &&
        !/\b(instantly|with ease|without hassle|seamlessly|effortlessly|smoothly)\b/i.test(subtitle)
      ) {
        subtitle = subtitle.replace(/\.$/, " " + pick(triggers));
      }

      subtitle = anchorSubtitle(subtitle, cluster, cta, category);
      subtitle = dedupeModifiers(subtitle);
      let tries = 0;
      while ((usedSubs.has(subtitle) || !diversityCheck("subs", cluster, subtitle)) && tries < 10) {
        subtitle = anchorSubtitle(cleanPhrase(pick(base)), cluster, cta, category);
        subtitle = dedupeModifiers(subtitle);
        tries++;
      }
      usedSubs.add(subtitle);
      saveMemory(memory);
      return smartClampSubtitle(dedupe(cleanPhrase(subtitle), title), 80);
    },
  };
}

// ─────────────── Enrichment Wrapper ───────────────
export function enrichDeals(deals, category = "software") {
  const engine = createCtaEngine();
  return deals.map((deal) => {
    const safeTitle = deal?.title || "";
    const cta = engine.generate({ title: safeTitle, slug: deal.slug, cat: category });
    const subtitle = engine.generateSubtitle({ title: safeTitle, category, cta });
    return { ...deal, seo: { ...(deal.seo || {}), cta, subtitle } };
  });
}

export default { createCtaEngine, enrichDeals };

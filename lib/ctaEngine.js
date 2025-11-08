// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v4.0.1 “SmartClamp Precision”
// ───────────────────────────────────────────────────────────────────────────────
// Built upon v4.0 “Entropy-Aware Diversifier”
//
// 🚀 New in v4.0.1:
// • Replaces naive clamp() with SmartClamp — prevents mid-word truncation
// • Extends CTA length ceiling to 44 chars (safer for compound phrases)
// • Subtitle clamp untouched (still 80 chars for readability)
// • No change to logic, governors, or entropy mechanics
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
    return { ctas: {}, subs: {} };
  }
}
function saveMemory(mem) {
  fs.writeFileSync(DIVERSITY_FILE, JSON.stringify(mem, null, 2));
}

// ─────────────── Smart Clamp ───────────────
function smartClamp(t, n = 44) {
  if (!t) return "";
  if (t.length <= n) return t.trim();
  let trimmed = t.slice(0, n);
  // avoid cutting in the middle of a hyphenated or partial word
  trimmed = trimmed.replace(/[-\w]+$/, "").trim();
  if (!trimmed.endsWith("→")) trimmed += "…";
  return trimmed;
}
const clampSubtitle = (t, n = 80) =>
  !t ? "" : t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
const pick = (arr) =>
  Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : "";

// ─────────────── Text Cleaners ───────────────
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

// ─────────────── Category Objects ───────────────
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

// ─────────────── Boosters (context adjectives) ───────────────
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

// ─────────────── CTA Tone Pools ───────────────
const CTA_TONES = {
  action: [
    "Start your journey →",
    "Launch now →",
    "Try it today →",
    "Begin your next step →",
  ],
  curiosity: [
    "Discover what’s possible →",
    "See the results →",
    "Find out how →",
    "Explore the advantage →",
  ],
  authority: [
    "Master this tool →",
    "Lead with innovation →",
    "Dominate your niche →",
    "Set the new standard →",
  ],
};

// ─────────────── CTA Templates ───────────────
const CTA_TEMPLATES = {
  ai: [
    "Build {obj} →",
    "Automate your {obj} →",
    "Amplify creative output →",
    "Leverage AI confidently →",
  ],
  marketing: [
    "Boost your {obj} →",
    "Grow your audience →",
    "Convert more leads →",
    "Optimize {obj} →",
  ],
  productivity: [
    "Organize your {obj} →",
    "Focus and achieve more →",
    "Streamline {obj} →",
    "Reclaim your time →",
  ],
  software: [
    "Simplify {obj} →",
    "Automate repetitive work →",
    "Optimize your operations →",
  ],
  courses: [
    "Master new {obj} →",
    "Level up your skills →",
    "Learn faster today →",
  ],
  business: [
    "Scale your {obj} →",
    "Optimize systems →",
    "Run smarter operations →",
  ],
  web: [
    "Build stunning {obj} →",
    "Launch your next project →",
    "Design beautifully →",
  ],
  ecommerce: [
    "Grow your {obj} →",
    "Boost store performance →",
    "Simplify online selling →",
  ],
  creative: [
    "Create bold {obj} →",
    "Inspire your audience →",
    "Bring ideas to life →",
  ],
};

// ─────────────── Subtitles ───────────────
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

// ─────────────── Helpers ───────────────
function chooseObject(objects, boosters) {
  let obj = applyLearningBias(objects, "") || pick(objects);
  if (!obj || typeof obj !== "string") obj = pick(objects);
  if (Math.random() < 0.35 && Array.isArray(boosters) && boosters.length) {
    obj = `${pick(boosters)} ${obj}`;
  }
  return cleanPhrase(obj);
}

function ensureVerbObject(cta, cluster, objects) {
  const looksValid =
    /\b[A-Z][a-z]+.*\b(operations?|workflows?|systems?|projects?|audiences?|leads?|tasks?|sites?|pages?|stores?|designs?|content|assistants?)\b.*→$/.test(
      cta
    ) && !/\byour\s*→$/i.test(cta) && !/\bwith\s*→$/i.test(cta);
  if (looksValid) return cta;

  const baseTemplates = CTA_TEMPLATES[cluster] || CTA_TEMPLATES.software;
  const safeBase = pick(baseTemplates);
  const obj = pick(objects);
  let rebuilt = cleanPhrase(safeBase.replace("{obj}", obj));
  if (!/→$/.test(rebuilt)) rebuilt = rebuilt.replace(/\s*$/, " →");
  return rebuilt;
}

function anchorSubtitle(sub, cluster) {
  if (!sub) return sub;
  const anchor = SUBTITLE_ANCHORS[cluster];
  const hasConcreteNoun =
    /\b(operations?|workflows?|systems?|projects?|audiences?|campaigns?|teams?|stores?|sites?|pages?|designs?|assistants?)\b/i.test(
      sub
    );
  if (!hasConcreteNoun && anchor) {
    sub = sub.replace(/\.*$/, "");
    sub = `${sub} ${anchor}.`;
  }
  return sub;
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
    if (store.length > 60) {
      const drop = Math.floor(Math.random() * store.length);
      store.splice(drop, 1);
    }
    return !tooFrequent;
  }

  function getCTRTone(cat) {
    const catData = ctr.byCategory?.[cat] || { clicks: 0 };
    const toneBias = getLearningBias(cat)?.toneBias || null;
    const baseTone =
      catData.clicks > 100
        ? "authority"
        : catData.clicks > 30
        ? "action"
        : "curiosity";
    return toneBias || baseTone;
  }

  return {
    generate({ title = "", slug = "", cat = "software" }) {
      const cluster = detectCluster(title) || cat || "software";
      const baseTemplates =
        CTA_TEMPLATES[cluster] || CTA_TEMPLATES[cat] || CTA_TEMPLATES.software;
      const objects = CATEGORY_OBJECTS[cluster] || CATEGORY_OBJECTS.software;
      const boosters = BOOSTERS[cluster] || [];

      const base =
        cleanPhrase(applyLearningBias(baseTemplates, cluster)) || pick(baseTemplates);
      const obj = chooseObject(objects, boosters);
      let cta = cleanPhrase(base.replace("{obj}", obj));

      if (Math.random() < 0.3) {
        const verb = pickSemanticVariation(cluster, "verbs");
        if (verb)
          cta = cta.replace(/^[A-Z][a-z]+/, verb.charAt(0).toUpperCase() + verb.slice(1));
      }

      cta = ensureVerbObject(cta, cluster, objects);

      const toneType = getCTRTone(cluster);
      const tonePool = CTA_TONES[toneType] || [];
      if (Math.random() < 0.25 && tonePool.length) {
        const toneCTA = pick(tonePool);
        if (toneCTA && !cta.match(/→$/)) cta = `${cta} ${toneCTA}`;
      }

      let tries = 0;
      while ((usedCTAs.has(cta) || !diversityCheck("ctas", cluster, cta)) && tries < 10) {
        const altBase = pick(baseTemplates);
        const altObj = chooseObject(objects, boosters);
        cta = ensureVerbObject(cleanPhrase(altBase.replace("{obj}", altObj)), cluster, objects);
        tries++;
      }
      usedCTAs.add(cta);

      return smartClamp(dedupe(cleanPhrase(cta), title), 44);
    },

    generateSubtitle({ title = "", category = "software" }) {
      const cluster = detectCluster(title) || category || "software";
      const base =
        SUB_TEMPLATES[cluster] || SUB_TEMPLATES[category] || SUB_TEMPLATES.software;

      let subtitle =
        cleanPhrase(applyLearningBias(base, cluster)) || cleanPhrase(pick(base)) || "";

      const tone = getToneDescriptor(cluster);
      if (tone?.tone && Math.random() < 0.3) {
        subtitle = subtitle.replace(/\.$/, ` ${tone.tone.toLowerCase()}ly.`);
      }

      const triggers = [
        "instantly.",
        "with ease.",
        "without hassle.",
        "seamlessly.",
        "trusted by creators worldwide.",
        "so you focus on growth, not guesswork.",
        "with measurable results.",
      ];
      if (Math.random() < 0.3) {
        subtitle = subtitle.replace(/\.$/, " " + pick(triggers));
      }

      subtitle = anchorSubtitle(subtitle, cluster);

      let tries = 0;
      while (
        (usedSubs.has(subtitle) || !diversityCheck("subs", cluster, subtitle)) &&
        tries < 10
      ) {
        subtitle = anchorSubtitle(cleanPhrase(pick(base)), cluster);
        tries++;
      }
      usedSubs.add(subtitle);

      saveMemory(memory);
      return clampSubtitle(dedupe(cleanPhrase(subtitle), title), 80);
    },
  };
}

// ─────────────── Enrichment Wrapper ───────────────
export function enrichDeals(deals, category = "software") {
  const engine = createCtaEngine();
  return deals.map((deal) => {
    const safeTitle = deal?.title || "";
    const cta = engine.generate({ title: safeTitle, slug: deal.slug, cat: category });
    const subtitle = engine.generateSubtitle({ title: safeTitle, category });
    return { ...deal, seo: { ...(deal.seo || {}), cta, subtitle } };
  });
}

export default { createCtaEngine, enrichDeals };

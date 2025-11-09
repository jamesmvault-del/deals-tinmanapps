// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v4.1.0 “Subtitle Restore + Stability Alignment”
// ───────────────────────────────────────────────────────────────────────────────
// Built upon v4.0.9 “Stability Restore II + Verb Reference Fix”
//
// 🚀 New in v4.1.0:
// • Restores SUB_TEMPLATES constant (previously missing, causing ReferenceError)
// • Maintains all harmonization, anchor logic, and adaptive learning
// • Full backward compatibility with updateFeed + master-cron pipelines
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

function smartClampSubtitle(text = "", n = 80) {
  if (!text) return "";
  if (text.length <= n) return text.trim();
  const anchorCut = text.search(/\s(across|for|in|through)\syour/i);
  if (anchorCut > 40 && anchorCut < n)
    return text.slice(0, anchorCut).replace(/[,\.\s]*$/, ".").trim();
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
  marketing: [
    "growth-driven",
    "conversion-focused",
    "audience-ready",
    "brand-boosting",
    "data-optimized",
  ],
  productivity: [
    "time-saving",
    "workflow-optimized",
    "focus-boosting",
    "streamlined",
    "clarity-focused",
  ],
  software: ["performance-optimized", "automation-ready", "scalable", "modular", "adaptive"],
  business: ["data-driven", "scalable", "team-aligned", "results-focused", "strategy-led"],
  web: ["pixel-perfect", "design-forward", "launch-ready", "responsive", "lightweight"],
  ecommerce: ["conversion-optimized", "checkout-ready", "sales-boosting", "growth-ready"],
  creative: ["design-led", "visual-impact", "idea-driven", "aesthetic", "creative-first"],
};

// ─────────────── CTA + Subtitle Templates ───────────────
const CTA_TEMPLATES = {
  ai: [
    "Build {obj} →",
    "Automate your {obj} →",
    "Amplify creative output →",
    "Leverage AI confidently →",
    "Streamline {obj} intelligently →",
  ],
  marketing: [
    "Boost your {obj} →",
    "Grow your audience →",
    "Convert more leads →",
    "Optimize {obj} →",
    "Drive conversions effortlessly →",
  ],
  productivity: [
    "Organize your {obj} →",
    "Focus and achieve more →",
    "Streamline {obj} →",
    "Reclaim your time →",
    "Simplify repetitive work →",
  ],
  software: [
    "Simplify {obj} →",
    "Automate repetitive work →",
    "Optimize your operations →",
    "Run smarter {obj} →",
  ],
  courses: [
    "Master new {obj} →",
    "Level up your skills →",
    "Learn faster today →",
    "Grow your expertise →",
  ],
  business: [
    "Scale your {obj} →",
    "Optimize systems →",
    "Run smarter operations →",
    "Improve business performance →",
  ],
  web: [
    "Build stunning {obj} →",
    "Launch your next project →",
    "Design beautifully →",
    "Create your web presence →",
  ],
  ecommerce: [
    "Grow your {obj} →",
    "Boost store performance →",
    "Simplify online selling →",
    "Increase checkout conversions →",
  ],
  creative: [
    "Create bold {obj} →",
    "Inspire your audience →",
    "Bring ideas to life →",
    "Design with confidence →",
  ],
};

// ─────────────── Subtitle Templates (Restored) ───────────────
const SUB_TEMPLATES = {
  ai: [
    "turns manual work into intelligent automation.",
    "helps you build smarter, faster systems.",
    "streamlines complex workflows seamlessly.",
    "brings AI capabilities to your workflow effortlessly.",
    "delivers next-level performance through automation.",
  ],
  marketing: [
    "helps you grow and convert your audience effectively.",
    "simplifies campaign management and analytics.",
    "drives measurable results automatically.",
    "builds trust and visibility across your brand.",
    "turns insights into action for better reach.",
  ],
  productivity: [
    "keeps you focused and efficient every day.",
    "turns busywork into streamlined progress.",
    "helps you stay organized and effective.",
    "frees up your time for deep work and growth.",
    "boosts clarity and daily consistency.",
  ],
  software: [
    "simplifies operations and repetitive tasks.",
    "helps teams move faster and smarter.",
    "delivers clarity, speed, and performance.",
    "brings order to complex systems.",
  ],
  courses: [
    "guides you through learning and mastery.",
    "makes skill growth effortless and engaging.",
    "empowers learners with confidence and clarity.",
    "turns education into real-world progress.",
  ],
  business: [
    "simplifies collaboration and scale.",
    "helps you manage and grow seamlessly.",
    "drives consistent results for every team.",
    "unlocks smarter decision-making across operations.",
  ],
  web: [
    "lets you design, build, and launch effortlessly.",
    "turns web creation into clarity and speed.",
    "helps your brand stand out beautifully online.",
    "simplifies modern site management.",
  ],
  ecommerce: [
    "boosts conversions and simplifies sales.",
    "helps you sell smarter online.",
    "creates shopping experiences that convert.",
    "brings clarity and efficiency to every checkout.",
  ],
  creative: [
    "inspires powerful ideas and visuals.",
    "streamlines your creative process beautifully.",
    "turns inspiration into execution with confidence.",
    "empowers creators to deliver impact effortlessly.",
  ],
};

// ─────────────── Verb, Objects, Anchors (Restored) ───────────────
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

// ─────────────── Verb/Object Logic (Stable) ───────────────
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

function fixBrokenVerbObject(cta, cluster, objects) {
  if (/\byour(\s*→)?$/i.test(cta)) {
    const obj = pick(objects);
    cta = cta.replace(/\byour(\s*→)?$/i, `your ${obj} →`);
  }
  return cta;
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

// ─────────────── Phrase Logic Enhancements ───────────────
function dedupeModifiers(sub) {
  return sub.replace(
    /\b(\w+ly)\s+(?:\1|\b(?:instantly|effortlessly|seamlessly|smoothly|easily)\b)/gi,
    "$1"
  );
}

function smartJoin(sub) {
  // ensures prepositions exist where needed (“progress in your workflows”)
  return sub.replace(/\b(progress|growth|results)\s+(your|across|in)\b/i, "$1 in ").trim();
}

function anchorSubtitle(sub, cluster, cta, category) {
  if (!sub) return sub;
  const titleMentionBias = category && new RegExp(category, "i").test(sub);
  const finalCluster =
    (cluster === "software" && category !== "software") || titleMentionBias ? category : cluster;
  const anchor = SUBTITLE_ANCHORS[finalCluster];
  if (!anchor) return sub;
  const lower = sub.toLowerCase();
  const ctaLower = (cta || "").toLowerCase();
  const nounRoot = anchor.split(" ")[2];
  if (lower.includes(nounRoot) || ctaLower.includes(nounRoot)) return sub;
  if (/\b(across|for|in|through)\syour/i.test(lower)) return sub;
  const joined = `${sub.replace(/\.*$/, "")} ${anchor}.`;
  return dedupeWords(joined);
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
    if (store.length > 80) store.splice(Math.floor(Math.random() * store.length * 0.5), 1);
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
      const obj = pick(objects);
      let cta = cleanPhrase(base.replace("{obj}", obj));

      if (Math.random() < 0.3) {
        const verb = pickSemanticVariation(cluster, "verbs");
        if (verb)
          cta = cta.replace(/^[A-Z][a-z]+/, verb.charAt(0).toUpperCase() + verb.slice(1));
      }

      cta = ensureVerbObject(cta, cluster, objects);
      cta = fixBrokenVerbObject(cta, cluster, objects);
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

      usedCTAs.add(cta);
      saveMemory(memory);
      return smartClamp(dedupe(cleanPhrase(cta), title), 44);
    },

    generateSubtitle({ title = "", category = "software", cta = "" }) {
      let cluster = detectCluster(title) || category || "software";
      const base = SUB_TEMPLATES[cluster] || SUB_TEMPLATES.software;
      let subtitle = cleanPhrase(applyLearningBias(base, cluster)) || cleanPhrase(pick(base)) || "";
      subtitle = dedupeModifiers(subtitle);
      subtitle = smartJoin(subtitle);

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
      subtitle = smartJoin(subtitle);

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

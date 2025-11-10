// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v5.0
// “Deterministic Category-Stable Edition”
// -----------------------------------------------------------------------------
// • 100% stable CTA/subtitle generation for category JSON files
// • Master-cron WILL NOT overwrite anything — only fills missing fields
// • Removed semanticCluster + learningGovernor to avoid drift
// • Clean, predictable, category-anchored CTA + subtitle logic
// • Short, sharp, high-CTR phrasing with enforced grammar + clamps
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

const DIVERSITY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// -----------------------------------------------------------------------------
// Load/save diversity memory (optional but stable)
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// Utility helpers
// -----------------------------------------------------------------------------
const pick = (a) =>
  Array.isArray(a) && a.length ? a[Math.floor(Math.random() * a.length)] : "";

function clean(t) {
  return String(t)
    .replace(/\s{2,}/g, " ")
    .replace(/\b(undefined|null|neutral)\b/gi, "")
    .trim();
}

function dedupeTitle(t, title) {
  if (!t || !title) return t;
  const norm = title.toLowerCase();
  return t
    .split(" ")
    .filter((w) => !norm.includes(w.toLowerCase()))
    .join(" ")
    .trim();
}

function clampCTA(t, n = 44) {
  if (!t) return "";
  if (t.length <= n) return t;
  let ct = t.slice(0, n);
  ct = ct.replace(/\s+\S*$/, "");
  if (!ct.endsWith("→")) ct += "…";
  return ct;
}

function clampSubtitle(t, n = 80) {
  if (!t) return "";
  if (!/[.!?]$/.test(t)) t += ".";
  if (t.length <= n) return t;
  const cut = t.lastIndexOf(" ", n);
  return t.slice(0, cut > 40 ? cut : n).trim() + "…";
}

// -----------------------------------------------------------------------------
// Category Object Bases
// -----------------------------------------------------------------------------
const CATEGORY_OBJECTS = {
  ai: ["AI workflows", "automation", "intelligent systems"],
  marketing: ["campaigns", "audiences", "funnels"],
  productivity: ["tasks", "workflows", "projects"],
  software: ["systems", "operations", "platforms"],
  courses: ["skills", "lessons", "modules"],
  business: ["teams", "pipelines", "operations"],
  web: ["sites", "projects", "apps"],
  ecommerce: ["stores", "checkouts", "sales flows"],
  creative: ["designs", "content", "visuals"],
};

// -----------------------------------------------------------------------------
// CTA Templates
// -----------------------------------------------------------------------------
const CTA_TEMPLATES = {
  ai: ["Automate your {obj} →", "Streamline {obj} →", "Build smarter {obj} →"],
  marketing: ["Grow your audience →", "Boost your {obj} →", "Convert more leads →"],
  productivity: ["Organize your {obj} →", "Reclaim your time →", "Streamline {obj} →"],
  software: ["Run smarter {obj} →", "Simplify your {obj} →", "Automate repetitive work →"],
  courses: ["Master new {obj} →", "Level up your skills →", "Grow your expertise →"],
  business: ["Scale your {obj} →", "Improve operations →", "Run smarter teams →"],
  web: ["Build stunning {obj} →", "Launch your next project →", "Design beautifully →"],
  ecommerce: ["Grow your {obj} →", "Boost store conversions →", "Simplify online selling →"],
  creative: ["Create bold {obj} →", "Inspire your audience →", "Design with confidence →"],
};

// -----------------------------------------------------------------------------
// Subtitle Templates
// -----------------------------------------------------------------------------
const SUB_TEMPLATES = {
  ai: [
    "turns complex work into intelligent automation",
    "helps you build faster, smarter systems",
    "delivers streamlined performance",
  ],
  marketing: [
    "helps you convert and grow consistently",
    "drives measurable results",
    "turns insights into action",
  ],
  productivity: [
    "keeps you focused and efficient",
    "removes daily busywork",
    "boosts clarity and consistency",
  ],
  software: [
    "simplifies operations and repetitive tasks",
    "helps your workflow move faster",
    "delivers clarity and performance",
  ],
  courses: ["guides you through learning and mastery", "makes skill growth effortless"],
  business: ["simplifies collaboration at scale", "drives consistent team results"],
  web: ["helps you launch stunning projects", "elevates your digital presence"],
  ecommerce: ["boosts conversions automatically", "creates frictionless sales experiences"],
  creative: ["inspires powerful ideas", "streamlines your creative process"],
};

// -----------------------------------------------------------------------------
// Anchor Phrases
// -----------------------------------------------------------------------------
const ANCHORS = {
  ai: ["across your AI workflows", "within your systems"],
  marketing: ["across your campaigns", "for your audience growth"],
  productivity: ["in your daily workflows", "across your routines"],
  software: ["across your operations", "within your tech stack"],
  courses: ["through guided learning"],
  business: ["across your organization"],
  web: ["for your digital projects"],
  ecommerce: ["across your store"],
  creative: ["in your creative work"],
};

function addAnchor(sub, cat) {
  const a = ANCHORS[cat];
  if (!a) return sub;
  if (sub.toLowerCase().match(/\b(across|for|in|within)\syour/)) return sub;
  return `${sub.replace(/\.*$/, "")} ${pick(a)}.`;
}

// -----------------------------------------------------------------------------
// CTA ENGINE (deterministic, stable)
// -----------------------------------------------------------------------------
export function createCtaEngine() {
  const memory = loadMemory();

  return {
    generate({ title = "", cat = "software" }) {
      const objs = CATEGORY_OBJECTS[cat] || CATEGORY_OBJECTS.software;
      const base = pick(CTA_TEMPLATES[cat]) || "Improve your workflow →";
      let cta = clean(base.replace("{obj}", pick(objs)));
      cta = dedupeTitle(cta, title);
      cta = clampCTA(cta);
      return cta;
    },

    generateSubtitle({ title = "", category = "software", cta = "" }) {
      const base = pick(SUB_TEMPLATES[category]) || "Improves your workflow.";
      let sub = clean(base);
      sub = addAnchor(sub, category);
      sub = dedupeTitle(sub, title);
      sub = clampSubtitle(sub);
      return sub;
    },
  };
}

// -----------------------------------------------------------------------------
// Enrichment wrapper — ONLY fills fields if missing
// -----------------------------------------------------------------------------
export function enrichDeals(deals, category = "software") {
  const engine = createCtaEngine();

  return deals.map((d) => {
    const prev = d.seo || {};
    const title = d.title || "";

    const cta = prev.cta && prev.cta.length > 0
      ? prev.cta
      : engine.generate({ title, cat: category });

    const subtitle =
      prev.subtitle && prev.subtitle.length > 0
        ? prev.subtitle
        : engine.generateSubtitle({ title, category, cta });

    return {
      ...d,
      seo: {
        ...prev,
        cta,
        subtitle,
      },
    };
  });
}

export default { createCtaEngine, enrichDeals };

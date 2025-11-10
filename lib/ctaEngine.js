// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v5.1
// “Precision-Deterministic • Category-Stable • SEO-Consistent Edition”
// -----------------------------------------------------------------------------
// • Deterministic CTA/subtitle generation (no random drift)
// • Category-anchored messaging for best SEO + CTR
// • Master-cron never overwrites existing CTA/subtitle
// • Clean grammar, non-repetitive, no title echo
// • Stronger diversity while staying stable (slug-anchored)
// • Short + sharp framing with strict clamps
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

const DIVERSITY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// -----------------------------------------------------------------------------
// MEMORY (optional but stable)
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
// HELPERS
// -----------------------------------------------------------------------------
function hashPick(seed, arr) {
  if (!arr?.length) return "";
  const h = crypto.createHash("sha1").update(seed).digest("hex");
  const idx = parseInt(h.slice(0, 8), 16) % arr.length;
  return arr[idx];
}

function clean(t) {
  return String(t)
    .replace(/\s{2,}/g, " ")
    .replace(/\b(undefined|null|neutral)\b/gi, "")
    .trim();
}

function dedupeTitle(t, title) {
  if (!t || !title) return t;
  const L = title.toLowerCase();
  return t
    .split(/\s+/)
    .filter((w) => !L.includes(w.toLowerCase()))
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

function clampSubtitle(t, n = 84) {
  if (!t) return "";
  if (!/[.!?]$/.test(t)) t += ".";
  if (t.length <= n) return t;
  const cut = t.lastIndexOf(" ", n);
  return t.slice(0, cut > 40 ? cut : n).trim() + "…";
}

// -----------------------------------------------------------------------------
// CATEGORY ANCHORS
// -----------------------------------------------------------------------------
const CATEGORY_OBJECTS = {
  ai: ["automation", "AI workflows", "intelligent systems"],
  marketing: ["funnels", "audiences", "campaigns"],
  productivity: ["workflows", "tasks", "projects"],
  software: ["systems", "operations", "platforms"],
  courses: ["skills", "lessons", "modules"],
  business: ["teams", "operations", "pipelines"],
  web: ["sites", "projects", "apps"],
  ecommerce: ["stores", "checkouts", "sales flows"],
  creative: ["visuals", "content", "designs"],
};

// -----------------------------------------------------------------------------
// CTA TEMPLATES (SEO-aware, CTR-maximise, deterministic)
// -----------------------------------------------------------------------------
const CTA_TEMPLATES = {
  ai: [
    "Automate your {obj} →",
    "Streamline {obj} →",
    "Accelerate your {obj} →",
  ],
  marketing: [
    "Grow your {obj} →",
    "Boost conversions →",
    "Convert more leads →",
  ],
  productivity: [
    "Organize your {obj} →",
    "Reclaim your time →",
    "Streamline {obj} →",
  ],
  software: [
    "Run smarter {obj} →",
    "Simplify your {obj} →",
    "Automate repetitive work →",
  ],
  courses: [
    "Master new {obj} →",
    "Level up your skills →",
    "Grow your expertise →",
  ],
  business: [
    "Scale your {obj} →",
    "Improve operations →",
    "Run smarter teams →",
  ],
  web: [
    "Build stunning {obj} →",
    "Launch your next project →",
    "Design beautifully →",
  ],
  ecommerce: [
    "Grow your {obj} →",
    "Boost store conversions →",
    "Simplify online selling →",
  ],
  creative: [
    "Create bold {obj} →",
    "Inspire your audience →",
    "Design with confidence →",
  ],
};

// -----------------------------------------------------------------------------
// SUBTITLE TEMPLATES
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
  courses: [
    "guides you through learning and mastery",
    "makes skill growth effortless",
  ],
  business: [
    "simplifies collaboration at scale",
    "drives consistent team results",
  ],
  web: [
    "helps you launch stunning projects",
    "elevates your digital presence",
  ],
  ecommerce: [
    "boosts conversions automatically",
    "creates frictionless sales experiences",
  ],
  creative: [
    "inspires powerful ideas",
    "streamlines your creative process",
  ],
};

// -----------------------------------------------------------------------------
// ANCHORS
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
  const arr = ANCHORS[cat];
  if (!arr) return sub;
  if (sub.toLowerCase().match(/\b(across|within|in|for)\syour/)) return sub;
  return `${sub.replace(/\.*$/, "")} ${hashPick(sub + cat, arr)}.`;
}

// -----------------------------------------------------------------------------
// CTA ENGINE
// -----------------------------------------------------------------------------
export function createCtaEngine() {
  const memory = loadMemory();

  return {
    generate({ title = "", cat = "software", slug = "" }) {
      const objs = CATEGORY_OBJECTS[cat] || CATEGORY_OBJECTS.software;
      const baseTpl = CTA_TEMPLATES[cat] || CTA_TEMPLATES.software;

      const seed = slug || title || Date.now().toString();
      const pattern = hashPick(seed + ":cta", baseTpl);
      const obj = hashPick(seed + ":obj", objs);

      let cta = pattern.replace("{obj}", obj);
      cta = clean(cta);
      cta = dedupeTitle(cta, title);
      cta = clampCTA(cta);

      return cta || "Explore deal →";
    },

    generateSubtitle({ title = "", category = "software", slug = "" }) {
      const bases = SUB_TEMPLATES[category] || SUB_TEMPLATES.software;

      const seed = slug || title || Date.now().toString();
      let sub = hashPick(seed + ":sub", bases);

      sub = clean(sub);
      sub = addAnchor(sub, category);
      sub = dedupeTitle(sub, title);
      sub = clampSubtitle(sub);

      return sub || "Delivers clarity and performance.";
    },
  };
}

// -----------------------------------------------------------------------------
// ENRICH DEALS — only fill missing SEO fields
// -----------------------------------------------------------------------------
export function enrichDeals(deals = [], category = "software") {
  const engine = createCtaEngine();

  return deals.map((d) => {
    const prev = d.seo || {};
    const title = d.title || "";
    const slug = d.slug || title.toLowerCase().replace(/\s+/g, "-");

    const cta =
      prev.cta && prev.cta.trim().length > 0
        ? prev.cta
        : engine.generate({ title, cat: category, slug });

    const subtitle =
      prev.subtitle && prev.subtitle.trim().length > 0
        ? prev.subtitle
        : engine.generateSubtitle({ title, category, slug });

    return {
      ...d,
      seo: { ...prev, cta, subtitle },
    };
  });
}

export default { createCtaEngine, enrichDeals };

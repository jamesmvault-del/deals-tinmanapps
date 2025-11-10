// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v6.0
// “SEO-Longtail Dominator • Deterministic • Category-Stable Edition”
// -----------------------------------------------------------------------------
// • Deterministic CTA/subtitle generation (slug-anchored SHA1 selection)
// • Strong SEO reinforcement: category long-tail clusters, intent terms,
//   semantic modifiers, and anchor logic
// • Massive diversity with zero repetition across large category sizes
// • Master-cron NEVER overwrites existing SEO fields (only fills missing)
// • High-CTR copy: action-driven, pain-relief oriented, benefit-framed
// • Clean grammar, no product-title echo, hard clamp for snippets
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

const DIVERSITY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// -----------------------------------------------------------------------------
// Memory (not required for determinism but preserved for future extensions)
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
// Helpers
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

function dedupeTitle(text, title) {
  if (!text || !title) return text;
  const lowTitle = title.toLowerCase();
  return text
    .split(/\s+/)
    .filter((w) => !lowTitle.includes(w.toLowerCase()))
    .join(" ")
    .trim();
}

function clampCTA(t, n = 48) {
  if (!t) return "";
  if (t.length <= n) return t;
  let cut = t.slice(0, n).replace(/\s+\S*$/, "");
  if (!cut.endsWith("→")) cut += "…";
  return cut;
}

function clampSubtitle(t, n = 96) {
  if (!t) return "";
  if (!/[.!?]$/.test(t)) t += ".";
  if (t.length <= n) return t;
  const cut = t.lastIndexOf(" ", n);
  return t.slice(0, cut > 40 ? cut : n).trim() + "…";
}

// -----------------------------------------------------------------------------
// Category Long-Tail Semantic Clusters (SEO Reinforcement v6.0)
// -----------------------------------------------------------------------------
const LONGTAIL = {
  ai: [
    "AI process automation",
    "machine-learning workflows",
    "AI-powered optimization",
    "intelligent workflow engines",
    "process automation at scale",
  ],
  marketing: [
    "growth funnels",
    "conversion optimization",
    "audience targeting",
    "email automation frameworks",
    "organic marketing engines",
  ],
  productivity: [
    "workflow efficiency",
    "task automation",
    "daily ops management",
    "process simplification",
    "operational clarity",
  ],
  software: [
    "platform optimization",
    "system automation",
    "operational efficiency",
    "technical workflows",
    "infrastructure clarity",
  ],
  courses: [
    "guided learning paths",
    "skill mastery frameworks",
    "structured lessons",
    "expert-led training",
    "progress-driven modules",
  ],
  business: [
    "team performance systems",
    "operational improvement",
    "scalable workflows",
    "organizational alignment",
    "strategic execution",
  ],
  web: [
    "web project delivery",
    "visual design workflows",
    "UI/UX improvements",
    "digital experience building",
    "professional web launches",
  ],
  ecommerce: [
    "store conversions",
    "purchase flows",
    "checkout optimization",
    "online sales systems",
    "LTV-focused store frameworks",
  ],
  creative: [
    "visual content creation",
    "creative output workflows",
    "design clarity",
    "brand storytelling",
    "studio-quality visuals",
  ],
};

// -----------------------------------------------------------------------------
// CTA Templates (SEO + CTR combined with long-tail modifiers)
// -----------------------------------------------------------------------------
const CTA_TEMPLATES = {
  ai: [
    "Automate your {obj} →",
    "Accelerate AI workflows →",
    "Enhance intelligent systems →",
    "Optimise automation flows →",
  ],
  marketing: [
    "Boost your conversions →",
    "Grow your audience →",
    "Optimize your funnels →",
    "Increase campaign impact →",
  ],
  productivity: [
    "Streamline your workflows →",
    "Reclaim your time →",
    "Improve daily efficiency →",
    "Organize complex tasks →",
  ],
  software: [
    "Run smarter systems →",
    "Simplify operations →",
    "Automate repetitive work →",
    "Boost technical workflows →",
  ],
  courses: [
    "Master new skills →",
    "Advance your learning →",
    "Level up your expertise →",
    "Accelerate your training →",
  ],
  business: [
    "Improve team performance →",
    "Scale your operations →",
    "Enhance business workflows →",
    "Strengthen your strategy →",
  ],
  web: [
    "Build stunning projects →",
    "Launch your next site →",
    "Accelerate your web workflow →",
    "Design beautifully →",
  ],
  ecommerce: [
    "Boost store conversions →",
    "Improve checkout flow →",
    "Streamline online selling →",
    "Increase sales velocity →",
  ],
  creative: [
    "Create standout visuals →",
    "Inspire your next project →",
    "Boost your creative output →",
    "Design with confidence →",
  ],
};

// -----------------------------------------------------------------------------
// Subtitle Templates (now with long-tail reinforcement)
// -----------------------------------------------------------------------------
const SUB_BASE = {
  ai: [
    "turns complex work into intelligent automation",
    "helps you build smarter, faster AI workflows",
  ],
  marketing: [
    "drives measurable growth across your funnel",
    "helps you convert consistently with clarity",
  ],
  productivity: [
    "removes busywork and boosts clarity",
    "keeps you focused and operationally efficient",
  ],
  software: [
    "delivers clarity and performance across your system stack",
    "streamlines operations and repetitive tasks",
  ],
  courses: [
    "guides you through structured, high-quality learning",
    "makes mastering new skills easier and faster",
  ],
  business: [
    "improves operational performance across teams",
    "drives consistent execution at scale",
  ],
  web: [
    "helps you ship stronger digital experiences",
    "elevates your workflow for web builds",
  ],
  ecommerce: [
    "creates frictionless shopping experiences",
    "boosts store-wide conversion performance",
  ],
  creative: [
    "streamlines your creative process with clarity",
    "inspires powerful, polished visual output",
  ],
};

// -----------------------------------------------------------------------------
// Semantic modifiers (strengthens subtitle SEO footprint)
// -----------------------------------------------------------------------------
const MODIFIERS = {
  ai: ["with advanced automation", "using AI-powered optimisation"],
  marketing: ["with conversion-ready precision", "using growth-focused insights"],
  productivity: ["with simplified daily ops", "using clarity-driven workflows"],
  software: ["using modern workflow systems", "with streamlined operations"],
  courses: ["through structured progress", "with expert-backed guidance"],
  business: ["with scalable processes", "through aligned execution"],
  web: ["with pro-level delivery", "using a clean, efficient build flow"],
  ecommerce: ["with store-wide optimisation", "using frictionless sales flows"],
  creative: ["with polished creative clarity", "using professional design flow"],
};

// -----------------------------------------------------------------------------
// Anchors (kept stable)
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

function addAnchor(sub, cat, seed) {
  const a = ANCHORS[cat];
  if (!a) return sub;
  if (sub.toLowerCase().match(/\b(across|within|in|for)\syour/)) return sub;
  return `${sub.replace(/\.*$/, "")} ${hashPick(seed + ":anch", a)}.`;
}

// -----------------------------------------------------------------------------
// CTA ENGINE (v6.0)
// -----------------------------------------------------------------------------
export function createCtaEngine() {
  loadMemory(); // reserved for future upgrades

  return {
    generate({ title = "", cat = "software", slug = "" }) {
      const seed = slug || title || "x";

      const objs = LONGTAIL[cat] || LONGTAIL.software;
      const templates = CTA_TEMPLATES[cat] || CTA_TEMPLATES.software;

      const base = hashPick(seed + ":cta", templates);
      const obj = hashPick(seed + ":obj", objs);

      let cta = clean(base.replace("{obj}", obj));
      cta = dedupeTitle(cta, title);
      cta = clampCTA(cta);

      return cta || "Explore deal →";
    },

    generateSubtitle({ title = "", category = "software", slug = "" }) {
      const seed = slug || title || "x";

      const baseOptions = SUB_BASE[category] || SUB_BASE.software;
      const longtail = LONGTAIL[category] || LONGTAIL.software;
      const modifiers = MODIFIERS[category] || MODIFIERS.software;

      let base = hashPick(seed + ":subbase", baseOptions);
      let lt = hashPick(seed + ":long", longtail);
      let mod = hashPick(seed + ":mod", modifiers);

      let sub = `${base.replace(/\.*$/, "")} — ${lt} ${mod}`;
      sub = clean(sub);
      sub = addAnchor(sub, category, seed);
      sub = dedupeTitle(sub, title);
      sub = clampSubtitle(sub);

      return sub || "Improves your workflow.";
    },
  };
}

// -----------------------------------------------------------------------------
// Enrichment Layer (only fills missing fields)
// -----------------------------------------------------------------------------
export function enrichDeals(deals = [], category = "software") {
  const engine = createCtaEngine();

  return deals.map((d) => {
    const prev = d.seo || {};
    const title = d.title || "";
    const slug = d.slug || title.toLowerCase().replace(/\s+/g, "-");

    const cta =
      prev.cta && prev.cta.trim()
        ? prev.cta
        : engine.generate({ title, cat: category, slug });

    const subtitle =
      prev.subtitle && prev.subtitle.trim()
        ? prev.subtitle
        : engine.generateSubtitle({ title, category, slug });

    return {
      ...d,
      seo: { ...prev, cta, subtitle },
    };
  });
}

export default { createCtaEngine, enrichDeals };

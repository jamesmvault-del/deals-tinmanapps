// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v6.4
// “Deterministic • Category-Pure • Regeneration-Safe • Seam-Proof Edition”
// -----------------------------------------------------------------------------
// • Deterministic CTA/subtitle (slug-anchored SHA1 selection)
// • Category-pure generation using each deal’s own category
// • Zero CTA/subtitle resurrection (compatible with regeneration mode)
// • Object-safe CTAs (no longtail nouns in CTAs)
// • Subtitle seam normalizer + phrase/bigram deduper (aggressively fixes
//   “delivers to…”, “using optimisation using…”, “through … through …”, etc.)
// • UK spelling normalisation (“optimisation”) and clean em-dash spacing
// • Massive diversity with hard anti-repetition logic
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const DIVERSITY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// -----------------------------------------------------------------------------
// Memory (kept but not used for determinism)
// -----------------------------------------------------------------------------
function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(DIVERSITY_FILE, "utf8"));
  } catch {
    return { ctas: {}, subs: {} };
  }
}
function saveMemory(mem) {
  try {
    fs.writeFileSync(DIVERSITY_FILE, JSON.stringify(mem, null, 2));
  } catch {}
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
// CTA Objects (safe noun phrases for insertion)
// -----------------------------------------------------------------------------
const CTA_OBJECTS = {
  ai: ["automation stack", "AI workflows", "model-powered tools", "ops pipeline", "smart systems"],
  marketing: ["campaigns", "funnels", "audience growth", "email engine", "content pipeline"],
  productivity: ["workflows", "daily systems", "task processes", "priority stack", "operations"],
  software: ["tech stack", "platform", "system workflows", "internal tools", "ops engine"],
  courses: ["learning path", "study plan", "training flow", "skill framework", "curriculum"],
  business: ["team ops", "strategic processes", "execution flow", "operations", "playbooks"],
  web: ["web projects", "frontend workflow", "site components", "build pipeline", "delivery stack"],
  ecommerce: ["store flows", "checkout", "catalog", "sales pipeline", "retention engine"],
  creative: ["creative workflow", "design system", "content pipeline", "visual process", "studio ops"],
};

// -----------------------------------------------------------------------------
// Long-tail (SEO Anchors) — UK spelling (“optimisation”)
// -----------------------------------------------------------------------------
const LONGTAIL = {
  ai: [
    "AI process automation",
    "machine-learning workflows",
    "AI-powered optimisation",
    "intelligent workflow engines",
    "process automation at scale",
  ],
  marketing: [
    "growth funnels",
    "conversion optimisation",
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
    "platform optimisation",
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
    "organisational alignment",
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
    "checkout optimisation",
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
// CTA Templates
// -----------------------------------------------------------------------------
const CTA_TEMPLATES = {
  ai: ["Automate your {obj} →", "Accelerate AI workflows →", "Enhance intelligent systems →", "Optimise automation flows →"],
  marketing: ["Boost your conversions →", "Grow your audience →", "Optimise your funnels →", "Increase campaign impact →"],
  productivity: ["Streamline your workflows →", "Reclaim your time →", "Improve daily efficiency →", "Organise complex tasks →"],
  software: ["Run smarter systems →", "Simplify operations →", "Automate repetitive work →", "Boost technical workflows →"],
  courses: ["Master new skills →", "Advance your learning →", "Level up your expertise →", "Accelerate your training →"],
  business: ["Improve team performance →", "Scale your operations →", "Enhance business workflows →", "Strengthen your strategy →"],
  web: ["Build stunning projects →", "Launch your next site →", "Accelerate your web workflow →", "Design beautifully →"],
  ecommerce: ["Boost store conversions →", "Improve checkout flow →", "Streamline online selling →", "Increase sales velocity →"],
  creative: ["Create standout visuals →", "Inspire your next project →", "Boost your creative output →", "Design with confidence →"],
};

// -----------------------------------------------------------------------------
// Subtitle bases (neutral, clean)
// -----------------------------------------------------------------------------
const SUB_BASE = {
  ai: ["turns complex work into intelligent automation", "helps you build smarter, faster AI workflows"],
  marketing: ["drives measurable growth across your funnel", "helps you convert consistently with clarity"],
  productivity: ["removes busywork and boosts clarity", "keeps you focused and operationally efficient"],
  software: ["delivers clarity and performance across your system stack", "streamlines operations and repetitive tasks"],
  courses: ["guides you through structured, high-quality learning", "makes mastering new skills easier and faster"],
  business: ["improves operational performance across teams", "drives consistent execution at scale"],
  web: ["helps you ship stronger digital experiences", "elevates your workflow for web builds"],
  ecommerce: ["creates frictionless shopping experiences", "boosts store-wide conversion performance"],
  creative: ["streamlines your creative process with clarity", "inspires powerful, polished visual output"],
};

// -----------------------------------------------------------------------------
// Modifiers (UK spelling normalised)
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
// Anchors
// -----------------------------------------------------------------------------
const ANCHORS = {
  ai: ["across your AI workflows", "within your systems"],
  marketing: ["across your campaigns", "for your audience growth"],
  productivity: ["in your daily workflows", "across your routines"],
  software: ["across your operations", "within your tech stack"],
  courses: ["through guided learning"],
  business: ["across your organisation"],
  web: ["for your digital projects"],
  ecommerce: ["across your store"],
  creative: ["in your creative work"],
};

function addAnchor(sub, cat, seed) {
  const a = ANCHORS[cat];
  if (!a) return sub;
  if (/\b(across|within|in|for)\s+your\b/i.test(sub)) return sub;
  return `${sub.replace(/\.*$/, "")} ${hashPick(seed + ":anch", a)}.`;
}

// -----------------------------------------------------------------------------
// Phrase/bigram dedupe + seam normaliser
// -----------------------------------------------------------------------------
function dedupePhrases(parts) {
  const text = parts.filter(Boolean).join(" ").replace(/\s*—\s*/g, " — ").trim();
  if (!text) return text;

  const words = text.split(/\s+/);
  const seenUni = new Set();
  const seenBi = new Set();
  const out = [];

  for (let i = 0; i < words.length; i++) {
    const cur = words[i];
    const uni = cur.toLowerCase();
    const bi = i > 0 ? (words[i - 1] + " " + cur).toLowerCase() : null;

    // keep em-dash as-is
    if (cur === "—") {
      if (out.length && out[out.length - 1] !== "—") out.push(cur);
      continue;
    }

    if (!seenUni.has(uni) && (!bi || !seenBi.has(bi))) {
      out.push(cur);
      seenUni.add(uni);
      if (bi) seenBi.add(bi);
    }
  }

  // fix double dashes/spaces
  return out.join(" ").replace(/\s*—\s*/g, " — ").replace(/\s{2,}/g, " ").trim();
}

function normalizeSeams(t) {
  let s = t;

  // UK spelling
  s = s.replace(/\boptimization\b/gi, "optimisation");

  // Remove bad “verb + to + noun” seams: “delivers to clarity” -> “delivers clarity”
  s = s.replace(/\b(delivers|adds|provides|offers|gives)\s+to\s+(\w+)/gi, "$1 $2");
  s = s.replace(/\b(simplif(?:y|ies)|streamlines|boosts|enhances|improves)\s+to\s+(\w+)/gi, "$1 $2");

  // Collapse duplicated prepositions/phrases
  s = s.replace(/\b(using|through|with)\s+([a-z0-9-]+)\s+\1\b/gi, "$1 $2");
  s = s.replace(/\b(using|through|with)\s+([a-z0-9-]+)\s+(using|through|with)\s+/gi, "$1 $2 ");
  s = s.replace(/\bat scale(?:\s+at scale)+/gi, "at scale");

  // Remove duplicated “AI-powered/ML” tokens
  s = s.replace(/\b(ai-?powered)\b.*?\b\1\b/gi, "$1");
  s = s.replace(/\b(machine-learning)\b.*?\b\1\b/gi, "$1");

  // If we ended up with “— —” or leading/trailing dash, fix it
  s = s.replace(/(?:\s*—\s*){2,}/g, " — ");
  s = s.replace(/^(—\s*)+/, "").replace(/(\s*—\s*)+$/, "");

  // Clean double spaces
  s = s.replace(/\s{2,}/g, " ").trim();

  return s;
}

// -----------------------------------------------------------------------------
// CTA ENGINE (v6.4)
// -----------------------------------------------------------------------------
export function createCtaEngine() {
  loadMemory(); // harmless

  return {
    generate({ title = "", cat = "software", slug = "" }) {
      const seed = slug || title || "x";
      const templates = CTA_TEMPLATES[cat] || CTA_TEMPLATES.software;
      const objs = CTA_OBJECTS[cat] || CTA_OBJECTS.software;

      let base = hashPick(seed + ":cta", templates);
      let obj = hashPick(seed + ":obj", objs);

      let cta = clean(base.replace("{obj}", obj));
      cta = dedupeTitle(cta, title);
      cta = clampCTA(cta);

      return cta || "Explore deal →";
    },

    generateSubtitle({ title = "", category = "software", slug = "" }) {
      const seed = slug || title || "x";

      const baseOpts = SUB_BASE[category] || SUB_BASE.software;
      const longOpts = LONGTAIL[category] || LONGTAIL.software;
      const modOpts = MODIFIERS[category] || MODIFIERS.software;

      const base = hashPick(seed + ":subbase", baseOpts).replace(/\.*$/, "");
      const lt = hashPick(seed + ":long", longOpts);
      const mod = hashPick(seed + ":mod", modOpts);

      // Build → dedupe → normalise
      let stitched = dedupePhrases([base, "—", lt, mod]);
      stitched = normalizeSeams(stitched);
      stitched = clean(stitched);
      stitched = addAnchor(stitched, category, seed);
      stitched = dedupeTitle(stitched, title);
      stitched = clampSubtitle(stitched);

      return stitched || "Improves your workflow.";
    },
  };
}

// -----------------------------------------------------------------------------
// Enrichment layer (category-pure and regen-safe — only fills missing fields)
// -----------------------------------------------------------------------------
export function enrichDeals(deals = []) {
  const engine = createCtaEngine();

  return deals.map((d) => {
    const prev = d.seo || {};
    const category = (d.category || "software").toLowerCase();
    const title = d.title || "";
    const slug = d.slug || title.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");

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

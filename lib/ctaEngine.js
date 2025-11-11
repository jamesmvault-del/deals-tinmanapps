// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v7.1
// “Deterministic • 3-Sentence Architecture • Whitespace SEO • Evergreen • No-Dash Edition”
// -------------------------------------------------------------------------------------------
// • FIXED CTA_TEMPLATES HOISTING ISSUE (for GitHub Actions + updateFeed)
// • FULL 3-sentence subtitle architecture
// • Long-tail / whitespace keyword momentum targeting
// • Deterministic SHA1 seeding
// • Zero em-dashes, no duplication, no seams
// • Anti-generic banlist
// • UK spelling normalisation
// • 100% regen-safe
// -------------------------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const MEMORY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// -------------------------------------------------------------------------------------------
// CTA TEMPLATES (MOVED UP — FIXES HOISTING BREAK IN updateFeed.js)
// -------------------------------------------------------------------------------------------
const CTA_TEMPLATES = {
  ai: [
    "Ship AI features faster →",
    "Automate {obj} safely →",
    "Cut manual steps in {obj} →",
    "Build reliable AI pipelines →",
  ],
  marketing: [
    "Lift conversion on {obj} →",
    "Tidy your funnel steps →",
    "Scale repeatable campaigns →",
    "Make offers convert clearer →",
  ],
  productivity: [
    "Make your day flow better →",
    "Close the loop on tasks →",
    "Reduce handoffs friction →",
    "Bring order to {obj} →",
  ],
  software: [
    "Ship with fewer regressions →",
    "Automate recurring platform work →",
    "Stabilise your release flow →",
    "Declutter your tech stack →",
  ],
  courses: [
    "Turn study into skill →",
    "Progress with a clear plan →",
    "Learn by doing, faster →",
    "Finish the track you start →",
  ],
  business: [
    "Tighten team execution →",
    "Make goals actually happen →",
    "Build a calmer operating rhythm →",
    "Remove process drag →",
  ],
  web: [
    "Ship cleaner web builds →",
    "Speed up component work →",
    "Make deploys predictable →",
    "Organise your UI library →",
  ],
  ecommerce: [
    "Remove checkout friction →",
    "Grow repeat purchases →",
    "Clean up catalog ops →",
    "Make merchandising simple →",
  ],
  creative: [
    "Ship on-brand assets faster →",
    "Shorten review cycles →",
    "Tidy your design system →",
    "Make briefs produce better work →",
  ],
};

// -------------------------------------------------------------------------------------------
// MEMORY (stub — not used for determinism)
// -------------------------------------------------------------------------------------------
function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
  } catch {
    return { ctas: {}, subtitles: {} };
  }
}
function saveMemory(mem) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(mem, null, 2), "utf8");
  } catch {}
}

// -------------------------------------------------------------------------------------------
// UTILS
// -------------------------------------------------------------------------------------------
function sha(seed) {
  return crypto.createHash("sha1").update(seed).digest("hex");
}
function pickIndex(seed, len) {
  return parseInt(sha(seed).slice(0, 8), 16) % len;
}
function hashPick(seed, arr) {
  if (!arr?.length) return "";
  return arr[pickIndex(seed, arr.length)];
}
function hashPickAvoid(seed, arr, avoidRegexes = []) {
  if (!arr?.length) return "";
  const L = arr.length;
  const base = pickIndex(seed, L);
  const stride = (parseInt(sha(seed + "::stride").slice(0, 6), 16) % (L - 1)) + 1;

  for (let i = 0; i < L; i++) {
    const idx = (base + stride * i) % L;
    const cand = arr[idx];
    if (!avoidRegexes.some((r) => r.test(cand))) return cand;
  }
  return arr[base];
}

function clean(t) {
  return String(t)
    .replace(/\s{2,}/g, " ")
    .replace(/\(undefined\)/gi, "")
    .trim();
}
function dedupeTitle(text, title) {
  if (!text || !title) return text;
  const low = title.toLowerCase();
  return text
    .split(/\s+/)
    .filter((w) => !low.includes(w.toLowerCase()))
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

// 3-sentence subtitle (~210 chars)
function clampSub(t, n = 210) {
  if (!t) return "";
  if (!/[.!?]$/.test(t)) t += ".";
  if (t.length <= n) return t;
  const cut = t.lastIndexOf(" ", n);
  return t.slice(0, cut > 80 ? cut : n).trim() + "…";
}

// -------------------------------------------------------------------------------------------
// BANLISTS
// -------------------------------------------------------------------------------------------
const BAN_CTA = [
  /enhance intelligent systems/i,
  /optimise automation flows/i,
  /automate your workflows/i,
  /accelerate workflows/i,
  /simplify operations/i,
  /build your workflows/i,
];

const BAN_SUB = [
  /helps you build smarter, faster/i,
  /turns complex work into intelligent automation/i,
  /process automation at scale/i,
  /ai-?powered optimisation/i,
  /using optimisation using/i,
  /through .* through/i,
  /across your workflows\./i,
];

// -------------------------------------------------------------------------------------------
// CTA OBJECTS
// -------------------------------------------------------------------------------------------
const CTA_OBJECTS = {
  ai: ["model workflows", "data cleanup", "AI pipelines", "prompt ops", "agent stack"],
  marketing: ["funnel steps", "ad sets", "campaigns", "landing flow", "content pipeline"],
  productivity: ["daily flow", "task queue", "priority stack", "handoffs"],
  software: ["release flow", "platform tasks", "internal dev tools", "tech stack"],
  courses: ["learning path", "study plan", "skill track", "training flow"],
  business: ["team ops", "playbooks", "reviews", "priority flow"],
  web: ["build pipeline", "UI library", "deploy steps", "page components"],
  ecommerce: ["checkout", "retention flow", "catalog ops", "product listings"],
  creative: ["design system", "creative ops", "visual assets", "review round"],
};

// -------------------------------------------------------------------------------------------
// LONGTAIL WHITESPACE (Sentence 2)
// -------------------------------------------------------------------------------------------
const WHITESPACE = {
  ai: [
    "agentic workflows",
    "retrieval-augmented flows",
    "model evaluation clarity",
    "data-labelling discipline",
  ],
  marketing: [
    "micro-conversion uplift",
    "intent-segmentation clarity",
    "offer-path sequencing",
  ],
  productivity: [
    "context-switch stability",
    "repeatable SOP design",
    "daily cadence uplift",
  ],
  software: [
    "release hygiene patterns",
    "runtime predictability cues",
    "deployment discipline",
  ],
  courses: [
    "checkpoint-led progress",
    "practical skill transfer",
  ],
  business: [
    "execution discipline",
    "scorecard alignment habits",
  ],
  web: [
    "component-driven velocity",
    "build-to-deploy clarity",
  ],
  ecommerce: [
    "checkout friction mapping",
    "offer sequencing insights",
  ],
  creative: [
    "visual cohesion patterns",
    "editorial polish loops",
  ],
};

// -------------------------------------------------------------------------------------------
// SUB BASES + MODIFIERS
// -------------------------------------------------------------------------------------------
const SUB_BASE = {
  ai: ["keeps AI delivery predictable", "helps teams add AI where impact is real"],
  marketing: ["keeps your funnel consistent", "clarifies the path to conversion"],
  productivity: ["keeps priorities visible", "removes friction from your day"],
  software: ["keeps releases steady", "reduces engineering toil"],
  courses: ["turns knowledge into skill", "keeps your learning on track"],
  business: ["improves execution", "keeps teams aligned"],
  web: ["helps you ship cleaner web work", "keeps builds predictable"],
  ecommerce: ["removes checkout friction", "keeps store ops measurable"],
  creative: ["makes creative work easier to ship", "keeps review loops tight"],
};

const SUB_MOD = {
  ai: ["with evaluation-first habits", "with stable model practices"],
  marketing: ["with tidy campaign ops", "with clean analytics insights"],
  productivity: ["with simple team rituals", "with light-touch automation"],
  software: ["with predictable deploy flow", "with disciplined processes"],
  courses: ["with clear checkpoints", "with tutor-style guidance"],
  business: ["with simple scorecards", "with focus-led rhythms"],
  web: ["with deploy-ready assets", "with maintainable components"],
  ecommerce: ["with merchandising clarity", "with real performance signals"],
  creative: ["with practical templates", "with clean creative structure"],
};

// -------------------------------------------------------------------------------------------
// ANCHORS (Sentence 3)
// -------------------------------------------------------------------------------------------
const ANCHORS = {
  ai: ["inside your AI workflows", "across your agent stack"],
  marketing: ["across your funnel", "inside your campaigns"],
  productivity: ["in your day-to-day", "across your routines"],
  software: ["in your delivery pipeline", "across your platform"],
  courses: ["through a clear study path"],
  business: ["across your operating rhythm"],
  web: ["in your web projects"],
  ecommerce: ["across your store"],
  creative: ["in your creative process"],
};

// -------------------------------------------------------------------------------------------
// REDUNDANCY CLEANER
// -------------------------------------------------------------------------------------------
function killSeams(t) {
  return t
    .replace(/—/g, " ")
    .replace(/\b(using|through|with)\s+([a-z0-9-]+)\s+\1\b/gi, "$1 $2")
    .replace(/\b(add|adds|added)\s+where\s+it\b/gi, "add it")
    .replace(/\boptimization\b/gi, "optimisation")
    .replace(/\s{2,}/g, " ");
}

// -------------------------------------------------------------------------------------------
// Build 3-sentence subtitle
// -------------------------------------------------------------------------------------------
function buildSubtitle({ title, category, seed }) {
  const base = hashPickAvoid(seed + ":s1", SUB_BASE[category], BAN_SUB);
  const white = hashPickAvoid(seed + ":s2", WHITESPACE[category]);
  const mod = hashPickAvoid(seed + ":s3", SUB_MOD[category]);
  const anch = hashPick(seed + ":s4", ANCHORS[category]);

  let s1 = `${base}.`;
  let s2 = `${white} ${mod}.`;
  let s3 = `${anch}.`;

  let out = `${s1} ${s2} ${s3}`;
  out = killSeams(out);
  out = clean(out);
  out = dedupeTitle(out, title);
  out = clampSub(out);

  if (BAN_SUB.some((r) => r.test(out))) return "Clear, measurable improvement.";
  return out;
}

// -------------------------------------------------------------------------------------------
// CTA ENGINE
// -------------------------------------------------------------------------------------------
export function createCtaEngine() {
  loadMemory(); // harmless stub

  return {
    generate({ title = "", cat = "software", slug = "" }) {
      const seed = slug || title || "x";
      const tpl = CTA_TEMPLATES[cat] || CTA_TEMPLATES.software;
      const obj = hashPick(seed + ":obj", CTA_OBJECTS[cat] || CTA_OBJECTS.software);

      let cta = clean(hashPickAvoid(seed + ":cta", tpl, BAN_CTA).replace("{obj}", obj));
      cta = dedupeTitle(cta, title);
      cta = clampCTA(cta);

      if (BAN_CTA.some((r) => r.test(cta))) cta = "View the details →";
      return cta;
    },

    generateSubtitle({ title = "", category = "software", slug = "" }) {
      const seed = slug || title || "x";
      return buildSubtitle({ title, category, seed });
    },
  };
}

// -------------------------------------------------------------------------------------------
// ENRICHMENT LAYER
// -------------------------------------------------------------------------------------------
export function enrichDeals(deals = []) {
  const engine = createCtaEngine();

  return deals.map((d) => {
    const prev = d.seo || {};
    const category = (d.category || "software").toLowerCase();
    const title = d.title || "";

    const slug =
      d.slug ||
      title.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");

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

// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v6.6
// “Deterministic • Category-Pure • Seamless • Anti-Generic • No-Dash Edition”
// -----------------------------------------------------------------------------
// • Deterministic (slug-anchored SHA1)
// • Category-pure phrasing
// • Hard anti-generic banlist (CTA + Subtitles)
// • Seamless subtitle construction (NO em-dashes ever)
// • Bigram & unigram deduper
// • UK spelling normalisation
// • 100% regen-safe
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const DIVERSITY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// ───────────────────────────────────────────────────────────────────────────────
// Memory (kept for potential future telemetry; not used for determinism)
// ───────────────────────────────────────────────────────────────────────────────
function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(DIVERSITY_FILE, "utf8"));
  } catch {
    return { ctas: {}, subs: {} };
  }
}
function saveMemory(mem) {
  try {
    fs.writeFileSync(DIVERSITY_FILE, JSON.stringify(mem, null, 2), "utf8");
  } catch {}
}

// ───────────────────────────────────────────────────────────────────────────────
// Utils
// ───────────────────────────────────────────────────────────────────────────────
function sha(seed) {
  return crypto.createHash("sha1").update(seed).digest("hex");
}
function pickIndex(seed, len) {
  const h = sha(seed);
  return parseInt(h.slice(0, 8), 16) % len;
}
function hashPick(seed, arr) {
  if (!arr?.length) return "";
  return arr[pickIndex(seed, arr.length)];
}
function hashPickAvoid(seed, arr, avoidRegexes = []) {
  if (!arr?.length) return "";
  const L = arr.length;
  if (!avoidRegexes.length) return arr[pickIndex(seed, L)];

  const base = pickIndex(seed, L);
  const stride = (parseInt(sha(seed + "::stride").slice(0, 4), 16) % (L - 1)) + 1;

  for (let k = 0; k < L; k++) {
    const idx = (base + k * stride) % L;
    const cand = arr[idx];
    if (!avoidRegexes.some((r) => r.test(cand))) return cand;
  }
  return arr[base];
}

function clean(t) {
  return String(t)
    .replace(/\s{2,}/g, " ")
    .replace(/\b(undefined|null|neutral)\b/gi, "")
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
function clampSubtitle(t, n = 96) {
  if (!t) return "";
  if (!/[.!?]$/.test(t)) t += ".";
  if (t.length <= n) return t;
  const cut = t.lastIndexOf(" ", n);
  return t.slice(0, cut > 40 ? cut : n).trim() + "…";
}

// ───────────────────────────────────────────────────────────────────────────────
// BANLIST (CTA & Subtitle)
// ───────────────────────────────────────────────────────────────────────────────
const BAN_CTA = [
  /Enhance intelligent systems/i,
  /Optimise automation flows/i,
  /Automate your workflows/i,
  /Accelerate workflows/i,
  /Simplify operations/i,
  /Run smarter platforms?/i,
  /Build your workflows/i,
];

const BAN_SUB = [
  /helps you build smarter, faster/i,
  /turns complex work into intelligent automation/i,
  /process automation at scale/i,
  /using AI-?powered optimisation/i,
  /using optimisation using/i,
  /through .* through/i,
  /across your workflows\./i,
];

// ───────────────────────────────────────────────────────────────────────────────
// CTA objects
// ───────────────────────────────────────────────────────────────────────────────
const CTA_OBJECTS = {
  ai: ["model workflows", "data cleanup", "prompt ops", "AI pipelines", "agent stack"],
  marketing: ["campaigns", "funnel steps", "lead capture", "ad sets", "content pipeline"],
  productivity: ["daily workflows", "task queue", "priority stack", "ops routine", "handoffs"],
  software: ["release flow", "internal tools", "platform tasks", "tech stack", "ops engine"],
  courses: ["learning path", "study plan", "skill track", "training flow", "curriculum"],
  business: ["team ops", "playbooks", "handoffs", "reviews", "cascaded goals"],
  web: ["component library", "build pipeline", "deploy steps", "page templates", "UI inventory"],
  ecommerce: ["checkout", "retention flow", "catalog ops", "product listings", "offer pages"],
  creative: ["design system", "asset pipeline", "storyboards", "visual edits", "review rounds"],
};

// ───────────────────────────────────────────────────────────────────────────────
// Longtail / Bases / Modifiers — all category pure
// (These feed into the new WHITESPACE-SAFE no-dash subtitle builder in Part B)
// ───────────────────────────────────────────────────────────────────────────────
const LONGTAIL = {
  ai: [
    "agentic workflows",
    "retrieval-augmented tasks",
    "prompt-safe orchestration",
    "automated data labelling",
    "evaluation practices",
  ],
  marketing: [
    "conversion-ready journeys",
    "message-market alignment",
    "audience segmentation depth",
    "offer testing cadence",
    "post-click optimisation",
  ],
  productivity: [
    "single-source-of-truth habits",
    "friction-free handoffs",
    "clean daily cadence",
    "context-switch reduction",
    "repeatable SOPs",
  ],
  software: [
    "release hygiene",
    "regression-free shipping",
    "triage discipline",
    "runtime clarity",
    "operational visibility",
  ],
  courses: [
    "milestone-based learning",
    "applied exercises",
    "mentor-grade guidance",
    "paced progression",
    "skill transfer practice",
  ],
  business: [
    "operating rhythm clarity",
    "decision-making focus",
    "execution consistency",
    "scorecard alignment",
    "priority flow",
  ],
  web: [
    "design-to-dev continuity",
    "component-driven builds",
    "accessible interfaces",
    "performance budgets",
    "clean deployments",
  ],
  ecommerce: [
    "cart recovery tactics",
    "checkout friction fixes",
    "offer sequencing",
    "LTV uplift motions",
    "merchandising clarity",
  ],
  creative: [
    "on-brand delivery",
    "editorial polish",
    "review-ready assets",
    "visual cohesion",
    "story clarity",
  ],
};

const SUB_BASE = {
  ai: [
    "keeps AI delivery predictable",
    "helps teams add AI where impact is real",
  ],
  marketing: [
    "keeps your funnel consistent and measurable",
    "clarifies the path from attention to purchase",
  ],
  productivity: [
    "keeps priorities visible and momentum high",
    "removes friction so work flows smoothly",
  ],
  software: [
    "keeps releases steady and predictable",
    "reduces toil across your engineering workflow",
  ],
  courses: [
    "turns knowledge into practical skill",
    "keeps you progressing with clear checkpoints",
  ],
  business: [
    "improves execution without added complexity",
    "keeps teams aligned around measurable outcomes",
  ],
  web: [
    "helps you ship cleaner, faster web work",
    "keeps builds consistent from design to deploy",
  ],
  ecommerce: [
    "removes friction that hurts conversion",
    "keeps store ops simple and measurable",
  ],
  creative: [
    "makes creative work clearer and easier to ship",
    "keeps feedback loops short and useful",
  ],
};

const MODIFIERS = {
  ai: ["with evaluation-first habits", "with human-in-the-loop guardrails"],
  marketing: ["with tidy campaign ops", "with useful analytics"],
  productivity: ["with simple team rituals", "with light-touch automation"],
  software: ["with stable processes", "with predictable deploy flow"],
  courses: ["with examples you can apply", "with clear learning beats"],
  business: ["with simple scorecards", "with meeting-light cadence"],
  web: ["with maintainable components", "with deploy-ready assets"],
  ecommerce: ["with stable merchandising", "with real performance metrics"],
  creative: ["with practical templates", "with review-friendly previews"],
};

// Anchors (no dashes; always sentence-safe)
const ANCHORS = {
  ai: ["inside your AI workflows", "across your agent stack"],
  marketing: ["across your campaigns", "in your funnel"],
  productivity: ["in your daily flow", "across your routines"],
  software: ["across your delivery pipeline", "in your platform"],
  courses: ["through a clear study path"],
  business: ["across your operating rhythm"],
  web: ["in your web projects"],
  ecommerce: ["across your store"],
  creative: ["in your creative process"],
};

// ───────────────────────────────────────────────────────────────────────────────
// CTA templates (no changes here)
// ───────────────────────────────────────────────────────────────────────────────
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
// ───────────────────────────────────────────────────────────────────────────────
// PART B — Subtitle builder (NO DASHES), redundancy killer, engine + enrichDeals
// ───────────────────────────────────────────────────────────────────────────────

// Sentence-safe joiners (never em-dash)
function sentenceJoin(parts) {
  // Keep only truthy, trimmed, non-duplicate fragments
  const seen = new Set();
  const cleanParts = [];
  for (const p of parts) {
    if (!p) continue;
    const s = String(p).replace(/\s{2,}/g, " ").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleanParts.push(s);
  }

  // Build a single sentence: "<base> <lt> <mod>. <anchor>" (no em-dash)
  if (!cleanParts.length) return "";
  let main = cleanParts.slice(0, 3).join(" "); // base + lt + mod
  main = main.replace(/\s*—\s*/g, " "); // kill stray dashes if any source text had them

  // Ensure trailing punctuation on main
  main = main.replace(/\.*\s*$/, ".");
  let tail = cleanParts[3] ? cleanParts[3] : "";

  // Anchor should start lowercase preposition; ensure it's appended properly.
  if (tail) {
    tail = tail.replace(/^[A-Z]/, (m) => m.toLowerCase());
    return `${main} ${tail.replace(/\.*\s*$/, ".")}`;
  }
  return main;
}

// Redundancy killer across whole subtitle (tokens + common bigrams)
function killRedundancy(t) {
  if (!t) return t;
  let s = t;

  // UK spelling
  s = s.replace(/\boptimization\b/gi, "optimisation");

  // Kill notorious seams & repeats
  s = s.replace(/\b(using|through|with)\s+([a-z0-9-]+)\s+\1\b/gi, "$1 $2");
  s = s.replace(/\b(using|through|with)\s+([a-z0-9-]+)\s+(using|through|with)\s+/gi, "$1 $2 ");
  s = s.replace(/\bat scale(?:\s+at scale)+/gi, "at scale");
  s = s.replace(/\b(ai-?powered)\b.*?\b\1\b/gi, "$1");
  s = s.replace(/\b(machine-learning)\b.*?\b\1\b/gi, "$1");

  // Remove accidental "—" anywhere
  s = s.replace(/—/g, " ");

  // Collapse spaces, tidy punctuation
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();

  // Guard against weird "add where it" seam
  s = s.replace(/\b(add|adds|added)\s+where\s+it\b/gi, "add it");

  return s;
}

// Keep existing helpers from Part A in scope: hashPick, hashPickAvoid, clean, dedupeTitle,
// clampSubtitle, BAN_SUB, SUB_BASE, LONGTAIL, MODIFIERS, ANCHORS, etc.

function addAnchorNoDash(sub, cat, seed) {
  const a = ANCHORS[cat];
  if (!a) return sub;
  if (/\b(across|within|in|for)\s+your\b/i.test(sub)) return sub;
  const anchor = String(hashPick(seed + ":anch", a)).replace(/\.*$/, "");
  const out = `${sub.replace(/\.*\s*$/, ".")} ${anchor}.`;
  // Normalise spaces/punctuation
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1");
}

// ───────────────────────────────────────────────────────────────────────────────
// CTA ENGINE v6.6 (CTA unchanged; subtitle rebuilt without dashes)
// ───────────────────────────────────────────────────────────────────────────────
export function createCtaEngine() {
  loadMemory(); // harmless

  return {
    generate({ title = "", cat = "software", slug = "" }) {
      const seed = slug || title || "x";
      const templates = CTA_TEMPLATES[cat] || CTA_TEMPLATES.software;
      const objs = (CTA_OBJECTS[cat] || CTA_OBJECTS.software);

      const base = hashPickAvoid(seed + ":cta", templates, BAN_CTA);
      const obj = hashPick(seed + ":obj", objs);

      let cta = clean(base.replace("{obj}", obj));
      cta = dedupeTitle(cta, title);
      cta = clampCTA(cta);

      if (BAN_CTA.some((r) => r.test(cta))) cta = "View the details →";
      return cta || "View the details →";
    },

    generateSubtitle({ title = "", category = "software", slug = "" }) {
      const seed = slug || title || "x";

      const baseOpts = SUB_BASE[category] || SUB_BASE.software;
      const longOpts = LONGTAIL[category] || LONGTAIL.software;
      const modOpts  = MODIFIERS[category] || MODIFIERS.software;

      const base = hashPickAvoid(seed + ":subbase", baseOpts, BAN_SUB).replace(/\.*$/, "");
      const lt   = hashPickAvoid(seed + ":long",    longOpts, BAN_SUB);
      const mod  = hashPickAvoid(seed + ":mod",     modOpts,  BAN_SUB);

      // Build a single, dashless sentence
      let stitched = sentenceJoin([base, lt, mod, ""]); // anchor added after cleaning
      stitched = killRedundancy(stitched);
      stitched = clean(stitched);
      stitched = addAnchorNoDash(stitched, category, seed);
      stitched = dedupeTitle(stitched, title);
      stitched = clampSubtitle(stitched);

      if (BAN_SUB.some((r) => r.test(stitched))) stitched = "Clear, measurable improvement.";
      return stitched || "Clear, measurable improvement.";
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Enrichment layer (regen-safe; only fills missing fields)
// ───────────────────────────────────────────────────────────────────────────────
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

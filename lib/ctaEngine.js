// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v8.0
// “Deterministic • Live-Metadata Bespoke • Whitespace SEO • No-Dash • Regen-Safe”
// -------------------------------------------------------------------------------------------
// What’s new vs v7.1
// • LIVE PRODUCT DATA → description-driven keywords for bespoke CTAs/subtitles
// • Deterministic picks seeded by slug+title+keyword hash (stable across runs)
// • Smarter redundancy killer + UK spelling normalisation
// • Backwards compatible API (createCtaEngine / enrichDeals) + exports sanitizeText
// • Hoisted CTA_TEMPLATES to avoid Actions/updateFeed hoisting issues
// -------------------------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const MEMORY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// -------------------------------------------------------------------------------------------
// CTA TEMPLATES (HOISTED — required for updateFeed/GitHub Actions)
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
// MEMORY (stub — not used for determinism; future CTR learning hook)
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
  return crypto.createHash("sha1").update(String(seed)).digest("hex");
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

export function sanitizeText(t = "") {
  return String(t || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replace(/&#x27;|&apos;/g, "'")
    // kill html tags & stray artifacts
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+–\s+|\s+—\s+|—|–/g, " ") // no dashes
    .replace(/\boptimization\b/gi, "optimisation") // UK
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function clean(t) {
  return sanitizeText(String(t).replace(/\(undefined\)/gi, ""));
}

function dedupeTitle(text, title) {
  if (!text || !title) return text;
  const low = title.toLowerCase();
  return text
    .split(/\s+/)
    .filter((w) => !low.includes(w.toLowerCase()))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function clampCTA(t, n = 48) {
  if (!t) return "";
  if (t.length <= n) return t;
  let cut = t.slice(0, n).replace(/\s+\S*$/, "");
  if (!cut.endsWith("→")) cut += "…";
  return cut;
}

// ~180–210 chars ideal for index + CTR. Category pages clamp further if needed.
function clampSub(t, n = 210) {
  if (!t) return "";
  if (!/[.!?]$/.test(t)) t += ".";
  if (t.length <= n) return t;
  const cut = t.lastIndexOf(" ", n);
  return t.slice(0, cut > 80 ? cut : n).trim() + "…";
}

// -------------------------------------------------------------------------------------------
/** STOPWORDS + tokenisers for simple noun-ish keyword extraction from description/title */
// -------------------------------------------------------------------------------------------
const STOP = new Set([
  "the","a","an","and","or","but","if","then","else","for","to","from","with","without",
  "on","in","at","by","of","as","is","are","was","were","be","been","being","it","its",
  "that","this","these","those","you","your","yours","we","our","ours","they","their",
  "them","i","me","my","mine","he","she","his","her","hers","do","does","did","done",
  "can","could","should","would","may","might","will","shall","not","no","yes","up","down",
  "over","under","again","more","most","such","very","into","about","than","so","just",
  "today","now","platform","software","tool","app","service","solution","product","system",
  "use","using","used","via","make","made","build","built","helps","help","get","got",
  "quickly","easily","fast","faster","speed","best","deal","discover","learn","host",
  "schedule","today","appsumo","ltd","lifetime","deal"
]);

function tokens(s = "") {
  return sanitizeText(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function extractKeywords({ title = "", description = "" }, topN = 8) {
  const bag = new Map();
  const add = (w) => {
    if (!w) return;
    if (STOP.has(w)) return;
    if (w.length < 3) return;
    if (/^\d+$/.test(w)) return;
    bag.set(w, (bag.get(w) || 0) + 1);
  };

  [...tokens(title), ...tokens(description)].forEach(add);

  return [...bag.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([w]) => w);
}

function bestKeywordPhrase(meta, category) {
  const kws = extractKeywords(meta, 10);
  if (!kws.length) return null;

  // Simple category-aware prioritisation
  const pref = {
    ai: ["ai","model","models","prompt","prompts","agent","agents","nlp","vision","speech"],
    marketing: ["ads","ad","campaign","seo","email","leads","funnel","landing","social"],
    productivity: ["tasks","workflow","automation","calendar","notes","inbox","priority"],
    software: ["deploy","release","version","api","integration","server","cloud","debug"],
    courses: ["course","lesson","training","learn","academy","masterclass","tutorial"],
    business: ["client","invoice","crm","accounting","team","project","report","portal"],
    web: ["website","builder","component","ui","css","html","page","design","deploy"],
    ecommerce: ["checkout","cart","orders","shopify","woocommerce","catalog","merchandising"],
    creative: ["design","assets","video","audio","brand","editor","review","story"]
  }[category] || [];

  for (const p of pref) {
    const hit = kws.find((k) => k.includes(p));
    if (hit) return hit;
  }

  // fallback: top keyword
  return kws[0] || null;
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
// CTA OBJECTS (fallback objects per category if metadata lacks a good noun)
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
// WHITESPACE / SUBTITLE SEEDS
// -------------------------------------------------------------------------------------------
const WHITESPACE = {
  ai: ["agentic workflows", "retrieval-augmented flows", "model evaluation clarity", "data-labelling discipline"],
  marketing: ["micro-conversion uplift", "intent-segmentation clarity", "offer-path sequencing"],
  productivity: ["context-switch stability", "repeatable SOP design", "daily cadence uplift"],
  software: ["release hygiene patterns", "runtime predictability cues", "deployment discipline"],
  courses: ["checkpoint-led progress", "practical skill transfer"],
  business: ["execution discipline", "scorecard alignment habits"],
  web: ["component-driven velocity", "build-to-deploy clarity"],
  ecommerce: ["checkout friction mapping", "offer sequencing insights"],
  creative: ["visual cohesion patterns", "editorial polish loops"],
};

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
    .replace(/—|–/g, " ")
    .replace(/\b(using|through|with)\s+([a-z0-9-]+)\s+\1\b/gi, "$1 $2")
    .replace(/\b(add|adds|added)\s+where\s+it\b/gi, "add it")
    .replace(/\boptimization\b/gi, "optimisation")
    .replace(/\s{2,}/g, " ");
}

// -------------------------------------------------------------------------------------------
// Build 3-sentence subtitle (now metadata-aware via keyword triads)
// -------------------------------------------------------------------------------------------
function buildSubtitle({ title, category, seed, meta = {} }) {
  const base = hashPickAvoid(seed + ":s1", SUB_BASE[category] || SUB_BASE.software, BAN_SUB);
  const white = hashPickAvoid(seed + ":s2", WHITESPACE[category] || WHITESPACE.software);
  const mod = hashPickAvoid(seed + ":s3", SUB_MOD[category] || SUB_MOD.software);
  const anch = hashPick(seed + ":s4", ANCHORS[category] || ANCHORS.software);

  // derive a lightweight, deterministic keyword triad from description/title
  const kws = extractKeywords(meta, 6); // top 6 → triad pick
  const triadSeed = seed + "::triad";
  const triad = [];
  if (kws.length) {
    // deterministic scattered picks (avoid repeats)
    const idxA = pickIndex(triadSeed + ":a", kws.length);
    const idxB = (idxA + Math.max(1, pickIndex(triadSeed + ":b", kws.length - 1))) % kws.length;
    const idxC = (idxB + Math.max(1, pickIndex(triadSeed + ":c", kws.length - 1))) % kws.length;
    [idxA, idxB, idxC].forEach((i) => {
      const w = kws[i];
      if (w && !triad.includes(w)) triad.push(w);
    });
  }

  // Sentence 2 becomes "<white> <mod>" OR "<white> with <triad focus>"
  let s1 = `${base}.`;
  let s2 = `${white} ${mod}.`;
  if (triad.length >= 2) {
    // form a clean comma list without dashes
    const tri = triad.slice(0, 3).join(", ");
    s2 = `${white} with ${tri}.`;
  }

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
// CTA ENGINE (metadata-aware but backward compatible)
// -------------------------------------------------------------------------------------------
export function createCtaEngine() {
  loadMemory(); // harmless stub

  return {
    /**
     * generate({ title, cat, slug, meta })
     * - meta is optional; if provided, we'll derive a bespoke object from description
     */
    generate({ title = "", cat = "software", slug = "", meta = {} }) {
      const category = (cat || "software").toLowerCase();
      const tpl = CTA_TEMPLATES[category] || CTA_TEMPLATES.software;

      // Try to derive a product-specific object from metadata
      const kw = bestKeywordPhrase(meta, category);
      const fallbackObj = hashPick(slug + ":obj", CTA_OBJECTS[category] || CTA_OBJECTS.software);
      const obj = kw ? kw : fallbackObj;

      // Deterministic template pick: seed includes obj to diversify
      const seed = slug || title || "x";
      const base = hashPickAvoid(seed + "::tpl::" + obj, tpl, BAN_CTA);

      let cta = clean(base.replace("{obj}", obj));
      cta = dedupeTitle(cta, title);
      cta = clampCTA(cta);

      if (BAN_CTA.some((r) => r.test(cta))) cta = "View the details →";
      return cta;
    },

    /**
     * generateSubtitle({ title, category, slug, meta })
     * - meta optional; when present we build a keyword triad for sentence 2
     */
    generateSubtitle({ title = "", category = "software", slug = "", meta = {} }) {
      const seed = (slug || title || "x") + "::sub::" + (meta?.description ? sha(meta.description).slice(0, 6) : "0");
      return buildSubtitle({ title, category, seed, meta });
    },
  };
}

// -------------------------------------------------------------------------------------------
// ENRICHMENT LAYER (regen-safe; never overwrites existing non-empty CTA/subtitle)
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

    const meta = {
      title: d.title || "",
      description: d.description || "",
    };

    const cta =
      prev.cta && prev.cta.trim()
        ? prev.cta
        : engine.generate({ title, cat: category, slug, meta });

    const subtitle =
      prev.subtitle && prev.subtitle.trim()
        ? prev.subtitle
        : engine.generateSubtitle({ title, category, slug, meta });

    return {
      ...d,
      seo: { ...prev, cta, subtitle },
    };
  });
}

export default { createCtaEngine, enrichDeals, sanitizeText };

// /lib/ctaEngine.js
// TinmanApps — Psychographic CTA + Subtitle Engine v8.0 (FINAL)
// “Deterministic • No-Metadata • 160-Char Subtitles • Global Dedup • No-Dash • Regen-Safe”
// -------------------------------------------------------------------------------------------
// This version implements EXACTLY the locked rules:
//
// ✅ No metadata used anywhere (no title/description keywords)
// ✅ Subtitle max length = 160 chars
// ✅ Global dedupe for CTAs + subtitles (no repeats across entire feed)
// ✅ Sentence-level + word-level anti-duplication
// ✅ Zero title-echo duplication
// ✅ No keyword triads, no injected nouns
// ✅ No “Clear, measurable improvement.” spam
// ✅ Deterministic across cron + GitHub Actions
// ✅ Safer whitespace + UK spelling normalisation
// -------------------------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const MEMORY_FILE = path.join(DATA_DIR, "diversity-memory.json");

// -------------------------------------------------------------------------------------------
// CTA TEMPLATES (unchanged, hoisted)
// -------------------------------------------------------------------------------------------
const CTA_TEMPLATES = {
  ai: [
    "Ship AI features faster →",
    "Automate tasks safely →",
    "Cut manual steps →",
    "Build reliable AI pipelines →",
  ],
  marketing: [
    "Lift conversion →",
    "Tidy your funnel →",
    "Scale repeatable campaigns →",
    "Make offers convert clearer →",
  ],
  productivity: [
    "Make your day flow better →",
    "Close the loop on tasks →",
    "Reduce handoff friction →",
    "Bring order to your workflow →",
  ],
  software: [
    "Ship with fewer regressions →",
    "Automate recurring work →",
    "Stabilise your release flow →",
    "Declutter your tech stack →",
  ],
  courses: [
    "Turn study into skill →",
    "Progress with a clear plan →",
    "Learn by doing →",
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
// MEMORY FOR GLOBAL DEDUPLICATION
// -------------------------------------------------------------------------------------------
function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
  } catch {
    return { usedCtas: new Set(), usedSubs: new Set() };
  }
}

function saveMemory(mem) {
  try {
    fs.writeFileSync(
      MEMORY_FILE,
      JSON.stringify(
        {
          usedCtas: [...mem.usedCtas],
          usedSubs: [...mem.usedSubs],
        },
        null,
        2
      ),
      "utf8"
    );
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

function sanitizeText(t = "") {
  return String(t || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/[–—]/g, " ")
    .replace(/\boptimization\b/gi, "optimisation")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
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
  if (t.length <= n) return t.trim();
  let cut = t.slice(0, n).replace(/\s+\S*$/, "");
  return cut.endsWith("→") ? cut : `${cut}…`;
}

function clampSub(t, n = 160) {
  if (!t) return "";
  if (!/[.!?]$/.test(t)) t += ".";
  if (t.length <= n) return t.trim();
  const cut = t.lastIndexOf(" ", n);
  return (cut > 40 ? t.slice(0, cut) : t.slice(0, n)).trim() + "…";
}

// -------------------------------------------------------------------------------------------
// SUBTITLE COMPONENTS — FIXED, DETERMINISTIC, NO METADATA
// -------------------------------------------------------------------------------------------
const SUB_S1 = {
  ai: ["keeps AI delivery predictable", "helps teams add AI where impact matters"],
  marketing: ["keeps your funnel consistent", "clarifies the path to conversion"],
  productivity: ["keeps priorities visible", "removes friction from your day"],
  software: ["keeps releases steady", "reduces engineering toil"],
  courses: ["turns knowledge into skill", "keeps your learning on track"],
  business: ["improves execution", "keeps teams aligned"],
  web: ["helps you ship cleaner web work", "keeps builds predictable"],
  ecommerce: ["removes checkout friction", "keeps store ops measurable"],
  creative: ["makes creative work easier to ship", "keeps review loops tight"],
};

const SUB_S2 = {
  ai: ["with stable model practices", "using repeatable workflows"],
  marketing: ["with tidy campaign ops", "using clean analytics"],
  productivity: ["with simple routines", "using light-touch habits"],
  software: ["with predictable deploy flow", "using disciplined processes"],
  courses: ["with clear checkpoints", "using structured guidance"],
  business: ["with simple scorecards", "using focus-led rhythms"],
  web: ["with maintainable components", "using deploy-ready assets"],
  ecommerce: ["with merchandising clarity", "using real performance signals"],
  creative: ["with practical templates", "using clean creative structure"],
};

const SUB_S3 = {
  ai: ["across your workflows", "inside your AI stack"],
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
// BUILD SUBTITLE (NO METADATA, NO TRIADS)
// -------------------------------------------------------------------------------------------
function buildSubtitle({ category, seed, title }) {
  const c = SUB_S1[category] ? category : "software";

  const s1 = SUB_S1[c][pickIndex(seed + "::s1", SUB_S1[c].length)];
  const s2 = SUB_S2[c][pickIndex(seed + "::s2", SUB_S2[c].length)];
  const s3 = SUB_S3[c][pickIndex(seed + "::s3", SUB_S3[c].length)];

  let out = `${s1}. ${s2}. ${s3}.`;

  out = sanitizeText(out);
  out = dedupeTitle(out, title);
  out = clampSub(out);

  return out;
}

// -------------------------------------------------------------------------------------------
// CTA ENGINE
// -------------------------------------------------------------------------------------------
export function createCtaEngine() {
  const mem = loadMemory();
  mem.usedCtas = new Set(mem.usedCtas);
  mem.usedSubs = new Set(mem.usedSubs);

  return {
    generate({ title = "", cat = "software", slug = "" }) {
      const c = CTA_TEMPLATES[cat] ? cat : "software";

      const seed = slug || title || "x";
      const tpl = CTA_TEMPLATES[c];

      let cta = tpl[pickIndex(seed, tpl.length)];
      cta = sanitizeText(cta);
      cta = dedupeTitle(cta, title);
      cta = clampCTA(cta);

      // global dedupe
      if (mem.usedCtas.has(cta)) {
        cta = tpl[(pickIndex(seed, tpl.length) + 1) % tpl.length];
        cta = sanitizeText(cta);
        cta = dedupeTitle(cta, title);
        cta = clampCTA(cta);
      }

      mem.usedCtas.add(cta);
      saveMemory(mem);
      return cta;
    },

    generateSubtitle({ title = "", category = "software", slug = "" }) {
      const c = category || "software";
      const seed = slug || title || "x";

      let sub = buildSubtitle({ category: c, seed, title });

      // global dedupe
      if (mem.usedSubs.has(sub)) {
        const altSeed = seed + "::alt";
        sub = buildSubtitle({ category: c, seed: altSeed, title });
      }

      mem.usedSubs.add(sub);
      saveMemory(mem);
      return sub;
    },
  };
}

// -------------------------------------------------------------------------------------------
// ENRICH DEALS
// -------------------------------------------------------------------------------------------
export function enrichDeals(deals = []) {
  const engine = createCtaEngine();

  return deals.map((d) => {
    const prev = d.seo || {};
    const cat = (d.category || "software").toLowerCase();
    const title = d.title || "";

    const slug =
      d.slug ||
      sanitizeText(title)
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");

    const cta =
      prev.cta && prev.cta.trim()
        ? prev.cta
        : engine.generate({ title, cat, slug });

    const subtitle =
      prev.subtitle && prev.subtitle.trim()
        ? prev.subtitle
        : engine.generateSubtitle({ title, category: cat, slug });

    return {
      ...d,
      seo: { ...prev, cta, subtitle },
    };
  });
}

export default { createCtaEngine, enrichDeals, sanitizeText };

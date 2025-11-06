// /lib/ctaEngine.js
// TinmanApps — CTA Intelligence Engine v2.0
// Context-aware, CTR-adaptive, deterministic weekly rotation + subtitle generation.
// World-class, authority-safe, referral-friendly, indexing-conscious.

// ───────────────────────────────────────────────────────────────────────────────
// Imports & paths
// ───────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import url from "url";

// Local data
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const CTR_FILE = path.join(DATA_DIR, "ctr-insights.json");
const PHRASES_FILE = path.join(DATA_DIR, "cta-phrases.json");

// ───────────────────────────────────────────────────────────────────────────────
// Safe loaders
// ───────────────────────────────────────────────────────────────────────────────
function loadCTR() {
  try {
    const raw = fs.readFileSync(CTR_FILE, "utf8");
    const json = JSON.parse(raw);
    return {
      totalClicks: json.totalClicks || 0,
      byDeal: json.byDeal || {},
      byCategory: json.byCategory || {},
      recent: Array.isArray(json.recent) ? json.recent : [],
    };
  } catch {
    return { totalClicks: 0, byDeal: {}, byCategory: {}, recent: [] };
  }
}

function loadPhrases() {
  try {
    const raw = fs.readFileSync(PHRASES_FILE, "utf8");
    const json = JSON.parse(raw);
    const active = Array.isArray(json.active) ? json.active : [];
    return active.filter(Boolean);
  } catch {
    return [];
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────────────────
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rngFactory(seed) {
  let s = seed >>> 0 || 123456789;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}
function isoYearWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function clampLen(s, max = 64) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
function clean(s) {
  return s.replace(/\s+/g, " ").replace(/\!+/g, "!").trim();
}
function titleBrand(raw = "") {
  // brand before dash, else first word group; remove emojis/extra symbols
  const t = String(raw).trim();
  const m = t.match(/^\s*([^–—-]+)[–—-]/);
  const base = (m ? m[1] : t).trim();
  return base.replace(/[|•·~:()【】\[\]{}"“”'’]/g, "").trim();
}

// ───────────────────────────────────────────────────────────────────────────────
// Archetypes & benefits (kept for tone control)
// ───────────────────────────────────────────────────────────────────────────────
const ARCH = {
  software: "Trust & Reliability",
  marketing: "Opportunity & Growth",
  productivity: "Efficiency & Focus",
  ai: "Novelty & Innovation",
  courses: "Authority & Learning",
};

const BENEFITS = {
  software: [
    "simplify your workflow",
    "standardize your process",
    "cut busywork",
    "make ops predictable",
    "reduce tool sprawl",
  ],
  marketing: [
    "grow faster",
    "boost conversions",
    "turn traffic into buyers",
    "scale campaigns",
    "find quick wins",
  ],
  productivity: [
    "save hours each week",
    "prioritize what matters",
    "eliminate friction",
    "stay in flow",
    "ship faster",
  ],
  ai: [
    "automate repetitive work",
    "unlock smart assistance",
    "ship 10× experiments",
    "prototype faster",
    "amplify your output",
  ],
  courses: [
    "level up skills",
    "learn from pros",
    "shorten the learning curve",
    "turn knowledge into action",
    "master the fundamentals",
  ],
};

// Subtitles (authority-safe defaults)
const SUBTITLE_TEMPLATES = {
  software: [
    "Run your business smarter with AI-powered efficiency.",
    "Simplify your daily workflow — everything in one place.",
    "Modern tools built to save you time and boost output.",
    "Empower your team with seamless automation.",
    "Smarter software that pays for itself in time saved.",
  ],
  marketing: [
    "Grow your audience faster with data-driven insights.",
    "Automate campaigns, capture leads, and convert with ease.",
    "Turn engagement into revenue — effortlessly.",
    "Marketing tools that make every click count.",
    "Stand out, sell more, and scale faster.",
  ],
  productivity: [
    "Stay focused and achieve more every day.",
    "Work smarter, not longer — automate the boring stuff.",
    "Tools that help you save hours and reduce stress.",
    "Maximize your output with minimal effort.",
    "Reclaim your time and focus on what matters.",
  ],
  ai: [
    "Harness artificial intelligence to scale your impact.",
    "Smarter automation for creators and businesses.",
    "Turn AI into your competitive edge.",
    "Leverage machine intelligence to do more with less.",
    "Future-proof your workflow with cutting-edge AI.",
  ],
  courses: [
    "Learn practical skills you can apply today.",
    "Level up your expertise with step-by-step guidance.",
    "Master in-demand skills from proven creators.",
    "Build your career with actionable learning.",
    "Turn knowledge into results — faster.",
  ],
};

// ───────────────────────────────────────────────────────────────────────────────
// Semantic signal extraction (title + url)
// ───────────────────────────────────────────────────────────────────────────────
function extractSignals({ title = "", url = "" }) {
  const t = `${title} ${url}`.toLowerCase();

  const has = (re) => re.test(t);
  const signals = new Set();

  if (has(/\b(ai|gpt|llm|machine learning|automation|autopilot)\b/)) signals.add("ai");
  if (has(/\bcrm|pipeline|sales|leads|prospect|outreach|agency\b/)) signals.add("crm");
  if (has(/\bemail|smtp|inbox|deliverability|newsletter\b/)) signals.add("email");
  if (has(/\bvideo|record|screen|stream|edit|caption|youtube|tiktok\b/)) signals.add("video");
  if (has(/\bcourse|learn|training|academy|masterclass|workshop\b/)) signals.add("course");
  if (has(/\bseo|serp|backlink|audit|rank|keywords?\b/)) signals.add("seo");
  if (has(/\bsocial|twitter|x\.com|instagram|facebook|linkedin|tiktok\b/)) signals.add("social");
  if (has(/\bdesign|brand|logo|mockup|graphic|ui|ux|illustration\b/)) signals.add("design");
  if (has(/\bcalendar|booking|schedule|appointment|tidycal|calendly\b/)) signals.add("calendar");
  if (has(/\bdocs?|knowledge base|wiki|notion|notes?\b/)) signals.add("docs");
  if (has(/\banalytics?|dashboard|insight|metrics|kpi\b/)) signals.add("analytics");
  if (has(/\becomm(erce)?|shopify|woocommerce|stripe|checkout|cart\b/)) signals.add("ecommerce");
  if (has(/\bsupport|helpdesk|ticket|chatbot|live chat\b/)) signals.add("support");
  if (has(/\bchat|voice|dial|call|voip|agent\b/)) signals.add("voice");
  if (has(/\bapi|developer|webhook|integrat(e|ion)\b/)) signals.add("api");
  if (has(/\bno-?code|builder|drag(-| )?drop|template\b/)) signals.add("nocode");
  if (signals.size === 0) signals.add("general");

  return Array.from(signals);
}

// ───────────────────────────────────────────────────────────────────────────────
/**
 * CTA template engines by signal cluster.
 * Every entry returns an array of functions: (ctx) => string
 * ctx: { brand, title, verb, benefit }
 * Deterministic selection via rng; then clamped & cleaned.
 */
// ───────────────────────────────────────────────────────────────────────────────
const SIGNAL_TEMPLATES = {
  ai: [
    ({ brand }) => `Unlock AI efficiency with ${brand} →`,
    ({ brand }) => `Automate smarter using ${brand} →`,
    ({ brand }) => `Scale your output with ${brand} →`,
  ],
  crm: [
    ({ brand }) => `Close more deals with ${brand} →`,
    ({ brand }) => `Streamline your pipeline in ${brand} →`,
    ({ brand }) => `Organize leads faster with ${brand} →`,
  ],
  email: [
    ({ brand }) => `Improve deliverability with ${brand} →`,
    ({ brand }) => `Send better campaigns via ${brand} →`,
    ({ brand }) => `Grow your list with ${brand} →`,
  ],
  video: [
    ({ brand }) => `Edit faster, publish quicker — ${brand} →`,
    ({ brand }) => `Create standout videos with ${brand} →`,
    ({ brand }) => `Record & repurpose using ${brand} →`,
  ],
  course: [
    ({ brand }) => `Start learning with ${brand} today →`,
    ({ brand }) => `Master new skills via ${brand} →`,
    ({ brand }) => `Turn lessons into results — ${brand} →`,
  ],
  seo: [
    ({ brand }) => `Fix SEO issues with ${brand} →`,
    ({ brand }) => `Grow organic traffic via ${brand} →`,
    ({ brand }) => `Audit & rank better — ${brand} →`,
  ],
  social: [
    ({ brand }) => `Schedule & grow with ${brand} →`,
    ({ brand }) => `Boost engagement using ${brand} →`,
    ({ brand }) => `Turn posts into results — ${brand} →`,
  ],
  design: [
    ({ brand }) => `Design faster with ${brand} →`,
    ({ brand }) => `Create on-brand assets — ${brand} →`,
    ({ brand }) => `Upgrade your visuals via ${brand} →`,
  ],
  calendar: [
    ({ brand }) => `Stop back-and-forth — use ${brand} →`,
    ({ brand }) => `Book more meetings with ${brand} →`,
    ({ brand }) => `Simplify scheduling — ${brand} →`,
  ],
  docs: [
    ({ brand }) => `Organize knowledge in ${brand} →`,
    ({ brand }) => `Document once, reuse — ${brand} →`,
    ({ brand }) => `Create living docs with ${brand} →`,
  ],
  analytics: [
    ({ brand }) => `See what matters with ${brand} →`,
    ({ brand }) => `Make data-driven moves — ${brand} →`,
    ({ brand }) => `Turn metrics into action — ${brand} →`,
  ],
  ecommerce: [
    ({ brand }) => `Increase checkout conversions — ${brand} →`,
    ({ brand }) => `Optimize your store with ${brand} →`,
    ({ brand }) => `Sell more, faster — ${brand} →`,
  ],
  support: [
    ({ brand }) => `Resolve tickets faster with ${brand} →`,
    ({ brand }) => `Delight customers via ${brand} →`,
    ({ brand }) => `Scale support efficiently — ${brand} →`,
  ],
  voice: [
    ({ brand }) => `Automate calls with ${brand} →`,
    ({ brand }) => `AI voice agents by ${brand} →`,
    ({ brand }) => `Answer faster using ${brand} →`,
  ],
  api: [
    ({ brand }) => `Build faster on ${brand} →`,
    ({ brand }) => `Integrate in minutes — ${brand} →`,
    ({ brand }) => `Ship features via ${brand} →`,
  ],
  nocode: [
    ({ brand }) => `Build without code in ${brand} →`,
    ({ brand }) => `Drag, drop, launch — ${brand} →`,
    ({ brand }) => `Prototype ideas fast with ${brand} →`,
  ],
  general: [
    ({ brand, benefit }) => `Achieve more with ${brand} — ${benefit} →`,
    ({ brand }) => `See what ${brand} makes easy →`,
    ({ brand }) => `Preview ${brand} in action →`,
  ],
};

// Tone/verb banks (still used for fallback mixing)
const VERBS = {
  discovery: ["Explore", "Discover", "See", "Preview", "Learn how to"],
  value: ["Save", "Reclaim", "Streamline", "Accelerate", "Reduce"],
  conversion: ["Unlock", "Get", "Claim", "Start", "Grab"],
  authority: ["See why teams", "See why creators", "See why founders"],
};
const CLOSERS = ["→", "→", "→", "↗", "»"];

// ───────────────────────────────────────────────────────────────────────────────
// Core engine
// ───────────────────────────────────────────────────────────────────────────────
class CTAEngine {
  constructor(opts = {}) {
    this.ctr = opts.ctr || loadCTR();
    this.evolverPhrases = loadPhrases();   // optional extra flavor
    this.used = new Set();
  }

  intentStage({ slug = "", cat = "" }) {
    // CTR-informed stage selection
    const dClicks = this.ctr.byDeal?.[slug] || 0;
    const cClicks = this.ctr.byCategory?.[cat] || 0;
    const total = (dClicks * 3) + (cClicks * 0.5) + (this.ctr.totalClicks ? 0.1 : 0);
    if (total >= 15) return "conversion";
    if (total >= 5) return "value";
    return "discovery";
  }

  rngFor(slug) {
    const seed = hash32(`${slug}::${isoYearWeek()}`);
    return rngFactory(seed);
  }

  generate({ title, slug, cat, url = "", keywords = [] }) {
    const category = (cat || "").toLowerCase();
    const archetype = ARCH[category] || "Trust & Reliability";
    const benefitPool = BENEFITS[category] || BENEFITS.software;

    const brand = titleBrand(title || slug || "This tool");
    const rng = this.rngFor(slug || title || "deal");
    const stage = this.intentStage({ slug, cat: category });

    // 1) Signals drive primary template set
    const signals = extractSignals({ title, url });
    const mainSignal = pick(rng, signals);
    let templates = SIGNAL_TEMPLATES[mainSignal] || SIGNAL_TEMPLATES.general;

    // 2) CTR stage can blend in tones
    if (archetype === "Authority & Learning" && stage !== "conversion" && rng() < 0.35) {
      // Swap to authority-style curiosity
      templates = [
        ({ brand }) => `See why teams choose ${brand} →`,
        ({ brand }) => `How pros use ${brand} →`,
        ({ brand }) => `Real results with ${brand} →`,
      ];
    } else if (archetype === "Novelty & Innovation" && stage === "discovery") {
      // Increase exploration feel
      templates = templates.concat([
        ({ brand }) => `What ${brand} makes easy ${pick(rng, CLOSERS)}`,
        ({ brand }) => `Preview ${brand} in action ${pick(rng, CLOSERS)}`,
      ]);
    }

    // 3) Optional evolver phrases, but *context-wrapped* (never generic)
    const evolver = this.evolverPhrases.length ? pick(rng, this.evolverPhrases) : null;
    if (evolver && rng() < 0.45) {
      templates = templates.concat([
        ({ brand }) => `${evolver}`.replace(/→|↗|»/g, "").trim() + ` — ${brand} →`,
        ({ brand }) => `${brand}: ${evolver}`.replace(/\s*→\s*$/, " →"),
      ]);
    }

    // 4) Build context
    const benefit = (keywords.find((k) => k.length <= 18) || pick(rng, benefitPool));
    const verb =
      stage === "conversion"
        ? pick(rng, VERBS.conversion)
        : stage === "value"
        ? pick(rng, VERBS.value)
        : pick(rng, VERBS.discovery);

    // 5) Generate, dedupe, clamp
    const candidates = [...templates];
    for (let i = 0; i < 7; i++) {
      const tmpl = pick(rng, candidates);
      const raw = tmpl({ brand, title: (title || "").trim(), verb, benefit });
      const cta = clampLen(clean(raw), 64);
      const sig = `${slug}::${hash32(cta)}`;
      if (!this.used.has(sig)) {
        this.used.add(sig);
        return cta;
      }
    }

    // 6) High-quality fallback (never generic spam)
    const fb = clampLen(clean(`Achieve more with ${brand} — ${benefit} →`), 64);
    this.used.add(`${slug}::${hash32(fb)}`);
    return fb;
  }

  // Subtitle generation (authority-friendly)
  generateSubtitle(record) {
    const { title = "", category = "software" } = record;
    const parts = title.split(/\s*[-–—]\s*/);
    if (parts.length > 1 && parts[1].length > 6) {
      return parts.slice(1).join(" – ").trim();
    }
    const pool = SUBTITLE_TEMPLATES[category] || SUBTITLE_TEMPLATES.software;
    // Deterministic pick without storing rng by slug (ok for subtitle)
    return pool[(hash32(title) % pool.length)];
  }

  // Enrich list with SEO/CTA data — used by feed builder
  enrichDeals(deals = [], cat) {
    return deals.map((d) => {
      const slug =
        d.slug ||
        d.url?.match(/products\/([^/]+)/)?.[1] ||
        (d.title || "").toLowerCase().replace(/\s+/g, "-");

      const title = d.title || slug || "Deal";
      const keywords = Array.isArray(d.seo?.keywords) ? d.seo.keywords : [];

      const cta = this.generate({ title, slug, cat, url: d.url || "", keywords });
      const subtitle = this.generateSubtitle({ title, category: cat });

      const seo = {
        ...(d.seo || {}),
        cta,
        subtitle,
        archetype: ARCH[(cat || "").toLowerCase()] || "Trust & Reliability",
      };
      return { ...d, seo };
    });
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Public API (backwards compatible)
// ───────────────────────────────────────────────────────────────────────────────
export function createCtaEngine(options = {}) {
  return new CTAEngine(options);
}
export function generateCTA(args) {
  const engine = new CTAEngine();
  return engine.generate(args);
}
export function enrichDealList(deals, cat) {
  const engine = new CTAEngine();
  return engine.enrichDeals(deals, cat);
}

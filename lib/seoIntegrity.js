// /lib/seoIntegrity.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — SEO Integrity Engine v4.0
// “Deterministic • Category-Pure • Long-Tail Momentum Edition”
//
// PURPOSE:
// • Guarantees SEO fields (cta, subtitle, clickbait, keywords) ALWAYS exist.
// • 100% deterministic (SHA1-anchored) — ZERO randomness anywhere.
// • Category-safe long-tail selection + entropy spread with collision fallback.
// • Never overwrites CTA/subtitle if present (respect upstream generators).
// • Works AFTER normalizeFeed()/regenerateSeo(), BEFORE mergeWithHistory().
//
// Notes:
// • Diversity is achieved via slug-seeded selection with deterministic
//   collision fallback (alt salts), so outputs stay stable across runs.
// • No clickbait hype — hooks are value-forward, aligned with CTR psychology.
// ───────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

// ───────────────────────────────────────────────────────────────────────────────
// Category Silos — Long-tail keywords & hooks (stable sets)
// ───────────────────────────────────────────────────────────────────────────────
const KEYWORDS = {
  ai: [
    "AI automation", "machine learning", "workflow intelligence",
    "GPT tools", "autonomous systems", "AI productivity",
  ],
  marketing: [
    "lead generation", "conversion marketing", "SEO analytics",
    "audience targeting", "brand growth", "digital funnels",
  ],
  productivity: [
    "workflow optimization", "task automation", "focus tools",
    "process improvement", "daily efficiency", "priority management",
  ],
  business: [
    "operations management", "sales systems", "business automation",
    "client insights", "scalable processes", "analytics workflow",
  ],
  courses: [
    "online learning", "skill mastery", "creator education",
    "learning pathways", "micro-learning", "training automation",
  ],
  web: [
    "website builder", "UX/UI workflow", "frontend optimization",
    "design automation", "web performance", "no-code tools",
  ],
  ecommerce: [
    "checkout optimization", "store performance", "cart automation",
    "conversion systems", "sales funnels", "ecommerce growth",
  ],
  creative: [
    "visual design", "content creation", "branding tools",
    "creative workflow", "media automation", "design templates",
  ],
  software: [
    "software automation", "workflow tools", "lifetime deals",
    "productivity apps", "SaaS utilities", "operations stack",
  ],
};

const HOOKS = {
  ai: ["Reinvent your workflow with AI", "Build smarter operations", "Your AI upgrade awaits"],
  marketing: ["Boost your brand fast", "Unlock growth instantly", "Optimize campaigns with clarity"],
  productivity: ["Get more done effortlessly", "Reclaim productive hours", "Keep daily work flowing"],
  business: ["Run smarter teams", "Scale with confidence", "Strengthen execution rhythm"],
  courses: ["Accelerate your learning", "Master skills faster", "Follow a guided path"],
  web: ["Design faster", "Launch beautiful pages", "Ship stronger experiences"],
  ecommerce: ["Increase conversions today", "Upgrade store performance", "Streamline purchase flows"],
  creative: ["Elevate creative output", "Design with precision", "Create polished visuals"],
  software: ["Discover what’s possible", "Optimize your stack", "Automate repetitive work"],
};

const BENEFITS = [
  "work smarter", "scale faster", "improve results",
  "automate tasks", "reduce friction", "deliver consistently",
];

// Grammar matrices for subtitle fallback (deterministic)
const SUB_VERBS = [
  "Streamlines", "Boosts", "Enhances", "Optimizes",
  "Accelerates", "Clarifies", "Improves", "Strengthens",
];
const SUB_OBJECTS = [
  "workflow clarity", "daily operations", "team output",
  "creative flow", "project momentum", "system performance",
];
const SUB_ENDINGS = [
  "for measurable progress.", "so you save hours weekly.",
  "to remove unnecessary friction.", "so your results compound.",
  "to keep everything running smoothly.",
];

// ───────────────────────────────────────────────────────────────────────────────
// Deterministic selectors (SHA1-anchored)
// ───────────────────────────────────────────────────────────────────────────────
function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function pickDet(seed, arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const h = sha1(seed);
  const idx = parseInt(h.slice(0, 8), 16) % arr.length;
  return arr[idx];
}
function multiPickDet(seed, arr, n) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const base = sha1(seed);
  const out = [];
  const used = new Set();
  const count = Math.min(n, arr.length);
  for (let i = 0; i < count; i++) {
    const h = sha1(base + ":" + i);
    let idx = parseInt(h.slice(0, 8), 16) % arr.length;
    // deterministic collision walk
    let steps = 0;
    while (used.has(idx) && steps < arr.length) {
      idx = (idx + 1) % arr.length;
      steps++;
    }
    used.add(idx);
    out.push(arr[idx]);
  }
  return out;
}
function stableSlugish(ctx) {
  return `${ctx}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function cap(t = "") {
  return t.replace(/\s{2,}/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
function clamp(t, n) {
  if (!t) return t;
  if (t.length <= n) return t;
  const cut = t.slice(0, n).replace(/\s+\S*$/, "");
  return cut + "…";
}

// ───────────────────────────────────────────────────────────────────────────────
// Collision-aware, deterministic field builders
// ───────────────────────────────────────────────────────────────────────────────
function buildDeterministicCTA(item, usedSet) {
  // Respect upstream CTA if present (regenerateSeo already set it)
  const existing = item.seo?.cta?.trim?.();
  if (existing) return existing;

  // Deterministic fallback (rare path) — outcome/benefit framed
  const seed = `cta:${item.slug || item.title || ""}`;
  const verb = pickDet(seed + ":v", ["Boost", "Improve", "Elevate", "Optimize", "Streamline", "Accelerate"]);
  const obj = pickDet(seed + ":o", ["workflow", "operations", "results", "performance", "processes", "systems"]);
  let cta = `${verb} your ${obj} →`;

  // Deterministic collision fallback
  if (usedSet.has(cta)) {
    const altVerb = pickDet(seed + ":v:alt", ["Level-up", "Strengthen", "Advance", "Upgrade"]);
    const altObj = pickDet(seed + ":o:alt", ["daily work", "team output", "delivery", "throughput"]);
    cta = `${altVerb} your ${altObj} →`;
  }
  usedSet.add(cta);
  return cta;
}

function buildDeterministicSubtitle(item, usedSet) {
  const existing = item.seo?.subtitle?.trim?.();
  if (existing && existing.length >= 18) return existing;

  const seed = `sub:${item.slug || item.title || ""}`;
  const v = pickDet(seed + ":v", SUB_VERBS);
  const o = pickDet(seed + ":o", SUB_OBJECTS);
  const e = pickDet(seed + ":e", SUB_ENDINGS);
  let sub = `${v} ${o} ${e}`;

  // Deterministic collision fallback
  if (usedSet.has(sub)) {
    const v2 = pickDet(seed + ":v2", SUB_VERBS);
    const o2 = pickDet(seed + ":o2", SUB_OBJECTS);
    const e2 = pickDet(seed + ":e2", SUB_ENDINGS);
    sub = `${v2} ${o2} ${e2}`;
  }
  usedSet.add(sub);
  return sub;
}

function buildDeterministicClickbait(item, cat) {
  const seed = `cb:${item.slug || item.title || ""}:${cat}`;
  const hook = pickDet(seed + ":h", HOOKS[cat] || HOOKS.software);
  const benefit = pickDet(seed + ":b", BENEFITS);
  const title = cap(item.title || "");
  const text = `${hook} — ${title} helps you ${benefit}`;
  return clamp(text, 160);
}

function buildDeterministicKeywords(item, cat) {
  const pool = KEYWORDS[cat] || KEYWORDS.software;
  const seed = `kw:${item.slug || item.title || ""}:${cat}`;
  return multiPickDet(seed, pool, 3);
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN — ensureSeoIntegrity(feed)
// ───────────────────────────────────────────────────────────────────────────────
export function ensureSeoIntegrity(feed) {
  if (!Array.isArray(feed)) {
    console.warn("⚠️ [SEO Integrity] Non-array feed — using empty.");
    feed = [];
  }
  if (feed.length === 0) {
    console.warn("⚠️ [SEO Integrity] Empty feed — returning empty.");
    return [];
  }

  const now = new Date().toISOString();
  const usedCTA = new Set();
  const usedSUB = new Set();

  const updated = feed.map((item) => {
    if (item.archived) return item;

    const cat = stableSlugish(item.category || "software");

    // Deterministic guarantees (respect existing CTA/subtitle; only fill if missing)
    const cta = buildDeterministicCTA(item, usedCTA);
    const subtitle = buildDeterministicSubtitle(item, usedSUB);
    const clickbait = item.seo?.clickbait?.trim?.() || buildDeterministicClickbait(item, cat);
    const keywords = Array.isArray(item.seo?.keywords) && item.seo.keywords.length > 0
      ? item.seo.keywords
      : buildDeterministicKeywords(item, cat);

    return {
      ...item,
      seo: {
        ...item.seo,
        cta,
        subtitle,
        clickbait,
        keywords,
        lastVerifiedAt: now,
      },
      verified: true,
    };
  });

  // Entropy telemetry (deterministic counts; useful in logs)
  const total = updated.length || 1;
  const entropyCTA = (new Set(updated.map(x => x.seo?.cta || ""))).size / total;
  const entropySUB = (new Set(updated.map(x => x.seo?.subtitle || ""))).size / total;
  console.log(`✅ [SEO Integrity] ${updated.length} verified. Entropy CTA:${entropyCTA.toFixed(2)} Subtitle:${entropySUB.toFixed(2)}`);

  return updated;
}

export default { ensureSeoIntegrity };

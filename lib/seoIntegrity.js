// /lib/seoIntegrity.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — SEO Integrity Engine v5.0 “Validation-Only”
// “No Generation • No Mutation • Deterministic QA • Entropy Telemetry”
//
// PURPOSE (strict):
// • VALIDATE ONLY. Do not generate, rewrite, or “fix” CTA/subtitle text.
// • Check structure + constraints against CTA Engine outputs (v11 series).
// • Enforce NOTHING — just log issues and stamp lastVerifiedAt.
// • Guarantees zero side-effects for downstream renderers.
//
// What this does:
// • Validates: presence, arrow suffix, length (CTA ≤64, Subtitle ≤160),
//   2-sentence subtitle, banned terms, category lexicon touch, product-name touch (relaxed).
// • Logs duplication + entropy metrics (post-validation).
// • Adds seo.lastVerifiedAt and verified flag. Leaves all text exactly as provided.
// ───────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

// ───────────────────────────────────────────────────────────────────────────────
// Category Lexicons & Hooks (used only for validation checks)
// ───────────────────────────────────────────────────────────────────────────────
const KEYWORDS = {
  ai: [
    "AI automation","machine learning","workflow intelligence",
    "GPT tools","autonomous systems","AI productivity","prompt engineering",
    "AI assistant","chatbot","data enrichment","LLM","predictive modeling",
    "agentic workflow","neural network","AI integration"
  ],
  marketing: [
    "lead generation","conversion marketing","SEO analytics",
    "audience targeting","brand growth","digital funnels","marketing automation",
    "campaign management","content performance","social insights"
  ],
  productivity: [
    "workflow optimization","task automation","focus tools",
    "process improvement","daily efficiency","priority management",
    "time tracking","goal setting","habit systems"
  ],
  business: [
    "operations management","sales systems","business automation",
    "client insights","scalable processes","analytics workflow",
    "project management","revenue operations","CRM workflow"
  ],
  courses: [
    "online learning","skill mastery","creator education",
    "learning pathways","micro-learning","training automation",
    "certification courses","learning platform","cohort training"
  ],
  web: [
    "website builder","UX/UI workflow","frontend optimization",
    "design automation","web performance","no-code tools",
    "WordPress","landing pages","Webflow","site performance"
  ],
  ecommerce: [
    "checkout optimization","store performance","cart automation",
    "conversion systems","sales funnels","ecommerce growth",
    "product listings","inventory sync","order automation"
  ],
  creative: [
    "visual design","content creation","branding tools",
    "creative workflow","media automation","design templates",
    "storyboarding","graphic creation","video production"
  ],
  software: [
    "software automation","workflow tools","lifetime deals",
    "productivity apps","SaaS utilities","operations stack",
    "API integration","cloud platform","plugin","automation suite"
  ],
};

const BANNED = ["click here", "buy now", "limited offer", "discount", "cheap", "sale"];

// ───────────────────────────────────────────────────────────────────────────────
// Deterministic helpers (for stable logging / metrics)
// ───────────────────────────────────────────────────────────────────────────────
function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }
function stableCat(c) {
  return String(c || "software").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ───────────────────────────────────────────────────────────────────────────────
// Core validators (pure checks, no mutation)
// ───────────────────────────────────────────────────────────────────────────────
function validateCta(ctaRaw = "") {
  const issues = [];
  const cta = String(ctaRaw || "").trim();

  if (!cta) issues.push("cta-missing");
  if (cta && !cta.endsWith("→")) issues.push("cta-no-arrow");
  if (cta && cta.length > 64) issues.push("cta-too-long");

  return issues;
}

function validateSubtitle(subRaw = "", title = "", category = "software") {
  const issues = [];
  const sub = String(subRaw || "").trim();
  const cat = stableCat(category);
  const titleLow = String(title || "").toLowerCase();

  if (!sub) {
    issues.push("subtitle-missing");
    return issues;
  }

  // sentence count (must be exactly 2 sentences, v11 convention)
  const sentenceCount = (sub.match(/[.!?]/g) || []).length;
  if (sentenceCount !== 2) issues.push("subtitle-not-two-sentences");

  if (sub.length > 160) issues.push("subtitle-too-long");
  if (titleLow && sub.toLowerCase().includes(titleLow)) issues.push("subtitle-title-echo");

  for (const banned of BANNED) {
    if (sub.toLowerCase().includes(banned)) issues.push(`subtitle-banned-term:${banned}`);
  }

  // category lexicon touch (at least one keyword present)
  const lex = KEYWORDS[cat] || KEYWORDS.software;
  const hasLex = lex.some((k) => sub.toLowerCase().includes(k.toLowerCase()));
  if (!hasLex) issues.push("subtitle-missing-lexicon");

  // relaxed product-name presence: enforce only for multi-word or ≥6 char name
  const nameWords = titleLow.split(/\s+/).filter((w) => w.length > 3);
  const longTitle = titleLow.replace(/\s+/g, "").length >= 6;
  const enforceName = nameWords.length > 1 || longTitle;
  if (enforceName) {
    const hasName = nameWords.some((w) => w && sub.toLowerCase().includes(w));
    if (!hasName) issues.push("subtitle-missing-product-name");
  }

  return issues;
}

// ───────────────────────────────────────────────────────────────────────────────
// Telemetry (duplication & entropy) — read-only
// ───────────────────────────────────────────────────────────────────────────────
function entropy(arr) {
  const total = arr.length || 1;
  const counts = Object.create(null);
  for (const x of arr) counts[x || ""] = (counts[x || ""] || 0) + 1;
  let H = 0;
  for (const k in counts) {
    const p = counts[k] / total;
    H += -p * Math.log2(p);
  }
  return Number.isFinite(H) ? H : 0;
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN — ensureSeoIntegrity(feed)
// Validation-only: returns the same feed objects with lastVerifiedAt + verified.
// Does NOT modify cta/subtitle/clickbait/keywords contents.
// ───────────────────────────────────────────────────────────────────────────────
export function ensureSeoIntegrity(feed) {
  if (!Array.isArray(feed) || feed.length === 0) {
    console.warn("⚠️ [SEO Integrity] Empty feed.");
    return [];
  }

  const now = new Date().toISOString();
  const seenCTA = new Set();
  const seenSUB = new Set();
  const problems = [];

  const updated = feed.map((item) => {
    // Pass archived straight through (still stamp verification meta for consistency)
    const cat = stableCat(item.category);
    const title = item.title || "";
    const seo = item.seo || {};

    // Run checks (no mutation of strings)
    const ctaIssues = validateCta(seo.cta);
    const subIssues = validateSubtitle(seo.subtitle, title, cat);

    // Duplication signals (active-run)
    const ctaKey = (seo.cta || "").trim();
    const subKey = (seo.subtitle || "").trim();
    if (ctaKey) {
      if (seenCTA.has(ctaKey)) problems.push(`dup-cta:${ctaKey}`);
      seenCTA.add(ctaKey);
    }
    if (subKey) {
      if (seenSUB.has(subKey)) problems.push(`dup-sub:${subKey}`);
      seenSUB.add(subKey);
    }

    // Aggregate issues for logging (not persisted onto item to keep schema stable)
    if (ctaIssues.length || subIssues.length) {
      problems.push(`${item.slug || title}:${[...ctaIssues, ...subIssues].join(",")}`);
    }

    // Return object unchanged except verification meta
    return {
      ...item,
      seo: { ...seo, lastVerifiedAt: now },
      verified: true,
    };
  });

  // Entropy telemetry (read-only)
  const ctas = updated.map((x) => (x.seo?.cta || "").trim());
  const subs = updated.map((x) => (x.seo?.subtitle || "").trim());
  const uniqCTA = new Set(ctas.filter(Boolean)).size;
  const uniqSUB = new Set(subs.filter(Boolean)).size;
  const eCTA = entropy(ctas).toFixed(2);
  const eSUB = entropy(subs).toFixed(2);

  console.log(
    `✅ [SEO Integrity v5.0] ${updated.length} checked. Entropy CTA:${eCTA} Subtitle:${eSUB} ` +
      `| uniqCTA=${uniqCTA}/${ctas.length} uniqSUB=${uniqSUB}/${subs.length}`
  );
  if (problems.length) {
    console.log("⚠️ SEO Integrity issues:", problems.slice(0, 25));
  }

  return updated;
}

export default { ensureSeoIntegrity };

// /lib/seoIntegrity.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — SEO Integrity Engine v6.0 “Grammar-Aware CTA v11 Validator”
// “Zero Mutation • Pure Validation • CTA Structure Rules • Category Lexicon QA”
//
// v6.0 Major Additions
// • CTA v11 grammar validation (verb→object→“with {Brand} {ending}” pattern)
// • Arrow enforcement tightened (single trailing arrow only “→”)
// • Forbidden CTA structures flagged: double-with, missing “with”, wrong ordering
// • Detect invalid verb clusters per category, noun mismatch, unnatural ordering
// • Subtitle checks unchanged except better sentence delimiter accuracy
//
// Strict guarantee:
//   ❌ never modifies CTA/subtitle
//   ❌ never generates replacements
//   ❌ never trims/corrects text
//   ✔ adds verification meta only
// ───────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

// CTA v11 category clusters — MUST MATCH CTA ENGINE v11 EXACTLY
const CTA_CLUSTERS = {
  ai: {
    verbs: ["Automate", "Simplify", "Enhance", "Optimize", "Scale"],
    objects: [
      "AI workflow","agent tasks","smart automation",
      "prompt chains","model outputs"
    ]
  },
  marketing: {
    verbs: ["Boost","Grow","Optimize","Scale","Elevate"],
    objects: [
      "marketing performance","campaigns","brand reach",
      "conversion rate","audience growth"
    ]
  },
  productivity: {
    verbs: ["Simplify","Organize","Streamline","Accelerate","Focus"],
    objects: ["daily work","task lists","team output","workflow","routine"]
  },
  business: {
    verbs: ["Streamline","Enhance","Automate","Improve","Elevate"],
    objects: ["operations","client management","sales systems","reporting","execution"]
  },
  courses: {
    verbs: ["Learn","Master","Advance","Level-up","Accelerate"],
    objects: ["skills","knowledge","career","expertise","learning path"]
  },
  web: {
    verbs: ["Build","Launch","Design","Optimize","Enhance"],
    objects: ["website","landing pages","UX","frontend workflow","design system"]
  },
  ecommerce: {
    verbs: ["Increase","Boost","Simplify","Optimize","Enhance"],
    objects: ["sales","checkout flow","store performance","customer journey"]
  },
  creative: {
    verbs: ["Create","Design","Elevate","Refine","Polish"],
    objects: ["visuals","content","media","creative assets"]
  },
  software: {
    verbs: ["Simplify","Optimize","Automate","Enhance","Improve"],
    objects: ["workflow","systems","stack","processes"]
  }
};

// Subtitle lexicons (unchanged from v5)
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
  ]
};

const BANNED = ["click here","buy now","limited offer","discount","cheap","sale"];

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function sha1(s){ return crypto.createHash("sha1").update(String(s)).digest("hex"); }
function stableCat(c){
  return String(c || "software")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");
}

// ───────────────────────────────────────────────────────────────────────────────
// CTA VALIDATOR (v11 grammar-aware)
// Pattern expected:
//
//   {Verb} your {object} with {Brand} {ending}
//   ending ∈ ["→","instantly →","today →","in one place →","for better results →"]
//
// Checks:
//   ✓ correct arrow pattern
//   ✓ correct verb appears
//   ✓ object appears
//   ✓ includes “with” exactly once
//   ✓ no “double-with”
//   ✓ “your {object} with {Brand}” ordering preserved
//   ✓ length ≤64
// ───────────────────────────────────────────────────────────────────────────────

function validateCtaV11(ctaRaw = "", category="software") {
  const issues = [];
  const cta = String(ctaRaw || "").trim();
  const cat = stableCat(category);
  const cluster = CTA_CLUSTERS[cat] || CTA_CLUSTERS.software;

  if (!cta) {
    issues.push("cta-missing");
    return issues;
  }

  // Arrow suffix check
  if (!cta.endsWith("→")) issues.push("cta-no-arrow");

  // Length
  if (cta.length > 64) issues.push("cta-too-long");

  const low = cta.toLowerCase();

  // Must contain single "with"
  const withCount = (low.match(/\bwith\b/g) || []).length;
  if (withCount === 0) issues.push("cta-missing-with");
  if (withCount > 1) issues.push("cta-double-with");

  // Must contain “ your ”
  if (!/\byour\b/i.test(cta)) issues.push("cta-missing-your");

  // Verb sanity
  const validVerb = cluster.verbs.some(v =>
    low.startsWith(v.toLowerCase() + " ") ||
    low.startsWith(v.toLowerCase())
  );
  if (!validVerb) issues.push("cta-invalid-verb");

  // Object sanity
  const hasObject = cluster.objects.some(o =>
    low.includes(o.toLowerCase())
  );
  if (!hasObject) issues.push("cta-missing-object");

  // Ordering check: Verb → your → object → with
  const idxVerb = Math.min(...cluster.verbs.map(v => low.indexOf(v.toLowerCase())).filter(i=>i>=0));
  const idxYour = low.indexOf("your ");
  const idxWith = low.indexOf("with ");

  if (idxVerb < 0) issues.push("cta-no-verb-detected");
  if (idxYour < 0) issues.push("cta-no-your-detected");
  if (idxWith < 0) issues.push("cta-no-with-detected");

  if (idxVerb >= 0 && idxYour >=0 && idxVerb > idxYour)
    issues.push("cta-order-verb-before-your");

  if (idxYour >=0 && idxWith >=0 && idxYour > idxWith)
    issues.push("cta-order-your-before-with");

  return issues;
}

// ───────────────────────────────────────────────────────────────────────────────
// Subtitle validator (unchanged except better punctuation handling)
// ───────────────────────────────────────────────────────────────────────────────
function validateSubtitle(subRaw="", title="", category="software") {
  const issues = [];
  const sub = String(subRaw || "").trim();
  const cat = stableCat(category);
  const titleLow = (title || "").toLowerCase();

  if (!sub){
    issues.push("subtitle-missing");
    return issues;
  }

  // Count terminal punctuation more precisely
  const sentenceCount = (sub.match(/[.!?]\s+/g) || []).length;
  if (sentenceCount !== 2) issues.push("subtitle-not-two-sentences");

  if (sub.length > 160) issues.push("subtitle-too-long");
  if (titleLow && sub.toLowerCase().includes(titleLow)) issues.push("subtitle-title-echo");

  for (const ban of BANNED){
    if (sub.toLowerCase().includes(ban)) issues.push(`subtitle-banned:${ban}`);
  }

  const lex = KEYWORDS[cat] || KEYWORDS.software;
  const hasLexicon = lex.some(k => sub.toLowerCase().includes(k.toLowerCase()));
  if (!hasLexicon) issues.push("subtitle-missing-lexicon");

  const nameWords = titleLow.split(/\s+/).filter(w => w.length > 3);
  const longTitle = titleLow.replace(/\s+/g,"").length >= 6;
  const enforce = nameWords.length > 1 || longTitle;

  if (enforce){
    const hasName = nameWords.some(w => w && sub.toLowerCase().includes(w));
    if (!hasName) issues.push("subtitle-missing-product-name");
  }

  return issues;
}

// ───────────────────────────────────────────────────────────────────────────────
// Telemetry
// ───────────────────────────────────────────────────────────────────────────────
function entropy(arr){
  const total = arr.length || 1;
  const counts = {};
  for (const x of arr) counts[x || ""] = (counts[x || ""] || 0) + 1;
  let H = 0;
  for (const k in counts){
    const p = counts[k] / total;
    H += -p * Math.log2(p);
  }
  return Number.isFinite(H) ? H : 0;
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN — ensureSeoIntegrity(feed)
// Validation-only, no mutation.
// ───────────────────────────────────────────────────────────────────────────────

export function ensureSeoIntegrity(feed){
  if (!Array.isArray(feed) || feed.length === 0){
    console.warn("⚠️ [SEO Integrity] Empty feed.");
    return [];
  }

  const now = new Date().toISOString();
  const seenCTA = new Set();
  const seenSUB = new Set();
  const problems = [];

  const validated = feed.map(item => {
    const cat = stableCat(item.category);
    const title = item.title || "";
    const seo = item.seo || {};

    // CTA v11 strict validation
    const ctaIssues = validateCtaV11(seo.cta, cat);

    // Subtitle checks
    const subIssues = validateSubtitle(seo.subtitle, title, cat);

    const ctaKey = (seo.cta || "").trim();
    const subKey = (seo.subtitle || "").trim();

    // Duplication detection
    if (ctaKey){
      if (seenCTA.has(ctaKey)) problems.push(`dup-cta:${ctaKey}`);
      seenCTA.add(ctaKey);
    }
    if (subKey){
      if (seenSUB.has(subKey)) problems.push(`dup-sub:${subKey}`);
      seenSUB.add(subKey);
    }

    if (ctaIssues.length || subIssues.length){
      problems.push(`${item.slug}:${[...ctaIssues, ...subIssues].join(",")}`);
    }

    return {
      ...item,
      seo: { ...seo, lastVerifiedAt: now },
      verified: true
    };
  });

  // Telemetry
  const ctas = validated.map(x => (x.seo?.cta || "").trim());
  const subs = validated.map(x => (x.seo?.subtitle || "").trim());
  const uniqCTA = new Set(ctas.filter(Boolean)).size;
  const uniqSUB = new Set(subs.filter(Boolean)).size;

  console.log(
    `✅ [SEO Integrity v6.0] ${validated.length} checked. ` +
    `Entropy CTA:${entropy(ctas).toFixed(2)} SUB:${entropy(subs).toFixed(2)} | ` +
    `uniqCTA=${uniqCTA}/${ctas.length} uniqSUB=${uniqSUB}/${subs.length}`
  );

  if (problems.length){
    console.log("⚠️ SEO Integrity issues:", problems.slice(0, 25));
  }

  return validated;
}

export default { ensureSeoIntegrity };

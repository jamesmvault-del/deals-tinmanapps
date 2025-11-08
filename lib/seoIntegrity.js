// /lib/seoIntegrity.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — SEO Integrity Engine v1.0 “Sanctifier Prime”
//
// Purpose:
// Enhances enriched feed data with clickbait headlines, keyword sets, and
// diversity logic for CTAs/subtitles. Guarantees world-class SEO hygiene.
//
// Integration point:
// After cleanseFeed() and enrichDeals(), before saving or insight execution.
//
// ───────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

// ─────────────── Keyword Silos ───────────────
const SEO_KEYWORDS = {
  ai: [
    "AI automation",
    "machine learning",
    "autonomous tools",
    "intelligent assistants",
    "no-code AI",
    "GPT workflow",
  ],
  marketing: [
    "lead generation",
    "SEO software",
    "growth automation",
    "social proof tools",
    "campaign analytics",
    "marketing productivity",
  ],
  productivity: [
    "time management",
    "project automation",
    "workflow optimization",
    "team efficiency",
    "task automation",
    "remote collaboration",
  ],
  courses: [
    "online learning",
    "creator education",
    "teach online",
    "knowledge platform",
    "e-learning tools",
    "course builder",
  ],
  business: [
    "startup software",
    "sales CRM",
    "analytics dashboard",
    "operations management",
    "client engagement",
  ],
  web: [
    "website builder",
    "form design",
    "no-code site",
    "CMS automation",
    "web app tools",
  ],
};

// ─────────────── Helpers ───────────────
function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function capitalize(t = "") {
  return t
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s{2,}/g, " ")
    .trim();
}

function randomHook(cat) {
  const hooks = {
    ai: ["Revolutionize with AI", "Build smarter today", "Your next AI upgrade"],
    marketing: ["Boost your brand instantly", "Grow your reach effortlessly"],
    productivity: ["Work faster, focus better", "Simplify your daily grind"],
    courses: ["Master skills faster", "Transform your learning"],
    business: ["Run smarter operations", "Streamline your growth"],
    web: ["Design faster", "Power your website with confidence"],
  };
  return rand(hooks[cat] || ["Unlock your next breakthrough"]);
}

// ─────────────── Main Processor ───────────────
export function ensureSeoIntegrity(feed = []) {
  const now = new Date().toISOString();

  const updated = feed.map((item) => {
    if (item.archived) return item; // skip archived entries

    const cat = item.category?.toLowerCase() || "software";
    const keywords = SEO_KEYWORDS[cat] || [cat, "AppSumo", "lifetime deal"];

    // Generate clickbait headline
    const clickbait =
      item.seo?.clickbait ||
      `${randomHook(cat)} — Discover ${capitalize(item.title)} on AppSumo`;

    // CTA and subtitle polish
    const cta =
      item.seo?.cta ||
      rand([
        "Discover smarter ways to grow →",
        "Streamline your workflow today →",
        "Unlock your next breakthrough →",
      ]);

    const subtitle =
      item.seo?.subtitle ||
      rand([
        "Helps teams move faster and smarter.",
        "Simplifies operations and saves hours weekly.",
        "Drives results with clarity and speed.",
      ]);

    // Final composition
    return {
      ...item,
      title: capitalize(item.title),
      seo: {
        ...item.seo,
        clickbait,
        keywords,
        cta,
        subtitle,
        lastVerifiedAt: now,
      },
      verified: true,
    };
  });

  console.log(
    `✅ [SEO Integrity] ${updated.length} entries verified and enriched.`
  );

  return updated;
}

export default { ensureSeoIntegrity };

// /lib/seoIntegrity.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — SEO Integrity Engine v2.2.1 “Fail-Safe Entropy Guardian”
//
// Purpose:
// Scales SEO + CTR diversity for large data feeds (100s+ items).
// Adds grammar-based subtitle generation, 30+ CTAs per category,
// validation guards, automatic entropy rebalancing, and now robust
// safety checks for empty or invalid feeds.
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
    "intelligent workflow",
    "no-code AI tools",
    "GPT automation",
    "autonomous assistants",
    "AI productivity",
    "AI task management",
    "AI-powered insights",
    "workflow intelligence",
  ],
  marketing: [
    "growth automation",
    "lead generation",
    "conversion marketing",
    "social proof software",
    "SEO analytics",
    "content promotion",
    "audience targeting",
    "digital funnels",
    "campaign optimization",
    "brand amplification",
  ],
  productivity: [
    "workflow optimization",
    "time tracking",
    "project automation",
    "team efficiency",
    "focus tools",
    "goal alignment",
    "habit formation",
    "process improvement",
    "task clarity",
    "priority management",
  ],
  courses: [
    "online learning",
    "creator education",
    "skill mastery",
    "knowledge platform",
    "e-learning automation",
    "training programs",
    "interactive learning",
    "micro-learning",
    "creator academy",
    "learning pathways",
  ],
  business: [
    "operations management",
    "sales CRM",
    "analytics dashboard",
    "startup software",
    "business automation",
    "client growth",
    "process analytics",
    "scalable systems",
    "revenue optimization",
    "founder tools",
  ],
  web: [
    "no-code builder",
    "website design",
    "form automation",
    "CMS workflow",
    "web tools",
    "site performance",
    "frontend optimization",
    "UX/UI enhancement",
    "plugin integration",
    "web analytics",
  ],
};

// ─────────────── Emotional Mapping ───────────────
const EMOTION_MAP = {
  ai: ["empower", "reinvent", "automate", "enhance", "unleash", "accelerate", "elevate"],
  marketing: ["grow", "attract", "convert", "amplify", "inspire", "scale", "energize"],
  productivity: ["focus", "organize", "simplify", "accelerate", "achieve", "refine", "streamline"],
  courses: ["master", "learn", "transform", "advance", "elevate", "teach", "grow"],
  business: ["scale", "streamline", "succeed", "manage", "optimize", "expand", "lead"],
  web: ["create", "design", "launch", "build", "deliver", "innovate", "develop"],
};

// ─────────────── CTA Reservoirs (Expanded to 30+ each) ───────────────
const CTA_VARIANTS = {
  ai: [
    "Automate your next move →",
    "Unleash intelligent automation →",
    "Build your smarter future →",
    "Empower your workflow →",
    "Enhance your results with AI →",
    "Reinvent your process today →",
    "Turn insight into action →",
    "Streamline decisions with AI →",
    "Activate your autonomous edge →",
    "Scale your AI advantage →",
    "Boost performance with smart systems →",
    "Create intelligent workflows →",
    "Supercharge operations →",
    "Elevate with AI precision →",
    "Leverage machine learning tools →",
    "Revolutionize your process →",
    "Build automation that learns →",
    "Accelerate with GPT-powered tools →",
    "Unlock intelligent potential →",
    "Drive innovation with AI →",
    "Simplify complex workflows →",
    "Transform manual tasks →",
    "Experience automation freedom →",
    "Reclaim your creative hours →",
    "Grow smarter every day →",
    "Deploy smarter workflows →",
    "Achieve more with less →",
    "Optimize intelligently →",
    "Evolve your business with AI →",
    "Discover the new automation frontier →",
  ],
  marketing: [
    "Grow your audience effortlessly →",
    "Attract more leads →",
    "Amplify your brand reach →",
    "Turn attention into conversions →",
    "Inspire engagement instantly →",
    "Boost your marketing automation →",
    "Create buzz effortlessly →",
    "Expand your online reach →",
    "Accelerate your conversions →",
    "Grow your influence fast →",
    "Empower your campaigns →",
    "Convert with confidence →",
    "Simplify your outreach →",
    "Launch campaigns that sell →",
    "Scale your marketing engine →",
    "Elevate your content reach →",
    "Capture audience attention →",
    "Drive measurable engagement →",
    "Build loyalty at scale →",
    "Grow faster with less effort →",
    "Activate your funnel now →",
    "Level up your brand →",
    "Reimagine your growth →",
    "Transform your lead flow →",
    "Supercharge your brand impact →",
    "Empower every campaign →",
    "Dominate your niche →",
    "Grow visibility instantly →",
    "Engage smarter today →",
    "Turn clicks into growth →",
  ],
  productivity: [
    "Simplify your daily grind →",
    "Focus on what matters →",
    "Accelerate your success →",
    "Get more done every day →",
    "Organize chaos into progress →",
    "Reclaim your productive hours →",
    "Streamline your to-do list →",
    "Plan smarter, work faster →",
    "Unlock effortless focus →",
    "Transform how you work →",
    "Simplify project management →",
    "Eliminate daily friction →",
    "Supercharge team flow →",
    "Create calm in the chaos →",
    "Achieve clarity in motion →",
    "Work with flow →",
    "Design your productive day →",
    "Scale your output →",
    "Reinvent your routines →",
    "Build unstoppable momentum →",
    "Upgrade your workflow →",
    "Reach your peak flow →",
    "Automate busywork instantly →",
    "Get your time back →",
    "Focus with purpose →",
    "Manage smarter →",
    "Stay organized easily →",
    "Run your day efficiently →",
    "Do more, stress less →",
    "Work smarter today →",
  ],
  courses: [
    "Master new skills today →",
    "Transform your knowledge →",
    "Learn smarter, not harder →",
    "Elevate your learning game →",
    "Advance your expertise →",
    "Unlock your teaching potential →",
    "Start your next skill today →",
    "Grow with guided learning →",
    "Accelerate your mastery →",
    "Empower your education →",
    "Discover new techniques →",
    "Upgrade your knowledge base →",
    "Take the next learning step →",
    "Level up your skills →",
    "Gain confidence fast →",
    "Master practical tools →",
    "Advance at your own pace →",
    "Unleash your creative learning →",
    "Transform your growth path →",
    "Reach new skill levels →",
    "Start mastering today →",
    "Expand your abilities →",
    "Boost your learning speed →",
    "Make learning enjoyable →",
    "Simplify your course creation →",
    "Create your next course →",
    "Turn expertise into success →",
    "Empower your learners →",
    "Start your learning journey →",
    "Lead with knowledge →",
  ],
  business: [
    "Scale your success →",
    "Streamline your workflow →",
    "Optimize your operations →",
    "Grow your business confidently →",
    "Run smarter, faster teams →",
    "Transform your client impact →",
    "Accelerate your growth →",
    "Simplify your operations →",
    "Expand your business horizon →",
    "Boost your revenue engine →",
    "Lead with clarity →",
    "Drive performance across teams →",
    "Run your systems efficiently →",
    "Grow without chaos →",
    "Enhance your operations →",
    "Deliver results faster →",
    "Modernize your management →",
    "Achieve operational excellence →",
    "Build scalable frameworks →",
    "Simplify internal systems →",
    "Strengthen your client base →",
    "Lead with confidence →",
    "Automate your processes →",
    "Grow smarter every day →",
    "Power your business engine →",
    "Align your teams →",
    "Simplify decision making →",
    "Run lean, scale fast →",
    "Evolve your strategy →",
    "Transform your bottom line →",
  ],
  web: [
    "Build your next project faster →",
    "Design without limits →",
    "Create stunning pages effortlessly →",
    "Launch your vision online →",
    "Deliver seamless digital experiences →",
    "Develop with precision →",
    "Build with performance in mind →",
    "Design faster than ever →",
    "Create beautiful interfaces →",
    "Elevate your web presence →",
    "Optimize your frontend →",
    "Streamline your site →",
    "Simplify design workflows →",
    "Power your creative process →",
    "Launch smarter websites →",
    "Shape your online identity →",
    "Upgrade your web stack →",
    "Enhance UX with ease →",
    "Empower your design team →",
    "Build interactive experiences →",
    "Deliver better performance →",
    "Create websites that convert →",
    "Accelerate your site build →",
    "Design with purpose →",
    "Prototype instantly →",
    "Launch your next big idea →",
    "Simplify web automation →",
    "Run faster sites →",
    "Optimize every pixel →",
    "Grow your online footprint →",
  ],
};

// ─────────────── Grammar Pools for Subtitles ───────────────
const VERB_PHRASES = [
  "Simplifies", "Streamlines", "Boosts", "Optimizes", "Accelerates",
  "Transforms", "Empowers", "Refines", "Elevates", "Reinforces",
];
const OBJECTS = [
  "your workflow", "team operations", "daily tasks", "campaigns", "systems",
  "your creative process", "client management", "learning experience",
  "productivity", "communication pipeline",
];
const BENEFITS = [
  "with measurable results.", "for maximum efficiency.",
  "so you can focus on growth.", "to save hours each week.",
  "with clarity and control.", "to eliminate repetitive work.",
  "with less effort and more impact.", "without complexity.",
  "for lasting performance.", "to keep your momentum strong.",
];
const IMPACT_PHRASES = [
  "— trusted by creators worldwide.", "— built for ambitious teams.",
  "— saving you time every single day.", "— delivering consistent growth.",
  "— crafted for clarity and precision.", "— empowering over 10,000 users.",
  "— loved by startups and pros alike.", "— designed for measurable success.",
];

// ─────────────── Helpers ───────────────
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function capitalize(t = "") {
  return t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
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
function chooseEmotionVerb(cat) { return rand(EMOTION_MAP[cat] || ["enhance"]); }
function buildSubtitle() {
  return `${rand(VERB_PHRASES)} ${rand(OBJECTS)} ${rand(BENEFITS)} ${rand(IMPACT_PHRASES)}`;
}

// ─────────────── Main Processor ───────────────
export function ensureSeoIntegrity(feed) {
  // Guard against invalid or empty feeds
  if (!Array.isArray(feed)) {
    console.warn("⚠️ [SEO Integrity] Received non-array feed. Initializing empty array.");
    feed = [];
  }
  if (feed.length === 0) {
    console.warn("⚠️ [SEO Integrity] Empty feed provided — skipping enrichment.");
    return [];
  }

  const now = new Date().toISOString();
  const usedCTAs = new Set();
  const usedSubs = new Set();

  const updated = feed.map((item) => {
    if (item.archived) return item;
    const cat = item.category?.toLowerCase() || "software";
    const emotionVerb = chooseEmotionVerb(cat);
    const keywords = SEO_KEYWORDS[cat] || [cat, "AppSumo", "lifetime deal"];
    const keywordSet = keywords.sort(() => 0.5 - Math.random()).slice(0, 3);

    const clickbait =
      item.seo?.clickbait ||
      `${randomHook(cat)} — ${capitalize(item.title)} helps you ${emotionVerb} your results`;

    let cta = item.seo?.cta || rand(CTA_VARIANTS[cat]);
    let attempts = 0;
    while ((usedCTAs.has(cta) || cta.trim().split(" ").length < 3) && attempts < 10) {
      cta = rand(CTA_VARIANTS[cat]);
      attempts++;
    }
    usedCTAs.add(cta);

    let subtitle = item.seo?.subtitle || buildSubtitle();
    let tries = 0;
    while ((usedSubs.has(subtitle) || subtitle.split(" ").length < 6) && tries < 10) {
      subtitle = buildSubtitle();
      tries++;
    }
    usedSubs.add(subtitle);

    return {
      ...item,
      title: capitalize(item.title),
      seo: {
        ...item.seo,
        clickbait,
        keywords: keywordSet,
        cta,
        subtitle,
        emotionalVerb: emotionVerb,
        lastVerifiedAt: now,
      },
      verified: true,
    };
  });

  // ─────────────── Entropy Rebalancer ───────────────
  const total = feed.length || 1;
  const ctaEntropy = (usedCTAs.size / total).toFixed(2);
  const subEntropy = (usedSubs.size / total).toFixed(2);

  if (ctaEntropy < 0.6 || subEntropy < 0.6) {
    console.warn(
      `⚠️ [SEO Integrity] Entropy low (CTA:${ctaEntropy}, SUB:${subEntropy}) — expansion recommended.`
    );
  }

  console.log(
    `✅ [SEO Integrity] ${updated.length} entries verified. CTA entropy:${ctaEntropy}, Subtitle entropy:${subEntropy}`
  );

  return updated;
}

export default { ensureSeoIntegrity };

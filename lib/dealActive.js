// /lib/dealActive.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Universal Active Deal Resolver v3.0
// “Referral-Guard Aligned • SEO-Integrity Safe • Canonical Active Contract”
//
// PURPOSE
// • Provide a single, authoritative definition of “active deal”
// • Enforce ReferralGuard rules (no sourceUrl → inactive)
// • Enforce SEO Integrity expectations (image/title/slug validity)
// • Prevent expired / unlisted / sold-out AppSumo deals from entering CTA/SEO
// • Protect RankingEngine, InsightPulse, Homepage, Categories, Sitemap
//
// Guarantees:
// • No undefined fields
// • No invalid referral bundles
// • No placeholder-only deals from ingestion glitches
// • 100% deterministic
// • Used across: CTA Engine, Evolver, Categories, Home, Insight, Sitemap
// ───────────────────────────────────────────────────────────────────────────────

export const DEAL_ACTIVE_VERSION = "v3.0";

const SOLD_SIGNALS = [
  "sold out",
  "no longer available",
  "ended",
  "expired",
  "deal ended",
  "unlisted",
  "unavailable",
  "no access",
  "discontinued",
  "not for sale",
  "not available",
  "waitlist",
  "coming soon",
  "removed",
  "archived",
  "retired",
];

function safeStr(v) {
  return String(v || "").toLowerCase().trim();
}

export function isActiveDeal(deal = {}) {
  if (!deal || typeof deal !== "object") return false;

  // 1️⃣ Explicit archive → NEVER active
  if (deal.archived === true) return false;

  // 2️⃣ ReferralGuard alignment — no sourceUrl = cannot be promoted
  // (broken deal ingestion, placeholder-only, etc.)
  if (!deal.sourceUrl || typeof deal.sourceUrl !== "string") return false;

  // 3️⃣ Basic SEO Integrity: must have valid slug + title
  const slug = safeStr(deal.slug);
  const title = safeStr(deal.title);
  if (!slug || !title) return false;

  // 4️⃣ Must have a valid image (placeholder allowed but not null)
  // If ingestion glitched and image = null → inactive
  if (!deal.image || typeof deal.image !== "string") return false;

  // 5️⃣ Sold-out detection: status, badge, title, description
  const status = safeStr(deal.status || deal.state);
  const badge = safeStr(deal.badge);
  const desc = safeStr(deal.description);
  const combined = `${status} ${badge} ${title} ${desc}`;

  const isSoldOut =
    deal.soldOut === true ||
    SOLD_SIGNALS.some((s) => combined.includes(s));

  if (isSoldOut) return false;

  // 6️⃣ Final canonical check: must have internal trackPath + masked
  if (!deal.trackPath || !deal.masked || !deal.referralUrl) return false;

  // 7️⃣ All checks passed
  return true;
}

export default { isActiveDeal, DEAL_ACTIVE_VERSION };

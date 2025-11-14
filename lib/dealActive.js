// /lib/dealActive.js
// TinmanApps — Universal Active Deal Resolver v1.0
// Ensures perfect filtering across Insight, CTA Engine, Categories & Homepage.
// Guards against sold-out, expired, ended, unpublished, old AppSumo listings.

export function isActiveDeal(deal = {}) {
  if (!deal || typeof deal !== "object") return false;

  // Respect explicit archive flag
  if (deal.archived === true) return false;

  // Normalise strings
  const status = String(deal.status || deal.state || "").toLowerCase();
  const badge  = String(deal.badge || "").toLowerCase();
  const title  = String(deal.title || "").toLowerCase();

  // Any AppSumo wording meaning “sold out/unavailable”
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
  ];

  const combined = `${status} ${badge} ${title}`.toLowerCase();

  const isSoldOut = 
    deal.soldOut === true ||
    SOLD_SIGNALS.some(sig => combined.includes(sig));

  if (isSoldOut) return false;

  return true;
}

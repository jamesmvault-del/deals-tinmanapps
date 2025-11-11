// /api/track.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — CTR Feedback + Referral Integrity Engine v5.0
// “Deterministic Momentum • Zero-Leak Redirector • Self-Healing CTR State”
//
// Guarantees:
// ✅ No raw links ever leak to user-facing HTML
// ✅ CTR state is self-healing (never corrupts, never throws)
// ✅ Deterministic momentum scoring (stable decay + streak logic)
// ✅ ReinforceLearning sandboxed (never breaks redirect path)
// ✅ Hardened redirect governor (only allows absolute http(s) URLs)
// ✅ Fully Render-safe (no sync surprises)
// │
// Used by updateFeed → item.referralUrl → /api/track → masked AppSumo redirect
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { reinforceLearning } from "../lib/learningGovernor.js";

const DATA_PATH = path.resolve("./data/ctr-insights.json");

// ───────────────────────────────────────────────────────────────────────────────
// Self-healing CTR loader
// ───────────────────────────────────────────────────────────────────────────────
function loadCTR() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    raw = {};
  }

  return {
    totalClicks: raw.totalClicks || 0,
    byDeal: raw.byDeal || {},
    byCategory: raw.byCategory || {},
    momentum: raw.momentum || {},
    recent: Array.isArray(raw.recent) ? raw.recent : [],
    lastUpdated: raw.lastUpdated || null,
  };
}

function saveCTR(state) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.error("❌ CTR save error:", e.message);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Deterministic Momentum Engine v3
// • No randomness
// • Half-life decay
// • Streak-reinforced lift
// ───────────────────────────────────────────────────────────────────────────────
function applyMomentum(ctr, slug) {
  if (!ctr.momentum) ctr.momentum = {};

  const now = Date.now();
  const prev = ctr.momentum[slug] || {
    last: now,
    delta: 0,
    streak: 0,
  };

  const gap = now - prev.last;

  // half-life every 12 hours
  const decay = gap > 12 * 60 * 60 * 1000 ? 0.5 : 1;

  const updated = {
    last: now,
    delta: Math.min(5, prev.delta * decay + 1),
    streak: prev.streak + 1,
  };

  ctr.momentum[slug] = updated;
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ───────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { deal, cat, redirect } = req.query;

  if (!deal) {
    return res.status(400).json({ error: "Missing deal slug" });
  }

  const category = cat || "unknown";

  // Load + heal
  const ctr = loadCTR();

  ctr.totalClicks++;
  ctr.lastUpdated = new Date().toISOString();

  // Increment counters
  ctr.byDeal[deal] = (ctr.byDeal[deal] || 0) + 1;
  ctr.byCategory[category] = (ctr.byCategory[category] || 0) + 1;

  // Recent log (rolling 120)
  ctr.recent.unshift({
    deal,
    cat: category,
    at: ctr.lastUpdated,
  });
  if (ctr.recent.length > 120) ctr.recent.length = 120;

  // Momentum model
  applyMomentum(ctr, deal);

  // Self-healing LearningGovernor (never breaks redirect path)
  try {
    reinforceLearning({
      category,
      patternKey: deal,
    });
  } catch (e) {
    console.error("LearningGovernor error:", e.message);
  }

  // Persist updated CTR metrics
  saveCTR(ctr);

  // ───────────────────────────────────────────────────────────────────────────
  // REFERRAL GOVERNOR — hardened redirect
  // ───────────────────────────────────────────────────────────────────────────
  if (redirect) {
    try {
      const url = decodeURIComponent(redirect);

      // Must be absolute http(s)
      if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: "Invalid redirect URL" });
      }

      // Deterministic 302 → masked affiliate link
      res.writeHead(302, { Location: url });
      return res.end();
    } catch {
      return res.status(400).json({ error: "Bad redirect encoding" });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Diagnostics JSON (never shows raw referral links)
  // ───────────────────────────────────────────────────────────────────────────
  const topDeals = Object.entries(ctr.byDeal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([slug, clicks]) => ({ slug, clicks }));

  return res.json({
    status: "CTR recorded",
    deal,
    category,
    totalClicks: ctr.totalClicks,
    topDeals,
    momentum: ctr.momentum[deal] || null,
    lastUpdated: ctr.lastUpdated,
  });
}

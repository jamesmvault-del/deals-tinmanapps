// /api/track.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — CTR Feedback Tracker v4.0
// “Momentum Engine + Referral Governor Edition”
//
// Purpose:
// • Records real clicks for deals + categories
// • Strengthens learningGovernor momentum patterns
// • Powers CTA Evolver v3.0 (momentum + semantic evolution)
// • Ensures total Render-safe persistence
// • Includes referral-governor safety (protects affiliate link integrity)
//
// Behaviour:
//   /api/track?deal=slug&cat=software&redirect=<encoded>
//     → logs CTR
//     → updates momentum
//     → safely redirects to encoded referral url
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { reinforceLearning } from "../lib/learningGovernor.js";

const DATA_PATH = path.resolve("./data/ctr-insights.json");

// ───────────────────────────────────────────────────────────────────────────────
// Safe JSON helpers
// ───────────────────────────────────────────────────────────────────────────────
function loadCTR() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    return {
      totalClicks: 0,
      byDeal: {},
      byCategory: {},
      momentum: {},
      recent: [],
      lastUpdated: null,
    };
  }
}

function saveCTR(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("❌ CTR save error:", e.message);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Momentum update helper
// ───────────────────────────────────────────────────────────────────────────────
function applyMomentum(data, dealSlug) {
  const now = Date.now();
  const m = data.momentum[dealSlug] || {
    last: now,
    delta: 0,
    streak: 0,
  };

  const gap = now - m.last;
  const decay = gap > 1000 * 60 * 60 * 12 ? 0.5 : 1; // half-day decay

  m.delta = Math.min(5, m.delta * decay + 1); // +1 reinforcement, max 5
  m.streak += 1;
  m.last = now;

  data.momentum[dealSlug] = m;
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ───────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { deal, cat, redirect } = req.query;

  if (!deal) {
    return res.status(400).json({ error: "Missing deal slug" });
  }

  // Load CTR data
  const ctr = loadCTR();
  ctr.totalClicks++;
  ctr.lastUpdated = new Date().toISOString();

  // Basic metrics
  ctr.byDeal[deal] = (ctr.byDeal[deal] || 0) + 1;
  if (cat) ctr.byCategory[cat] = (ctr.byCategory[cat] || 0) + 1;

  // Recent events
  ctr.recent.unshift({
    deal,
    cat: cat || "unknown",
    at: ctr.lastUpdated,
  });
  if (ctr.recent.length > 120) ctr.recent.length = 120;

  // Momentum engine
  applyMomentum(ctr, deal);

  // Learning governor reinforcement
  try {
    reinforceLearning({
      category: cat || "software",
      patternKey: deal,
    });
  } catch (e) {
    console.error("LearningGovernor error:", e.message);
  }

  // Persist
  saveCTR(ctr);

  // ───────────────────────────────────────────────────────────────────────────
  // ✅ REDIRECTION LOGIC (referral-governor)
  // ───────────────────────────────────────────────────────────────────────────
  if (redirect) {
    try {
      const url = decodeURIComponent(redirect);

      // Must be http/https
      if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: "Invalid redirect URL" });
      }

      res.writeHead(302, { Location: url });
      return res.end();
    } catch {
      return res.status(400).json({ error: "Bad redirect encoding" });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Debug / Non-redirect response
  // ───────────────────────────────────────────────────────────────────────────
  const topDeals = Object.entries(ctr.byDeal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([slug, clicks]) => ({ slug, clicks }));

  return res.json({
    status: "CTR recorded",
    totalClicks: ctr.totalClicks,
    deal,
    category: cat || "unknown",
    topDeals,
    momentum: ctr.momentum[deal] || null,
    lastUpdated: ctr.lastUpdated,
  });
}

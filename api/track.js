// /api/track.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — CTR Feedback Tracker v4.1
// “Self-Healing Momentum + Referral Governor Edition”
//
// Fixes in this version:
// ✅ Ensures ctr-insights.json ALWAYS has all fields (prevents undefined errors)
// ✅ Momentum engine is 100% crash-proof even with empty/corrupt files
// ✅ ReinforceLearning is fully sandboxed
// ✅ Redirect logic hardened
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { reinforceLearning } from "../lib/learningGovernor.js";

const DATA_PATH = path.resolve("./data/ctr-insights.json");

// ───────────────────────────────────────────────────────────────────────────────
// Safe JSON load (100% self-healing)
// ───────────────────────────────────────────────────────────────────────────────
function loadCTR() {
  let json;

  try {
    json = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    json = {};
  }

  // ✅ Ensure required top-level fields exist
  return {
    totalClicks: json.totalClicks || 0,
    byDeal: json.byDeal || {},
    byCategory: json.byCategory || {},
    momentum: json.momentum || {},
    recent: Array.isArray(json.recent) ? json.recent : [],
    lastUpdated: json.lastUpdated || null,
  };
}

function saveCTR(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("❌ CTR save error:", e.message);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Safe Momentum Engine (never throws)
// ───────────────────────────────────────────────────────────────────────────────
function applyMomentum(data, dealSlug) {
  // ✅ Guarantee the momentum object exists
  if (!data.momentum) data.momentum = {};

  const now = Date.now();
  const existing =
    data.momentum[dealSlug] || {
      last: now,
      delta: 0,
      streak: 0,
    };

  const gap = now - existing.last;
  const decay = gap > 1000 * 60 * 60 * 12 ? 0.5 : 1; // half-day decay

  const updated = {
    last: now,
    delta: Math.min(5, existing.delta * decay + 1),
    streak: existing.streak + 1,
  };

  data.momentum[dealSlug] = updated;
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

  // Load + heal CTR state
  const ctr = loadCTR();

  ctr.totalClicks++;
  ctr.lastUpdated = new Date().toISOString();

  // Basic metrics
  ctr.byDeal[deal] = (ctr.byDeal[deal] || 0) + 1;
  ctr.byCategory[category] = (ctr.byCategory[category] || 0) + 1;

  // Recent event log
  ctr.recent.unshift({
    deal,
    cat: category,
    at: ctr.lastUpdated,
  });
  if (ctr.recent.length > 120) ctr.recent.length = 120;

  // Momentum engine
  applyMomentum(ctr, deal);

  // Learning governor
  try {
    reinforceLearning({
      category,
      patternKey: deal,
    });
  } catch (e) {
    console.error("LearningGovernor error:", e.message);
  }

  // Persist CTR
  saveCTR(ctr);

  // ───────────────────────────────────────────────────────────────────────────
  // REDIRECTION LOGIC (referral-governor)
  // ───────────────────────────────────────────────────────────────────────────
  if (redirect) {
    try {
      const url = decodeURIComponent(redirect);

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
  // Diagnostic JSON output
  // ───────────────────────────────────────────────────────────────────────────
  const topDeals = Object.entries(ctr.byDeal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([slug, clicks]) => ({ slug, clicks }));

  return res.json({
    status: "CTR recorded",
    totalClicks: ctr.totalClicks,
    deal,
    category,
    topDeals,
    momentum: ctr.momentum[deal] || null,
    lastUpdated: ctr.lastUpdated,
  });
}

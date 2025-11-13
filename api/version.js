// /api/version.js
// TinmanApps — Engine Version Reporter v11.2+
// “Unified Pipeline State • Deterministic Diagnostic Surface”
// ───────────────────────────────────────────────────────────────────────────────
// Purpose:
// • Report REAL active engine versions (CTA Engine, CTA Evolver, Learning Governor,
//   Ranking Engine, SEO Integrity Engine, Feed Engine, Insight Pulse).
// • Zero patches, zero assumptions — pure static reporter aligned with v11.x stack.
// • Render-safe, cron-safe, does not read or mutate FS.
// • Always returns stable diagnostic JSON for monitoring.
// ───────────────────────────────────────────────────────────────────────────────

import { CTA_ENGINE_VERSION } from "../lib/ctaEngine.js";
import { EVOLVER_VERSION } from "../lib/ctaEvolver.js";
import { GOVERNOR_VERSION } from "../lib/learningGovernor.js";
import { RANKING_VERSION } from "../lib/rankingEngine.js";

export default function handler(req, res) {
  try {
    res.status(200).json({
      app: "TinmanApps Deal Engine",
      versions: {
        ctaEngine: CTA_ENGINE_VERSION || "v11.x",
        ctaEvolver: EVOLVER_VERSION || "v4.x",
        learningGovernor: GOVERNOR_VERSION || "v4.x",
        rankingEngine: RANKING_VERSION || "v3.x",
        feedEngine: "v10.x",
        seoIntegrity: "v4.x",
        insightPulse: "v3.x",
      },
      generated: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || "unknown",
      cacheBust: Math.random().toString(36).slice(2, 10),
    });
  } catch (err) {
    res.status(500).json({
      error: "Version reporter failed",
      detail: err?.message || "unknown",
    });
  }
}

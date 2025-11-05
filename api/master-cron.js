// /api/master-cron.js
// Purpose: run builder → proxy refresh cycle in background.

import { backgroundRefresh } from "../lib/proxyCache.js";

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
let lastRun = 0;

async function performCycle() {
  const start = Date.now();
  const stamp = new Date().toISOString();
  console.log(`🔁 [Cron] Starting refresh cycle @ ${stamp}`);
  await backgroundRefresh();
  const ms = Date.now() - start;
  lastRun = Date.now();
  console.log(`✅ [Cron] Refresh complete in ${ms} ms`);
  return { status: "ok", ranAt: stamp, duration: ms };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: "Use GET" }));
    }

    const now = Date.now();
    const force =
      new URL(req.url, `http://${req.headers.host}`).searchParams.get("force") ===
      "1";

    if (!force && now - lastRun < REFRESH_INTERVAL_MS) {
      const next = new Date(lastRun + REFRESH_INTERVAL_MS).toISOString();
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({ message: `Next scheduled run @ ${next}`, lastRun })
      );
    }

    performCycle(); // run async

    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        message: "Cycle triggered in background.",
        previousRun: lastRun ? new Date(lastRun).toISOString() : null
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

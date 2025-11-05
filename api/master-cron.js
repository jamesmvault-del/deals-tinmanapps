// /api/master-cron.js
// Purpose: orchestrate builder → proxy refresh cycle without blocking the user.
//
// Render Scheduler or external pings can hit:
//   GET /api/master-cron
//   GET /api/master-cron?force=1   (force refresh even if recent)
//
// Designed to run comfortably on free tier (short async run).

import { setTimeout as delay } from "timers/promises";

// We import the proxy so we can update its internal CACHE directly.
// If your project ever separates processes, replace this with a network fetch.
import appsumoProxy from "./appsumo-proxy.js";
import appsumoBuilder from "./appsumo-builder.js";

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h cadence

// shared timestamp
let lastRun = 0;

async function performCycle() {
  const start = Date.now();
  const stamp = new Date().toISOString();
  console.log(`🔁 [Cron] Starting refresh cycle @ ${stamp}`);

  try {
    // Step 1: run builder to get fresh data
    const fakeRes = {
      headers: {},
      setHeader() {},
      statusCode: 200,
      end() {},
    };

    // builder returns its metrics; on free tier we just simulate delay
    const metrics = await appsumoBuilder(
      { method: "GET", url: "/api/appsumo-builder?cat=software" },
      fakeRes
    );

    // Step 2: refresh proxy cache asynchronously
    // We call its backgroundRefresh function indirectly via ?refresh=1 style logic.
    await (await import("./appsumo-proxy.js")).default(
      { method: "GET", url: "/api/appsumo-proxy?refresh=1" },
      fakeRes
    );

    const ms = Date.now() - start;
    lastRun = Date.now();

    console.log(`✅ [Cron] Refresh complete in ${ms}ms`);
    return {
      status: "ok",
      ranAt: stamp,
      buildMs: ms,
      builderResult: metrics || "ok",
    };
  } catch (err) {
    console.error("❌ [Cron] error:", err);
    return { status: "error", message: err.message };
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: "Use GET" }));
    }

    const now = Date.now();
    const force = new URL(req.url, `http://${req.headers.host}`).searchParams.get("force") === "1";

    if (!force && now - lastRun < REFRESH_INTERVAL_MS) {
      const next = new Date(lastRun + REFRESH_INTERVAL_MS).toISOString();
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({ message: `Next scheduled run @ ${next}`, lastRun })
      );
    }

    // run asynchronously so the response returns fast
    performCycle();

    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        message: "Cycle triggered in background.",
        previousRun: lastRun ? new Date(lastRun).toISOString() : null,
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

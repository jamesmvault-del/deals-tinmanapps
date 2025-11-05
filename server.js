// /server.js
// 🚀 TinmanApps Deal Engine — Production Server Entry

import express from "express";

// ✅ Core API modules
import appsumoProxy from "./api/appsumo-proxy.js";
import masterCron from "./api/master-cron.js";
import insight from "./api/insight.js";
import categories from "./api/categories.js";
import ctaPhrases from "./api/cta-phrases.js";

// ✅ Auto-initialise CTA Evolver on startup
import { evolveCTAs } from "./lib/ctaEvolver.js";

const app = express();

// 🔁 ensure CTA phrases file exists (runs once on boot)
evolveCTAs();

// ✅ Register routes
app.get("/api/appsumo-proxy", appsumoProxy);
app.get("/api/master-cron", masterCron);
app.get("/api/insight", insight);
app.get("/api/categories", categories);
app.get("/api/cta-phrases", ctaPhrases);

// ✅ Health check (root)
app.get("/", (req, res) => {
  res.send("✅ TinmanApps deal engine running");
});

// ✅ Catch-all handler for 404s
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

// ✅ Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("✅ Registered route: /api/appsumo-proxy");
  console.log("✅ Registered route: /api/master-cron");
  console.log("✅ Registered route: /api/insight");
  console.log("✅ Registered route: /api/categories");
  console.log("✅ Registered route: /api/cta-phrases");
});

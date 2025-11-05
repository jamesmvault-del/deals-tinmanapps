// /server.js
// 🚀 TinmanApps Deal Engine — Production Server Entry

import express from "express";

// ✅ Core API modules
import appsumoProxy from "./api/appsumo-proxy.js";
import masterCron from "./api/master-cron.js";
import insight from "./api/insight.js";
import categories from "./api/categories.js";
import ctaPhrases from "./api/cta-phrases.js";
import imageProxy from "./api/image-proxy.js";

// ✅ Evolver auto-init
import { evolveCTAs } from "./lib/ctaEvolver.js";

const app = express();

// 🔁 ensure CTA phrases file exists on boot
evolveCTAs();

// ✅ Serve static assets (for images, CSS, etc.)
app.use("/assets", express.static("public/assets"));

// ✅ Register API routes
app.get("/api/appsumo-proxy", appsumoProxy);
app.get("/api/master-cron", masterCron);
app.get("/api/insight", insight);
app.get("/api/categories", categories);
app.get("/api/cta-phrases", ctaPhrases);
app.get("/api/image-proxy", imageProxy);

// ✅ Health check (root)
app.get("/", (req, res) => {
  res.send("✅ TinmanApps deal engine running");
});

// ✅ 404 handler
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
  console.log("✅ Registered route: /api/image-proxy");
  console.log("✅ Static assets available at /assets/*");
});

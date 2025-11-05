// /server.js
// 🚀 TinmanApps Deal Engine — Production Server
// Unified Express entry point with full routing and SEO endpoints

import express from "express";
import appsumoProxy from "./api/appsumo-proxy.js";
import masterCron from "./api/master-cron.js";
import insight from "./api/insight.js";
import categories from "./api/categories.js";
import home from "./api/home.js";
import imageProxy from "./api/image-proxy.js";
import track from "./api/track.js";
import ctrReport from "./api/ctr-report.js";
import ctaPhrases from "./api/cta-phrases.js";

const app = express();

// ✅ Public assets (images, placeholders, etc.)
app.use("/assets", express.static("public/assets"));

// ✅ Core API routes
app.get("/api/appsumo-proxy", appsumoProxy);
app.get("/api/master-cron", masterCron);
app.get("/api/insight", insight);
app.get("/api/image-proxy", imageProxy);
app.get("/api/track", track);
app.get("/api/ctr-report", ctrReport);
app.get("/api/cta-phrases", ctaPhrases);

// ✅ Public-facing SEO pages
app.get("/categories", home);              // index of all categories
app.get("/categories/:cat", categories);   // individual category pages

// ✅ Root health check
app.get("/", (req, res) => {
  res.send("✅ TinmanApps deal engine running");
});

// ✅ Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("✅ Registered routes:");
  [
    "/",
    "/api/appsumo-proxy",
    "/api/master-cron",
    "/api/insight",
    "/api/image-proxy",
    "/api/track",
    "/api/ctr-report",
    "/api/cta-phrases",
    "/categories",
    "/categories/:cat"
  ].forEach((r) => console.log(" →", r));
});

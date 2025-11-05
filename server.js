// /server.js
// Express entry point for TinmanApps Deal Engine

import express from "express";
import appsumoProxy from "./api/appsumo-proxy.js";
import masterCron from "./api/master-cron.js";
import insight from "./api/insight.js";

const app = express();

// ✅ API routes
app.get("/api/appsumo-proxy", appsumoProxy);
app.get("/api/master-cron", masterCron);
app.get("/api/insight", insight);

// ✅ Health / root
app.get("/", (req, res) => {
  res.send("✅ TinmanApps deal engine running");
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

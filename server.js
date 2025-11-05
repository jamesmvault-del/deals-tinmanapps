// server.js — routes all API endpoints cleanly

import http from "http";
import url from "url";

import appsumoBuilder from "./api/appsumo-builder.js";
import appsumoProxy from "./api/appsumo-proxy.js";
import masterCron from "./api/master-cron.js";

const routes = {
  "/api/appsumo-builder": appsumoBuilder,
  "/api/appsumo-proxy": appsumoProxy,
  "/api/master-cron": masterCron
};

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = url.parse(req.url);
    const match = Object.keys(routes).find((r) => pathname.startsWith(r));

    if (match) {
      return routes[match](req, res);
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end("✅ TinmanApps deal engine running");
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("Error: " + err.message);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// server.js — upgraded router to handle all /api endpoints
// Works on Render and with any number of /api/*.js files

import http from "http";
import url from "url";

// Import all API handlers
import appsumoBuilder from "./api/appsumo-builder.js";
import appsumoProxy from "./api/appsumo-proxy.js";

// Map of available endpoints
const routes = {
  "/api/appsumo-builder": appsumoBuilder,
  "/api/appsumo-proxy": appsumoProxy
};

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = url.parse(req.url);
    const match = Object.keys(routes).find((r) => pathname.startsWith(r));

    if (match) {
      return routes[match](req, res);
    }

    // Default response for root or unknown paths
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

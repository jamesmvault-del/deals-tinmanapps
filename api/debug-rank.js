// /api/debug-rank.js
// TinmanApps — Smart Ranking Debug Endpoint v2.0 “Deep Visibility”
// ───────────────────────────────────────────────────────────────────────────────
// Purpose:
// Gives full transparency into rankingEngine v2.0 scoring — CTR, momentum,
// semantics, long-tail rarity, freshness, exploration boost, and final score.
//
// Usage:
//    /api/debug-rank?cat=ai
//
// Output:
//    Human-friendly HTML table with all ranking signals.
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";
import { rankDeals, debugRank } from "../lib/rankingEngine.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

function loadJsonSafe(file, fallback = []) {
  try {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  try {
    const cat = String(req.query.cat || "software").toLowerCase();

    const deals = loadJsonSafe(`appsumo-${cat}.json`, []);
    if (!deals.length) {
      res.setHeader("Content-Type", "text/html");
      return res.send(`<h1>No deals found for category: ${cat}</h1>`);
    }

    // ⚡ Pull ranked results with full scoring breakdown
    const rows = debugRank(deals, cat, 40);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Ranking Debug — ${cat}</title>
<style>
  body {
    font-family: system-ui, -apple-system, Segoe UI, Roboto;
    background: #f6f8fb;
    color: #111;
    padding: 24px;
  }
  h1 {
    margin: 0 0 16px;
    color: #2a63f6;
    font-size: 24px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    box-shadow: 0 3px 10px rgba(0,0,0,.05);
    border-radius: 10px;
    overflow: hidden;
  }
  th {
    background: #eef2ff;
    padding: 12px;
    font-size: 12px;
    text-transform: uppercase;
    font-weight: 600;
    color: #2a63f6;
    border-bottom: 1px solid #e3e7f3;
  }
  td {
    padding: 12px;
    font-size: 14px;
    border-bottom: 1px solid #eef1f5;
  }
  tr:hover {
    background: #fafcff;
  }
  .score {
    font-weight: 700;
    color: #1d4fe6;
  }
  .slug {
    color: #666;
    font-size: 12px;
  }
</style>
</head>
<body>

<h1>📊 Ranking Debug: ${cat}</h1>

<table>
<thead>
<tr>
  <th>#</th>
  <th>Title</th>
  <th>CTR</th>
  <th>Momentum</th>
  <th>Semantic</th>
  <th>Long-tail</th>
  <th>Fresh</th>
  <th>Explore</th>
  <th>Score</th>
</tr>
</thead>
<tbody>
${rows
  .map(
    (r, i) => `
<tr>
  <td>${i + 1}</td>
  <td>
    ${r.title}<br>
    <span class="slug">${r.slug}</span>
  </td>
  <td>${r.ctr.toFixed(3)}</td>
  <td>${r.momentum.toFixed(3)}</td>
  <td>${r.semantic.toFixed(3)}</td>
  <td>${r.longTail.toFixed(3)}</td>
  <td>${r.freshness.toFixed(3)}</td>
  <td>${r.explore.toFixed(3)}</td>
  <td class="score">${r.score.toFixed(3)}</td>
</tr>`
  )
  .join("\n")}
</tbody>
</table>

</body>
</html>
`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("debug-rank error:", err);
    res.status(500).send("Internal server error");
  }
}

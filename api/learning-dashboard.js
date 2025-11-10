// /api/learning-dashboard.js
// TinmanApps — Adaptive Learning Dashboard v2.0 “CTR Resonance Explorer”
// ───────────────────────────────────────────────────────────────────────────────
// What this version adds:
// • Reads true reinforcement data from ctr-insights.json.learning
// • Extracts toneBias via learningGovernor.getLearningBias()
// • Displays category CTR share, reinforcement totals, top patterns
// • Clean 7-day CTR trend from `recent` array
// • Zero external dependencies, pure Node, Render-safe
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import url from "url";
import { getLearningBias } from "../lib/learningGovernor.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");

const CTR_FILE = path.join(DATA_DIR, "ctr-insights.json");
const LEARN_FILE = path.join(DATA_DIR, "learning-governor.json"); // optional external state

function loadJsonSafe(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  // CTR + learning sources
  const ctr = loadJsonSafe(CTR_FILE, {
    totalClicks: 0,
    byDeal: {},
    byCategory: {},
    recent: [],
    learning: {},   // { [category]: { [patternKey]: { clicks, impressions } } }
  });

  // Optional historical file (if ever used)
  const legacy = loadJsonSafe(LEARN_FILE, {});

  // Merge legacy if needed
  const learning = {
    ...(legacy.learning || {}),
    ...(ctr.learning || {}),
  };

  const today = new Date();

  // --- Build 7-day CTR trend ---
  const dailyCounts = Array(7).fill(0);
  for (const r of ctr.recent) {
    const t = new Date(r.at);
    const diff = Math.floor((today - t) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff < 7) dailyCounts[6 - diff]++;
  }
  const trendJson = JSON.stringify(dailyCounts);

  // --- Build category learning table ---
  const categories = Object.keys(learning);

  const rowsHTML = categories
    .map((category) => {
      const patterns = learning[category] || {};
      const patternKeys = Object.keys(patterns);

      // Reinforcement totals
      let totalReinf = 0;
      const sortable = [];
      for (const key of patternKeys) {
        const r = patterns[key];
        const v = (r?.clicks || 0) * 1.0 + (r?.impressions || 0) * 0.2;
        sortable.push([key, v]);
        totalReinf += v;
      }

      sortable.sort((a, b) => b[1] - a[1]);
      const top = sortable.slice(0, 5).map(([k]) => k);

      // Category CTR share
      const clicks = ctr.byCategory?.[category] || 0;

      // Tone bias via governor
      let toneBias = "neutral";
      try {
        const bias = getLearningBias(category);
        toneBias = bias?.toneBias || "neutral";
      } catch {
        toneBias = "neutral";
      }

      return `
        <tr>
          <td>${category}</td>
          <td>${toneBias}</td>
          <td>${clicks}</td>
          <td>${Math.round(totalReinf)}</td>
          <td>${top.join(", ") || "—"}</td>
        </tr>
      `;
    })
    .join("\n");

  // --- HTML ---
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>TinmanApps Learning Dashboard</title>
<style>
  body {
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    background: #f6f8fb;
    margin: 0;
    color: #101326;
  }
  header {
    padding: 22px 24px;
    background: #2a63f6;
    color: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,.12);
  }
  h1 { margin: 0; font-size: 22px; font-weight: 600; }
  .sub { opacity: 0.85; font-size: 14px; margin-top: 2px; }
  main { padding: 24px; max-width: 1080px; margin: 0 auto; }
  .grid { display:flex; gap:24px; flex-wrap:wrap; margin-bottom:28px; }
  .card {
    flex:1 1 240px;
    background:#fff;
    border-radius:12px;
    padding:18px;
    box-shadow:0 2px 8px rgba(0,0,0,.06);
  }
  .metric {
    font-size:30px;
    font-weight:700;
    color:#2a63f6;
  }
  .metric-sub { margin-top:4px; font-size:13px; color:#6c7392; }

  table {
    width:100%; border-collapse:collapse;
    background:#fff; margin-top:24px;
    border-radius:12px; overflow:hidden;
    box-shadow:0 2px 6px rgba(0,0,0,.06);
  }
  th {
    background:#eef2ff; padding:12px;
    color:#2a63f6; text-transform:uppercase;
    font-size:12px; letter-spacing:0.04em;
  }
  td { padding:12px; font-size:14px; border-bottom:1px solid #eef1f5; }
  tr:hover { background:#fafcff; }
  
  canvas {
    width:100%; height:160px;
    background:#fff; border-radius:8px;
    box-shadow:0 1px 5px rgba(0,0,0,.08);
    margin-top:12px;
  }

  footer {
    text-align:center;
    padding:22px 12px 38px;
    color:#79819d;
    font-size:13px;
  }
</style>
</head>
<body>

<header>
  <h1>🧠 TinmanApps Learning Dashboard</h1>
  <div class="sub">Reinforcement memory • Tone evolution • CTR resonance</div>
</header>

<main>
  <div class="grid">
    <div class="card">
      <div class="metric">${ctr.totalClicks || 0}</div>
      <div class="metric-sub">Total Clicks Recorded</div>
    </div>
    <div class="card">
      <div class="metric">${categories.length}</div>
      <div class="metric-sub">Learning Categories</div>
    </div>
  </div>

  <h3 style="margin:0 0 6px;">📈 CTR Trend (Past 7 Days)</h3>
  <canvas id="trend"></canvas>

  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Tone Bias</th>
        <th>Clicks</th>
        <th>Reinforcement</th>
        <th>Top Patterns</th>
      </tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>
</main>

<footer>
  Updated ${new Date().toLocaleString()} • Data synced from ctr-insights.json
</footer>

<script>
  const data = ${trendJson};
  const c = document.getElementById("trend");
  const ctx = c.getContext("2d");
  const W = c.width, H = c.height;
  const max = Math.max(...data, 1);
  const step = W / (data.length - 1);

  ctx.clearRect(0,0,W,H);
  ctx.beginPath();
  ctx.moveTo(0, H - (data[0]/max)*(H-20) - 10);

  for (let i=1; i<data.length; i++){
    const x = i * step;
    const y = H - (data[i]/max)*(H-20) - 10;
    ctx.lineTo(x,y);
  }
  ctx.strokeStyle="#2a63f6";
  ctx.lineWidth=2.2;
  ctx.stroke();

  ctx.fillStyle="rgba(42,99,246,0.12)";
  ctx.lineTo(W,H);
  ctx.lineTo(0,H);
  ctx.closePath();
  ctx.fill();
</script>

</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
}

// /api/ctr-report.js
// TinmanApps — CTR Insight Explorer v2.0 “Weighted Engagement Dashboard”
// ───────────────────────────────────────────────────────────────────────────────
// Purpose:
// • Professional report for ctr-insights.json
// • Shows: total clicks, CTR by category, top deals, 7-day trend, reinforcement
// • Pure Node, no deps. Render-safe.
// • Complements learning-dashboard.js but focused entirely on CTR metrics.
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const CTR_PATH = path.resolve("./data/ctr-insights.json");

function loadJsonSafe(fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(CTR_PATH, "utf8"));
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  const ctr = loadJsonSafe({
    totalClicks: 0,
    byDeal: {},
    byCategory: {},
    recent: [],
    learning: {},
  });

  const now = new Date();

  // --- 7-day CTR trend ---
  const daily = Array(7).fill(0);
  for (const r of ctr.recent || []) {
    const t = new Date(r.at);
    const diff = Math.floor((now - t) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff < 7) daily[6 - diff]++;
  }
  const trendJson = JSON.stringify(daily);

  // --- Top deals by CTR ---
  const topDeals = Object.entries(ctr.byDeal || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([slug, clicks]) => ({ slug, clicks }));

  // --- Category breakdown ---
  const cats = Object.entries(ctr.byCategory || {}).sort((a, b) => b[1] - a[1]);

  // --- Reinforcement memory (flatten sorted) ---
  const reinforcement = [];
  const learn = ctr.learning || {};
  for (const [cat, patterns] of Object.entries(learn)) {
    for (const [key, obj] of Object.entries(patterns || {})) {
      const score = (obj.clicks || 0) + (obj.impressions || 0) * 0.25;
      reinforcement.push({
        category: cat,
        pattern: key,
        clicks: obj.clicks || 0,
        impressions: obj.impressions || 0,
        score,
      });
    }
  }

  reinforcement.sort((a, b) => b.score - a.score);

  // --- HTML OUTPUT ---
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>CTR Report — TinmanApps</title>
<style>
  body {
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    background: #f6f8fb;
    margin: 0;
    color: #14161f;
  }
  header {
    background: #2a63f6;
    color: #fff;
    padding: 22px 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,.12);
  }
  h1 { margin: 0; font-size: 22px; }
  .sub { margin-top: 3px; font-size: 13px; opacity: .85; }

  main { padding: 24px; max-width: 1100px; margin: 0 auto; }

  .grid { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 28px; }
  .card {
    flex: 1 1 240px;
    background: #fff;
    padding: 18px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,.06);
  }
  .metric {
    font-size: 30px;
    font-weight: 600;
    color: #2a63f6;
  }
  .metric-sub { margin-top: 4px; font-size: 13px; color: #6c7392; }

  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 6px rgba(0,0,0,.06);
    margin-top: 20px;
  }
  th {
    background: #eef2ff;
    color: #2a63f6;
    padding: 12px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  td { padding: 12px; border-bottom: 1px solid #eef1f5; }
  tr:hover { background: #fafcff; }

  canvas {
    width: 100%;
    height: 160px;
    margin-top: 16px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 1px 5px rgba(0,0,0,.08);
  }
</style>
</head>
<body>

<header>
  <h1>📈 CTR Report</h1>
  <div class="sub">Analysis of ctr-insights.json</div>
</header>

<main>

<div class="grid">
  <div class="card">
    <div class="metric">${ctr.totalClicks || 0}</div>
    <div class="metric-sub">Total Clicks Recorded</div>
  </div>
  <div class="card">
    <div class="metric">${Object.keys(ctr.byDeal || {}).length}</div>
    <div class="metric-sub">Tracked Deals</div>
  </div>
  <div class="card">
    <div class="metric">${cats.length}</div>
    <div class="metric-sub">Active Categories</div>
  </div>
</div>

<h3 style="margin:0 0 6px;">📊 CTR Trend (Past 7 Days)</h3>
<canvas id="trend"></canvas>

<h3 style="margin-top:28px;">🏆 Top Deals by CTR</h3>
<table>
  <thead><tr><th>#</th><th>Slug</th><th>Clicks</th></tr></thead>
  <tbody>
    ${topDeals
      .map(
        (d, i) =>
          `<tr><td>${i + 1}</td><td>${d.slug}</td><td>${d.clicks}</td></tr>`
      )
      .join("")}
  </tbody>
</table>

<h3 style="margin-top:28px;">📂 CTR by Category</h3>
<table>
  <thead><tr><th>Category</th><th>Clicks</th></tr></thead>
  <tbody>
    ${cats
      .map(([c, v]) => `<tr><td>${c}</td><td>${v}</td></tr>`)
      .join("")}
  </tbody>
</table>

<h3 style="margin-top:28px;">🧠 Reinforcement Memory (Top Patterns)</h3>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Category</th>
      <th>Pattern</th>
      <th>Clicks</th>
      <th>Impressions</th>
      <th>Score</th>
    </tr>
  </thead>
  <tbody>
    ${reinforcement
      .slice(0, 30)
      .map(
        (r, i) =>
          `<tr>
            <td>${i + 1}</td>
            <td>${r.category}</td>
            <td>${r.pattern}</td>
            <td>${r.clicks}</td>
            <td>${r.impressions}</td>
            <td>${r.score.toFixed(2)}</td>
          </tr>`
      )
      .join("")}
  </tbody>
</table>

</main>

<script>
  const data = ${trendJson};
  const c = document.getElementById("trend");
  const ctx = c.getContext("2d");

  const W = c.width, H = c.height;
  const max = Math.max(...data, 1);
  const step = W / (data.length - 1);

  ctx.beginPath();
  ctx.moveTo(0, H - (data[0]/max)*(H-20) - 10);
  for (let i=1;i<data.length;i++){
    const x = i*step;
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

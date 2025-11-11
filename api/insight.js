// /api/insight.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Insight Pulse v4.1
// “Deterministic Momentum • CTR-Weighted • Referral Integrity Diagnostics”
//
// What this does (deterministic, Render-safe):
// • Reads local silos (appsumo-*.json) → falls back to feed-cache.json → falls back to proxy CACHE
// • Computes TRUE rising keywords globally (vs previous snapshot), plus per-category top terms
// • Uses size-aware entropy health signals for CTA/subtitle diversity
// • Mines bi/tri-gram long tails deterministically (sorted by score → alpha tiebreak)
// • Weights signals by CTR strength + recency (if available in ctr-insights.json)
// • Emits referral integrity telemetry: masked %, missing %, external %
// • Ranks category “sample” deals by representativeness (not order-of-file)
// • Persists hidden frequency/slugs for next-run deltas
//
// Input files:
//   /data/appsumo-*.json            (preferred)
//   /data/feed-cache.json           (fallback 1)
//   lib/proxyCache.js::CACHE        (fallback 2, minimal)
//   /data/ctr-insights.json         (optional; strengthens CTR weighting)
// Output files:
//   /data/insight-latest.json
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { CACHE } from "../lib/proxyCache.js";

// ───────────────────────────── Paths ─────────────────────────────
const DATA_DIR = path.resolve("./data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");
const CTR_PATH = path.join(DATA_DIR, "ctr-insights.json");
const SNAP_PATH = path.join(DATA_DIR, "insight-latest.json");

// ───────────────────────────── Utils (deterministic) ─────────────────────────────
function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}
function saveJson(p, obj) {
  try {
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    // silent in cron silent mode, log otherwise in caller
  }
}
function listCategoryFiles() {
  try {
    return fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));
  } catch {
    return [];
  }
}
function stable(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function isoNow() {
  return new Date().toISOString();
}
function clamp01(x) {
  if (Number.isNaN(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function log1p(x) {
  return Math.log(1 + Math.max(0, x));
}
function daysSince(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - t) / (1000 * 60 * 60 * 24));
}

// ───────────────────────────── Loading silos (3-tier) ─────────────────────────────
function loadLocalSilos() {
  const files = listCategoryFiles();
  const silos = {};
  for (const file of files) {
    const cat = file.replace(/^appsumo-/, "").replace(/\.json$/, "");
    silos[cat] = loadJson(path.join(DATA_DIR, file), []);
  }
  return silos;
}
function aggregateFromFeed(feed) {
  const out = {};
  for (const d of feed) {
    const cat = (d.category || "software").toLowerCase();
    if (!out[cat]) out[cat] = [];
    out[cat].push(d);
  }
  return out;
}
function fallbackSilosFromCache() {
  const cats = (CACHE && CACHE.categories) || {};
  const out = {};
  for (const [cat, deals] of Object.entries(cats)) {
    out[cat] = (deals || []).map((d) => ({
      title: d.title || "Untitled",
      slug:
        (d.title || "")
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-") || "untitled",
      category: cat,
      seo: {},
      archived: false,
      url: d.url || null,
      referralUrl: d.referralUrl || null,
    }));
  }
  return out;
}

// ───────────────────────────── Tokenization (deterministic) ─────────────────────────────
const STOP = new Set([
  "the","and","for","you","your","with","from","that","this","are","was","were","but","not","all","any",
  "can","will","into","about","over","our","their","more","most","such","than","then","too","very","via",
  "to","in","on","of","by","at","as","it","its","a","an","or","be","is","am","we","they","them","us",
  "new","best","top","pro","plus","ultra","v","vs"
]);
function stem(w) {
  let s = String(w || "").toLowerCase();
  if (STOP.has(s) || s.length <= 2) return "";
  // simple, stable stems (order matters, deterministic)
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y"; // policies -> policy
  else if (s.endsWith("ing") && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith("ed") && s.length > 4) s = s.slice(0, -2);
  else if (s.endsWith("es") && s.length > 4) s = s.slice(0, -2);
  else if (s.endsWith("s") && s.length > 3) s = s.slice(0, -1);
  return STOP.has(s) ? "" : s.replace(/[^a-z0-9]+/g, "");
}
function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(stem)
    .filter(Boolean);
}
function tokenizeDeal(deal) {
  const titleTokens = tokenize(deal.title);
  const subtitleTokens = tokenize(deal?.seo?.subtitle || "");
  const keywordTokens = Array.isArray(deal?.seo?.keywords)
    ? deal.seo.keywords.map((k) => tokenize(k)).flat()
    : [];
  // weighted stream (titles:1.0, subtitle:0.6, keywords:0.6)
  return {
    titleTokens,
    subtitleTokens,
    keywordTokens
  };
}
function countFreqWeighted(items) {
  const freq = {};
  for (const d of items) {
    const { titleTokens, subtitleTokens, keywordTokens } = tokenizeDeal(d);
    for (const t of titleTokens) freq[t] = (freq[t] || 0) + 1.0;
    for (const t of subtitleTokens) freq[t] = (freq[t] || 0) + 0.6;
    for (const t of keywordTokens) freq[t] = (freq[t] || 0) + 0.6;
  }
  return freq;
}
function buildNgrams(tokens, n = 2) {
  const grams = {};
  for (let i = 0; i + n <= tokens.length; i++) {
    const g = tokens.slice(i, i + n).join(" ");
    if (g.length < 4) continue;
    grams[g] = (grams[g] || 0) + 1;
  }
  return grams;
}
function ngramPoolFromTitles(items) {
  // Only titles for n-grams to keep noise low; deterministic
  const grams2 = {};
  const grams3 = {};
  for (const d of items) {
    const t = tokenize(d.title);
    const b2 = buildNgrams(t, 2);
    const b3 = buildNgrams(t, 3);
    for (const [g, c] of Object.entries(b2)) grams2[g] = (grams2[g] || 0) + c;
    for (const [g, c] of Object.entries(b3)) grams3[g] = (grams3[g] || 0) + c;
  }
  return { grams2, grams3 };
}

// ───────────────────────────── Metrics helpers ─────────────────────────────
function diversity(items, key) {
  const vals = items.map((d) => (d.seo && d.seo[key]) || "").filter(Boolean);
  if (!vals.length) return 0;
  const set = new Set(vals);
  return +(set.size / vals.length).toFixed(2);
}
function titleEntropyFrom(items) {
  const all = items.map((d) => String(d.title || "").toLowerCase()).join(" ");
  const tokens = tokenize(all);
  const uniq = new Set(tokens).size;
  const total = Math.max(1, tokens.length);
  return +(Math.min(1, uniq / total).toFixed(3));
}
function rarityMap(freq) {
  const out = {};
  for (const [w, f] of Object.entries(freq)) out[w] = 1 / (f + 1); // deterministic, bounded
  return out;
}
function dynamicEntropyThreshold(n) {
  // Scale requirement up with silo size (log curve, bounded)
  // n=1..150 → 0.35..0.60 ; >150 stays near 0.60
  const min = 0.35;
  const add = 0.25 * clamp01(Math.log1p(Math.max(0, n)) / Math.log1p(150));
  return +(min + add).toFixed(2);
}
function healthFromSignals({ ctaEntropy, subEntropy, nActive, churnRate }) {
  const th = dynamicEntropyThreshold(nActive);
  if (ctaEntropy < th || subEntropy < th) return "critical";
  if (churnRate > 0.35) return "warn";
  return "good";
}
function slugsSet(items) {
  const s = new Set();
  for (const d of items) if (d.slug) s.add(String(d.slug).toLowerCase());
  return s;
}

// ───────────────────────────── CTR weighting (deterministic) ─────────────────────────────
function ctrWeightForSlug(ctr, slug) {
  const rec = (ctr && ctr.byDeal && ctr.byDeal[slug]) || null;
  if (!rec) return 1.0;
  const clicks = Math.max(0, Number(rec.clicks || rec.count || 0));
  const last = rec.lastClickAt || rec.last || null;
  const age = daysSince(last);
  const recencyBoost = clamp01(1 - age / 30); // 1.0 if today → → 0 over 30 days
  const strength = Math.min(0.5, log1p(clicks) / 5); // ≤ +0.5
  return 1 + strength * recencyBoost; // 1..1.5
}
function aggregateCtrWeightOverDeals(ctr, items) {
  // Average weight across items that mention a token/ngram in title
  const weights = {};
  for (const d of items) {
    const w = ctrWeightForSlug(ctr, String(d.slug || "").toLowerCase());
    const tokens = tokenize(d.title);
    for (const t of tokens) {
      if (!t) continue;
      weights[t] = Math.max(weights[t] || 0, w); // take strongest associated weight deterministically
    }
  }
  return weights;
}

// ───────────────────────────── Rising keywords (true global) ─────────────────────────────
function globalRisers(currentFreqGlobal, prevFreqGlobal) {
  const eps = 0.5;
  const out = [];
  for (const [w, cur] of Object.entries(currentFreqGlobal)) {
    const prev = prevFreqGlobal[w] || 0;
    const lift = (cur + eps) / (prev + eps);
    if (lift <= 1.0) continue;
    out.push({ word: w, lift, cur, prev });
  }
  // order by lift desc → cur desc → alpha asc (deterministic)
  out.sort((a, b) => (b.lift - a.lift) || (b.cur - a.cur) || (a.word < b.word ? -1 : 1));
  return out;
}

// ───────────────────────────── Referral integrity ─────────────────────────────
function referralStats(items) {
  let masked = 0, missing = 0, external = 0, total = 0;
  for (const d of items) {
    total++;
    const r = d.referralUrl || "";
    if (!r) { missing++; continue; }
    if (r.startsWith("/")) masked++;
    else if (/^https?:\/\//i.test(r)) external++;
    else masked++; // treat relative paths as masked
  }
  const pct = (x) => (total ? +((x / total).toFixed(2)) : 0);
  return {
    total,
    maskedCount: masked,
    externalCount: external,
    missingCount: missing,
    maskedPct: pct(masked),
    externalPct: pct(external),
    missingPct: pct(missing),
  };
}

// ───────────────────────────── Representativeness score ─────────────────────────────
function representativenessScore(deal, topKeywordsSet, longTailList) {
  let score = 0;
  const title = String(deal.title || "").toLowerCase();
  for (const kw of topKeywordsSet) if (title.includes(kw)) score += 1;
  for (const lt of longTailList) if (title.includes(lt)) score += 1.25;
  // Fresh CTA/subtitle bonus (non-empty)
  if (deal?.seo?.cta) score += 0.25;
  if (deal?.seo?.subtitle) score += 0.25;
  return score;
}

// ───────────────────────────── Handler ─────────────────────────────
export default async function handler(req, res) {
  const t0 = Date.now();
  const silent = req?.query?.silent === "1";

  // Load silos: local → feed → CACHE
  let silos = loadLocalSilos();
  if (!Object.keys(silos).length) {
    const feed = loadJson(FEED_PATH, []);
    silos = Array.isArray(feed) && feed.length ? aggregateFromFeed(feed) : fallbackSilosFromCache();
  }

  const ctr = loadJson(CTR_PATH, { byDeal: {}, byCategory: {}, recent: [] });
  const prevSnap = loadJson(SNAP_PATH, {
    analysedAt: null,
    categories: {},
    _freqByCat: {},
    _slugsByCat: {},
  });

  // Build global prev freq by summing category prevs
  const prevFreqGlobal = {};
  for (const freqObj of Object.values(prevSnap._freqByCat || {})) {
    for (const [w, f] of Object.entries(freqObj || {})) {
      prevFreqGlobal[w] = (prevFreqGlobal[w] || 0) + Number(f || 0);
    }
  }

  // Analyse per-category (deterministic)
  const categories = {};
  const globalCTAs = [];
  const globalSubs = [];
  const globalSlugs = new Set();
  const currentFreqGlobal = {};

  for (const [catKey, itemsRaw] of Object.entries(silos)) {
    const cat = String(catKey || "software").toLowerCase();

    // sanitize + normalize deals
    const items = (itemsRaw || []).map((d) => ({
      title: d.title || "Untitled",
      slug:
        d.slug ||
        (d.title || "")
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-"),
      category: (d.category || cat).toLowerCase(),
      seo: d.seo || {},
      archived: !!d.archived,
      url: d.url || d.link || null,
      referralUrl: d.referralUrl || null,
      image: d.image || null,
    }));

    const active = items.filter((d) => !d.archived);
    const archived = items.filter((d) => d.archived);
    const nActive = active.length;

    // Frequency (weighted tokens)
    const freq = countFreqWeighted(active);

    // Merge into global current freq
    for (const [w, f] of Object.entries(freq)) {
      currentFreqGlobal[w] = (currentFreqGlobal[w] || 0) + f;
    }

    // Title entropy
    const titleEntropy = titleEntropyFrom(active);

    // CTA / Subtitle entropy
    const ctaEntropy = diversity(active, "cta");
    const subEntropy = diversity(active, "subtitle");

    // Momentum & scarcity
    const prevCount = prevSnap?.categories?.[cat]?.totalDeals || 0;
    const totalDeals = nActive;
    const momentum = +(Math.min(1, prevCount ? totalDeals / prevCount : 0.5).toFixed(3));
    const scarcity = +(Math.max(0, 1 - Math.min(1, totalDeals / 1200)).toFixed(3));

    // CTR weighting map (token→weight max over deals)
    const ctrTokenWeight = aggregateCtrWeightOverDeals(ctr, active);

    // Rarity weighting
    const rarity = rarityMap(freq);

    // Rising (category-level, deterministic lift)
    const prevFreqCat = prevSnap?._freqByCat?.[cat] || {};
    const eps = 0.5;
    const weighted = [];
    for (const [w, cur] of Object.entries(freq)) {
      const prev = prevFreqCat[w] || 0;
      const lift = (cur + eps) / (prev + eps);
      const ctrW = ctrTokenWeight[w] || 1.0;
      const score = (rarity[w] || 0) * lift * ctrW;
      weighted.push([w, score, lift, cur]);
    }
    // Sort deterministically
    weighted.sort((a, b) => (b[1] - a[1]) || (b[2] - a[2]) || (b[3] - a[3]) || (a[0] < b[0] ? -1 : 1));

    const topKeywords = weighted.slice(0, 10).map(([w]) => w);

    // Long-tail ngrams (2–3)
    const { grams2, grams3 } = ngramPoolFromTitles(active);
    const longTailScores = [];
    for (const [g, c] of Object.entries(grams2)) {
      const toks = g.split(" ");
      const avgRarity = toks.reduce((s, t) => s + (rarity[t] || 0), 0) / Math.max(1, toks.length);
      const avgCtr = toks.reduce((s, t) => s + (ctrTokenWeight[t] || 1.0), 0) / Math.max(1, toks.length);
      const prevAvg = toks.reduce((s, t) => s + (prevFreqCat[t] || 0), 0) / Math.max(1, toks.length);
      const curAvg = toks.reduce((s, t) => s + (freq[t] || 0), 0) / Math.max(1, toks.length);
      const lift = (curAvg + eps) / (prevAvg + eps);
      const score = avgRarity * lift * avgCtr * Math.log1p(c);
      if (g.length >= 12) longTailScores.push([g, score, lift, c]);
    }
    for (const [g, c] of Object.entries(grams3)) {
      const toks = g.split(" ");
      const avgRarity = toks.reduce((s, t) => s + (rarity[t] || 0), 0) / Math.max(1, toks.length);
      const avgCtr = toks.reduce((s, t) => s + (ctrTokenWeight[t] || 1.0), 0) / Math.max(1, toks.length);
      const prevAvg = toks.reduce((s, t) => s + (prevFreqCat[t] || 0), 0) / Math.max(1, toks.length);
      const curAvg = toks.reduce((s, t) => s + (freq[t] || 0), 0) / Math.max(1, toks.length);
      const lift = (curAvg + eps) / (prevAvg + eps);
      const score = avgRarity * lift * avgCtr * Math.log1p(c);
      if (g.length >= 12) longTailScores.push([g, score, lift, c]);
    }
    longTailScores.sort((a, b) => (b[1] - a[1]) || (b[2] - a[2]) || (b[3] - a[3]) || (a[0] < b[0] ? -1 : 1));
    const longTail = longTailScores.slice(0, 20).map(([g]) => g);

    // Churn (compare slugs)
    const prevSlugsSet = new Set(Object.keys(prevSnap?._slugsByCat?.[cat] || {}).map((k) => k.toLowerCase()));
    const currSlugsSet = slugsSet(active);
    const added = [];
    const removed = [];
    for (const s of currSlugsSet) if (!prevSlugsSet.has(s)) added.push(s);
    for (const s of prevSlugsSet) if (!currSlugsSet.has(s)) removed.push(s);
    const churnBase = Math.max(1, currSlugsSet.size + prevSlugsSet.size);
    const churnRate = +((added.length + removed.length) / churnBase).toFixed(2);

    // Health (size-aware thresholds)
    const health = healthFromSignals({ ctaEntropy, subEntropy, nActive, churnRate });

    // Referral integrity
    const referral = referralStats(active);

    // Global collections
    globalCTAs.push(...active.map((d) => (d.seo?.cta ? String(d.seo.cta) : null)).filter(Boolean));
    globalSubs.push(...active.map((d) => (d.seo?.subtitle ? String(d.seo.subtitle) : null)).filter(Boolean));
    for (const s of currSlugsSet) globalSlugs.add(s);

    // Ranked sample (representativeness)
    const topSet = new Set(topKeywords);
    const sampleRanked = [...active]
      .map((d) => [d, representativenessScore(d, topSet, longTail)])
      .sort((a, b) => (b[1] - a[1]) || (String(a[0].slug) < String(b[0].slug) ? -1 : 1))
      .slice(0, 3)
      .map(([d]) => ({
        slug: d.slug,
        title: d.title,
        cta: d.seo?.cta || null,
        subtitle: d.seo?.subtitle || null,
      }));

    categories[cat] = {
      totalDeals,
      archivedDeals: archived.length,
      titleEntropy,     // 0..1
      ctaEntropy,       // 0..1 (unique/total)
      subEntropy,       // 0..1 (unique/total)
      momentum,         // vs previous snapshot (bounded 0..1)
      scarcity,         // fewer items → closer to 1
      boost: +((titleEntropy * 0.4 + momentum * 0.3 + scarcity * 0.2 + 0.1).toFixed(3)),
      referralIntegrity: referral,
      topKeywords,
      longTail,
      churn: { added, removed, churnRate },
      sample: sampleRanked,
    };
  }

  // Global risers & frequent (TRUE)
  const globalRising = globalRisers(currentFreqGlobal, prevFreqGlobal);
  const topGlobalRisers = globalRising.slice(0, 20).map(({ word, lift, cur, prev }) => ({
    word,
    lift: +lift.toFixed(3),
    cur: +cur.toFixed(3),
    prev: +prev.toFixed(3),
  }));
  const topGlobalFrequent = Object.entries(currentFreqGlobal)
    .map(([w, f]) => [w, f])
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .slice(0, 20)
    .map(([word, freq]) => ({ word, freq: +Number(freq).toFixed(3) }));

  // Global referral integrity (across all active)
  const allActive = Object.values(silos).flat().filter((d) => !d.archived);
  const globalReferral = referralStats(allActive);

  // Global entropy
  const global = {
    totalCategories: Object.keys(categories).length,
    totalActiveDeals: Array.from(globalSlugs).length,
    ctaEntropy: globalCTAs.length ? +(new Set(globalCTAs).size / globalCTAs.length).toFixed(2) : 0,
    subtitleEntropy: globalSubs.length ? +(new Set(globalSubs).size / globalSubs.length).toFixed(2) : 0,
    topGlobalRisers,
    topGlobalFrequent,
    referralIntegrity: globalReferral,
  };

  // Hidden snapshot helpers for next run
  const _freqByCat = {};
  const _slugsByCat = {};
  for (const [cat, items] of Object.entries(silos)) {
    const active = (items || []).filter((d) => !d.archived);
    _freqByCat[cat] = countFreqWeighted(active);
    const set = {};
    for (const d of active) if (d.slug) set[String(d.slug).toLowerCase()] = 1;
    _slugsByCat[cat] = set;
  }

  const result = {
    source: "Insight Pulse v4.1",
    analysedAt: isoNow(),
    durationMs: Date.now() - t0,
    categories,
    global,
    // hidden fields for next diff
    _freqByCat,
    _slugsByCat,
  };

  // Persist + respond
  saveJson(SNAP_PATH, result);
  res.json(result);
}

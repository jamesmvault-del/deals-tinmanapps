// /api/insight.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — Insight Pulse v6.0 (Strict Mode)
// “Pure Analytics • Deterministic • Zero-Influence • CTA/Sub Health Metrics”
//
// STRICT-MODE GUARANTEES:
// • Read-only → NO SEO mutation, NO CTA/subtitle reinforcement, NO ranking influence
// • Zero side effects beyond writing /data/insight-latest.json
// • Pure analytics of category silos → deterministic insights only
//
// INPUT SOURCES (priority order):
//   1) /data/appsumo-*.json
//   2) /data/feed-cache.json
//   3) proxyCache.CACHE (fallback)
//
// OUTPUT:
//   /data/insight-latest.json (diagnostic only)
//
// WHAT THIS ANALYSIS PROVIDES:
// • Category keyword frequencies & long-tail n-grams
// • Global rising keywords vs previous snapshot
// • CTR-assisted weighting (diagnostic only; read-only)
// • Category entropy & health diagnostics
// • Referral integrity stats
// • CTA/Subtitle HEALTH: average length, p95, within-limit %, 2-sentence rate,
//   simple grammar-confidence proxy, duplicated-token checks, variance
// • Archive-aware churn metrics
//
// 100% deterministic / cache-stable / Render-safe.
// ───────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CACHE } from "../lib/proxyCache.js";
import { CTA_ENGINE_VERSION } from "../lib/ctaEngine.js";

// ───────────────────────────── Paths (FIXED) ─────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");
const FEED_PATH = path.join(DATA_DIR, "feed-cache.json");
const CTR_PATH = path.join(DATA_DIR, "ctr-insights.json");
const SNAP_PATH = path.join(DATA_DIR, "insight-latest.json");

// ───────────────────────────── Helpers ─────────────────────────────
function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
function saveJson(p, obj) {
  try { fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8"); } catch {}
}
function listCategoryFiles() {
  try {
    return fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("appsumo-") && f.endsWith(".json"));
  } catch { return []; }
}
function isoNow() { return new Date().toISOString(); }
function clamp01(x){ if(Number.isNaN(x))return 0; return x<0?0:x>1?1:x; }
function log1p(x){ return Math.log(1 + Math.max(0, x)); }
function daysSince(iso){
  if(!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if(Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - t) / (1000*60*60*24));
}

// ───────────────────────────── Load silos (3-tier fallback) ─────────────────────────────
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
      slug: (d.title || "").toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "untitled",
      category: cat,
      seo: {},
      archived: false,
      url: d.url || null,
      referralUrl: d.referralUrl || null,
      image: d.image || null,
    }));
  }
  return out;
}

// ───────────────────────────── Tokenization ─────────────────────────────
const STOP = new Set([
  "the","and","for","you","your","with","from","that","this","are","was","were","but","not","all","any",
  "can","will","into","about","over","our","their","more","most","such","than","then","too","very","via",
  "to","in","on","of","by","at","as","it","its","a","an","or","be","is","am","we","they","them","us",
  "new","best","top","pro","plus","ultra","v","vs"
]);
function stem(w){
  let s = String(w || "").toLowerCase();
  if (STOP.has(s) || s.length <= 2) return "";
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0,-3) + "y";
  else if (s.endsWith("ing") && s.length > 5) s = s.slice(0,-3);
  else if (s.endsWith("ed") && s.length > 4) s = s.slice(0,-2);
  else if (s.endsWith("es") && s.length > 4) s = s.slice(0,-2);
  else if (s.endsWith("s") && s.length > 3)  s = s.slice(0,-1);
  return STOP.has(s) ? "" : s.replace(/[^a-z0-9]+/g, "");
}
function tokenize(text){
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(stem)
    .filter(Boolean);
}
function tokenizeDeal(deal){
  const titleTokens = tokenize(deal.title);
  const subtitleTokens = tokenize(deal?.seo?.subtitle || "");
  const keywordTokens = Array.isArray(deal?.seo?.keywords) ? deal.seo.keywords.map((k)=>tokenize(k)).flat() : [];
  return { titleTokens, subtitleTokens, keywordTokens };
}
function countFreqWeighted(items){
  const freq = {};
  for (const d of items) {
    const { titleTokens, subtitleTokens, keywordTokens } = tokenizeDeal(d);
    for (const t of titleTokens)  freq[t] = (freq[t] || 0) + 1.0;
    for (const t of subtitleTokens) freq[t] = (freq[t] || 0) + 0.6;
    for (const t of keywordTokens) freq[t] = (freq[t] || 0) + 0.6;
  }
  return freq;
}

// ───────────────────────────── N-grams ─────────────────────────────
function buildNgrams(tokens, n=2){
  const grams = {};
  for (let i=0; i+n<=tokens.length; i++){
    const g = tokens.slice(i, i+n).join(" ");
    if (g.length < 4) continue;
    grams[g] = (grams[g] || 0) + 1;
  }
  return grams;
}
function ngramPoolFromTitles(items){
  const grams2={}, grams3={};
  for (const d of items) {
    const t = tokenize(d.title);
    const b2 = buildNgrams(t,2);
    const b3 = buildNgrams(t,3);
    for (const [g,c] of Object.entries(b2)) grams2[g] = (grams2[g] || 0) + c;
    for (const [g,c] of Object.entries(b3)) grams3[g] = (grams3[g] || 0) + c;
  }
  return { grams2, grams3 };
}

// ───────────────────────────── Metrics ─────────────────────────────
function diversity(items, key){
  const vals = items.map((d)=>(d.seo && d.seo[key]) || "").filter(Boolean);
  if (!vals.length) return 0;
  return +(new Set(vals).size / vals.length).toFixed(2);
}
function titleEntropyFrom(items){
  const all = items.map((d)=>String(d.title||"").toLowerCase()).join(" ");
  const tokens = tokenize(all);
  const uniq = new Set(tokens).size;
  const total = Math.max(1, tokens.length);
  return +(Math.min(1, uniq/total).toFixed(3));
}
function rarityMap(freq){
  const out={};
  for (const [w,f] of Object.entries(freq)) out[w] = 1/(f+1);
  return out;
}
function slugsSet(items){
  const s = new Set();
  for (const d of items) if (d.slug) s.add(String(d.slug).toLowerCase());
  return s;
}

// ───────────────────────────── CTR weighting (diagnostic only) ─────────────────────────────
function ctrWeightForSlug(ctr, slug){
  const rec = (ctr && ctr.byDeal && ctr.byDeal[slug]) || null;
  if (!rec) return 1.0;
  const clicks = Math.max(0, Number(rec.clicks || rec.count || 0));
  const last = rec.lastClickAt || rec.last || null;
  const age = daysSince(last);
  const recencyBoost = clamp01(1 - age/30);
  const strength = Math.min(0.5, log1p(clicks)/5);
  return 1 + strength*recencyBoost;
}
function aggregateCtrWeightOverDeals(ctr, items){
  const weights = {};
  for (const d of items) {
    const w = ctrWeightForSlug(ctr, String(d.slug||"").toLowerCase());
    for (const t of tokenize(d.title)) {
      if (!t) continue;
      weights[t] = Math.max(weights[t]||0, w);
    }
  }
  return weights;
}

// ───────────────────────────── Global rising keywords ─────────────────────────────
function globalRisers(currentFreqGlobal, prevFreqGlobal){
  const eps = 0.5;
  const out=[];
  for (const [w,cur] of Object.entries(currentFreqGlobal)) {
    const prev = prevFreqGlobal[w] || 0;
    const lift = (cur+eps)/(prev+eps);
    if (lift <= 1.0) continue;
    out.push({ word:w, lift, cur, prev });
  }
  out.sort((a,b)=> (b.lift-a.lift) || (b.cur-b.cur) || (a.word<b.word?-1:1));
  return out;
}

// ───────────────────────────── Referral integrity ─────────────────────────────
function referralStats(items){
  let masked=0, missing=0, external=0, total=0;
  for (const d of items) {
    total++;
    const r = d.referralUrl || "";
    if (!r) { missing++; continue; }
    if (r.startsWith("/")) masked++;
    else if (/^https?:\/\//i.test(r)) external++;
    else masked++;
  }
  const pct = (x)=> total ? +((x/total).toFixed(2)) : 0;
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

// ───────────────────────────── CTA/SUBTITLE HEALTH ─────────────────────────────
// Light-weight, deterministic heuristics (no external NLP):
function twoSentenceRate(subs){
  if (!subs.length) return 0;
  let ok=0;
  for (const s of subs) {
    const count = (String(s).match(/[.!?]/g) || []).length;
    if (count === 2) ok++;
  }
  return +(ok / subs.length).toFixed(2);
}
function withinLimitRate(list, maxLen){
  if (!list.length) return 0;
  let ok=0;
  for (const s of list) if (String(s).trim().length <= maxLen) ok++;
  return +(ok / list.length).toFixed(2);
}
function avgLen(list){
  if (!list.length) return 0;
  const sum = list.reduce((a,s)=>a+String(s).trim().length,0);
  return +(sum / list.length).toFixed(1);
}
function p95Len(list){
  if (!list.length) return 0;
  const arr = list.map((s)=>String(s).trim().length).sort((a,b)=>a-b);
  const idx = Math.floor(0.95*(arr.length-1));
  return arr[idx] || 0;
}
function dupTokenRate(list){
  if (!list.length) return 0;
  let issues=0;
  const re = /\b(\w+)\s+\1\b/i; // doubled word (e.g., "your your")
  for (const s of list) if (re.test(String(s))) issues++;
  return +(issues / list.length).toFixed(2);
}
function arrowComplianceRate(ctas){
  if (!ctas.length) return 0;
  let ok=0;
  for (const s of ctas) if (String(s).trim().endsWith("→")) ok++;
  return +(ok / ctas.length).toFixed(2);
}
function grammarConfidence(ctas, subs){
  // Simple proxy: starts uppercase, ends correctly, no double-token, basic punctuation balance
  function scoreOne(s, isCTA=false){
    const t = String(s).trim();
    let sc = 1.0;
    if (!t) return 0.0;
    if (!/^[A-Z0-9]/.test(t)) sc -= 0.15;
    if (isCTA) {
      if (!t.endsWith("→")) sc -= 0.2;
      if (t.length > 64) sc -= 0.2;
    } else {
      if (!/[.!?…]$/.test(t)) sc -= 0.1;
      const punct = (t.match(/[.!?…]/g)||[]).length;
      if (punct < 1 || punct > 3) sc -= 0.1;
      if (t.length > 160) sc -= 0.2;
    }
    if (/\b(\w+)\s+\1\b/i.test(t)) sc -= 0.2;
    if (/[“”‘’]/.test(t)) sc -= 0.05; // curly quotes left behind
    if (/[^\x00-\x7F]/.test(t) && !t.includes("→")) sc -= 0.05; // stray unicode (excluding arrow)
    return Math.max(0, +(sc.toFixed(2)));
  }
  if (!ctas.length && !subs.length) return 0;
  const a = ctas.map((s)=>scoreOne(s,true));
  const b = subs.map((s)=>scoreOne(s,false));
  const all = a.concat(b);
  if (!all.length) return 0;
  const avg = all.reduce((x,y)=>x+y,0)/all.length;
  return +avg.toFixed(2);
}
function variance(arr){
  if (!arr.length) return 0;
  const nums = arr.map((s)=>String(s).trim().length);
  const mean = nums.reduce((a,b)=>a+b,0)/nums.length;
  const v = nums.reduce((a,b)=>a+Math.pow(b-mean,2),0)/nums.length;
  return +v.toFixed(1);
}

// ───────────────────────────── Representativeness (diagnostic-only) ─────────────────────────────
function representativenessScore(deal, topKeywordsSet, longTailList){
  let score = 0;
  const title = String(deal.title||"").toLowerCase();
  for (const kw of topKeywordsSet) if (title.includes(kw)) score += 1;
  for (const lt of longTailList) if (title.includes(lt)) score += 1.25;
  if (deal?.seo?.cta) score += 0.25;
  if (deal?.seo?.subtitle) score += 0.25;
  return score;
}

// ───────────────────────────── Core handler ─────────────────────────────
export default async function handler(req, res){
  const t0 = Date.now();

  // Local → feed → CACHE fallback
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

  // Build previous global freq
  const prevFreqGlobal = {};
  for (const freqObj of Object.values(prevSnap._freqByCat || {})) {
    for (const [w,f] of Object.entries(freqObj || {})) {
      prevFreqGlobal[w] = (prevFreqGlobal[w] || 0) + Number(f || 0);
    }
  }

  // ───────────────────────────── Per-category analysis ─────────────────────────────
  const categories = {};
  const globalCTAs = [];
  const globalSubs = [];
  const globalSlugs = new Set();
  const currentFreqGlobal = {};

  for (const [catKey, itemsRaw] of Object.entries(silos)) {
    const cat = String(catKey || "software").toLowerCase();

    const items = (itemsRaw || []).map((d)=>({
      title: d.title || "Untitled",
      slug: d.slug || (d.title || "").toLowerCase().replace(/[^\w\s-]/g,"").trim().replace(/\s+/g,"-"),
      category: (d.category || cat).toLowerCase(),
      seo: d.seo || {},
      archived: !!d.archived,
      url: d.url || d.link || null,
      referralUrl: d.referralUrl || null,
      image: d.image || null,
    }));

    const active = items.filter((d)=>!d.archived);
    const archived = items.filter((d)=>d.archived);
    const nActive = active.length;

    const freq = countFreqWeighted(active);
    for (const [w,f] of Object.entries(freq)) {
      currentFreqGlobal[w] = (currentFreqGlobal[w] || 0) + f;
    }

    const titleEntropy = titleEntropyFrom(active);
    const ctaEntropy = diversity(active, "cta");
    const subEntropy = diversity(active, "subtitle");

    const prevCount = prevSnap?.categories?.[cat]?.totalDeals || 0;
    const momentum = +(Math.min(1, prevCount ? nActive/prevCount : 0.5).toFixed(3));
    const scarcity = +(Math.max(0, 1 - Math.min(1, nActive/1200)).toFixed(3));

    const ctrTokenWeight = aggregateCtrWeightOverDeals(ctr, active);
    const rarity = rarityMap(freq);

    const prevFreqCat = prevSnap?._freqByCat?.[cat] || {};
    const eps = 0.5;

    // Rising keywords (category-level)
    const weighted = [];
    for (const [w,cur] of Object.entries(freq)) {
      const prev = prevFreqCat[w] || 0;
      const lift = (cur+eps)/(prev+eps);
      const ctrW = ctrTokenWeight[w] || 1.0;
      const score = (rarity[w] || 0) * lift * ctrW;
      weighted.push([w, score, lift, cur]);
    }
    weighted.sort((a,b)=> b[1]-a[1] || b[2]-a[2] || b[3]-a[3] || (a[0]<b[0]?-1:1));
    const topKeywords = weighted.slice(0,10).map(([w])=>w);

    // Long-tail n-grams
    const { grams2, grams3 } = ngramPoolFromTitles(active);
    const longTailScores = [];
    function scoreGram(g,c){
      const toks = g.split(" ");
      const avgRarity = toks.reduce((s,t)=> s+(rarity[t]||0),0)/toks.length;
      const avgCtr = toks.reduce((s,t)=> s+(ctrTokenWeight[t]||1.0),0)/toks.length;
      const prevAvg = toks.reduce((s,t)=> s+(prevFreqCat[t]||0),0)/toks.length;
      const curAvg = toks.reduce((s,t)=> s+(freq[t]||0),0)/toks.length;
      const lift = (curAvg+eps)/(prevAvg+eps);
      return avgRarity * lift * avgCtr * Math.log1p(c);
    }
    for (const [g,c] of Object.entries(grams2)) { if (g.length>=12) longTailScores.push([g,scoreGram(g,c)]); }
    for (const [g,c] of Object.entries(grams3)) { if (g.length>=12) longTailScores.push([g,scoreGram(g,c)]); }
    longTailScores.sort((a,b)=> b[1]-a[1] || (a[0]<b[0]?-1:1));
    const longTail = longTailScores.slice(0,20).map(([g])=>g);

    // Churn vs previous snapshot
    const prevSlugs = new Set(Object.keys(prevSnap?._slugsByCat?.[cat] || {}));
    const currSlugs = slugsSet(active);
    const added=[], removed=[];
    for (const s of currSlugs) if (!prevSlugs.has(s)) added.push(s);
    for (const s of prevSlugs) if (!currSlugs.has(s)) removed.push(s);
    const churnRate = +(((added.length + removed.length) / Math.max(1, currSlugs.size + prevSlugs.size))).toFixed(2);

    const referral = referralStats(active);

    // Accumulate CTA/SUB health inputs
    const catCTAs = active.map((d)=> d.seo?.cta).filter(Boolean);
    const catSUBs = active.map((d)=> d.seo?.subtitle).filter(Boolean);
    globalCTAs.push(...catCTAs);
    globalSubs.push(...catSUBs);
    for (const s of currSlugs) globalSlugs.add(s);

    // Health metrics (category)
    const ctaAvg = avgLen(catCTAs);
    const ctaP95 = p95Len(catCTAs);
    const ctaWithin = withinLimitRate(catCTAs, 64);
    const ctaArrow = arrowComplianceRate(catCTAs);
    const ctaDupTok = dupTokenRate(catCTAs);
    const ctaVar = variance(catCTAs);

    const subAvg = avgLen(catSUBs);
    const subP95 = p95Len(catSUBs);
    const subWithin = withinLimitRate(catSUBs, 160);
    const subTwoSent = twoSentenceRate(catSUBs);
    const subDupTok = dupTokenRate(catSUBs);
    const subVar = variance(catSUBs);

    const grammar = grammarConfidence(catCTAs, catSUBs);

    // Sample (diagnostic only)
    const topSet = new Set(topKeywords);
    const sampleRanked = [...active]
      .map((d)=>[d, representativenessScore(d, topSet, longTail)])
      .sort((a,b)=> b[1]-a[1] || (String(a[0].slug) < String(b[0].slug) ? -1 : 1))
      .slice(0,3)
      .map(([d])=>({ slug:d.slug, title:d.title, cta:d.seo?.cta||null, subtitle:d.seo?.subtitle||null }));

    categories[cat] = {
      totalDeals: nActive,
      archivedDeals: archived.length,
      titleEntropy,
      ctaEntropy,
      subEntropy,
      momentum,
      scarcity,
      referralIntegrity: referral,
      topKeywords,
      longTail,
      churn: { added, removed, churnRate },
      ctaHealth: {
        avgLen: ctaAvg, p95Len: ctaP95, within64Pct: ctaWithin, arrowPct: ctaArrow,
        dupTokenPct: ctaDupTok, variance: ctaVar
      },
      subtitleHealth: {
        avgLen: subAvg, p95Len: subP95, within160Pct: subWithin, twoSentencePct: subTwoSent,
        dupTokenPct: subDupTok, variance: subVar
      },
      grammarConfidence: grammar, // 0..1 proxy
      sample: sampleRanked,
    };
  }

  // ───────────────────────────── Global stats ─────────────────────────────
  const globalRising = globalRisers(currentFreqGlobal, prevFreqGlobal);
  const topGlobalRisers = globalRising.slice(0,20).map(({word,lift,cur,prev})=>({
    word, lift:+lift.toFixed(3), cur:+cur.toFixed(3), prev:+prev.toFixed(3)
  }));

  const topGlobalFrequent = Object.entries(currentFreqGlobal)
    .map(([w,f])=>[w,f])
    .sort((a,b)=> b[1]-a[1] || (a[0]<b[0]?-1:1))
    .slice(0,20)
    .map(([word,freq])=>({ word, freq:+Number(freq).toFixed(3) }));

  const allActive = Object.values(silos).flat().filter((d)=>!d.archived);
  const globalReferral = referralStats(allActive);

  // Global health aggregates
  const global = {
    engineVersion: CTA_ENGINE_VERSION || "v10.x",
    totalCategories: Object.keys(categories).length,
    totalActiveDeals: globalSlugs.size,
    ctaEntropy: globalCTAs.length ? +(new Set(globalCTAs).size / globalCTAs.length).toFixed(2) : 0,
    subtitleEntropy: globalSubs.length ? +(new Set(globalSubs).size / globalSubs.length).toFixed(2) : 0,
    ctaHealth: {
      avgLen: avgLen(globalCTAs),
      p95Len: p95Len(globalCTAs),
      within64Pct: withinLimitRate(globalCTAs, 64),
      arrowPct: arrowComplianceRate(globalCTAs),
      dupTokenPct: dupTokenRate(globalCTAs),
      variance: variance(globalCTAs),
    },
    subtitleHealth: {
      avgLen: avgLen(globalSubs),
      p95Len: p95Len(globalSubs),
      within160Pct: withinLimitRate(globalSubs, 160),
      twoSentencePct: twoSentenceRate(globalSubs),
      dupTokenPct: dupTokenRate(globalSubs),
      variance: variance(globalSubs),
    },
    grammarConfidence: grammarConfidence(globalCTAs, globalSubs),
    topGlobalRisers,
    topGlobalFrequent,
    referralIntegrity: globalReferral,
  };

  // ───────────────────────────── Snapshot for next run ─────────────────────────────
  const _freqByCat = {};
  const _slugsByCat = {};
  for (const [cat, items] of Object.entries(silos)) {
    const active = (items || []).filter((d)=>!d.archived);
    _freqByCat[cat] = countFreqWeighted(active);
    const set = {};
    for (const d of active) if (d.slug) set[String(d.slug).toLowerCase()] = 1;
    _slugsByCat[cat] = set;
  }

  const result = {
    source: "Insight Pulse v6.0 (strict)",
    analysedAt: isoNow(),
    durationMs: Date.now() - t0,
    categories,
    global,
    _freqByCat,
    _slugsByCat,
  };

  saveJson(SNAP_PATH, result);
  res.json(result);
}

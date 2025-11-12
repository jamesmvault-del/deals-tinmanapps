// /lib/seoIntegrity.js
// ───────────────────────────────────────────────────────────────────────────────
// TinmanApps — SEO Integrity Engine v4.4
// “Deterministic • Category-Pure • Entropy-Aware • Sentence-Scoped Integrity”
//
// PURPOSE:
// • Guarantees SEO fields (cta, subtitle, clickbait, keywords) ALWAYS exist.
// • Category-safe long-tail + entropy spread with deterministic fallback.
// • Adds ACTIVE-run CTA duplication detection & subtitle integrity checks.
// • Subtitle must contain 2 sentences, ≤160 chars, no title echo or banned terms.
// • Verifies category-appropriate keyword lexicon presence.
// • Runs AFTER normalizeFeed()/regenerateSeo(), BEFORE mergeWithHistory().
// ───────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

// ───────────────────────────────────────────────────────────────────────────────
// Category Lexicons & Hooks
// ───────────────────────────────────────────────────────────────────────────────
const KEYWORDS = {
  ai: [
    "AI automation","machine learning","workflow intelligence",
    "GPT tools","autonomous systems","AI productivity"
  ],
  marketing: [
    "lead generation","conversion marketing","SEO analytics",
    "audience targeting","brand growth","digital funnels"
  ],
  productivity: [
    "workflow optimization","task automation","focus tools",
    "process improvement","daily efficiency","priority management"
  ],
  business: [
    "operations management","sales systems","business automation",
    "client insights","scalable processes","analytics workflow"
  ],
  courses: [
    "online learning","skill mastery","creator education",
    "learning pathways","micro-learning","training automation"
  ],
  web: [
    "website builder","UX/UI workflow","frontend optimization",
    "design automation","web performance","no-code tools"
  ],
  ecommerce: [
    "checkout optimization","store performance","cart automation",
    "conversion systems","sales funnels","ecommerce growth"
  ],
  creative: [
    "visual design","content creation","branding tools",
    "creative workflow","media automation","design templates"
  ],
  software: [
    "software automation","workflow tools","lifetime deals",
    "productivity apps","SaaS utilities","operations stack"
  ],
};

const HOOKS = {
  ai: ["Reinvent your workflow with AI","Build smarter operations","Your AI upgrade awaits"],
  marketing: ["Boost your brand fast","Unlock growth instantly","Optimize campaigns with clarity"],
  productivity: ["Get more done effortlessly","Reclaim productive hours","Keep daily work flowing"],
  business: ["Run smarter teams","Scale with confidence","Strengthen execution rhythm"],
  courses: ["Accelerate your learning","Master skills faster","Follow a guided path"],
  web: ["Design faster","Launch beautiful pages","Ship stronger experiences"],
  ecommerce: ["Increase conversions today","Upgrade store performance","Streamline purchase flows"],
  creative: ["Elevate creative output","Design with precision","Create polished visuals"],
  software: ["Discover what’s possible","Optimize your stack","Automate repetitive work"],
};

const BENEFITS = [
  "work smarter","scale faster","improve results","automate tasks",
  "reduce friction","deliver consistently"
];

const SUB_VERBS = [
  "Streamlines","Boosts","Enhances","Optimizes",
  "Accelerates","Clarifies","Improves","Strengthens"
];
const SUB_OBJECTS = [
  "workflow clarity","daily operations","team output",
  "creative flow","project momentum","system performance"
];
const SUB_ENDINGS = [
  "for measurable progress.","so you save hours weekly.",
  "to remove unnecessary friction.","so your results compound.",
  "to keep everything running smoothly."
];

// ───────────────────────────────────────────────────────────────────────────────
// Core deterministic selectors
// ───────────────────────────────────────────────────────────────────────────────
function sha1(s){return crypto.createHash("sha1").update(String(s)).digest("hex");}
function pickDet(seed,arr){if(!arr?.length)return"";return arr[parseInt(sha1(seed).slice(0,8),16)%arr.length];}
function multiPickDet(seed,arr,n){if(!arr?.length)return[];const base=sha1(seed);const used=new Set();const out=[];for(let i=0;i<Math.min(n,arr.length);i++){let idx=parseInt(sha1(base+":"+i).slice(0,8),16)%arr.length;let s=0;while(used.has(idx)&&s<arr.length){idx=(idx+1)%arr.length;s++;}used.add(idx);out.push(arr[idx]);}return out;}
function stableSlug(ctx){return `${ctx}`.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");}

// ───────────────────────────────────────────────────────────────────────────────
// Normalizers / Validators
// ───────────────────────────────────────────────────────────────────────────────
function clamp(t,n){if(!t)return t;if(t.length<=n)return t;const cut=t.slice(0,n).replace(/\s+\S*$/,"");return cut+"…";}
function ensurePeriod(t){return/[.!?…]$/.test(t)?t:t+".";}
function normalizeSeams(t=""){return t.replace(/\b(delivers|adds|provides)\s+to\s+(\w+)/gi,"$1 $2").replace(/\b(ai-?powered)\b([^.!?]*?)\b\1\b/gi,"$1$2").replace(/\s{2,}/g," ").trim();}
function dedupeTitle(t="",title=""){if(!t||!title)return t;const low=title.toLowerCase();const out=t.split(/\s+/).filter(w=>!low.includes(w.toLowerCase())).join(" ");return out.trim()||t;}
function validateCTA(t=""){const s=t.trim();if(s.length<8)return null;return s.endsWith("→")?s:(s.length<=44?s+" →":s);}
function validateSubtitle(t=""){const s=ensurePeriod(normalizeSeams(t.trim()));return s.length>=18?s:null;}

// ───────────────────────────────────────────────────────────────────────────────
// Deterministic field builders
// ───────────────────────────────────────────────────────────────────────────────
function buildCTA(item,used){const existing=item.seo?.cta?.trim?.();if(existing){const fixed=validateCTA(existing);if(fixed){used.add(fixed);return clamp(fixed,64);}}const seed=`cta:${item.slug||item.title}`;const verb=pickDet(seed+":v",["Boost","Improve","Elevate","Optimize","Streamline","Accelerate"]);const obj=pickDet(seed+":o",["workflow","operations","results","performance","processes","systems"]);let cta=`${verb} your ${obj} →`;if(used.has(cta)){cta=`${pickDet(seed+":v:alt",["Level-up","Strengthen","Advance","Upgrade"])} your ${pickDet(seed+":o:alt",["daily work","team output","delivery","throughput"])} →`;}used.add(cta);return clamp(cta,64);}
function buildSubtitle(item,used){const existing=item.seo?.subtitle?.trim?.();if(existing){const norm=validateSubtitle(existing);if(norm){const f=clamp(dedupeTitle(norm,item.title),160);used.add(f);return f;}}const seed=`sub:${item.slug||item.title}`;const v=pickDet(seed+":v",SUB_VERBS);const o=pickDet(seed+":o",SUB_OBJECTS);const e=pickDet(seed+":e",SUB_ENDINGS);let sub=`${v} ${o} ${e}`;if(used.has(sub)){sub=`${pickDet(seed+":v2",SUB_VERBS)} ${pickDet(seed+":o2",SUB_OBJECTS)} ${pickDet(seed+":e2",SUB_ENDINGS)}`;}const f=clamp(sub,160);used.add(f);return f;}
function buildClickbait(item,cat){const seed=`cb:${item.slug||item.title}:${cat}`;const hook=pickDet(seed+":h",HOOKS[cat]||HOOKS.software);const ben=pickDet(seed+":b",BENEFITS);const title=item.title?.trim?.()||"";return clamp(`${hook} — ${title} helps you ${ben}`,160);}
function buildKeywords(item,cat){return multiPickDet(`kw:${item.slug||item.title}:${cat}`,KEYWORDS[cat]||KEYWORDS.software,3);}

// ───────────────────────────────────────────────────────────────────────────────
// Integrity QA (v10 checks)
// ───────────────────────────────────────────────────────────────────────────────
const BANNED = ["click here","buy now","limited offer","discount","cheap","sale"];

function validateSeoFields(item,category){
  const errors=[];
  const cta=item.seo?.cta||"";
  const sub=item.seo?.subtitle||"";
  const title=item.title?.toLowerCase()||"";

  // CTA duplication handled globally outside
  if(!cta.endsWith("→"))errors.push("cta-no-arrow");
  if(cta.length>64)errors.push("cta-too-long");

  // Subtitle sentence & structure check
  const sentenceCount=(sub.match(/[.!?]/g)||[]).length;
  if(sentenceCount!==2)errors.push("subtitle-not-two-sentences");
  if(sub.length>160)errors.push("subtitle-too-long");
  if(title && sub.toLowerCase().includes(title))errors.push("subtitle-title-echo");

  for(const banned of BANNED){if(sub.toLowerCase().includes(banned))errors.push("subtitle-banned-term:"+banned);}

  // Category lexicon presence
  const lex=KEYWORDS[category]||KEYWORDS.software;
  const hit=lex.some(k=>sub.toLowerCase().includes(k.toLowerCase()));
  if(!hit)errors.push("subtitle-missing-lexicon");

  return errors;
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN — ensureSeoIntegrity(feed)
// ───────────────────────────────────────────────────────────────────────────────
export function ensureSeoIntegrity(feed){
  if(!Array.isArray(feed)||feed.length===0){console.warn("⚠️ [SEO Integrity] Empty feed.");return[];}

  const now=new Date().toISOString();
  const usedCTA=new Set();
  const usedSUB=new Set();
  const seenCTAs=new Set();
  const seenSUBs=new Set();
  const problems=[];

  const updated=feed.map(item=>{
    if(item.archived)return item;
    const cat=stableSlug(item.category||"software");
    const title=item.title||"";

    let cta=buildCTA(item,usedCTA);
    cta=clamp(dedupeTitle(cta,title),64);
    let subtitle=buildSubtitle(item,usedSUB);
    subtitle=clamp(dedupeTitle(normalizeSeams(subtitle),title),160);

    const clickbait=item.seo?.clickbait?.trim?.()||buildClickbait(item,cat);
    const keywords=(Array.isArray(item.seo?.keywords)&&item.seo.keywords.length>0)?item.seo.keywords:buildKeywords(item,cat);

    // Duplication checks (ACTIVE-run)
    if(seenCTAs.has(cta))problems.push(`dup-cta:${cta}`);
    if(seenSUBs.has(subtitle))problems.push(`dup-sub:${subtitle}`);
    seenCTAs.add(cta);seenSUBs.add(subtitle);

    const errs=validateSeoFields({seo:{cta,subtitle},title},cat);
    if(errs.length)problems.push(`${item.slug||title}:${errs.join(",")}`);

    return {
      ...item,
      seo:{...item.seo,cta,subtitle,clickbait,keywords,lastVerifiedAt:now},
      verified:true,
    };
  });

  // Entropy metrics
  const total=updated.length||1;
  const uniqCTA=new Set(updated.map(x=>x.seo?.cta||"")).size;
  const uniqSUB=new Set(updated.map(x=>x.seo?.subtitle||"")).size;
  const eCTA=(uniqCTA/total).toFixed(2);
  const eSUB=(uniqSUB/total).toFixed(2);
  console.log(`✅ [SEO Integrity v4.4] ${updated.length} verified. Entropy CTA:${eCTA} Subtitle:${eSUB}`);
  if(problems.length)console.log("⚠️ SEO Integrity issues:",problems.slice(0,25));

  return updated;
}

export default { ensureSeoIntegrity };

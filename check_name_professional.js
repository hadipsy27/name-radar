#!/usr/bin/env node
/**
 * Name Radar Professional - Enhanced Business Name Checker
 *
 * Professional tool for checking PT/Startup/Company/Domain name availability
 * with comprehensive scoring, validation, and reporting.
 *
 * Features:
 * - Professional business name validation (PT, CV, UD, Firma)
 * - Comprehensive brand scoring and SEO analysis
 * - Executive summary and recommendations
 * - Multi-format reporting (Excel with multiple sheets)
 * - Domain and social media availability checking
 * - Competitor analysis and trademark risk assessment
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');
let pLimit = require('p-limit'); pLimit = pLimit.default || pLimit;
const { parse: parseDomain } = require('tldts');
const fs = require('fs');
const path = require('path');
const whois = require('whois-json');
const dns = require('dns').promises;
const ExcelJS = require('exceljs');
require('dotenv').config();
const { URL } = require('url');

// Import professional modules
const { generateProfessionalReport } = require('./src/modules/reporter');
const { probeSocialMedia, getSocialSummary } = require('./src/modules/social-probe');
const {
  validateBusinessName,
  detectEntityType,
  generateNameVariants,
  checkSEOFriendliness,
  checkMemorability
} = require('./src/utils/validators');
const {
  calculateBrandScore,
  analyzeCompetitors,
  generateExecutiveSummary
} = require('./src/utils/scoring');
const { BUSINESS_TLDS } = require('./src/config/constants');

const SERPAPI_KEY = process.env.SERPAPI_KEY || null;

/* ---------- Utils ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };

const slugLettersDigitsHyphen = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '');

function toDomainBase(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

const safeDomainInfo = (urlStr) => {
  try {
    const u = new URL(urlStr);
    const info = parseDomain(u.hostname);
    const domain = info.domain && info.publicSuffix ? `${info.domain}.${info.publicSuffix}` : u.hostname;
    return { domain, hostname: u.hostname, tld: info.publicSuffix || '', sld: info.domain || '' };
  } catch { return { domain: null, hostname: null, tld: null, sld: null }; }
};

async function fetchPage(url, timeout = 15000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; name-radar-pro/2.0; +https://github.com/hadipsy27/name-radar)' },
      redirect: 'follow', timeout
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch { return null; }
}

function extractTitleAndSnippet(html, maxWords = 60) {
  if (!html) return { title: null, snippet: null };
  const $ = cheerio.load(html);
  const title = ($('title').first().text() || '').trim() || null;

  let snippet = $('meta[name="description"]').attr('content') ||
                $('meta[property="og:description"]').attr('content') || '';
  if (!snippet) {
    const texts = [];
    $('p').each((i, el) => {
      const t = $(el).text().trim();
      if (t) texts.push(t);
      if (texts.join(' ').split(/\s+/).length >= maxWords) return false;
    });
    snippet = (texts.join(' ') || $('body').text() || '')
      .replace(/\s+/g, ' ').trim().split(' ').slice(0, maxWords).join(' ');
  } else {
    snippet = snippet.replace(/\s+/g, ' ').trim().split(' ').slice(0, maxWords).join(' ');
  }
  return { title, snippet: snippet || null };
}

/* ---------- Search engines ---------- */
async function serpapiSearch(query, num = 20, debug = false) {
  if (!SERPAPI_KEY) throw new Error('No SERPAPI_KEY');
  const params = new URLSearchParams({ engine: 'google', q: query, api_key: SERPAPI_KEY, num: String(Math.min(num, 100)) });
  const url = `https://serpapi.com/search.json?${params}`;
  const res = await fetch(url, { timeout: 15000 });
  if (!res.ok) throw new Error(`SerpApi HTTP ${res.status}`);
  const j = await res.json();
  const list = [];
  (j.organic_results || []).forEach(r => { if (r.link) list.push(r.link); else if (r.url) list.push(r.url); });
  if (debug) console.log('[DEBUG] serpapi urls:', list);
  return list.slice(0, num);
}

async function bingScrapeSearch(q, num = 20, debug = false) {
  const take = Math.min(num, 50);
  const urls = [];
  let first = 0;
  for (let page = 0; page < 3 && urls.length < num; page++) {
    const qs = new URLSearchParams({ q, count: String(take), first: String(first) }).toString();
    const url = `https://www.bing.com/search?${qs}`;
    const html = await fetchPage(url);
    if (!html) break;
    const $ = cheerio.load(html);
    $('li.b_algo, .b_algo, ol#b_results > li').each((i, el) => {
      if (urls.length >= num) return false;
      const a = $(el).find('h2 a').attr('href') || $(el).find('a[href^="http"]').attr('href');
      if (a && a.startsWith('http')) urls.push(a);
    });
    first += take;
  }
  const uniq = [...new Set(urls)].slice(0, num);
  if (debug) console.log('[DEBUG] bing urls:', uniq);
  return uniq;
}

async function ddgHtmlSearch(q, num = 20, debug = false) {
  const qs = new URLSearchParams({ q, s: '0' }).toString();
  const url = `https://duckduckgo.com/html/?${qs}`;
  const html = await fetchPage(url);
  if (!html) return [];
  const $ = cheerio.load(html);
  const urls = [];
  $('a.result__a, a.result__url, div.result h2 a').each((i, el) => {
    if (urls.length >= num) return false;
    const href = $(el).attr('href');
    if (href && href.startsWith('http')) urls.push(href);
  });
  const uniq = [...new Set(urls)].slice(0, num);
  if (debug) console.log('[DEBUG] ddg urls:', uniq);
  return uniq;
}

async function searchUrlsForName(name, opts = {}) {
  const { limit = 30, engine = 'auto', debug = false } = opts;
  const quoted = `"${name}"`;
  const query = `intitle:${quoted} OR inurl:${name} OR "${name}"`;

  const tryList = [];
  if (engine === 'serpapi' || engine === 'auto') tryList.push('serpapi');
  if (engine === 'bing'     || engine === 'auto' || engine === 'multi') tryList.push('bing');
  if (engine === 'ddg'      || engine === 'auto' || engine === 'multi') tryList.push('ddg');

  for (const eng of tryList) {
    try {
      if (eng === 'serpapi' && SERPAPI_KEY) {
        const r = await serpapiSearch(query, limit, debug);
        if (r.length) return r;
      } else if (eng === 'bing') {
        const r = await bingScrapeSearch(query, limit, debug);
        if (r.length) return r;
      } else if (eng === 'ddg') {
        const r = await ddgHtmlSearch(query, limit, debug);
        if (r.length) return r;
      }
    } catch (_) { /* continue */ }
  }
  return [];
}

/* ---------- WHOIS / DNS / crt.sh ---------- */
async function checkWhois(domain) {
  try {
    const info = await whois(domain, { follow: 3, timeout: 15000 });
    const raw = JSON.stringify(info).toLowerCase();
    const noMatchPhrases = ['no match for','not found','no data found','no entries found','status: free','domain not found','not registered','no object found'];
    const likelyAvailable = noMatchPhrases.some(p => raw.includes(p));
    return { ok: true, info, likelyAvailable };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function checkDns(domain) {
  try {
    const a = await dns.resolve(domain).catch(() => null);
    if (a && a.length) return { resolves: true, records: a };
    const aaaa = await dns.resolve6(domain).catch(() => null);
    if (aaaa && aaaa.length) return { resolves: true, records: aaaa };
    return { resolves: false, records: [] };
  } catch (e) { return { resolves: false, error: e.message, records: [] }; }
}

async function checkCrtSh(domain) {
  try {
    const q = encodeURIComponent(`%25${domain}`);
    const url = `https://crt.sh/?q=${q}&output=json`;
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    if (!text || text.trim().toLowerCase() === 'no results found') return { ok: true, entries: [] };
    let j; try { j = JSON.parse(text); } catch { return { ok: true, entries: [] }; }
    const entries = (Array.isArray(j) ? j : []).map(it => ({
      common_name: it.common_name, name_value: it.name_value,
      not_before: it.not_before, not_after: it.not_after, id: it.min_cert_id || it.id || null
    }));
    return { ok: true, entries };
  } catch (e) { return { ok: false, error: e.message }; }
}

/* ---------- Social parsing ---------- */
const SOCIAL_PLATFORMS = [
  { hostRe: /(^|\.)instagram\.com$/i,               platform: 'instagram', usernamePathIndex: 1 },
  { hostRe: /(^|\.)tiktok\.com$/i,                  platform: 'tiktok',    usernamePathIndex: 1 },
  { hostRe: /(^|\.)twitter\.com$|(^|\.)x\.com$/i,   platform: 'twitter',   usernamePathIndex: 1 },
  { hostRe: /(^|\.)facebook\.com$/i,                platform: 'facebook',  usernamePathIndex: 1 },
  { hostRe: /(^|\.)youtube\.com$/i,                 platform: 'youtube',   usernamePathIndex: 1 },
  { hostRe: /(^|\.)linktr\.ee$/i,                   platform: 'linktree',  usernamePathIndex: 1 },
  { hostRe: /(^|\.)msha\.ke$/i,                     platform: 'milkshake', usernamePathIndex: 1 },
  { hostRe: /(^|\.)github\.com$/i,                  platform: 'github',    usernamePathIndex: 1 },
  { hostRe: /(^|\.)behance\.net$/i,                 platform: 'behance',   usernamePathIndex: 1 },
  { hostRe: /(^|\.)medium\.com$/i,                  platform: 'medium',    usernamePathIndex: 1 },
  { hostRe: /(^|\.)linkedin\.com$/i,                platform: 'linkedin',  usernamePathIndex: 1 },
];

function extractSocialUsername(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (/linkedin\.com$/.test(host)) {
      const head = pathParts[0] || '';
      const map = new Set(['in','company','school','showcase']);
      const uidx = map.has(head) ? 1 : 0;
      let username = pathParts[uidx] || '';
      if (username.startsWith('@')) username = username.slice(1);
      return { platform: 'linkedin', username: username || null };
    }

    for (const p of SOCIAL_PLATFORMS) {
      if (p.platform === 'linkedin') continue;
      if (p.hostRe.test(host)) {
        let username = pathParts[p.usernamePathIndex] || '';
        if (username.startsWith('@')) username = username.slice(1);
        if (/youtube\.com$/.test(host)) {
          if (pathParts[0] === '@') username = pathParts[1] || username;
          if (pathParts[0] === 'channel' || pathParts[0] === 'c') username = pathParts[1] || username;
        }
        if (/facebook\.com$/.test(host) && username.includes('.php')) username = '';
        return { platform: p.platform, username: username || null };
      }
    }
    return { platform: null, username: null };
  } catch { return { platform: null, username: null }; }
}

/* ---------- Matching ---------- */
function classifyMatch(nameRaw, result) {
  const q = slugLettersDigitsHyphen(nameRaw);
  const titleSlug = slugLettersDigitsHyphen(result.title || '');
  const sldSlug = slugLettersDigitsHyphen(result.sld || '');

  if (sldSlug && sldSlug === q) return { type: 'exact_domain', score: 100 };
  if (sldSlug && (sldSlug.includes(q) || q.includes(sldSlug))) return { type: 'domain_contains', score: 80 };

  const soc = extractSocialUsername(result.url);
  if (soc.username) {
    const userSlug = slugLettersDigitsHyphen(soc.username);
    if (userSlug === q) return { type: 'social_exact', score: 90, social: soc };
    if (userSlug.includes(q) || q.includes(userSlug)) return { type: 'social_contains', score: 70, social: soc };
  }

  const orgTitle = /(^|\b)(pt|cv|inc|ltd|llc|company|perusahaan|studio|ventures|labs)\b/i.test(result.title || '');
  if (titleSlug === q && orgTitle) return { type: 'org_title_exact', score: 75 };
  if (titleSlug.includes(q) && orgTitle) return { type: 'org_title_contains', score: 60 };

  return { type: 'mention', score: 20 };
}

/* ---------- Candidate domains ---------- */
function buildCandidateDomains(name) {
  const base = toDomainBase(name);
  const allTLDs = [...BUSINESS_TLDS.global, ...BUSINESS_TLDS.indonesia, ...BUSINESS_TLDS.startup];
  const uniqueTLDs = [...new Set(allTLDs)];
  const candidates = [];
  for (const tld of uniqueTLDs) candidates.push(`${base}.${tld}`);
  return [...new Set(candidates)];
}

/* ---------- Process URL ---------- */
async function processUrlForName(name, u, idx, concurrency) {
  await sleep(120 * (idx % concurrency));
  const html = await fetchPage(u);
  const { title, snippet } = extractTitleAndSnippet(html, 80);
  const dn = safeDomainInfo(u);

  const base = {
    url: u, domain: dn.domain, hostname: dn.hostname, tld: dn.tld, sld: dn.sld,
    title, snippet, match_type: 'unknown', match_score: 0,
    social_platform: null, social_username: null,
    whois: null, dns: null, crt: null,
    origin: 'search'
  };

  const cls = classifyMatch(name, { ...dn, url: u, title });
  base.match_type = cls.type;
  base.match_score = cls.score || 0;
  if (cls.social) {
    base.social_platform = cls.social.platform;
    base.social_username = cls.social.username;
  }
  return base;
}

/* ---------- Core per-name ---------- */
async function findNameUsage(name, options = {}) {
  const {
    limit = 40, concurrency = 6,
    doWhois = true, doCrt = true, allowMentions = false, strict = false,
    engine = 'auto', debug = false, probe = 'auto', onlyFound = true
  } = options;

  const limitFn = pLimit(concurrency);

  console.log(`\n🔍 Analyzing: "${name}"`);
  console.log('━'.repeat(60));

  // Professional validation
  const entityType = detectEntityType(name);
  if (entityType) {
    console.log(`📋 Entity Type Detected: ${entityType}`);
  }

  const validation = validateBusinessName(name, entityType);
  if (validation.errors.length > 0) {
    console.log('\n⚠️  VALIDATION ERRORS:');
    validation.errors.forEach(err => console.log(`   ❌ ${err}`));
  }
  if (validation.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    validation.warnings.forEach(warn => console.log(`   ⚠️  ${warn}`));
  }

  // 0) Direct probe
  console.log('\n🌐 Probing domains...');
  let probeResults = [];
  if (probe === 'always' || probe === 'auto') {
    const candidates = buildCandidateDomains(name);
    console.log(`   Checking ${candidates.length} domain variations`);
    const checks = candidates.map(d => limitFn(async () => {
      const dn = { domain: d, hostname: d, tld: d.split('.').slice(1).join('.'), sld: d.split('.')[0] };
      const r = {
        url: `http://${d}`, domain: d, hostname: d, tld: dn.tld, sld: dn.sld,
        title: null, snippet: null, match_type: 'exact_domain', match_score: 100,
        social_platform: null, social_username: null, whois: null, dns: null, crt: null,
        origin: 'probe'
      };
      r.whois = doWhois ? await checkWhois(d).catch(e => ({ ok:false, error:e.message })) : null;
      r.dns   =            await checkDns(d).catch(e   => ({ resolves:false, error:e.message, records:[] }));
      r.crt   = doCrt   ? await checkCrtSh(d).catch(e => ({ ok:false, error:e.message })) : null;
      return r;
    }));
    probeResults = await Promise.all(checks);
  }

  // 1) Search
  console.log('\n🔎 Searching web...');
  const urls = await searchUrlsForName(name, { limit, engine, debug });
  console.log(`   Found ${urls.length} URLs to analyze`);

  const processed = await Promise.all(
    urls.map((u, i) => limitFn(() => processUrlForName(name, u, i, concurrency)))
  );

  let combined = [...probeResults, ...processed];

  // 2) Filter
  combined = combined.filter(r => {
    if (!allowMentions && r.match_type === 'mention') return false;
    if (strict) return ['exact_domain','social_exact','org_title_exact'].includes(r.match_type);
    return ['exact_domain','domain_contains','social_exact','social_contains','org_title_exact','org_title_contains'].includes(r.match_type);
  });

  // 3) Dedupe
  const seen = new Set();
  const dedup = [];
  for (const r of combined.sort((a,b) => b.match_score - a.match_score)) {
    const key = (r.match_type.startsWith('social') && r.social_platform && r.social_username)
      ? `${r.social_platform}:${r.social_username}`.toLowerCase()
      : (r.domain || r.hostname || r.url || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    dedup.push(r);
  }

  // 4) Enrichment for search results
  console.log('\n📊 Enriching data (WHOIS, DNS, Certificates)...');
  for (const r of dedup) {
    if (probeResults.find(pr => pr.domain === r.domain)) continue;
    if (r.domain) {
      if (doWhois) r.whois = await checkWhois(r.domain).catch(e => ({ ok: false, error: e.message }));
      r.dns = await checkDns(r.domain).catch(e => ({ resolves: false, error: e.message, records: [] }));
      if (doCrt) r.crt = await checkCrtSh(r.domain).catch(e => ({ ok: false, error: e.message }));
      await sleep(100);
    }
  }

  // 4.5) Direct Social Media Probing
  console.log('\n📱 Verifying social media accounts...');
  const cleanName = toDomainBase(name); // Get clean version for social media
  const socialProbeResults = await probeSocialMedia(cleanName, {
    platforms: ['instagram', 'facebook', 'youtube', 'twitter', 'tiktok', 'linkedin', 'github'],
    delay: 800,
    debug
  });

  // Create social media result entries for platforms found in probe
  const socialResults = [];
  Object.entries(socialProbeResults).forEach(([platform, probeData]) => {
    // Check if we already have this from search results
    const existingResult = dedup.find(r =>
      r.social_platform === platform && r.social_username === cleanName
    );

    if (existingResult) {
      // Update existing result with verified probe data
      existingResult.social_verified = true;
      existingResult.social_probe_status = probeData.status;
      existingResult.social_probe_confidence = probeData.confidence;
      existingResult.social_exists = probeData.exists;
    } else {
      // Create new result entry for this social platform
      const socialResult = {
        url: probeData.url,
        domain: null,
        hostname: null,
        tld: null,
        sld: null,
        title: null,
        snippet: null,
        match_type: probeData.status === 'taken' ? 'social_exact' : 'social_probe',
        match_score: probeData.status === 'taken' ? 90 : 0,
        social_platform: platform,
        social_username: cleanName,
        social_verified: true,
        social_probe_status: probeData.status,
        social_probe_confidence: probeData.confidence,
        social_exists: probeData.exists,
        whois: null,
        dns: null,
        crt: null,
        origin: 'social_probe'
      };

      // Only add if status is 'taken' or we want to show all candidates
      if (probeData.status === 'taken' || !onlyFound) {
        socialResults.push(socialResult);
      }
    }
  });

  // Merge social results
  const allResults = [...dedup, ...socialResults];

  // 5) Filter results with evidence
  const filtered = [];
  for (const r of allResults) {
    const sources = computeUsageSources(r);
    if (!onlyFound || sources.length > 0) filtered.push(r);
  }

  console.log(`\n✅ Analysis complete: ${filtered.length} results found`);

  return { name, found: filtered.length, results: filtered, socialProbeResults };
}

/* ---------- usage_detected_from ---------- */
function computeUsageSources(r) {
  const sources = [];
  const whoisOk = r.whois && r.whois.ok;
  const whoisLikely = whoisOk ? !!r.whois.likelyAvailable : false;
  const dnsResolves = r.dns && r.dns.resolves ? true : false;
  const crtCount = (r.crt && r.crt.ok && Array.isArray(r.crt.entries)) ? r.crt.entries.length : 0;

  if (whoisOk && !whoisLikely) sources.push('WHOIS');
  if (dnsResolves) sources.push('DNS');
  if (crtCount > 0) sources.push('crt.sh');
  if (r.match_type === 'social_exact' || r.match_type === 'social_contains') sources.push('social');
  if (r.match_type === 'org_title_exact' || r.match_type === 'org_title_contains') sources.push('org_title');
  if (r.match_type === 'exact_domain' || r.match_type === 'domain_contains') sources.push('domain_present');
  if (r.origin === 'search') sources.push('search_hit');
  if (r.origin === 'probe')  sources.push('probe_hit');

  return sources;
}

/* ---------- CLI ---------- */
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     NAME RADAR PROFESSIONAL - Business Name Analyzer      ║');
  console.log('║          PT / Startup / Company / Domain Checker          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const argv = process.argv.slice(2);
  const flags = {};
  let positionalName = null;

  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v === undefined ? true : v;
    } else if (!positionalName) {
      positionalName = a;
    }
  }

  const inputFile = flags.input || null;
  const limit = parseInt(flags.limit || '30', 10);
  const engine = flags.engine || 'auto';
  const probe = flags.probe || 'auto';
  const out = flags.out || null;
  const doWhois = !flags['no-whois'];
  const doCrt = !flags['no-crt'];
  const strict = !!flags['strict'];
  const allowMentions = !!flags['allow-mentions'];
  const debug = !!flags['debug'];
  const onlyFound = !flags['show-candidates'];
  const professionalReport = !flags['no-professional-report'];

  let names = [];
  if (inputFile) {
    if (!fs.existsSync(inputFile)) { console.error(`❌ Input file not found: ${inputFile}`); process.exit(1); }
    const content = fs.readFileSync(inputFile, 'utf8');
    names = content
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('#'));
    if (!names.length) { console.error('❌ No valid names in input file.'); process.exit(1); }
  } else if (positionalName) {
    names = [positionalName];
  } else {
    console.log('Usage:');
    console.log('  node check_name_professional.js "YourBusinessName" [options]');
    console.log('  node check_name_professional.js --input=names.txt [options]');
    console.log('\nOptions:');
    console.log('  --limit=N              Number of search results (default: 30)');
    console.log('  --engine=auto|multi    Search engine (default: auto)');
    console.log('  --probe=auto|always    Domain probing (default: auto)');
    console.log('  --out=report.xlsx      Output file path');
    console.log('  --strict               Only exact matches');
    console.log('  --no-whois             Skip WHOIS checks');
    console.log('  --no-crt               Skip certificate transparency checks');
    console.log('  --no-professional-report  Skip professional report generation');
    console.log('  --debug                Enable debug mode');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Mode: ${inputFile ? 'BULK' : 'SINGLE'}`);
  console.log(`  Search limit: ${limit}`);
  console.log(`  Engine: ${engine}`);
  console.log(`  Professional reports: ${professionalReport ? 'Enabled' : 'Disabled'}`);
  console.log('');

  ensureDir('./reports');

  for (const name of names) {
    try {
      const res = await findNameUsage(name, { limit, doWhois, doCrt, strict, allowMentions, engine, debug, probe, onlyFound });
      res.results.forEach(r => r.query_name = name);

      // Generate professional report
      if (professionalReport) {
        console.log('\n📝 Generating professional report...');
        const outputPath = out || `./reports/${name.replace(/[^a-z0-9_-]/gi, '_')}_analysis.xlsx`;
        const report = await generateProfessionalReport(name, res.results, { outputPath });

        console.log('\n' + '═'.repeat(60));
        console.log('📊 ANALYSIS SUMMARY');
        console.log('═'.repeat(60));
        console.log(`Overall Score: ${report.brandScore.overall}/100 (${report.brandScore.grade})`);
        console.log(`Recommendation: ${report.executiveSummary.recommendation}`);
        console.log('\nKey Findings:');
        report.executiveSummary.keyFindings.forEach(f => console.log(`  ${f}`));
        console.log('\n📄 Detailed report saved to:');
        console.log(`   ${report.outputPath}`);
        console.log('═'.repeat(60));
      }

    } catch (e) {
      console.error(`\n❌ Error analyzing "${name}":`, e.message);
      if (debug) console.error(e.stack);
    }
  }

  console.log('\n✅ All analyses complete!\n');
}

if (require.main === module) main();

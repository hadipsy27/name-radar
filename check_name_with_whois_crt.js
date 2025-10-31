/**
 * check_name_with_whois_crt.js — All-in-One (Excel output)
 *
 * Fitur:
 * - Single & Bulk (--input=names.txt)
 * - Multi-engine search: SerpApi (opsional via .env), Bing scraping, DuckDuckGo HTML
 * - Direct Probe kandidat domain populer (.com .net .org .io .co .id .co.id .ai .app .dev)
 * - Filter ketat (exact domain / social username / org title) + --strict / --allow-mentions
 * - Enrichment: WHOIS, DNS, crt.sh
 * - Output: Excel .xlsx (stabil per kolom; auto-filter; auto width)
 * - Debug mode
 *
 * Contoh:
 *   node check_name_with_whois_crt.js "LinkPulse" --engine=multi --probe=always --limit=30 --strict --debug --out=linkpulse.xlsx
 *   node check_name_with_whois_crt.js --input=names.txt --engine=multi --probe=auto --limit=25 --strict --combine-xlsx=all.xlsx
 *   node check_name_with_whois_crt.js --input=names.txt --outdir-xlsx=out_xlsx
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');
// p-limit ESM default export fix (works with v3 or v5):
let pLimit = require('p-limit'); pLimit = pLimit.default || pLimit;

const { parse: parseDomain } = require('tldts');
const fs = require('fs');
const path = require('path');
const whois = require('whois-json');
const dns = require('dns').promises;
const ExcelJS = require('exceljs');
require('dotenv').config();
const { URL } = require('url');

const SERPAPI_KEY = process.env.SERPAPI_KEY || null;

/* ---------- Utils ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
const slugLettersDigits = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{Letter}\p{Number}]+/gu, '');
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
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; name-radar/1.5; +https://example.com)' },
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

/* ---------- Search: SerpApi / Bing / DuckDuckGo ---------- */
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
  { hostRe: /(^|\.)medium\.com$/i,                  platform: 'medium',    usernamePathIndex: 1 }
];

function extractSocialUsername(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    const pathParts = url.pathname.split('/').filter(Boolean);
    for (const p of SOCIAL_PLATFORMS) {
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

/* ---------- Matching rules ---------- */
function classifyMatch(nameRaw, result) {
  const q = slugLettersDigits(nameRaw);
  const titleSlug = slugLettersDigits(result.title || '');
  const sldSlug = slugLettersDigits(result.sld || '');

  if (sldSlug && sldSlug === q) return { type: 'exact_domain', score: 100 };
  if (sldSlug && (sldSlug.includes(q) || q.includes(sldSlug))) return { type: 'domain_contains', score: 80 };

  const soc = extractSocialUsername(result.url);
  if (soc.username) {
    const userSlug = slugLettersDigits(soc.username);
    if (userSlug === q) return { type: 'social_exact', score: 90, social: soc };
    if (userSlug.includes(q) || q.includes(userSlug)) return { type: 'social_contains', score: 70, social: soc };
  }

  const orgTitle = /(^|\b)(pt|cv|inc|ltd|llc|company|perusahaan|studio|ventures|labs)\b/i.test(result.title || '');
  if (titleSlug === q && orgTitle) return { type: 'org_title_exact', score: 75 };
  if (titleSlug.includes(q) && orgTitle) return { type: 'org_title_contains', score: 60 };

  return { type: 'mention', score: 20 };
}

/* ---------- Candidate domain probe ---------- */
const COMMON_TLDS = ['com','net','org','io','co','id','co.id','ai','app','dev'];
function buildCandidateDomains(name) {
  const base = slugLettersDigits(name);
  const variants = [base, base.replace(/-+/g,'')].filter(Boolean);
  const candidates = [];
  for (const s of variants) for (const tld of COMMON_TLDS) candidates.push(`${s}.${tld}`);
  return [...new Set(candidates)];
}

/* ---------- Process URL for one name ---------- */
async function processUrlForName(name, u, idx, concurrency) {
  await sleep(120 * (idx % concurrency));
  const html = await fetchPage(u);
  const { title, snippet } = extractTitleAndSnippet(html, 80);
  const dn = safeDomainInfo(u);

  const base = {
    url: u, domain: dn.domain, hostname: dn.hostname, tld: dn.tld, sld: dn.sld,
    title, snippet, match_type: 'unknown', match_score: 0,
    social_platform: null, social_username: null,
    whois: null, dns: null, crt: null
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
    engine = 'auto', debug = false, probe = 'auto'
  } = options;

  const limitFn = pLimit(concurrency);

  // 0) Direct probe (exact domains)
  let probeResults = [];
  if (probe === 'always' || probe === 'auto') {
    const candidates = buildCandidateDomains(name);
    const checks = candidates.map(d => limitFn(async () => {
      const dn = { domain: d, hostname: d, tld: d.split('.').slice(1).join('.'), sld: d.split('.')[0] };
      const r = {
        url: `http://${d}`, domain: d, hostname: d, tld: dn.tld, sld: dn.sld,
        title: null, snippet: null, match_type: 'exact_domain', match_score: 100,
        social_platform: null, social_username: null, whois: null, dns: null, crt: null
      };
      r.whois = doWhois ? await checkWhois(d).catch(e => ({ ok:false, error:e.message })) : null;
      r.dns   =            await checkDns(d).catch(e   => ({ resolves:false, error:e.message, records:[] }));
      r.crt   = doCrt   ? await checkCrtSh(d).catch(e => ({ ok:false, error:e.message })) : null;
      return r;
    }));
    probeResults = await Promise.all(checks);
    if (debug) console.log('[DEBUG] probe domains:', candidates);
  }

  // 1) Search
  const urls = await searchUrlsForName(name, { limit, engine, debug });
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

  // 3) Dedupe (prioritaskan skor tinggi)
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

  // 4) Enrichment untuk hasil dari search (probe sudah enriched)
  for (const r of dedup) {
    if (probeResults.find(pr => pr.domain === r.domain)) continue;
    if (r.domain) {
      if (doWhois) r.whois = await checkWhois(r.domain).catch(e => ({ ok: false, error: e.message }));
      r.dns = await checkDns(r.domain).catch(e => ({ resolves: false, error: e.message, records: [] }));
      if (doCrt) r.crt = await checkCrtSh(r.domain).catch(e => ({ ok: false, error: e.message }));
      await sleep(100);
    }
    if (debug) console.log('[DEBUG] match', { type: r.match_type, score: r.match_score, domain: r.domain, url: r.url });
  }

  return { name, found: dedup.length, results: dedup };
}

/* ---------- Row mapping & availability heuristic ---------- */
function mapRows(results) {
  return results.map(r => {
    const whoisOk = r.whois && r.whois.ok;
    const whoisLikely = whoisOk ? !!r.whois.likelyAvailable : false;
    const dnsResolves = r.dns && r.dns.resolves ? true : false;
    const crtCount = (r.crt && r.crt.ok && Array.isArray(r.crt.entries)) ? r.crt.entries.length : 0;
    const available = !!(whoisLikely && !dnsResolves && crtCount === 0);

    return {
      query_name: r.query_name || '',
      domain: r.domain || '',
      tld: r.tld || '',
      hostname: r.hostname || '',
      url: r.url || '',
      title: (r.title || '').trim(),
      snippet: (r.snippet || '').trim(),
      resolves: dnsResolves ? 'yes' : 'no',
      whois_available_guess: whoisOk
        ? (whoisLikely ? 'likely' : 'taken_or_unknown')
        : (r.whois && r.whois.error ? `err:${r.whois.error}` : ''),
      crt_count: crtCount,
      match_type: r.match_type || '',
      match_score: r.match_score || 0,
      social_platform: r.social_platform || '',
      social_username: r.social_username || '',
      available: available
    };
  });
}

/* ---------- Excel helpers ---------- */
const EXCEL_COLUMNS = [
  { header: 'query_name', key: 'query_name' },
  { header: 'domain', key: 'domain' },
  { header: 'tld', key: 'tld' },
  { header: 'hostname', key: 'hostname' },
  { header: 'url', key: 'url' },
  { header: 'title', key: 'title' },
  { header: 'snippet', key: 'snippet' },
  { header: 'resolves', key: 'resolves' },
  { header: 'whois_available_guess', key: 'whois_available_guess' },
  { header: 'crt_count', key: 'crt_count' },
  { header: 'match_type', key: 'match_type' },
  { header: 'match_score', key: 'match_score' },
  { header: 'social_platform', key: 'social_platform' },
  { header: 'social_username', key: 'social_username' },
  { header: 'available', key: 'available' }
];

function autosizeColumns(worksheet, rows, min = 10, max = 80) {
  worksheet.columns.forEach(col => {
    const key = col.key;
    let longest = col.header ? String(col.header).length : 10;
    rows.forEach(r => {
      const v = r[key];
      const len = v == null ? 0 : String(v).length;
      if (len > longest) longest = len;
    });
    col.width = Math.max(min, Math.min(max, longest + 2));
  });
  // freeze first row and set autofilter
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: EXCEL_COLUMNS.length }
  };
}

async function writePerNameXlsx(outdir, name, rows) {
  ensureDir(outdir);
  const outPath = path.join(outdir, `${(name || 'result').replace(/[^a-z0-9_-]+/gi,'_')}.xlsx`);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('results');
  ws.columns = EXCEL_COLUMNS;
  ws.addRows(rows);
  autosizeColumns(ws, rows);
  await wb.xlsx.writeFile(outPath);
  return outPath;
}

async function writeCombinedXlsx(xlsxPath, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('all_results');
  ws.columns = EXCEL_COLUMNS;
  ws.addRows(rows);
  autosizeColumns(ws, rows);
  await wb.xlsx.writeFile(xlsxPath);
  return xlsxPath;
}

async function writeSingleXlsx(outPath, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('results');
  ws.columns = EXCEL_COLUMNS;
  ws.addRows(rows);
  autosizeColumns(ws, rows);
  await wb.xlsx.writeFile(outPath);
  return outPath;
}

/* ---------- CLI ---------- */
async function main() {
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
  const engine = flags.engine || 'auto'; // auto|serpapi|bing|ddg|multi
  const probe = flags.probe || 'auto';   // auto|always|off
  const out = flags.out || null;         // if endsWith .xlsx => write excel
  const outdirXlsx = flags['outdir-xlsx'] || null;
  const combineXlsx = flags['combine-xlsx'] || null;
  const doWhois = !flags['no-whois'];
  const doCrt = !flags['no-crt'];
  const strict = !!flags['strict'];
  const allowMentions = !!flags['allow-mentions'];
  const debug = !!flags['debug'];

  let names = [];
  if (inputFile) {
    if (!fs.existsSync(inputFile)) {
      console.error(`Input file not found: ${inputFile}`); process.exit(1);
    }
    const content = fs.readFileSync(inputFile, 'utf8');
    names = content.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
    if (!names.length) { console.error('No valid names in input file.'); process.exit(1); }
  } else if (positionalName) {
    names = [positionalName];
  } else {
    console.log('Usage:\n  node check_name_with_whois_crt.js "NameString" [--limit=30] [--engine=auto|serpapi|bing|ddg|multi] [--probe=auto|always|off] [--out=file.xlsx] [--no-whois] [--no-crt] [--strict] [--allow-mentions] [--debug]\n  node check_name_with_whois_crt.js --input=names.txt [--combine-xlsx=all.xlsx | --outdir-xlsx=out_xlsx] [same flags]');
    process.exit(1);
  }

  console.log(`Mode: ${inputFile ? 'BULK' : 'SINGLE'} | limit=${limit} | engine=${engine} | probe=${probe} | whois=${doWhois} | crt=${doCrt} | strict=${strict} | allowMentions=${allowMentions}`);
  if (inputFile) console.log(`Input file: ${inputFile}`);

  const allRowsForCombined = [];
  for (const name of names) {
    console.log(`\n>>> Checking: "${name}"`);
    try {
      const res = await findNameUsage(name, { limit, doWhois, doCrt, strict, allowMentions, engine, debug, probe });
      res.results.forEach(r => r.query_name = name);
      const rows = mapRows(res.results);

      console.log(JSON.stringify({ meta: { name, engine, limit, found: res.found } }, null, 2));

      if (inputFile) {
        if (combineXlsx) allRowsForCombined.push(...rows);
        if (outdirXlsx) {
          const p = await writePerNameXlsx(outdirXlsx, name, rows);
          console.log(`Saved XLSX: ${p}`);
        }
      } else if (out && out.toLowerCase().endsWith('.xlsx')) {
        const p = await writeSingleXlsx(out, rows);
        console.log(`Saved XLSX: ${p}`);
      }
    } catch (e) {
      console.error(`Error on "${name}":`, e.message);
    }
  }

  if (inputFile && combineXlsx) {
    const p = await writeCombinedXlsx(combineXlsx, allRowsForCombined);
    console.log(`\nSaved combined XLSX: ${p}  (total rows: ${allRowsForCombined.length})`);
  }
}

if (require.main === module) main();

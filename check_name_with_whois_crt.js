/**
 * check_name_with_whois_crt.js (focused match: domain / social username / org title)
 *
 * Run examples:
 *   # single
 *   node check_name_with_whois_crt.js "ayocekdisini" --limit=30 --strict
 *
 *   # bulk
 *   node check_name_with_whois_crt.js --input=names.txt --limit=25 --combine-csv=all.csv --strict
 *
 * Flags:
 *   --mode=auto|serpapi|scrape
 *   --limit=NUMBER
 *   --out=file.csv (single mode)
 *   --outdir=out_csv (bulk: CSV per nama)
 *   --combine-csv=all.csv (bulk: satu CSV gabungan)
 *   --no-whois  --no-crt
 *   --strict  (hanya exact match di domain/username/title)
 *   --allow-mentions (izinkan hasil yang hanya “menyebut” di body; default: buang)
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');
// p-limit ESM default export fix:
let pLimit = require('p-limit'); pLimit = pLimit.default || pLimit;

const { parse: parseDomain } = require('tldts');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const whois = require('whois-json');
const dns = require('dns').promises;
require('dotenv').config();
const { URL } = require('url');

const SERPAPI_KEY = process.env.SERPAPI_KEY || null;

/* ---------- Utils ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
const slugify = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{Letter}\p{Number}]+/gu, '').trim();

function safeDomainInfo(urlStr) {
  try {
    const u = new URL(urlStr);
    const info = parseDomain(u.hostname);
    const domain = info.domain && info.publicSuffix ? `${info.domain}.${info.publicSuffix}` : u.hostname;
    return { domain, hostname: u.hostname, tld: info.publicSuffix || '', sld: info.domain || '' };
  } catch { return { domain: null, hostname: null, tld: null, sld: null }; }
}

async function fetchPage(url, timeout = 15000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; name-radar/1.2; +https://example.com)' },
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
  // Gunakan meta description kalau ada, JANGAN pakai preview Google
  let snippet = $('meta[name="description"]').attr('content') ||
                $('meta[property="og:description"]').attr('content') || '';
  if (!snippet) {
    // ambil paragraf awal (ringkas)
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

/* ---------- Search ---------- */
async function serpapiSearch(query, num = 20) {
  if (!SERPAPI_KEY) throw new Error('No SERPAPI_KEY');
  const params = new URLSearchParams({ engine: 'google', q: query, api_key: SERPAPI_KEY, num: String(Math.min(num, 100)) });
  const url = `https://serpapi.com/search.json?${params}`;
  const res = await fetch(url, { timeout: 15000 });
  if (!res.ok) throw new Error(`SerpApi HTTP ${res.status}`);
  const j = await res.json();
  const list = [];
  (j.organic_results || []).forEach(r => { if (r.link) list.push(r.link); else if (r.url) list.push(r.url); });
  return list.slice(0, num);
}

async function bingScrapeSearch(q, num = 20) {
  const qs = encodeURIComponent(q);
  const url = `https://www.bing.com/search?q=${qs}&count=${Math.min(num, 50)}`;
  const html = await fetchPage(url);
  if (!html) return [];
  const $ = cheerio.load(html);
  const urls = [];
  $('.b_algo').each((i, el) => {
    if (urls.length >= num) return false;
    const a = $(el).find('h2 a').attr('href') || $(el).find('a').attr('href');
    if (a && a.startsWith('http')) urls.push(a);
  });
  return urls.slice(0, num);
}

async function searchUrlsForName(name, opts = {}) {
  const { mode = 'auto', limit = 30 } = opts;
  const quoted = `"${name}"`;
  // Fokus ke title & url; intext tetap, tapi nanti disaring.
  const query = `intitle:${quoted} OR inurl:${name} OR "${name}"`;
  if ((mode === 'auto' || mode === 'serpapi') && SERPAPI_KEY) {
    try { return await serpapiSearch(query, limit); } catch {}
  }
  return await bingScrapeSearch(query, limit);
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

/* ---------- Matching rules ---------- */
const SOCIAL_PLATFORMS = [
  { hostRe: /(^|\.)instagram\.com$/i,               platform: 'instagram', usernamePathIndex: 1 },
  { hostRe: /(^|\.)tiktok\.com$/i,                  platform: 'tiktok',    usernamePathIndex: 1 }, // /@username -> handle dimulai '@'
  { hostRe: /(^|\.)twitter\.com$|(^|\.)x\.com$/i,   platform: 'twitter',   usernamePathIndex: 1 },
  { hostRe: /(^|\.)facebook\.com$/i,                platform: 'facebook',  usernamePathIndex: 1 },
  { hostRe: /(^|\.)youtube\.com$/i,                 platform: 'youtube',   usernamePathIndex: 1 }, // /@handle atau /c/...
  { hostRe: /(^|\.)linktr\.ee$/i,                   platform: 'linktree',  usernamePathIndex: 1 },
  { hostRe: /(^|\.)msha\.ke$/i,                     platform: 'milkshake', usernamePathIndex: 1 },
  { hostRe: /(^|\.)github\.com$/i,                  platform: 'github',    usernamePathIndex: 1 },
  { hostRe: /(^|\.)behance\.net$/i,                 platform: 'behance',   usernamePathIndex: 1 },
  { hostRe: /(^|\.)medium\.com$/i,                  platform: 'medium',    usernamePathIndex: 1 }
];

// Ambil username dari path jika host cocok
function extractSocialUsername(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    const pathParts = url.pathname.split('/').filter(Boolean); // buang '' kosong
    for (const p of SOCIAL_PLATFORMS) {
      if (p.hostRe.test(host)) {
        let username = pathParts[p.usernamePathIndex] || '';
        // TikTok & YouTube bisa pakai '@handle'
        if (username.startsWith('@')) username = username.slice(1);
        // YouTube: /channel/ atau /c/ atau /@handle
        if (/youtube\.com$/.test(host)) {
          if (pathParts[0] === '@') username = pathParts[1] || username;
          if (pathParts[0] === 'channel' || pathParts[0] === 'c') username = pathParts[1] || username;
        }
        // Facebook: bisa /profile.php?id=... (abaikan)
        if (/facebook\.com$/.test(host) && username.includes('.php')) username = '';
        return { platform: p.platform, username: username || null };
      }
    }
    return { platform: null, username: null };
  } catch { return { platform: null, username: null }; }
}

// Skoring & klasifikasi
function classifyMatch(nameRaw, result) {
  const q = slugify(nameRaw);
  const titleSlug = slugify(result.title || '');
  const sldSlug = slugify(result.sld || ''); // second-level (tanpa TLD)
  const hostSlug = slugify(result.hostname || '');

  // Domain exact vs contains
  if (sldSlug && sldSlug === q) return { type: 'exact_domain', score: 100 };
  if (sldSlug && sldSlug.includes(q)) return { type: 'domain_contains', score: 80 };

  // Social username match
  const soc = extractSocialUsername(result.url);
  if (soc.username) {
    const userSlug = slugify(soc.username);
    if (userSlug === q) return { type: 'social_exact', score: 90, social: soc };
    if (userSlug.includes(q) || q.includes(userSlug)) return { type: 'social_contains', score: 70, social: soc };
  }

  // Title organization match (PT/CV/Inc/Ltd/LLC/Company…)
  const orgTitle = /(^|\b)(pt|cv|inc|ltd|llc|company|perusahaan|studio|ventures|labs)\b/i.test(result.title || '');
  if (titleSlug === q && orgTitle) return { type: 'org_title_exact', score: 75 };
  if (titleSlug.includes(q) && orgTitle) return { type: 'org_title_contains', score: 60 };

  // Mention only (di body/title tidak sesuai atau hanya artikel)
  return { type: 'mention', score: 20 };
}

/* ---------- Core per-name ---------- */
async function processUrlForName(name, u, idx, concurrency) {
  await sleep(120 * (idx % concurrency)); // stagger
  const html = await fetchPage(u);
  const { title, snippet } = extractTitleAndSnippet(html, 80);
  const dn = safeDomainInfo(u);

  // dasar output
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

async function findNameUsage(name, options = {}) {
  const {
    limit = 40, concurrency = 6, mode = 'auto',
    doWhois = true, doCrt = true, allowMentions = false, strict = false
  } = options;

  const urls = await searchUrlsForName(name, { mode, limit });
  if (!urls || urls.length === 0) return { name, found: 0, results: [] };

  const limitFn = pLimit(concurrency);
  const processed = await Promise.all(
    urls.map((u, i) => limitFn(() => processUrlForName(name, u, i, concurrency)))
  );

  // Filter hasil sesuai aturan:
  const accepted = processed.filter(r => {
    // buang mention-only kecuali allowMentions
    if (!allowMentions && r.match_type === 'mention') return false;
    // strict: hanya exact* & social_exact
    if (strict) {
      return ['exact_domain','social_exact','org_title_exact'].includes(r.match_type);
    }
    // non-strict: terima domain_contains & social_contains juga
    return ['exact_domain','domain_contains','social_exact','social_contains','org_title_exact','org_title_contains'].includes(r.match_type);
  });

  // dedupe per "key utama": exact domain > social > lainnya
  const seen = new Set();
  const dedup = [];
  for (const r of accepted.sort((a,b) => b.match_score - a.match_score)) {
    const key = (r.match_type.startsWith('social') && r.social_platform && r.social_username)
      ? `${r.social_platform}:${r.social_username}`.toLowerCase()
      : (r.domain || r.hostname || r.url || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    dedup.push(r);
  }

  // WHOIS/DNS/CRT (best-effort)
  for (const r of dedup) {
    if (r.domain) {
      if (doWhois) r.whois = await checkWhois(r.domain).catch(e => ({ ok: false, error: e.message }));
      r.dns = await checkDns(r.domain).catch(e => ({ resolves: false, error: e.message, records: [] }));
      if (doCrt) r.crt = await checkCrtSh(r.domain).catch(e => ({ ok: false, error: e.message }));
      await sleep(120);
    }
  }

  return { name, found: dedup.length, results: dedup };
}

/* ---------- CSV helpers ---------- */
function mapRowsForCsv(results) {
  return results.map(r => ({
    query_name: r.query_name || '',
    domain: r.domain || '',
    tld: r.tld || '',
    hostname: r.hostname || '',
    url: r.url || '',
    title: r.title || '',
    snippet: r.snippet || '',
    resolves: r.dns && r.dns.resolves ? 'yes' : 'no',
    whois_available_guess: r.whois && r.whois.ok ? (r.whois.likelyAvailable ? 'likely' : 'taken_or_unknown') : (r.whois && r.whois.error ? `err:${r.whois.error}` : ''),
    crt_count: r.crt && r.crt.ok && Array.isArray(r.crt.entries) ? String(r.crt.entries.length) : '',
    match_type: r.match_type || '',
    match_score: r.match_score || 0,
    social_platform: r.social_platform || '',
    social_username: r.social_username || ''
  }));
}

async function writePerNameCsv(outdir, name, rows) {
  ensureDir(outdir);
  const csvPath = path.join(outdir, `${(name || 'result').replace(/[^a-z0-9_-]+/gi,'_')}.csv`);
  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: 'query_name', title: 'query_name' },
      { id: 'domain', title: 'domain' },
      { id: 'tld', title: 'tld' },
      { id: 'hostname', title: 'hostname' },
      { id: 'url', title: 'url' },
      { id: 'title', title: 'title' },
      { id: 'snippet', title: 'snippet' },
      { id: 'resolves', title: 'resolves' },
      { id: 'whois_available_guess', title: 'whois_available_guess' },
      { id: 'crt_count', title: 'crt_count' },
      { id: 'match_type', title: 'match_type' },
      { id: 'match_score', title: 'match_score' },
      { id: 'social_platform', title: 'social_platform' },
      { id: 'social_username', title: 'social_username' }
    ]
  });
  await csvWriter.writeRecords(rows);
  return csvPath;
}

async function writeCombinedCsv(csvPath, rows) {
  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: 'query_name', title: 'query_name' },
      { id: 'domain', title: 'domain' },
      { id: 'tld', title: 'tld' },
      { id: 'hostname', title: 'hostname' },
      { id: 'url', title: 'url' },
      { id: 'title', title: 'title' },
      { id: 'snippet', title: 'snippet' },
      { id: 'resolves', title: 'resolves' },
      { id: 'whois_available_guess', title: 'whois_available_guess' },
      { id: 'crt_count', title: 'crt_count' },
      { id: 'match_type', title: 'match_type' },
      { id: 'match_score', title: 'match_score' },
      { id: 'social_platform', title: 'social_platform' },
      { id: 'social_username', title: 'social_username' }
    ]
  });
  await csvWriter.writeRecords(rows);
  return csvPath;
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
  const mode = flags.mode || 'auto';
  const out = flags.out || null;
  const outdir = flags.outdir || null;
  const combineCsv = flags['combine-csv'] || null;
  const doWhois = !flags['no-whois'];
  const doCrt = !flags['no-crt'];
  const strict = !!flags['strict'];
  const allowMentions = !!flags['allow-mentions'];

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
    console.log('Usage:\n  node check_name_with_whois_crt.js "NameString" [--limit=30] [--mode=auto|serpapi|scrape] [--out=file.csv] [--no-whois] [--no-crt] [--strict]\n  node check_name_with_whois_crt.js --input=names.txt [--limit=25] [--combine-csv=all.csv | --outdir=out_csv] [--no-whois] [--no-crt] [--strict]');
    process.exit(1);
  }

  console.log(`Mode: ${inputFile ? 'BULK' : 'SINGLE'} | limit=${limit} | whois=${doWhois} | crt=${doCrt} | strict=${strict} | allowMentions=${allowMentions}`);
  if (inputFile) console.log(`Input file: ${inputFile}`);

  const allRowsForCombined = [];
  for (const name of names) {
    console.log(`\n>>> Checking: "${name}"`);
    try {
      const res = await findNameUsage(name, { limit, mode, doWhois, doCrt, strict, allowMentions });
      // tambahkan query_name ke setiap result
      res.results.forEach(r => r.query_name = name);

      const rows = mapRowsForCsv(res.results);
      console.log(JSON.stringify({ meta: { name, mode, limit, found: res.found } }, null, 2));

      if (inputFile) {
        if (combineCsv) allRowsForCombined.push(...rows);
        if (outdir) {
          const p = await writePerNameCsv(outdir, name, rows);
          console.log(`Saved CSV: ${p}`);
        }
      } else if (out) {
        const writer = createObjectCsvWriter({ path: out, header: Object.keys(rows[0] || {}).map(k => ({ id: k, title: k })) });
        await writer.writeRecords(rows);
        console.log(`Saved CSV: ${out}`);
      }
    } catch (e) {
      console.error(`Error on "${name}":`, e.message);
    }
  }

  if (inputFile && combineCsv) {
    await writeCombinedCsv(combineCsv, allRowsForCombined);
    console.log(`\nSaved combined CSV: ${combineCsv}  (total rows: ${allRowsForCombined.length})`);
  }
}

if (require.main === module) main();

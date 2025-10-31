/**
 * check_name_with_whois_crt.js (with BULK mode)
 *
 * Features:
 * - Single query (positional) OR bulk via --input=names.txt (one name per line)
 * - Search (SerpApi if key, else Bing scrape)
 * - Extract domain/TLD/title/snippet per result URL
 * - WHOIS (free via whois-json), DNS resolve check, crt.sh (public JSON)
 * - Output: JSON to stdout; CSV per-name via --out=..., or bulk:
 *     --combine-csv=all_results.csv (single CSV for all names)
 *     --outdir=./out (CSV per name)
 *
 * Usage examples:
 *   node check_name_with_whois_crt.js "NamaStartup" --limit=30
 *   node check_name_with_whois_crt.js --input=names.txt --limit=25 --combine-csv=all.csv
 *   node check_name_with_whois_crt.js --input=names.txt --outdir=out_csv
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const pLimit = require('p-limit');
const { parse: parseDomain } = require('tldts');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const whois = require('whois-json');
const dns = require('dns').promises;
require('dotenv').config();
const { URL } = require('url');

const SERPAPI_KEY = process.env.SERPAPI_KEY || null;

// ---------- Helpers ----------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function slugify(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

function safeDomainInfo(urlStr) {
  try {
    const u = new URL(urlStr);
    const info = parseDomain(u.hostname);
    const domain = info.domain && info.publicSuffix ? `${info.domain}.${info.publicSuffix}` : u.hostname;
    return { domain, hostname: u.hostname, tld: info.publicSuffix || '' };
  } catch (e) {
    return { domain: null, hostname: null, tld: null };
  }
}

async function fetchPage(url, timeout = 15000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; name-check-bot/1.1; +https://example.com)' },
      redirect: 'follow',
      timeout
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    return null;
  }
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
    if (!texts.length) {
      const body = $('body').text() || '';
      snippet = body.replace(/\s+/g, ' ').trim().split(' ').slice(0, maxWords).join(' ');
    } else {
      snippet = texts.join(' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, maxWords).join(' ');
    }
  } else {
    snippet = snippet.replace(/\s+/g, ' ').trim().split(' ').slice(0, maxWords).join(' ');
  }
  if (!snippet) snippet = null;
  return { title, snippet };
}

// ---------- Search providers ----------
async function serpapiSearch(query, num = 20) {
  if (!SERPAPI_KEY) throw new Error('No SERPAPI_KEY');
  const params = new URLSearchParams({ engine: 'google', q: query, api_key: SERPAPI_KEY, num: String(Math.min(num, 100)) });
  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const res = await fetch(url, { timeout: 15000 });
  if (!res.ok) throw new Error(`SerpApi HTTP ${res.status}`);
  const j = await res.json();
  const list = [];
  if (Array.isArray(j.organic_results)) {
    j.organic_results.forEach(r => { if (r.link) list.push(r.link); else if (r.url) list.push(r.url); });
  }
  return list.slice(0, num);
}

async function bingScrapeSearch(q, num = 20) {
  const qs = encodeURIComponent(q);
  const url = `https://www.bing.com/search?q=${qs}&count=${Math.min(num,50)}`;
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
  const query = `intitle:${quoted} OR inurl:${name} OR intext:${quoted} OR "${name}"`;
  if ((mode === 'auto' || mode === 'serpapi') && SERPAPI_KEY) {
    try { return await serpapiSearch(query, limit); } catch (e) {}
  }
  return await bingScrapeSearch(query, limit);
}

// ---------- WHOIS / DNS / crt.sh ----------
async function checkWhois(domain) {
  try {
    const info = await whois(domain, { follow: 3, timeout: 15000 });
    const raw = JSON.stringify(info).toLowerCase();
    const noMatchPhrases = [
      'no match for','not found','no data found','no entries found','status: free',
      'domain not found','not registered','no object found'
    ];
    const likelyAvailable = noMatchPhrases.some(p => raw.includes(p));
    return { ok: true, info, likelyAvailable };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkDns(domain) {
  try {
    const a = await dns.resolve(domain).catch(() => null);
    if (a && a.length) return { resolves: true, records: a };
    const aaaa = await dns.resolve6(domain).catch(() => null);
    if (aaaa && aaaa.length) return { resolves: true, records: aaaa };
    return { resolves: false, records: [] };
  } catch (e) {
    return { resolves: false, error: e.message, records: [] };
  }
}

async function checkCrtSh(domain) {
  try {
    const q = encodeURIComponent(`%25${domain}`);
    const url = `https://crt.sh/?q=${q}&output=json`;
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    if (!text || text.trim() === '' || text.trim().toLowerCase() === 'no results found') return { ok: true, entries: [] };
    let j;
    try { j = JSON.parse(text); } catch { return { ok: true, entries: [] }; }
    const entries = (Array.isArray(j) ? j : []).map(it => ({
      issuer_ca_id: it.issuer_ca_id,
      issuer_name: it.issuer_name,
      common_name: it.common_name,
      name_value: it.name_value,
      not_before: it.not_before,
      not_after: it.not_after,
      id: it.min_cert_id || it.id || null
    }));
    return { ok: true, entries };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------- Core worker for one name ----------
async function findNameUsage(name, options = {}) {
  const {
    limit = 40, concurrency = 6, mode = 'auto', fetchDelayMs = 200, doWhois = true, doCrt = true
  } = options;

  const urls = await searchUrlsForName(name, { mode, limit });
  if (!urls || urls.length === 0) return { name, found: 0, results: [] };

  const limitFn = pLimit(concurrency);
  const tasks = urls.map((u, idx) => limitFn(async () => {
    await sleep(fetchDelayMs * (idx % concurrency));
    const html = await fetchPage(u);
    const { title, snippet } = extractTitleAndSnippet(html, 80);
    const dn = safeDomainInfo(u);
    const out = { query_name: name, url: u, domain: dn.domain, hostname: dn.hostname, tld: dn.tld, title, snippet, whois: null, dns: null, crt: null };

    if (doWhois && out.domain) {
      out.whois = await checkWhois(out.domain).catch(e => ({ ok: false, error: e.message }));
      await sleep(120);
    }
    if (out.domain) {
      out.dns = await checkDns(out.domain).catch(e => ({ resolves: false, error: e.message, records: [] }));
    }
    if (doCrt && out.domain) {
      out.crt = await checkCrtSh(out.domain).catch(e => ({ ok: false, error: e.message }));
      await sleep(120);
    }
    return out;
  }));

  const raw = await Promise.all(tasks);

  // dedupe per domain
  const seen = new Set();
  const dedup = [];
  for (const r of raw) {
    const key = (r.domain || r.hostname || r.url || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    dedup.push(r);
  }
  return { name, found: dedup.length, results: dedup };
}

// ---------- CSV writers ----------
async function writePerNameCsv(outdir, name, rows) {
  ensureDir(outdir);
  const csvPath = path.join(outdir, `${slugify(name) || 'result'}.csv`);
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
      { id: 'crt_count', title: 'crt_count' }
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
      { id: 'crt_count', title: 'crt_count' }
    ]
  });
  await csvWriter.writeRecords(rows);
  return csvPath;
}

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
    crt_count: r.crt && r.crt.ok && Array.isArray(r.crt.entries) ? String(r.crt.entries.length) : ''
  }));
}

// ---------- CLI ----------
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
  const out = flags.out || null;                // for single-name CSV
  const outdir = flags.outdir || null;          // for per-name CSV in bulk
  const combineCsv = flags['combine-csv'] || null; // single combined CSV for bulk
  const doWhois = !flags['no-whois'];
  const doCrt = !flags['no-crt'];

  // Determine mode: single vs bulk
  let names = [];
  if (inputFile) {
    if (!fs.existsSync(inputFile)) {
      console.error(`Input file not found: ${inputFile}`);
      process.exit(1);
    }
    const content = fs.readFileSync(inputFile, 'utf8');
    names = content.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
    if (!names.length) {
      console.error('No valid names in input file.');
      process.exit(1);
    }
  } else if (positionalName) {
    names = [positionalName];
  } else {
    console.log('Usage:\n  node check_name_with_whois_crt.js "NameString" [--limit=30] [--mode=auto|serpapi|scrape] [--out=file.csv] [--no-whois] [--no-crt]\n  node check_name_with_whois_crt.js --input=names.txt [--limit=25] [--combine-csv=all.csv | --outdir=out_csv] [--no-whois] [--no-crt]');
    process.exit(1);
  }

  console.log(`Mode: ${inputFile ? 'BULK' : 'SINGLE'} | limit=${limit} | whois=${doWhois} | crt=${doCrt}`);
  if (inputFile) console.log(`Input file: ${inputFile}`);

  const allRowsForCombined = [];
  for (const name of names) {
    console.log(`\n>>> Checking: "${name}"`);
    try {
      const res = await findNameUsage(name, { limit, mode, doWhois, doCrt });
      const rows = mapRowsForCsv(res.results);

      // print JSON meta per name (ringkas)
      console.log(JSON.stringify({ meta: { name, mode, limit, found: res.found } }, null, 2));

      if (inputFile) {
        if (combineCsv) {
          allRowsForCombined.push(...rows);
        }
        if (outdir) {
          const p = await writePerNameCsv(outdir, name, rows);
          console.log(`Saved CSV: ${p}`);
        }
      } else {
        // single mode
        if (out) {
          const csvWriter = createObjectCsvWriter({
            path: out,
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
              { id: 'crt_count', title: 'crt_count' }
            ]
          });
          await csvWriter.writeRecords(rows);
          console.log(`Saved CSV: ${out}`);
        }
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

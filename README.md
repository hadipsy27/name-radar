# name-radar

Small utility to check name usage on the web and basic domain information (WHOIS, DNS, crt.sh) using the script `check_name_with_whois_crt.js`.

This repository includes a single Node.js script that can run in single-query mode or bulk mode (one name per line). It searches the web for results containing the name, extracts domains and page metadata, performs WHOIS/DNS checks and queries crt.sh for certificates, then outputs JSON to stdout and optional CSVs.

## Quick summary / contract

- Input: a single name (positional) or an input file (`--input=names.txt`) with one name per line.
- Output: JSON printed to stdout per name; optional CSV files per-name or a combined CSV.
- Error modes: network timeouts, whois provider errors, crt.sh rate-limits — script prints errors per name but continues.

## Requirements

- Node.js 14+ (tested). The script uses CommonJS requires; use Node v14+ or v16+ for best compatibility.
- npm (optional, for installing dependencies)
- Internet access for WHOIS, DNS and crt.sh queries

## Install dependencies

1. Initialize a project (optional but recommended):

```powershell
# from repo root
npm init -y
```

2. Install the runtime dependencies required by the script. Important: use `node-fetch@2` because the script uses CommonJS `require()`.

```powershell
npm install node-fetch@2 cheerio p-limit@3 tldts csv-writer whois-json dotenv
```

Notes:
- `node-fetch@3` is ESM-only and will not work with `require('node-fetch')` used in the script. Pin to `node-fetch@2`.
- `dotenv` is optional but useful to set `SERPAPI_KEY` in a `.env` file.

## Environment variables

- `SERPAPI_KEY` (optional): if set, the script will attempt to use SerpApi for searches (faster/more accurate). Create a `.env` file in the repo root:

```text
SERPAPI_KEY=your_serpapi_key_here
```

The script loads environment variables with `dotenv` automatically.

## Usage (examples, PowerShell)

Open PowerShell at the repository root.

# Single name (positional)
```powershell
node .\\check_name_with_whois_crt.js "MyStartupName"
```

# Single name with limit
```powershell
node .\\check_name_with_whois_crt.js "MyStartupName" --limit=30
```

# Single name, save per-run CSV
```powershell
node .\\check_name_with_whois_crt.js "MyStartupName" --out=results.csv
```

# Bulk mode: provide input file (one name per line). Save per-name CSVs into a directory:
```powershell
node .\\check_name_with_whois_crt.js --input=names.txt --outdir=out_csv --limit=25
```

# Bulk mode: combine into a single CSV
```powershell
node .\\check_name_with_whois_crt.js --input=names.txt --combine-csv=all_results.csv --limit=25
```

# Additional flags
- `--limit=N` — maximum number of search results to process per name (default ~30)
- `--mode=auto|serpapi|scrape` — search provider selection (auto uses SerpApi if key present)
- `--no-whois` — skip WHOIS checks
- `--no-crt` — skip crt.sh queries

Example with options:

```powershell
node .\\check_name_with_whois_crt.js "MyStartupName" --limit=40 --mode=auto --out=single.csv --no-whois
```

## Input file format (for `--input`)

- Plain text file, one name per line. Empty lines and lines starting with `#` are ignored.

Example `names.txt`:

```text
# names to check
MyStartup
AnotherProject
cool-name-2025
```

## Output

- JSON summary for each name is printed to stdout. The script prints a short JSON meta object per name. Full per-URL results are used to create CSV rows when requested.
- CSV columns (when created): `query_name, domain, tld, hostname, url, title, snippet, resolves, whois_available_guess, crt_count`.

## Troubleshooting

- WHOIS failures: public whois lookups can be rate-limited by registrars. If you get many errors, run with `--no-whois` or use a paid WHOIS API and adapt the script.
- crt.sh errors / empty responses: crt.sh may rate-limit or return non-JSON pages. Script handles common cases but may return fewer entries.
- `node-fetch` ESM error: if you see an error about `require()` or ESM, ensure you installed `node-fetch@2`.
- DNS resolution: script uses Node's `dns` module; local DNS settings or firewalls may affect results.

## Optional improvements

- Add a `package.json` scripts entry:

```json
"scripts": {
	"start": "node check_name_with_whois_crt.js"
}
```

- Add unit tests for parsing helpers and a small integration test with a short input file.

## License

See the `LICENSE` file in this repository.

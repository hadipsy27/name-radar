# Name Radar

Cek pemakaian **nama brand/startup/PT/domain/username sosmed** secara cepat. Tool Node.js ini melakukan pencarian lintas mesin (SerpApi/Bing/DuckDuckGo), mem‑probe domain kandidat populer, dan memperkaya hasil dengan **WHOIS, DNS**, dan **crt.sh (Certificate Transparency)** — semuanya bisa berjalan **gratis** (tanpa API key), dengan opsi SerpApi jika tersedia.

---

## Fitur Utama

* **Input tunggal atau bulk** (`--input=names.txt`).
* **Multi‑engine search**: SerpApi (opsional), **Bing scraping**, **DuckDuckGo HTML**.
* **Direct Domain Probe**: cek kandidat domain populer (mis. `name.com/.net/.io/.id/...`) meski hasil search kosong.
* **Filter ketat** agar hanya hasil yang **benar‑benar memakai** nama:

  * `exact_domain`, `domain_contains`
  * `social_exact`, `social_contains` (Instagram/TikTok/X/Twitter/YouTube/Linktree/Milkshake/GitHub/Behance/Medium)
  * `org_title_exact`, `org_title_contains` (title mengandung PT/LLC/Ltd/Inc/Labs/Ventures, dll.)
* **WHOIS + DNS + crt.sh** gratis (best‑effort; tidak menjamin ketersediaan untuk registrasi).
* **CSV export** (per nama atau gabungan), **debug mode**, dan opsi **strict matching**.

> ⚠️ **Disclaimer**: Hasil WHOIS/CRT/DNS bersifat indikatif. Untuk konfirmasi ketersediaan domain, gunakan registrar resmi (Namecheap/GoDaddy/WhoisXML API, dll.).

---

## Instalasi

```bash
# Buat folder projek dan inisialisasi
mkdir name-radar && cd name-radar
npm init -y

# Install dependency (p-limit sudah kompatibel ESM/CommonJS di kode)
npm i node-fetch@2 cheerio p-limit tldts dotenv csv-writer whois-json
```

Simpan file skrip sebagai **`check_name_with_whois_crt.js`** (isi file ada di repo/proyek Anda).

> **Catatan `p-limit`**: Jika Anda menggunakan `p-limit@5` (ESM‑only), skrip ini sudah menambahkan shim `pLimit = pLimit.default || pLimit`, sehingga **tidak perlu downgrade**. Alternatif aman: `npm i p-limit@3`.

---

## Konfigurasi Opsional

Buat file **`.env`** bila ingin memakai SerpApi untuk hasil yang lebih stabil:

```
SERPAPI_KEY=your_serpapi_key_here
```

Tanpa SerpApi, tool akan otomatis pakai **Bing** dan fallback **DuckDuckGo**.

---

## Cara Pakai (Singkat)

### Single Query

```bash
node check_name_with_whois_crt.js "LinkPulse" \
  --engine=multi --probe=always --limit=30 --strict --debug
```

### Bulk Mode (file `.txt` satu nama per baris)

```bash
# Simpan file: names.txt
# Contoh isi:
# LinkPulse
# IniDomain

# CSV gabungan semua nama
node check_name_with_whois_crt.js --input=names.txt \
  --engine=multi --probe=auto --limit=25 --strict \
  --combine-csv=all_results.csv

# Atau CSV per nama
node check_name_with_whois_crt.js --input=names.txt \
  --engine=multi --probe=auto --limit=25 --strict \
  --outdir=out_csv
```

---

## Opsi/Flags

* `--engine=auto|serpapi|bing|ddg|multi`

  * `auto`: SerpApi jika ada key → kalau tidak ada, Bing → DDG.
  * `multi`: coba berurutan SerpApi (jika ada), lalu Bing, lalu DDG.
* `--probe=auto|always|off`

  * `auto/always`: cek kandidat domain populer (`.com .net .org .io .co .id .co.id .ai .app .dev`).
* `--limit=<N>`: jumlah URL target dari mesin pencari (default 30).
* `--strict`: hanya hasil **exact** (`exact_domain`, `social_exact`, `org_title_exact`).
* `--allow-mentions`: izinkan hasil yang **hanya menyebut** nama di body (default: dibuang).
* `--no-whois`, `--no-crt`: matikan enrichment WHOIS / crt.sh.
* `--debug`: cetak URL hasil per engine & ringkasan match untuk audit.
* Output:

  * Single: `--out=hasil.csv`.
  * Bulk: `--combine-csv=all.csv` (gabungan) atau `--outdir=out_csv` (per nama).

---

## Skema Output CSV

Kolom yang dihasilkan:

| Kolom                   | Deskripsi                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `query_name`            | Nama yang dicari                                                                                                              |
| `domain`                | Domain (registrable) yang terkait                                                                                             |
| `tld`                   | TLD/public suffix                                                                                                             |
| `hostname`              | Hostname dari URL                                                                                                             |
| `url`                   | Sumber URL                                                                                                                    |
| `title`                 | `<title>` halaman                                                                                                             |
| `snippet`               | Deskripsi singkat (meta description/paragraf awal)                                                                            |
| `resolves`              | `yes/no` hasil cek DNS A/AAAA                                                                                                 |
| `whois_available_guess` | Heuristik ketersediaan (`likely`/`taken_or_unknown`/`err:...`)                                                                |
| `crt_count`             | Jumlah entri sertifikat dari crt.sh (indikasi pemakaian/subdomain)                                                            |
| `match_type`            | Tipe kecocokan: `exact_domain`, `domain_contains`, `social_exact`, `social_contains`, `org_title_exact`, `org_title_contains` |
| `match_score`           | Skor prioritas (0–100)                                                                                                        |
| `social_platform`       | Platform sosial (jika cocok)                                                                                                  |
| `social_username`       | Username/handle yang cocok                                                                                                    |

> **Interpretasi cepat**:
>
> * `exact_domain` + `resolves=yes` → sangat mungkin **sudah dipakai**.
> * `whois_available_guess=likely` → domain *mungkin* available (perlu konfirmasi ke registrar).
> * `crt_count>0` → ada jejak sertifikat SSL (indikasi aktif/pemakaian sebelumnya).

---

## Prinsip Matching

* **Domain**: cocok jika SLD (second-level domain, tanpa TLD) **sama** atau **mengandung** nama.
* **Sosmed**: cocok jika handle/username sama atau mengandung nama. Platform yang didukung: Instagram, TikTok, X/Twitter, YouTube, Linktree, Milkshake, GitHub, Behance, Medium.
* **Organisasi (title)**: `<title>` mengandung frasa organisasi (PT/CV/Inc/Ltd/LLC/Company/Perusahaan/Studio/Ventures/Labs) dan stringnya cocok.
* **Mentions**: hasil yang hanya “menyebut” di body dibuang secara default (aktifkan `--allow-mentions` bila perlu).

---

## Contoh Penggunaan

### 1) Cek satu nama dengan filter ketat

```bash
node check_name_with_whois_crt.js "IniDomain" --strict --engine=multi --probe=always --limit=30 --out=IniDomain.csv
```

### 2) Audit hasil mesin pencari (debug)

```bash
node check_name_with_whois_crt.js "LinkPulse" --engine=multi --probe=auto --limit=30 --debug
```

### 3) Bulk + CSV gabungan

```bash
node check_name_with_whois_crt.js --input=names.txt \
  --engine=multi --probe=auto --limit=25 \
  --combine-csv=all_results.csv
```

---

## Tips Akurasi & Performa

* **SerpApi** (jika ada): hasil paling stabil, kurangi false negative.
* **`--probe=always`**: memastikan domain obvious (mis. `name.com/.net/.io`) tetap terdeteksi walau mesin cari kosong.
* **Rate limit**: crt.sh & WHOIS bisa menolak jika terlalu sering — gunakan **`--limit` lebih kecil** atau jalankan batch.
* **Caching/Retry**: untuk produksi, tambahkan cache sederhana (file/Redis) dan retry backoff.

---

## Troubleshooting

* **`pLimit is not a function`**: gunakan versi p-limit v3 (`npm i p-limit@3`) **atau** pakai skrip ini (sudah ada shim `pLimit = pLimit.default || pLimit`).
* **Tidak ada hasil padahal manual ada**: jalankan dengan `--engine=multi --probe=always --debug`. Cek log `[DEBUG]` apakah URL target terparsing. Mesin pencari kadang A/B test layout; fallback DDG dan probe domain akan membantu.
* **WHOIS `taken_or_unknown`**: artinya tidak ada frasa “not found” yang jelas; lakukan konfirmasi ke registrar.

---

## Keamanan & Etika

* Patuhi robots.txt/ToS situs yang diakses. Gunakan alat ini secara wajar, hindari beban berlebihan.
* Jangan gunakan untuk scraping agresif atau tujuan yang melanggar hukum/kebijakan layanan.

---

## Roadmap (Opsional)

* Integrasi **registrar API** (Namecheap/GoDaddy/WhoisXML) untuk availability yang presisi.
* **Whitelist/Blacklist platform** via flag `--include=ig,tiktok --exclude=facebook`.
* **Output JSON file** per query/bulk.
* **Dockerfile** dan GitHub Action untuk run terjadwal.

---

## Lisensi

Apache License —

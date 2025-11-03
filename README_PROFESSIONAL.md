# Name Radar Professional 🎯

**Tool profesional untuk analisis kelayakan nama PT/Startup/Perusahaan/Domain dengan sistem scoring komprehensif dan laporan mendalam.**

---

## 🌟 Fitur Profesional

### ✅ Analisis Komprehensif
- **Validasi Nama Bisnis** - Sesuai regulasi PT, CV, UD, Firma di Indonesia
- **Scoring System** - Penilaian 360° dari 5 aspek utama
- **Executive Summary** - Ringkasan eksekutif dengan rekomendasi jelas
- **Competitor Analysis** - Analisis persaingan dan risiko trademark
- **SEO & Branding Score** - Evaluasi kelayakan SEO dan daya ingat brand

### 📊 Laporan Multi-Sheet Excel
1. **Executive Summary** - Overview dengan score dan rekomendasi
2. **Detailed Results** - Data lengkap semua temuan
3. **Domain Analysis** - Status ketersediaan domain per TLD
4. **Social Media** - Ketersediaan handle di platform utama
5. **SEO & Branding** - Analisis SEO dan validasi nama bisnis
6. **Competitor Analysis** - Daftar kompetitor dan tingkat ancaman
7. **Recommendations** - Rekomendasi aksi berdasarkan prioritas

### 🔍 Sistem Scoring (0-100)

#### 1. Domain Availability (30%)
- Mengecek TLD kritis: `.com`, `.co.id`, `.id`, `.io`
- Status: Available / Taken / Unknown
- Verifikasi WHOIS, DNS, dan Certificate Transparency

#### 2. Social Media Availability (25%)
- Platform kritis: Instagram, Facebook, LinkedIn, Twitter
- Deteksi handle yang sudah digunakan
- Rekomendasi platform alternatif

#### 3. Trademark Risk (20%)
- Deteksi bisnis dengan nama serupa
- Analisis risiko konflik hukum
- Level ancaman: Low / Medium / High

#### 4. SEO Friendliness (15%)
- Panjang optimal (6-15 karakter)
- Komposisi huruf dan angka
- Kemudahan diucapkan
- Keunikan nama

#### 5. Memorability (10%)
- Pola pengulangan
- Struktur ritmis
- Aliterasi
- Keseimbangan vokal-konsonan

### 🏢 Validasi Entitas Bisnis Indonesia

#### PT (Perseroan Terbatas)
- ✓ Minimal 3 kata (termasuk "PT")
- ✓ Tidak menggunakan kata yang bertentangan dengan ketertiban umum
- ✓ Tidak sama dengan PT yang sudah terdaftar
- ✓ Modal minimal: Rp 50.000.000
- ✓ Minimal 2 pemegang saham

#### CV (Commanditaire Vennootschap)
- ✓ Minimal 2 kata (termasuk "CV")
- ✓ Nama harus unik
- ✓ Lebih fleksibel dibanding PT

#### UD (Usaha Dagang)
- ✓ Untuk usaha perorangan
- ✓ Tidak memerlukan akta notaris

#### Firma
- ✓ Kemitraan dengan tanggung jawab penuh
- ✓ Minimal 2 anggota

---

## 📦 Instalasi

```bash
# Clone repository
git clone https://github.com/hadipsy27/name-radar.git
cd name-radar

# Install dependencies
npm install

# (Opsional) Setup SerpApi untuk hasil lebih akurat
# Buat file .env dan tambahkan:
# SERPAPI_KEY=your_api_key_here
```

---

## 🚀 Cara Penggunaan

### Mode Profesional (Rekomendasi)

#### Single Name Analysis
```bash
# Analisis nama tunggal dengan laporan lengkap
node check_name_professional.js "Astra Digital"

# Atau gunakan npm script
npm run check "Astra Digital"
```

#### Bulk Analysis (Multiple Names)
```bash
# Buat file names.txt:
# PT Maju Bersama
# CV Sinar Jaya
# Startup Nusantara

# Jalankan analisis bulk
node check_name_professional.js --input=names.txt
```

#### Custom Options
```bash
node check_name_professional.js "TechNova Indonesia" \
  --limit=40 \
  --engine=multi \
  --probe=always \
  --out=reports/technova_analysis.xlsx
```

### Mode Basic (Backward Compatible)
```bash
# Tetap bisa menggunakan versi basic
npm run check:basic "MyStartup"
```

---

## 🎯 Use Cases Profesional

### 1. Mendirikan PT Baru
```bash
node check_name_professional.js "PT Solusi Digital Indonesia" --engine=multi
```
**Output:**
- Validasi nama sesuai ketentuan PT
- Cek ketersediaan domain `.co.id` dan `.id`
- Analisis kompetitor di industri digital
- Score kelayakan nama
- Rekomendasi registrasi

### 2. Rebranding Perusahaan
```bash
# Analisis beberapa opsi rebranding
node check_name_professional.js --input=rebrand_options.txt
```
**Output:**
- Perbandingan score antar nama
- Analisis risiko trademark
- Ketersediaan aset digital
- Rekomendasi nama terbaik

### 3. Validasi Nama Startup
```bash
node check_name_professional.js "InnoTech" \
  --probe=always \
  --strict
```
**Output:**
- Cek domain `.io`, `.ai`, `.tech`
- Handle social media startup-friendly
- SEO score untuk tech brand
- Memorability score

### 4. Due Diligence Akuisisi
```bash
node check_name_professional.js "Target Company Name" \
  --engine=multi \
  --limit=50
```
**Output:**
- Analisis kompetitor mendalam
- Deteksi konflik trademark
- Aset digital yang dimiliki
- Risiko legal

---

## 📋 Opsi Command Line

| Flag | Deskripsi | Default |
|------|-----------|---------|
| `--input=file.txt` | File input untuk bulk analysis | - |
| `--out=report.xlsx` | Path output laporan | `./reports/{name}_analysis.xlsx` |
| `--limit=N` | Jumlah URL search results | 30 |
| `--engine=auto\|multi` | Search engine | auto |
| `--probe=auto\|always\|off` | Domain probing | auto |
| `--strict` | Hanya exact matches | false |
| `--no-whois` | Skip WHOIS checks | false |
| `--no-crt` | Skip certificate checks | false |
| `--no-professional-report` | Skip laporan profesional | false |
| `--debug` | Enable debug mode | false |

---

## 📊 Interpretasi Hasil

### Overall Score & Grade

| Score | Grade | Interpretasi |
|-------|-------|--------------|
| 90-100 | A+ (Excellent) | **SANGAT DIREKOMENDASIKAN** - Lanjutkan dengan percaya diri |
| 80-89 | A (Very Good) | **DIREKOMENDASIKAN** - Nama sangat baik dengan availability tinggi |
| 70-79 | B (Good) | **LAYAK** - Beberapa aspek perlu perhatian |
| 60-69 | C (Fair) | **PERTIMBANGKAN ULANG** - Ada tantangan signifikan |
| 50-59 | D (Poor) | **TIDAK DISARANKAN** - Banyak masalah |
| <50 | F (Not Recommended) | **HINDARI** - Cari alternatif lain |

### Status Domain

| Status | Arti | Aksi |
|--------|------|------|
| 🟢 Likely Available | Domain kemungkinan besar tersedia | **Register segera** |
| 🟡 Taken/Unknown | WHOIS tidak jelas / mungkin diambil | Cek di registrar resmi |
| 🔴 Taken | Sudah digunakan (DNS resolve + cert) | Pilih TLD lain / ubah nama |

### Threat Level (Competitor)

| Level | Jumlah Kompetitor | Risiko |
|-------|-------------------|--------|
| **None** | 0 | Aman, tidak ada konflik |
| **Low** | 1-2 | Risiko minimal |
| **Medium** | 3-5 | Perlu trademark search |
| **High** | 6+ | **Sangat berisiko** - konsultasi lawyer |

---

## 🎨 Contoh Output

### Terminal Output
```
╔═══════════════════════════════════════════════════════════╗
║     NAME RADAR PROFESSIONAL - Business Name Analyzer      ║
║          PT / Startup / Company / Domain Checker          ║
╚═══════════════════════════════════════════════════════════╝

🔍 Analyzing: "PT Digital Nusantara"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Entity Type Detected: PT

⚠️  WARNINGS:
   ⚠️  Name contains common business terms

🌐 Probing domains...
   Checking 15 domain variations

🔎 Searching web...
   Found 23 URLs to analyze

📊 Enriching data (WHOIS, DNS, Certificates)...

✅ Analysis complete: 8 results found

📝 Generating professional report...

═══════════════════════════════════════════════════════════
📊 ANALYSIS SUMMARY
═══════════════════════════════════════════════════════════
Overall Score: 82/100 (A - Very Good)
Recommendation: HIGHLY RECOMMENDED - Proceed with confidence

Key Findings:
  ✓ Primary domains are available
  ✓ Major social media handles available
  ✓ Low trademark conflict risk

📄 Detailed report saved to:
   ./reports/PT_Digital_Nusantara_analysis.xlsx
═══════════════════════════════════════════════════════════
```

### Excel Report Preview

#### Sheet 1: Executive Summary
```
┌─────────────────────────────────────────────────┐
│  NAME RADAR - Professional Business Name        │
│             Analysis                            │
├─────────────────────────────────────────────────┤
│  Business Name: PT Digital Nusantara            │
├─────────────────────────────────────────────────┤
│  Overall Score: 82/100                          │
│  Grade: A (Very Good)                           │
├─────────────────────────────────────────────────┤
│  SCORE BREAKDOWN                                │
│  ┌──────────────────────┬───────┬────────┐     │
│  │ Domain Availability  │ 85/100│  25.5  │     │
│  │ Social Media         │ 90/100│  22.5  │     │
│  │ Trademark Risk       │ 80/100│  16.0  │     │
│  │ SEO Friendly         │ 75/100│  11.25 │     │
│  │ Memorability         │ 70/100│   7.0  │     │
│  └──────────────────────┴───────┴────────┘     │
└─────────────────────────────────────────────────┘
```

---

## 🔧 Tips & Best Practices

### Untuk Akurasi Maksimal

1. **Gunakan SerpApi Key** (opsional tapi sangat membantu)
   ```bash
   # .env
   SERPAPI_KEY=your_key_here
   ```

2. **Probe Comprehensive**
   ```bash
   --probe=always --engine=multi --limit=40
   ```

3. **Strict Mode untuk PT/CV**
   ```bash
   --strict  # Hanya exact matches
   ```

### Workflow Profesional

```mermaid
1. Brainstorm 5-10 nama kandidat
   ↓
2. Jalankan bulk analysis
   ↓
3. Review score & executive summary
   ↓
4. Pilih 2-3 nama terbaik (score >75)
   ↓
5. Konsultasi lawyer untuk trademark search
   ↓
6. Register domain & social media
   ↓
7. File trademark application
```

---

## 🆚 Perbandingan Mode

| Fitur | Basic Mode | Professional Mode |
|-------|-----------|-------------------|
| Domain checking | ✅ | ✅ |
| Social media check | ✅ | ✅ |
| WHOIS/DNS/Cert | ✅ | ✅ |
| Business validation | ❌ | ✅ |
| Scoring system | ❌ | ✅ |
| Executive summary | ❌ | ✅ |
| Competitor analysis | ❌ | ✅ |
| SEO analysis | ❌ | ✅ |
| Multi-sheet Excel | ❌ | ✅ |
| Recommendations | ❌ | ✅ |
| Professional formatting | ❌ | ✅ |

---

## 📚 Struktur Project

```
name-radar/
├── check_name_professional.js    # Main CLI profesional
├── check_name_with_whois_crt.js  # Basic version
├── src/
│   ├── config/
│   │   └── constants.js          # Konfigurasi & konstanta
│   ├── utils/
│   │   ├── validators.js         # Business validation
│   │   └── scoring.js            # Scoring system
│   └── modules/
│       └── reporter.js           # Professional reporting
├── reports/                       # Output reports
├── package.json
└── README_PROFESSIONAL.md
```

---

## ⚠️ Disclaimer

- **WHOIS/DNS/CRT**: Hasil bersifat **indikatif**, bukan jaminan mutlak
- **Trademark**: Selalu lakukan **professional trademark search** sebelum registrasi
- **Legal**: Konsultasikan dengan **lawyer** untuk kepastian hukum
- **Registrar**: Konfirmasi ketersediaan domain di **registrar resmi** (Namecheap, GoDaddy, dll)

---

## 🤝 Contributing

Contributions are welcome! Terutama untuk:
- Integrasi dengan API registrar resmi
- Support untuk entitas bisnis negara lain
- Improved trademark database
- UI/dashboard web

---

## 📞 Support

Jika menemukan bug atau punya saran:
- **Issues**: [GitHub Issues](https://github.com/hadipsy27/name-radar/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hadipsy27/name-radar/discussions)

---

## 📄 License

Apache License - see LICENSE file

---

## 🎓 Case Studies

### Case Study 1: PT Tech Startup
**Situasi**: Founder ingin mendirikan PT di bidang fintech
**Kandidat**: "PT Saldo Digital Indonesia"

**Hasil Analisis:**
- Overall Score: 78/100 (B - Good)
- Domain `.co.id` tersedia
- Instagram & LinkedIn tersedia
- 2 kompetitor dengan nama serupa (Medium Risk)

**Keputusan**: Proceed dengan trademark search tambahan

### Case Study 2: Rebranding E-commerce
**Situasi**: E-commerce existing ingin rebranding
**Kandidat**: "Tokobeli", "BelanjaNow", "ShopKita"

**Hasil:**
| Nama | Score | Keputusan |
|------|-------|-----------|
| Tokobeli | 65/100 | Reject - too similar to competitors |
| BelanjaNow | 88/100 | **SELECTED** - high score, available |
| ShopKita | 72/100 | Backup option |

---

**Built with ❤️ for Indonesian entrepreneurs and business owners**

🚀 **Happy naming!**

/**
 * Configuration and constants for Name Radar
 * Professional company/startup name checking tool
 */

module.exports = {
  // Common TLDs for different business types
  BUSINESS_TLDS: {
    global: ['com', 'net', 'org', 'io', 'co', 'ai', 'app', 'dev', 'biz', 'tech', 'inc'],
    indonesia: ['id', 'co.id', 'web.id', 'sch.id', 'ac.id', 'or.id'],
    startup: ['io', 'ai', 'tech', 'dev', 'app', 'digital', 'cloud'],
    professional: ['co', 'inc', 'pro', 'consulting', 'agency']
  },

  // Indonesian business entity types
  INDONESIA_ENTITY_TYPES: {
    'PT': {
      fullName: 'Perseroan Terbatas',
      description: 'Limited Liability Company',
      minCapital: 50000000, // 50 juta IDR
      minShareholders: 2,
      rules: [
        'Nama harus unik dan tidak sama dengan PT yang sudah terdaftar',
        'Tidak boleh menggunakan kata yang bertentangan dengan ketertiban umum',
        'Minimal 3 kata (termasuk PT)',
        'Tidak boleh menggunakan nama negara, kementerian, atau lembaga negara'
      ]
    },
    'CV': {
      fullName: 'Commanditaire Vennootschap',
      description: 'Limited Partnership',
      minCapital: 0,
      minShareholders: 2,
      rules: [
        'Nama harus unik',
        'Minimal terdiri dari 2 kata (termasuk CV)',
        'Lebih fleksibel dibanding PT'
      ]
    },
    'UD': {
      fullName: 'Usaha Dagang',
      description: 'Trading Business',
      minCapital: 0,
      minShareholders: 1,
      rules: [
        'Untuk usaha perorangan',
        'Tidak memerlukan akta notaris',
        'Cukup dengan surat izin usaha'
      ]
    },
    'Firma': {
      fullName: 'Firma',
      description: 'General Partnership',
      minCapital: 0,
      minShareholders: 2,
      rules: [
        'Semua anggota bertanggung jawab penuh',
        'Nama harus mencerminkan kegiatan usaha'
      ]
    }
  },

  // Business name validation rules
  NAME_VALIDATION: {
    minLength: 2,
    maxLength: 50,
    invalidPatterns: [
      /^\d+$/, // all numbers
      /^[\W_]+$/, // only special chars
    ],
    reservedWords: [
      'indonesia', 'republik', 'negara', 'pemerintah', 'kementerian',
      'presiden', 'gubernur', 'bank indonesia', 'polri', 'tni',
      'nasional', 'international'
    ],
    brandRiskyWords: [
      'google', 'facebook', 'microsoft', 'apple', 'amazon',
      'alibaba', 'tencent', 'samsung', 'toyota', 'honda'
    ]
  },

  // Social media platforms configuration
  SOCIAL_PLATFORMS: [
    {
      name: 'instagram',
      hostRe: /(^|\.)instagram\.com$/i,
      importance: 'critical',
      businessValue: 95
    },
    {
      name: 'facebook',
      hostRe: /(^|\.)facebook\.com$/i,
      importance: 'high',
      businessValue: 85
    },
    {
      name: 'twitter',
      hostRe: /(^|\.)twitter\.com$|(^|\.)x\.com$/i,
      importance: 'high',
      businessValue: 80
    },
    {
      name: 'linkedin',
      hostRe: /(^|\.)linkedin\.com$/i,
      importance: 'critical',
      businessValue: 90
    },
    {
      name: 'youtube',
      hostRe: /(^|\.)youtube\.com$/i,
      importance: 'high',
      businessValue: 85
    },
    {
      name: 'tiktok',
      hostRe: /(^|\.)tiktok\.com$/i,
      importance: 'medium',
      businessValue: 75
    },
    {
      name: 'github',
      hostRe: /(^|\.)github\.com$/i,
      importance: 'medium',
      businessValue: 70
    }
  ],

  // Scoring weights
  SCORING_WEIGHTS: {
    domainAvailability: 30,
    socialMediaAvailability: 25,
    trademark: 20,
    seoFriendly: 15,
    memorability: 10
  },

  // SEO criteria
  SEO_CRITERIA: {
    optimalLength: { min: 6, max: 15 },
    preferredCharacters: /^[a-z0-9-]+$/,
    avoidNumbers: true,
    avoidHyphens: true,
    keywordRelevance: true
  },

  // Rate limiting
  RATE_LIMITS: {
    searchDelay: 150,
    whoisDelay: 200,
    dnsDelay: 100,
    socialDelay: 100
  },

  // Professional report sections
  REPORT_SECTIONS: {
    executiveSummary: true,
    availabilityScore: true,
    riskAnalysis: true,
    recommendations: true,
    competitorAnalysis: true,
    socialMediaPresence: true,
    domainOptions: true
  }
};

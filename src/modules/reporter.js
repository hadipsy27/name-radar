/**
 * Professional Reporting Module
 * Generate comprehensive Excel reports with analytics and insights
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const { calculateBrandScore, analyzeCompetitors, generateExecutiveSummary } = require('../utils/scoring');
const { validateBusinessName, detectEntityType, checkSEOFriendliness } = require('../utils/validators');
const { BUSINESS_TLDS } = require('../config/constants');

/**
 * Generate professional Excel report
 */
async function generateProfessionalReport(name, results, options = {}) {
  const {
    outputPath = `./reports/${sanitizeFilename(name)}_analysis.xlsx`,
    includeExecutiveSummary = true,
    includeRecommendations = true,
    includeCompetitorAnalysis = true
  } = options;

  // Calculate scores and analysis
  const brandScore = calculateBrandScore(name, results);
  const executiveSummary = generateExecutiveSummary(name, brandScore, results);
  const competitorAnalysis = analyzeCompetitors(results);
  const entityType = detectEntityType(name);
  const validation = validateBusinessName(name, entityType);
  const seoAnalysis = checkSEOFriendliness(name);

  // Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Name Radar Professional';
  workbook.created = new Date();

  // 1. Executive Summary Sheet
  if (includeExecutiveSummary) {
    await createExecutiveSummarySheet(workbook, name, executiveSummary, brandScore, validation);
  }

  // 2. Detailed Results Sheet
  await createDetailedResultsSheet(workbook, name, results);

  // 3. Domain Analysis Sheet
  await createDomainAnalysisSheet(workbook, name, results, brandScore);

  // 4. Social Media Analysis Sheet
  await createSocialMediaSheet(workbook, name, results, brandScore);

  // 5. SEO & Branding Sheet
  await createSEOBrandingSheet(workbook, name, seoAnalysis, validation);

  // 6. Competitor Analysis Sheet
  if (includeCompetitorAnalysis && competitorAnalysis.count > 0) {
    await createCompetitorAnalysisSheet(workbook, competitorAnalysis, results);
  }

  // 7. Recommendations Sheet
  if (includeRecommendations) {
    await createRecommendationsSheet(workbook, brandScore, executiveSummary);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save workbook
  await workbook.xlsx.writeFile(outputPath);

  return {
    outputPath,
    brandScore,
    executiveSummary,
    competitorAnalysis
  };
}

/**
 * Create Executive Summary Sheet
 */
async function createExecutiveSummarySheet(workbook, name, summary, brandScore, validation) {
  const sheet = workbook.addWorksheet('Executive Summary', {
    views: [{ showGridLines: false }]
  });

  let row = 1;

  // Title
  sheet.mergeCells(`A${row}:F${row}`);
  const titleCell = sheet.getCell(`A${row}`);
  titleCell.value = `NAME RADAR - Professional Business Name Analysis`;
  titleCell.font = { size: 18, bold: true, color: { argb: '002060' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(row).height = 30;
  row += 2;

  // Business Name
  sheet.mergeCells(`A${row}:F${row}`);
  const nameCell = sheet.getCell(`A${row}`);
  nameCell.value = `Business Name: ${name}`;
  nameCell.font = { size: 16, bold: true };
  nameCell.alignment = { horizontal: 'center' };
  sheet.getRow(row).height = 25;
  row += 2;

  // Overall Score Card
  sheet.mergeCells(`B${row}:E${row}`);
  const scoreCard = sheet.getCell(`B${row}`);
  scoreCard.value = `Overall Score: ${brandScore.overall}/100`;
  scoreCard.font = { size: 20, bold: true, color: { argb: 'FFFFFF' } };
  scoreCard.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: getScoreColor(brandScore.overall) }
  };
  scoreCard.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(row).height = 35;
  row += 1;

  // Grade
  sheet.mergeCells(`B${row}:E${row}`);
  const gradeCell = sheet.getCell(`B${row}`);
  gradeCell.value = brandScore.grade;
  gradeCell.font = { size: 14, bold: true };
  gradeCell.alignment = { horizontal: 'center', vertical: 'middle' };
  gradeCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'E7E6E6' }
  };
  row += 2;

  // Recommendation
  sheet.mergeCells(`A${row}:F${row}`);
  const recCell = sheet.getCell(`A${row}`);
  recCell.value = `Recommendation: ${summary.recommendation}`;
  recCell.font = { size: 12, bold: true, color: { argb: getRecommendationColor(summary.recommendation) } };
  recCell.alignment = { horizontal: 'center', wrapText: true };
  sheet.getRow(row).height = 30;
  row += 2;

  // Score Breakdown Header
  sheet.getCell(`A${row}`).value = 'SCORE BREAKDOWN';
  sheet.getCell(`A${row}`).font = { size: 12, bold: true };
  sheet.mergeCells(`A${row}:F${row}`);
  row += 1;

  // Score Breakdown Table
  const breakdownHeaders = ['Category', 'Score', 'Weight', 'Weighted', 'Status'];
  breakdownHeaders.forEach((header, idx) => {
    const cell = sheet.getCell(row, idx + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
    cell.font = { color: { argb: 'FFFFFF' }, bold: true };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  row += 1;

  // Breakdown rows
  Object.entries(brandScore.breakdown).forEach(([category, data]) => {
    sheet.getCell(row, 1).value = formatCategoryName(category);
    sheet.getCell(row, 2).value = `${data.score}/100`;
    sheet.getCell(row, 3).value = `${data.weight}%`;
    sheet.getCell(row, 4).value = data.weighted.toFixed(1);
    sheet.getCell(row, 5).value = getScoreStatus(data.score);

    // Color code the score
    sheet.getCell(row, 2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: getScoreColor(data.score) }
    };

    for (let col = 1; col <= 5; col++) {
      sheet.getCell(row, col).border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    }
    row += 1;
  });

  row += 1;

  // Key Findings
  sheet.getCell(`A${row}`).value = 'KEY FINDINGS';
  sheet.getCell(`A${row}`).font = { size: 12, bold: true };
  sheet.mergeCells(`A${row}:F${row}`);
  row += 1;

  summary.keyFindings.forEach(finding => {
    sheet.mergeCells(`A${row}:F${row}`);
    const cell = sheet.getCell(`A${row}`);
    cell.value = finding;
    cell.alignment = { wrapText: true };
    row += 1;
  });

  row += 1;

  // Next Steps
  sheet.getCell(`A${row}`).value = 'RECOMMENDED NEXT STEPS';
  sheet.getCell(`A${row}`).font = { size: 12, bold: true };
  sheet.mergeCells(`A${row}:F${row}`);
  row += 1;

  summary.nextSteps.forEach((step, idx) => {
    sheet.mergeCells(`A${row}:F${row}`);
    const cell = sheet.getCell(`A${row}`);
    cell.value = `${idx + 1}. ${step}`;
    cell.alignment = { wrapText: true };
    row += 1;
  });

  // Set column widths
  sheet.getColumn(1).width = 25;
  sheet.getColumn(2).width = 15;
  sheet.getColumn(3).width = 15;
  sheet.getColumn(4).width = 15;
  sheet.getColumn(5).width = 20;
  sheet.getColumn(6).width = 15;
}

/**
 * Create Detailed Results Sheet
 */
async function createDetailedResultsSheet(workbook, name, results) {
  const sheet = workbook.addWorksheet('Detailed Results');

  // Headers
  const headers = [
    'Domain/Platform',
    'Type',
    'Match Type',
    'Score',
    'DNS',
    'WHOIS Status',
    'Certificates',
    'Social Platform',
    'Username',
    'Title',
    'URL',
    'Usage Source'
  ];

  sheet.getRow(1).values = headers;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4472C4' }
  };
  sheet.getRow(1).font = { color: { argb: 'FFFFFF' }, bold: true };

  // Add data
  results.forEach((r, idx) => {
    const row = idx + 2;
    sheet.getRow(row).values = [
      r.domain || r.social_platform || 'N/A',
      r.match_type.includes('social') ? 'Social Media' : 'Domain',
      r.match_type,
      r.match_score,
      r.dns && r.dns.resolves ? 'Yes' : 'No',
      getWhoisStatus(r.whois),
      getCertCount(r.crt),
      r.social_platform || '',
      r.social_username || '',
      (r.title || '').substring(0, 50),
      r.url,
      getUsageSources(r)
    ];
  });

  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  };

  // Auto-size columns
  headers.forEach((_, idx) => {
    sheet.getColumn(idx + 1).width = 20;
  });

  sheet.getColumn(10).width = 40; // Title column
  sheet.getColumn(11).width = 50; // URL column
}

/**
 * Create Domain Analysis Sheet
 */
async function createDomainAnalysisSheet(workbook, name, results, brandScore) {
  const sheet = workbook.addWorksheet('Domain Analysis');

  let row = 1;

  // Title
  sheet.mergeCells(`A${row}:E${row}`);
  sheet.getCell(`A${row}`).value = 'Domain Availability Analysis';
  sheet.getCell(`A${row}`).font = { size: 14, bold: true };
  sheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
  row += 2;

  // Headers
  const headers = ['TLD', 'Domain', 'Status', 'DNS Resolves', 'Certificates'];
  headers.forEach((h, idx) => {
    const cell = sheet.getCell(row, idx + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
    cell.font = { color: { argb: 'FFFFFF' }, bold: true };
  });
  row += 1;

  // Group all TLDs
  const allTLDs = [...BUSINESS_TLDS.global, ...BUSINESS_TLDS.indonesia, ...BUSINESS_TLDS.startup];
  const uniqueTLDs = [...new Set(allTLDs)];

  uniqueTLDs.forEach(tld => {
    const domainName = `${name.toLowerCase().replace(/[^a-z0-9-]/g, '')}.${tld}`;
    const found = results.find(r => r.domain === domainName);

    sheet.getCell(row, 1).value = tld;
    sheet.getCell(row, 2).value = domainName;

    if (found) {
      const whoisAvailable = found.whois && found.whois.likelyAvailable;
      const dnsResolves = found.dns && found.dns.resolves;
      const certs = getCertCount(found.crt);

      sheet.getCell(row, 3).value = whoisAvailable ? 'Likely Available' : 'Taken/Unknown';
      sheet.getCell(row, 4).value = dnsResolves ? 'Yes' : 'No';
      sheet.getCell(row, 5).value = certs;

      // Color code status
      const statusCell = sheet.getCell(row, 3);
      if (whoisAvailable && !dnsResolves && certs === 0) {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '00B050' } }; // Green
        statusCell.font = { color: { argb: 'FFFFFF' } };
      } else if (!dnsResolves) {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEB9C' } }; // Yellow
      } else {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } }; // Red
      }
    } else {
      sheet.getCell(row, 3).value = 'Not Checked';
      sheet.getCell(row, 4).value = '-';
      sheet.getCell(row, 5).value = '-';
    }

    row += 1;
  });

  // Auto-size columns
  for (let i = 1; i <= 5; i++) {
    sheet.getColumn(i).width = 20;
  }
}

/**
 * Create Social Media Analysis Sheet
 */
async function createSocialMediaSheet(workbook, name, results, brandScore) {
  const sheet = workbook.addWorksheet('Social Media');

  let row = 1;

  // Title
  sheet.mergeCells(`A${row}:D${row}`);
  sheet.getCell(`A${row}`).value = 'Social Media Handle Availability';
  sheet.getCell(`A${row}`).font = { size: 14, bold: true };
  sheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
  row += 2;

  // Headers
  const headers = ['Platform', 'Handle', 'Status', 'URL'];
  headers.forEach((h, idx) => {
    const cell = sheet.getCell(row, idx + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
    cell.font = { color: { argb: 'FFFFFF' }, bold: true };
  });
  row += 1;

  const platforms = ['instagram', 'facebook', 'twitter', 'linkedin', 'youtube', 'tiktok', 'github'];
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');

  platforms.forEach(platform => {
    const found = results.find(r => r.social_platform === platform);

    sheet.getCell(row, 1).value = platform.charAt(0).toUpperCase() + platform.slice(1);
    sheet.getCell(row, 2).value = `@${cleanName}`;

    const statusCell = sheet.getCell(row, 3);

    // Use verified probe data if available
    if (found && found.social_verified) {
      const probeStatus = found.social_probe_status;
      const confidence = found.social_probe_confidence;

      if (probeStatus === 'taken') {
        statusCell.value = `Taken (Verified)`;
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } }; // Red
        sheet.getCell(row, 4).value = found.url;
      } else if (probeStatus === 'available') {
        statusCell.value = `Available (Verified)`;
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '00B050' } }; // Green
        statusCell.font = { color: { argb: 'FFFFFF' } };
        sheet.getCell(row, 4).value = found.url;
      } else {
        // Unknown status - couldn't verify
        statusCell.value = `Check Manually`;
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEB9C' } }; // Yellow
        sheet.getCell(row, 4).value = found.url;
      }
    } else if (found) {
      // Found in search but not verified
      statusCell.value = 'Taken (Found in Search)';
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } }; // Red
      sheet.getCell(row, 4).value = found.url;
    } else {
      // Not found at all - check manually to be sure
      statusCell.value = 'Check Manually';
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEB9C' } }; // Yellow
      sheet.getCell(row, 4).value = `https://www.${platform}.com/${cleanName}`;
    }

    row += 1;
  });

  // Auto-size columns
  sheet.getColumn(1).width = 15;
  sheet.getColumn(2).width = 20;
  sheet.getColumn(3).width = 20;
  sheet.getColumn(4).width = 50;
}

/**
 * Create SEO & Branding Sheet
 */
async function createSEOBrandingSheet(workbook, name, seoAnalysis, validation) {
  const sheet = workbook.addWorksheet('SEO & Branding');

  let row = 1;

  // Title
  sheet.mergeCells(`A${row}:C${row}`);
  sheet.getCell(`A${row}`).value = 'SEO & Branding Analysis';
  sheet.getCell(`A${row}`).font = { size: 14, bold: true };
  sheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
  row += 2;

  // SEO Score
  sheet.getCell(`A${row}`).value = 'SEO Score:';
  sheet.getCell(`A${row}`).font = { bold: true };
  sheet.getCell(`B${row}`).value = `${seoAnalysis.percentage}/100`;
  sheet.getCell(`C${row}`).value = seoAnalysis.grade;
  row += 2;

  // SEO Factors
  sheet.getCell(`A${row}`).value = 'SEO Factor';
  sheet.getCell(`B${row}`).value = 'Score';
  sheet.getCell(`C${row}`).value = 'Note';
  sheet.getRow(row).font = { bold: true };
  row += 1;

  Object.entries(seoAnalysis.factors).forEach(([factor, data]) => {
    sheet.getCell(`A${row}`).value = formatCategoryName(factor);
    sheet.getCell(`B${row}`).value = data.score;
    sheet.getCell(`C${row}`).value = data.note;
    row += 1;
  });

  row += 2;

  // Validation Results
  sheet.mergeCells(`A${row}:C${row}`);
  sheet.getCell(`A${row}`).value = 'Business Name Validation';
  sheet.getCell(`A${row}`).font = { size: 12, bold: true };
  row += 1;

  if (validation.errors.length > 0) {
    sheet.getCell(`A${row}`).value = 'ERRORS:';
    sheet.getCell(`A${row}`).font = { bold: true, color: { argb: 'FF0000' } };
    row += 1;
    validation.errors.forEach(error => {
      sheet.mergeCells(`A${row}:C${row}`);
      sheet.getCell(`A${row}`).value = `• ${error}`;
      sheet.getCell(`A${row}`).alignment = { wrapText: true };
      row += 1;
    });
  }

  if (validation.warnings.length > 0) {
    row += 1;
    sheet.getCell(`A${row}`).value = 'WARNINGS:';
    sheet.getCell(`A${row}`).font = { bold: true, color: { argb: 'FFA500' } };
    row += 1;
    validation.warnings.forEach(warning => {
      sheet.mergeCells(`A${row}:C${row}`);
      sheet.getCell(`A${row}`).value = `• ${warning}`;
      sheet.getCell(`A${row}`).alignment = { wrapText: true };
      row += 1;
    });
  }

  if (validation.suggestions.length > 0) {
    row += 1;
    sheet.getCell(`A${row}`).value = 'SUGGESTIONS:';
    sheet.getCell(`A${row}`).font = { bold: true, color: { argb: '0000FF' } };
    row += 1;
    validation.suggestions.forEach(suggestion => {
      sheet.mergeCells(`A${row}:C${row}`);
      sheet.getCell(`A${row}`).value = `• ${suggestion}`;
      sheet.getCell(`A${row}`).alignment = { wrapText: true };
      row += 1;
    });
  }

  // Auto-size columns
  sheet.getColumn(1).width = 25;
  sheet.getColumn(2).width = 15;
  sheet.getColumn(3).width = 50;
}

/**
 * Create Competitor Analysis Sheet
 */
async function createCompetitorAnalysisSheet(workbook, analysis, results) {
  const sheet = workbook.addWorksheet('Competitor Analysis');

  let row = 1;

  // Title
  sheet.mergeCells(`A${row}:D${row}`);
  sheet.getCell(`A${row}`).value = 'Competitor & Conflict Analysis';
  sheet.getCell(`A${row}`).font = { size: 14, bold: true };
  sheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
  row += 2;

  // Summary
  sheet.getCell(`A${row}`).value = 'Total Competitors Found:';
  sheet.getCell(`A${row}`).font = { bold: true };
  sheet.getCell(`B${row}`).value = analysis.count;
  row += 1;

  sheet.getCell(`A${row}`).value = 'Threat Level:';
  sheet.getCell(`A${row}`).font = { bold: true };
  const threatCell = sheet.getCell(`B${row}`);
  threatCell.value = analysis.threat.toUpperCase();
  threatCell.font = { bold: true, color: { argb: getThreatColor(analysis.threat) } };
  row += 2;

  // Competitor list
  sheet.getCell(`A${row}`).value = 'Competitor';
  sheet.getCell(`B${row}`).value = 'Type';
  sheet.getCell(`C${row}`).value = 'Platform/Domain';
  sheet.getCell(`D${row}`).value = 'URL';
  sheet.getRow(row).font = { bold: true };
  row += 1;

  const competitors = results.filter(r =>
    r.match_type.includes('exact') || r.match_type.includes('org_title')
  );

  competitors.forEach(comp => {
    sheet.getCell(`A${row}`).value = comp.title || comp.domain || comp.social_username;
    sheet.getCell(`B${row}`).value = comp.match_type;
    sheet.getCell(`C${row}`).value = comp.domain || comp.social_platform || '-';
    sheet.getCell(`D${row}`).value = comp.url;
    row += 1;
  });

  // Auto-size columns
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 20;
  sheet.getColumn(3).width = 25;
  sheet.getColumn(4).width = 50;
}

/**
 * Create Recommendations Sheet
 */
async function createRecommendationsSheet(workbook, brandScore, summary) {
  const sheet = workbook.addWorksheet('Recommendations');

  let row = 1;

  // Title
  sheet.mergeCells(`A${row}:D${row}`);
  sheet.getCell(`A${row}`).value = 'Professional Recommendations';
  sheet.getCell(`A${row}`).font = { size: 14, bold: true };
  sheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
  row += 2;

  // Headers
  sheet.getCell(`A${row}`).value = 'Priority';
  sheet.getCell(`B${row}`).value = 'Category';
  sheet.getCell(`C${row}`).value = 'Finding';
  sheet.getCell(`D${row}`).value = 'Recommended Action';
  sheet.getRow(row).font = { bold: true };
  row += 1;

  // Add recommendations
  brandScore.recommendations.forEach(rec => {
    const priorityCell = sheet.getCell(`A${row}`);
    priorityCell.value = rec.priority.toUpperCase();
    priorityCell.font = { bold: true };
    priorityCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: getPriorityColor(rec.priority) }
    };

    sheet.getCell(`B${row}`).value = rec.category;
    sheet.getCell(`C${row}`).value = rec.message;
    sheet.getCell(`D${row}`).value = rec.action;

    sheet.getRow(row).alignment = { wrapText: true };
    row += 1;
  });

  // Auto-size columns
  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 15;
  sheet.getColumn(3).width = 40;
  sheet.getColumn(4).width = 40;
}

// Helper functions
function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
}

function getScoreColor(score) {
  if (score >= 80) return '00B050';
  if (score >= 60) return '92D050';
  if (score >= 40) return 'FFC000';
  return 'FF0000';
}

function getRecommendationColor(recommendation) {
  if (recommendation.includes('HIGHLY RECOMMENDED')) return '00B050';
  if (recommendation.includes('CONDITIONALLY')) return 'FFC000';
  return 'FF0000';
}

function getScoreStatus(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

function formatCategoryName(name) {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function getWhoisStatus(whois) {
  if (!whois) return 'Not Checked';
  if (!whois.ok) return 'Error';
  return whois.likelyAvailable ? 'Likely Available' : 'Taken/Unknown';
}

function getCertCount(crt) {
  if (!crt || !crt.ok) return 0;
  return Array.isArray(crt.entries) ? crt.entries.length : 0;
}

function getUsageSources(result) {
  const sources = [];
  if (result.whois && result.whois.ok && !result.whois.likelyAvailable) sources.push('WHOIS');
  if (result.dns && result.dns.resolves) sources.push('DNS');
  if (result.crt && result.crt.ok && result.crt.entries && result.crt.entries.length > 0) sources.push('crt.sh');
  if (result.social_platform) sources.push('Social');
  if (result.origin === 'search') sources.push('Search');
  return sources.join('; ');
}

function getThreatColor(threat) {
  switch (threat) {
    case 'high': return 'FF0000';
    case 'medium': return 'FFC000';
    case 'low': return '92D050';
    default: return '00B050';
  }
}

function getPriorityColor(priority) {
  switch (priority) {
    case 'high': return 'FFC7CE';
    case 'medium': return 'FFEB9C';
    case 'low': return 'C6EFCE';
    default: return 'FFFFFF';
  }
}

module.exports = {
  generateProfessionalReport
};

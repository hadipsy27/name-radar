/**
 * Brand Scoring and Analytics
 * Comprehensive scoring system for business name evaluation
 */

const { SCORING_WEIGHTS, BUSINESS_TLDS } = require('../config/constants');
const { checkSEOFriendliness, checkMemorability } = require('./validators');

/**
 * Calculate comprehensive brand score
 */
function calculateBrandScore(name, results) {
  const score = {
    overall: 0,
    breakdown: {},
    grade: '',
    recommendations: []
  };

  // 1. Domain Availability Score (30%)
  const domainScore = calculateDomainScore(results);
  score.breakdown.domainAvailability = {
    score: domainScore.score,
    weight: SCORING_WEIGHTS.domainAvailability,
    weighted: (domainScore.score * SCORING_WEIGHTS.domainAvailability) / 100,
    details: domainScore.details
  };

  // 2. Social Media Availability Score (25%)
  const socialScore = calculateSocialScore(results);
  score.breakdown.socialMediaAvailability = {
    score: socialScore.score,
    weight: SCORING_WEIGHTS.socialMediaAvailability,
    weighted: (socialScore.score * SCORING_WEIGHTS.socialMediaAvailability) / 100,
    details: socialScore.details
  };

  // 3. Trademark Risk Score (20%)
  const trademarkScore = calculateTrademarkRisk(results);
  score.breakdown.trademarkRisk = {
    score: trademarkScore.score,
    weight: SCORING_WEIGHTS.trademark,
    weighted: (trademarkScore.score * SCORING_WEIGHTS.trademark) / 100,
    details: trademarkScore.details
  };

  // 4. SEO Friendliness (15%)
  const seoScore = checkSEOFriendliness(name);
  score.breakdown.seoFriendly = {
    score: seoScore.percentage,
    weight: SCORING_WEIGHTS.seoFriendly,
    weighted: (seoScore.percentage * SCORING_WEIGHTS.seoFriendly) / 100,
    factors: seoScore.factors
  };

  // 5. Memorability Score (10%)
  const memoryScore = checkMemorability(name);
  score.breakdown.memorability = {
    score: memoryScore.percentage,
    weight: SCORING_WEIGHTS.memorability,
    weighted: (memoryScore.percentage * SCORING_WEIGHTS.memorability) / 100,
    factors: memoryScore.factors
  };

  // Calculate overall score
  score.overall = Math.round(
    score.breakdown.domainAvailability.weighted +
    score.breakdown.socialMediaAvailability.weighted +
    score.breakdown.trademarkRisk.weighted +
    score.breakdown.seoFriendly.weighted +
    score.breakdown.memorability.weighted
  );

  // Assign grade
  if (score.overall >= 90) score.grade = 'A+ (Excellent)';
  else if (score.overall >= 80) score.grade = 'A (Very Good)';
  else if (score.overall >= 70) score.grade = 'B (Good)';
  else if (score.overall >= 60) score.grade = 'C (Fair)';
  else if (score.overall >= 50) score.grade = 'D (Poor)';
  else score.grade = 'F (Not Recommended)';

  // Generate recommendations
  score.recommendations = generateRecommendations(score);

  return score;
}

/**
 * Calculate domain availability score
 */
function calculateDomainScore(results) {
  const domainResults = results.filter(r => r.match_type.includes('domain'));
  const score = { score: 0, details: {} };

  // Check critical TLDs
  const criticalTLDs = ['com', 'co.id', 'id', 'io'];
  const availableCritical = criticalTLDs.filter(tld => {
    const found = domainResults.find(r => {
      if (!r.domain || !r.domain.endsWith(`.${tld}`)) return false;

      // Check if domain is taken (any evidence)
      const dnsTaken = r.dns && r.dns.resolves;
      const crtTaken = r.crt && r.crt.ok && r.crt.entries && r.crt.entries.length > 0;
      const whoisTaken = r.whois && r.whois.ok && !r.whois.likelyAvailable;

      return dnsTaken || crtTaken || whoisTaken;
    });

    return !found; // Available if NOT found as taken
  });

  score.details.criticalTLDs = {
    total: criticalTLDs.length,
    available: availableCritical.length,
    unavailable: criticalTLDs.length - availableCritical.length
  };

  // Calculate score based on availability
  if (availableCritical.length === criticalTLDs.length) {
    score.score = 100;
    score.details.status = 'All critical domains available';
  } else if (availableCritical.length >= criticalTLDs.length * 0.75) {
    score.score = 80;
    score.details.status = 'Most critical domains available';
  } else if (availableCritical.length >= criticalTLDs.length * 0.5) {
    score.score = 60;
    score.details.status = 'Some critical domains available';
  } else if (availableCritical.length > 0) {
    score.score = 40;
    score.details.status = 'Few critical domains available';
  } else {
    score.score = 20;
    score.details.status = 'No critical domains available';
  }

  return score;
}

/**
 * Calculate social media availability score
 */
function calculateSocialScore(results) {
  const socialResults = results.filter(r =>
    r.social_platform || r.match_type.includes('social')
  );
  const score = { score: 0, details: {} };

  const criticalPlatforms = ['instagram', 'facebook', 'linkedin', 'twitter'];
  const platformStatus = {};

  criticalPlatforms.forEach(platform => {
    const found = socialResults.find(r => r.social_platform === platform);

    if (found && found.social_verified) {
      // Use verified probe status
      platformStatus[platform] = found.social_probe_status === 'taken' ? 'taken' : 'available';
    } else if (found) {
      // Found in search results but not verified
      platformStatus[platform] = 'taken';
    } else {
      // Not found anywhere
      platformStatus[platform] = 'available';
    }
  });

  score.details.platforms = platformStatus;

  const availableCount = Object.values(platformStatus).filter(s => s === 'available').length;
  score.score = Math.round((availableCount / criticalPlatforms.length) * 100);

  if (score.score === 100) {
    score.details.status = 'All major platforms available';
  } else if (score.score >= 75) {
    score.details.status = 'Most major platforms available';
  } else if (score.score >= 50) {
    score.details.status = 'Some platforms available';
  } else {
    score.details.status = 'Most platforms taken';
  }

  return score;
}

/**
 * Calculate trademark risk
 */
function calculateTrademarkRisk(results) {
  const score = { score: 0, details: {} };

  // Check for exact matches
  const exactMatches = results.filter(r => r.match_type.includes('exact'));

  // Check for org title matches (potential registered businesses)
  const orgMatches = results.filter(r => r.match_type.includes('org_title'));

  score.details.exactMatches = exactMatches.length;
  score.details.orgMatches = orgMatches.length;

  // Calculate risk score (inverted - higher is better)
  if (exactMatches.length === 0 && orgMatches.length === 0) {
    score.score = 100;
    score.details.risk = 'Low Risk';
    score.details.note = 'No existing businesses found with this name';
  } else if (exactMatches.length === 0 && orgMatches.length <= 2) {
    score.score = 80;
    score.details.risk = 'Low-Medium Risk';
    score.details.note = 'Few similar businesses found';
  } else if (exactMatches.length <= 2) {
    score.score = 60;
    score.details.risk = 'Medium Risk';
    score.details.note = 'Some businesses with similar names exist';
  } else if (exactMatches.length <= 5) {
    score.score = 40;
    score.details.risk = 'Medium-High Risk';
    score.details.note = 'Multiple businesses with similar names';
  } else {
    score.score = 20;
    score.details.risk = 'High Risk';
    score.details.note = 'Many existing businesses with this name - high trademark conflict risk';
  }

  return score;
}

/**
 * Generate recommendations based on scores
 */
function generateRecommendations(scoreData) {
  const recommendations = [];

  // Domain recommendations
  if (scoreData.breakdown.domainAvailability.score < 70) {
    recommendations.push({
      priority: 'high',
      category: 'Domain',
      message: 'Consider alternative TLDs or name variations. Critical domains are taken.',
      action: 'Review available domain alternatives in the report'
    });
  }

  // Social media recommendations
  if (scoreData.breakdown.socialMediaAvailability.score < 70) {
    recommendations.push({
      priority: 'medium',
      category: 'Social Media',
      message: 'Major social media handles are taken. Consider name variations.',
      action: 'Secure available platforms immediately or modify the name'
    });
  }

  // Trademark recommendations
  if (scoreData.breakdown.trademarkRisk.score < 60) {
    recommendations.push({
      priority: 'high',
      category: 'Legal',
      message: 'High trademark conflict risk detected. Legal issues may arise.',
      action: 'Conduct professional trademark search before proceeding'
    });
  }

  // SEO recommendations
  if (scoreData.breakdown.seoFriendly.score < 60) {
    recommendations.push({
      priority: 'low',
      category: 'SEO',
      message: 'Name may not be optimal for search engine visibility.',
      action: 'Consider shorter, more memorable alternatives'
    });
  }

  // Overall score recommendations
  if (scoreData.overall >= 80) {
    recommendations.push({
      priority: 'info',
      category: 'Overall',
      message: 'Excellent name choice! Good availability across channels.',
      action: 'Proceed with registration and secure all available platforms'
    });
  } else if (scoreData.overall < 50) {
    recommendations.push({
      priority: 'high',
      category: 'Overall',
      message: 'This name faces significant challenges. Consider alternatives.',
      action: 'Generate and evaluate alternative names'
    });
  }

  return recommendations;
}

/**
 * Analyze competitor presence
 */
function analyzeCompetitors(results) {
  const competitors = results.filter(r =>
    r.match_type.includes('exact') || r.match_type.includes('org_title')
  );

  const analysis = {
    count: competitors.length,
    byType: {},
    byDomain: {},
    bySocial: {},
    threat: 'low'
  };

  // Group by type
  competitors.forEach(c => {
    analysis.byType[c.match_type] = (analysis.byType[c.match_type] || 0) + 1;

    if (c.domain) {
      const tld = c.tld || 'unknown';
      analysis.byDomain[tld] = (analysis.byDomain[tld] || 0) + 1;
    }

    if (c.social_platform) {
      analysis.bySocial[c.social_platform] = (analysis.bySocial[c.social_platform] || 0) + 1;
    }
  });

  // Assess threat level
  if (competitors.length === 0) {
    analysis.threat = 'none';
  } else if (competitors.length <= 2) {
    analysis.threat = 'low';
  } else if (competitors.length <= 5) {
    analysis.threat = 'medium';
  } else {
    analysis.threat = 'high';
  }

  return analysis;
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(name, brandScore, results) {
  const summary = {
    name,
    overallScore: brandScore.overall,
    grade: brandScore.grade,
    recommendation: '',
    keyFindings: [],
    nextSteps: []
  };

  // Overall recommendation
  if (brandScore.overall >= 80) {
    summary.recommendation = 'HIGHLY RECOMMENDED - Proceed with confidence';
    summary.nextSteps.push('Register domain and social media accounts immediately');
    summary.nextSteps.push('File trademark application');
    summary.nextSteps.push('Develop brand identity and guidelines');
  } else if (brandScore.overall >= 60) {
    summary.recommendation = 'CONDITIONALLY RECOMMENDED - Minor concerns exist';
    summary.nextSteps.push('Secure available domains and social accounts');
    summary.nextSteps.push('Consider trademark search for peace of mind');
    summary.nextSteps.push('Monitor competitor activity');
  } else {
    summary.recommendation = 'NOT RECOMMENDED - Significant challenges detected';
    summary.nextSteps.push('Brainstorm alternative names');
    summary.nextSteps.push('Run additional name searches');
    summary.nextSteps.push('Consult with branding professionals');
  }

  // Key findings
  const domainScore = brandScore.breakdown.domainAvailability.score;
  const socialScore = brandScore.breakdown.socialMediaAvailability.score;
  const trademarkScore = brandScore.breakdown.trademarkRisk.score;

  if (domainScore >= 80) {
    summary.keyFindings.push('✓ Primary domains are available');
  } else {
    summary.keyFindings.push('⚠ Limited domain availability');
  }

  if (socialScore >= 80) {
    summary.keyFindings.push('✓ Major social media handles available');
  } else {
    summary.keyFindings.push('⚠ Some social media handles taken');
  }

  if (trademarkScore >= 80) {
    summary.keyFindings.push('✓ Low trademark conflict risk');
  } else {
    summary.keyFindings.push('⚠ Potential trademark conflicts detected');
  }

  return summary;
}

module.exports = {
  calculateBrandScore,
  calculateDomainScore,
  calculateSocialScore,
  calculateTrademarkRisk,
  analyzeCompetitors,
  generateExecutiveSummary,
  generateRecommendations
};

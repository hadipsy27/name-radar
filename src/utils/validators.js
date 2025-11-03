/**
 * Business Name Validation Utilities
 * Professional validation for PT, CV, and other business entities
 */

const { INDONESIA_ENTITY_TYPES, NAME_VALIDATION } = require('../config/constants');

/**
 * Validate business name according to Indonesian regulations and best practices
 */
function validateBusinessName(name, entityType = null) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: [],
    entityInfo: null
  };

  // Basic validations
  if (!name || typeof name !== 'string') {
    validation.isValid = false;
    validation.errors.push('Name is required and must be a string');
    return validation;
  }

  const trimmedName = name.trim();

  // Length validation
  if (trimmedName.length < NAME_VALIDATION.minLength) {
    validation.isValid = false;
    validation.errors.push(`Name too short (minimum ${NAME_VALIDATION.minLength} characters)`);
  }

  if (trimmedName.length > NAME_VALIDATION.maxLength) {
    validation.warnings.push(`Name is quite long (${trimmedName.length} characters). Consider shorter alternatives for better branding.`);
  }

  // Pattern validations
  if (NAME_VALIDATION.invalidPatterns.some(pattern => pattern.test(trimmedName))) {
    validation.isValid = false;
    validation.errors.push('Name contains only numbers or special characters');
  }

  // Reserved words check
  const lowerName = trimmedName.toLowerCase();
  const foundReserved = NAME_VALIDATION.reservedWords.find(word =>
    lowerName.includes(word.toLowerCase())
  );
  if (foundReserved) {
    validation.warnings.push(`Name contains reserved/restricted word: "${foundReserved}". This may face legal issues.`);
  }

  // Trademark risky words
  const foundRisky = NAME_VALIDATION.brandRiskyWords.find(word =>
    lowerName.includes(word.toLowerCase())
  );
  if (foundRisky) {
    validation.warnings.push(`Name contains trademark-protected term: "${foundRisky}". High risk of legal conflicts.`);
  }

  // Entity-specific validation
  if (entityType && INDONESIA_ENTITY_TYPES[entityType]) {
    validation.entityInfo = INDONESIA_ENTITY_TYPES[entityType];

    // Check PT naming rules
    if (entityType === 'PT') {
      if (!trimmedName.toUpperCase().startsWith('PT ')) {
        validation.suggestions.push('PT names should start with "PT " prefix');
      }
      const words = trimmedName.split(/\s+/);
      if (words.length < 3) {
        validation.warnings.push('PT names should have at least 3 words (including "PT")');
      }
    }

    // Check CV naming rules
    if (entityType === 'CV') {
      if (!trimmedName.toUpperCase().startsWith('CV ')) {
        validation.suggestions.push('CV names should start with "CV " prefix');
      }
      const words = trimmedName.split(/\s+/);
      if (words.length < 2) {
        validation.warnings.push('CV names should have at least 2 words (including "CV")');
      }
    }
  }

  return validation;
}

/**
 * Check if name is SEO-friendly
 */
function checkSEOFriendliness(name) {
  const score = {
    total: 0,
    maxScore: 100,
    factors: {}
  };

  const cleanName = name.toLowerCase().replace(/[^a-z0-9-]/g, '');

  // Length check (15 points)
  const length = cleanName.length;
  if (length >= 6 && length <= 15) {
    score.factors.length = { score: 15, note: 'Optimal length for SEO' };
    score.total += 15;
  } else if (length >= 4 && length <= 20) {
    score.factors.length = { score: 10, note: 'Acceptable length' };
    score.total += 10;
  } else {
    score.factors.length = { score: 5, note: 'Suboptimal length for SEO' };
    score.total += 5;
  }

  // Character composition (20 points)
  if (/^[a-z]+$/.test(cleanName)) {
    score.factors.characters = { score: 20, note: 'Pure alphabetic - excellent' };
    score.total += 20;
  } else if (/^[a-z0-9]+$/.test(cleanName)) {
    score.factors.characters = { score: 15, note: 'Alphanumeric - good' };
    score.total += 15;
  } else if (cleanName.includes('-')) {
    score.factors.characters = { score: 10, note: 'Contains hyphens - acceptable but not ideal' };
    score.total += 10;
  }

  // Memorability (25 points)
  const vowels = (cleanName.match(/[aeiou]/g) || []).length;
  const consonants = (cleanName.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
  const vowelRatio = vowels / (vowels + consonants);

  if (vowelRatio >= 0.3 && vowelRatio <= 0.5) {
    score.factors.memorability = { score: 25, note: 'Good balance of vowels and consonants' };
    score.total += 25;
  } else {
    score.factors.memorability = { score: 15, note: 'Could be more memorable' };
    score.total += 15;
  }

  // Pronounceability (20 points)
  const difficultPatterns = /([bcdfghjklmnpqrstvwxyz]{4,})/g;
  if (!difficultPatterns.test(cleanName)) {
    score.factors.pronounceability = { score: 20, note: 'Easy to pronounce' };
    score.total += 20;
  } else {
    score.factors.pronounceability = { score: 10, note: 'May be difficult to pronounce' };
    score.total += 10;
  }

  // Uniqueness (20 points) - check for common patterns
  const commonWords = ['tech', 'digital', 'solutions', 'group', 'international', 'global', 'indo', 'nusa'];
  const hasCommonWord = commonWords.some(word => cleanName.includes(word));
  if (!hasCommonWord) {
    score.factors.uniqueness = { score: 20, note: 'Unique name without overused terms' };
    score.total += 20;
  } else {
    score.factors.uniqueness = { score: 10, note: 'Contains common business terms' };
    score.total += 10;
  }

  score.percentage = Math.round((score.total / score.maxScore) * 100);
  score.grade = score.percentage >= 80 ? 'Excellent' :
                score.percentage >= 60 ? 'Good' :
                score.percentage >= 40 ? 'Fair' : 'Poor';

  return score;
}

/**
 * Check brand memorability
 */
function checkMemorability(name) {
  const cleanName = name.toLowerCase().replace(/[^a-z]/g, '');
  const score = {
    total: 0,
    factors: {}
  };

  // Length factor
  if (cleanName.length <= 8) {
    score.factors.length = { value: 30, note: 'Short and memorable' };
    score.total += 30;
  } else if (cleanName.length <= 12) {
    score.factors.length = { value: 20, note: 'Moderate length' };
    score.total += 20;
  } else {
    score.factors.length = { value: 10, note: 'Long - harder to remember' };
    score.total += 10;
  }

  // Repetition patterns (like "papa", "mama")
  const hasRepetition = /(.{2,})\1/.test(cleanName);
  if (hasRepetition) {
    score.factors.pattern = { value: 20, note: 'Contains repetitive pattern' };
    score.total += 20;
  }

  // Rhyming quality
  const syllables = cleanName.match(/[aeiou]+[^aeiou]*/g) || [];
  if (syllables.length >= 2 && syllables.length <= 3) {
    score.factors.rhythm = { value: 25, note: 'Good rhythmic structure' };
    score.total += 25;
  }

  // Alliteration (same starting sounds)
  const words = name.split(/[\s-]+/);
  if (words.length >= 2) {
    const firstLetters = words.map(w => w.charAt(0).toLowerCase());
    const hasAlliteration = firstLetters.every(l => l === firstLetters[0]);
    if (hasAlliteration) {
      score.factors.alliteration = { value: 25, note: 'Uses alliteration' };
      score.total += 25;
    }
  }

  score.percentage = Math.min(100, score.total);
  return score;
}

/**
 * Get entity type from name
 */
function detectEntityType(name) {
  const upperName = name.toUpperCase().trim();

  if (upperName.startsWith('PT ') || upperName.startsWith('PT.')) {
    return 'PT';
  }
  if (upperName.startsWith('CV ') || upperName.startsWith('CV.')) {
    return 'CV';
  }
  if (upperName.startsWith('UD ') || upperName.startsWith('UD.')) {
    return 'UD';
  }
  if (upperName.includes('FIRMA')) {
    return 'Firma';
  }

  return null;
}

/**
 * Generate name variants for testing
 */
function generateNameVariants(name) {
  const cleaned = name.replace(/^(PT|CV|UD)\s+/i, '').trim();
  const variants = new Set([cleaned]);

  // Add lowercase
  variants.add(cleaned.toLowerCase());

  // Add without spaces
  variants.add(cleaned.replace(/\s+/g, ''));
  variants.add(cleaned.toLowerCase().replace(/\s+/g, ''));

  // Add with hyphens
  variants.add(cleaned.replace(/\s+/g, '-').toLowerCase());

  // Add camelCase
  const words = cleaned.split(/\s+/);
  if (words.length > 1) {
    const camelCase = words[0].toLowerCase() + words.slice(1).map(w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join('');
    variants.add(camelCase);
  }

  return Array.from(variants);
}

module.exports = {
  validateBusinessName,
  checkSEOFriendliness,
  checkMemorability,
  detectEntityType,
  generateNameVariants
};

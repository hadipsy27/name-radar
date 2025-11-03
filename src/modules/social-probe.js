/**
 * Social Media Direct Probing Module
 * Directly check if social media handles exist
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Fetch with proper headers and error handling
 */
async function fetchWithHeaders(url, options = {}) {
  try {
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache'
    };

    const response = await fetch(url, {
      method: 'HEAD', // Use HEAD first for faster response
      headers: { ...defaultHeaders, ...options.headers },
      redirect: 'follow',
      timeout: options.timeout || 20000,
      ...options
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      text: async () => '', // HEAD doesn't have body
      headers: response.headers
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: error.message,
      error: error.message
    };
  }
}

/**
 * Check Instagram account
 * Instagram typically returns 200 for existing accounts, 404 for non-existent
 */
async function checkInstagram(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.instagram.com/${cleanUsername}/`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // 404 = account doesn't exist
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    // 200 = account exists
    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    // 429 = rate limited
    if (response.status === 429) {
      return { exists: null, url, status: 'unknown', confidence: 'low', note: 'Rate limited' };
    }

    // 302/301 usually means exists (redirect to login or  different page)
    if (response.status === 302 || response.status === 301) {
      return { exists: true, url, status: 'taken', confidence: 'medium' };
    }

    // 0 = network error, timeout, etc - can't determine
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error' };
    }

    // Other status codes
    return { exists: null, url, status: 'unknown', confidence: 'low', note: `HTTP ${response.status}` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check Facebook page/profile
 * Facebook returns 200 for existing pages, redirects or errors for non-existent
 */
async function checkFacebook(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.facebook.com/${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    if (response.status === 302 || response.status === 301) {
      // Facebook redirects to different URL, likely exists
      return { exists: true, url, status: 'taken', confidence: 'medium' };
    }

    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error' };
    }

    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status}` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check YouTube channel
 * YouTube returns 200 for existing channels, 404 for non-existent
 */
async function checkYouTube(username) {
  const cleanUsername = username.replace(/^@/, '');

  // Try @username format (new format)
  const url = `https://www.youtube.com/@${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    if (response.status === 302 || response.status === 301) {
      return { exists: true, url, status: 'taken', confidence: 'medium' };
    }

    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error' };
    }

    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status}` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check Twitter/X account
 * Twitter returns 200 for existing accounts
 */
async function checkTwitter(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://twitter.com/${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    if (response.status === 302 || response.status === 301) {
      return { exists: true, url, status: 'taken', confidence: 'medium' };
    }

    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error' };
    }

    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status}` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check TikTok account
 * TikTok returns 200 for existing accounts
 */
async function checkTikTok(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.tiktok.com/@${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    if (response.status === 302 || response.status === 301) {
      return { exists: true, url, status: 'taken', confidence: 'medium' };
    }

    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error' };
    }

    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status}` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check LinkedIn company/profile
 * LinkedIn returns 200 for existing pages
 */
async function checkLinkedIn(username) {
  const cleanUsername = username.replace(/^@/, '');
  // Try company first (more common for businesses)
  const url = `https://www.linkedin.com/company/${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'medium' };
    }

    if (response.status === 302 || response.status === 301) {
      return { exists: true, url, status: 'taken', confidence: 'medium' };
    }

    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error' };
    }

    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status}` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check GitHub account
 * GitHub returns 404 for non-existent users/orgs
 */
async function checkGitHub(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://github.com/${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // GitHub is very reliable with 404
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    if (response.status === 302 || response.status === 301) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error' };
    }

    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status}` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Probe all social media platforms for a username
 */
async function probeSocialMedia(username, options = {}) {
  const {
    platforms = ['instagram', 'facebook', 'twitter', 'linkedin', 'youtube', 'tiktok', 'github'],
    concurrency = 3,
    delay = 1000,
    debug = false
  } = options;

  const results = {};

  // Define checkers
  const checkers = {
    instagram: checkInstagram,
    facebook: checkFacebook,
    youtube: checkYouTube,
    twitter: checkTwitter,
    tiktok: checkTikTok,
    linkedin: checkLinkedIn,
    github: checkGitHub
  };

  // Check platforms with delay to avoid rate limiting
  for (const platform of platforms) {
    if (checkers[platform]) {
      try {
        if (debug) console.log(`[DEBUG] Checking ${platform} for @${username}...`);
        results[platform] = await checkers[platform](username);
        if (debug) console.log(`[DEBUG] ${platform}: ${results[platform].status}`);

        // Add delay between requests
        if (platforms.indexOf(platform) < platforms.length - 1) {
          await sleep(delay);
        }
      } catch (error) {
        results[platform] = {
          exists: null,
          url: '',
          status: 'error',
          confidence: 'none',
          error: error.message
        };
      }
    }
  }

  return results;
}

/**
 * Get a quick summary of social media availability
 */
function getSocialSummary(probeResults) {
  const summary = {
    total: Object.keys(probeResults).length,
    taken: 0,
    available: 0,
    unknown: 0,
    platforms: {}
  };

  Object.entries(probeResults).forEach(([platform, result]) => {
    summary.platforms[platform] = result.status;

    if (result.status === 'taken') summary.taken++;
    else if (result.status === 'available') summary.available++;
    else summary.unknown++;
  });

  return summary;
}

module.exports = {
  probeSocialMedia,
  getSocialSummary,
  checkInstagram,
  checkFacebook,
  checkYouTube,
  checkTwitter,
  checkTikTok,
  checkLinkedIn,
  checkGitHub
};

/**
 * Social Media Direct Probing Module
 * Directly check if social media handles exist
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Fetch with proper headers and error handling
 * Uses GET method for better redirect compatibility
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
      method: 'GET', // Use GET for better redirect compatibility
      headers: { ...defaultHeaders, ...options.headers },
      redirect: 'manual', // Don't auto-follow, so we can detect redirects
      timeout: options.timeout || 20000,
      ...options
    });

    // Check if it's a redirect
    const isRedirect = response.status >= 300 && response.status < 400;
    const redirectUrl = response.headers.get('location');

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      isRedirect,
      redirectUrl,
      text: async () => {
        try {
          return await response.text();
        } catch {
          return '';
        }
      },
      headers: response.headers
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: error.message,
      error: error.message,
      isRedirect: false,
      redirectUrl: null
    };
  }
}

/**
 * Check Instagram account
 * Instagram typically returns 200 for existing accounts, 404 for non-existent
 * May redirect to login page for existing accounts
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

    // 429 = rate limited (can't determine)
    if (response.status === 429) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Rate limited - check manually' };
    }

    // Redirect = likely exists (Instagram redirects to login or mobile version)
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      const redirUrl = response.redirectUrl || '';
      // If redirecting within Instagram domain (not to login or error), account exists
      if (redirUrl.includes('instagram.com') && !redirUrl.includes('/accounts/login')) {
        return {
          exists: true,
          url,
          status: 'taken',
          confidence: 'high',
          note: 'Redirected (account exists)'
        };
      }
      // Redirect to login might mean account exists but requires auth
      if (redirUrl.includes('/accounts/login')) {
        return {
          exists: null,
          url,
          status: 'unknown',
          confidence: 'none',
          note: 'Requires login - check manually'
        };
      }
    }

    // 403 = Forbidden (Instagram blocking, can't determine)
    if (response.status === 403) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Blocked by Instagram - check manually' };
    }

    // 0 = network error, timeout, etc - can't determine
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    // Other status codes
    return { exists: null, url, status: 'unknown', confidence: 'low', note: `HTTP ${response.status} - check manually` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check Facebook page/profile
 * Facebook redirects to web.facebook.com for existing pages
 * Example: facebook.com/cretivox -> web.facebook.com/cretivox?_rdc=1&_rdr
 */
async function checkFacebook(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.facebook.com/${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // Successful page load = taken
    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    // 404 = definitely doesn't exist
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    // Redirect = page exists
    // Facebook typically redirects to web.facebook.com, m.facebook.com, or with query params
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      const redirUrl = response.redirectUrl || '';
      // Check if redirect is to Facebook domain (not error page)
      if (redirUrl.includes('facebook.com') && !redirUrl.includes('login') && !redirUrl.includes('error')) {
        return {
          exists: true,
          url: redirUrl || url,
          status: 'taken',
          confidence: 'high',
          note: 'Redirected (page exists)'
        };
      }
    }

    // Network error
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    // Other status codes
    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status}` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check YouTube channel
 * YouTube returns 200 for existing channels, 404 for non-existent
 * May redirect to different YouTube URL formats
 */
async function checkYouTube(username) {
  const cleanUsername = username.replace(/^@/, '');

  // Try @username format (new format)
  const url = `https://www.youtube.com/@${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // 200 = channel exists
    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    // 404 = channel doesn't exist
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    // Redirect = channel exists (YouTube may redirect to /c/ or /channel/ format)
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      const redirUrl = response.redirectUrl || '';
      if (redirUrl.includes('youtube.com') && !redirUrl.includes('error')) {
        return {
          exists: true,
          url: redirUrl || url,
          status: 'taken',
          confidence: 'high',
          note: 'Redirected (channel exists)'
        };
      }
    }

    // Network error
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status}` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check Twitter/X account
 * Twitter redirects to x.com for existing accounts
 * Example: twitter.com/cretivox -> x.com/cretivox
 */
async function checkTwitter(username) {
  const cleanUsername = username.replace(/^@/, '');

  // Try both twitter.com and x.com
  const urls = [
    `https://twitter.com/${cleanUsername}`,
    `https://x.com/${cleanUsername}`
  ];

  for (const url of urls) {
    try {
      const response = await fetchWithHeaders(url, { timeout: 20000 });

      // Successful page load = taken
      if (response.status === 200) {
        return { exists: true, url, status: 'taken', confidence: 'high' };
      }

      // 404 = doesn't exist
      if (response.status === 404) {
        // Only return available if BOTH URLs return 404
        if (url === urls[urls.length - 1]) {
          return { exists: false, url: urls[0], status: 'available', confidence: 'high' };
        }
        continue; // Try next URL
      }

      // Redirect = account exists
      // Twitter redirects from twitter.com to x.com
      if (response.isRedirect || response.status === 302 || response.status === 301) {
        const redirUrl = response.redirectUrl || '';
        // Check if redirect is to x.com or twitter.com domain (not error page)
        if ((redirUrl.includes('x.com') || redirUrl.includes('twitter.com')) &&
            !redirUrl.includes('login') && !redirUrl.includes('error')) {
          return {
            exists: true,
            url: redirUrl || url,
            status: 'taken',
            confidence: 'high',
            note: 'Redirected (account exists)'
          };
        }
      }

      // Network error
      if (response.status === 0) {
        continue; // Try next URL
      }

      // If we get here and it's not the last URL, try next
      if (url !== urls[urls.length - 1]) {
        continue;
      }

      // Last URL - return unknown
      return { exists: null, url: urls[0], status: 'unknown', confidence: 'medium', note: `HTTP ${response.status}` };

    } catch (error) {
      if (url === urls[urls.length - 1]) {
        return { exists: null, url: urls[0], status: 'unknown', confidence: 'none', error: error.message };
      }
      continue; // Try next URL
    }
  }

  return { exists: null, url: urls[0], status: 'unknown', confidence: 'none', note: 'All attempts failed' };
}

/**
 * Check TikTok account
 * TikTok returns 200 for existing accounts
 * May have aggressive anti-bot protection
 */
async function checkTikTok(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.tiktok.com/@${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // 200 = account exists
    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    // 404 = account doesn't exist
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    // Redirect = account likely exists
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      const redirUrl = response.redirectUrl || '';
      if (redirUrl.includes('tiktok.com') && !redirUrl.includes('error')) {
        return {
          exists: true,
          url: redirUrl || url,
          status: 'taken',
          confidence: 'high',
          note: 'Redirected (account exists)'
        };
      }
    }

    // 403 = Blocked by TikTok
    if (response.status === 403) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Blocked by TikTok - check manually' };
    }

    // Network error
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status} - check manually` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check LinkedIn company/profile
 * LinkedIn returns 200 for existing pages
 * May redirect to different URL or require authentication
 */
async function checkLinkedIn(username) {
  const cleanUsername = username.replace(/^@/, '');
  // Try company first (more common for businesses)
  const url = `https://www.linkedin.com/company/${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // 200 = page exists
    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    // 404 = page doesn't exist
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'medium' };
    }

    // Redirect = page likely exists
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      const redirUrl = response.redirectUrl || '';
      // LinkedIn may redirect to login or different format
      if (redirUrl.includes('linkedin.com')) {
        // If redirecting to login/auth, can't determine - needs manual check
        if (redirUrl.includes('authwall') || redirUrl.includes('login')) {
          return {
            exists: null,
            url,
            status: 'unknown',
            confidence: 'none',
            note: 'Requires login - check manually'
          };
        }
        // Other LinkedIn redirects usually mean page exists
        return {
          exists: true,
          url: redirUrl || url,
          status: 'taken',
          confidence: 'high',
          note: 'Redirected (page exists)'
        };
      }
    }

    // 999 = LinkedIn rate limiting
    if (response.status === 999) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'LinkedIn rate limit - check manually' };
    }

    // Network error
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status} - check manually` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check GitHub account
 * GitHub is the most reliable - returns 404 for non-existent users/orgs
 */
async function checkGitHub(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://github.com/${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // GitHub is very reliable with 404 - definitely doesn't exist
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    // 200 = user/org exists
    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'high' };
    }

    // Redirect = user/org exists (rare but possible)
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      const redirUrl = response.redirectUrl || '';
      if (redirUrl.includes('github.com')) {
        return {
          exists: true,
          url: redirUrl || url,
          status: 'taken',
          confidence: 'high',
          note: 'Redirected (account exists)'
        };
      }
    }

    // 429 = Rate limited
    if (response.status === 429) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Rate limited - check manually' };
    }

    // Network error
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status} - check manually` };

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

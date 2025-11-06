/**
 * Social Media Direct Probing Module
 * Directly check if social media handles exist
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Search engines for Facebook verification via Google/Bing search
 */
async function searchEngine(query, maxResults = 10) {
  try {
    // Try Bing first (more reliable for scraping)
    const urls = await bingSearch(query, maxResults);
    if (urls.length > 0) return urls;

    // Fallback to DuckDuckGo
    return await ddgSearch(query, maxResults);
  } catch (error) {
    return [];
  }
}

async function bingSearch(query, num = 10) {
  try {
    const qs = new URLSearchParams({ q: query, count: String(num) }).toString();
    const url = `https://www.bing.com/search?${qs}`;
    const html = await fetchPage(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const urls = [];
    $('li.b_algo, .b_algo, ol#b_results > li').each((i, el) => {
      if (urls.length >= num) return false;
      const a = $(el).find('h2 a').attr('href') || $(el).find('a[href^="http"]').attr('href');
      if (a && a.startsWith('http')) urls.push(a);
    });
    return [...new Set(urls)].slice(0, num);
  } catch {
    return [];
  }
}

async function ddgSearch(query, num = 10) {
  try {
    const qs = new URLSearchParams({ q: query, s: '0' }).toString();
    const url = `https://duckduckgo.com/html/?${qs}`;
    const html = await fetchPage(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const urls = [];
    $('a.result__a, a.result__url, div.result h2 a').each((i, el) => {
      if (urls.length >= num) return false;
      const href = $(el).attr('href');
      if (href && href.startsWith('http')) urls.push(href);
    });
    return [...new Set(urls)].slice(0, num);
  } catch {
    return [];
  }
}

async function fetchPage(url, timeout = 15000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      redirect: 'follow',
      timeout
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

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
 * Strategy 1: Search-based detection (Primary - avoids anti-bot)
 * Strategy 2: Direct probe (Fallback)
 *
 * SEARCH APPROACH:
 * - Search "instagram {username}" on Bing/Google
 * - If results contain instagram.com/{username}/ → account EXISTS
 * - Avoids Instagram's aggressive anti-bot measures
 */
async function checkInstagram(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.instagram.com/${cleanUsername}/`;

  try {
    // STRATEGY 1: Search-based detection
    const searchQuery = `instagram ${cleanUsername}`;
    const searchResults = await searchEngine(searchQuery, 10);

    // Look for Instagram URLs matching this username
    const igUrlPatterns = [
      `instagram.com/${cleanUsername}`,
      `instagram.com/${cleanUsername}/`,
      `www.instagram.com/${cleanUsername}`,
      `www.instagram.com/${cleanUsername}/`
    ];

    const foundInSearch = searchResults.some(resultUrl => {
      const lowerUrl = resultUrl.toLowerCase();
      return igUrlPatterns.some(pattern => lowerUrl.includes(pattern));
    });

    if (foundInSearch) {
      return {
        exists: true,
        url,
        status: 'taken',
        confidence: 'high',
        note: 'Found in search results (Google/Bing)'
      };
    }

    // STRATEGY 2: Direct probe (fallback)
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
 * Strategy 1: Search Google/Bing for "facebook {username}" to avoid anti-bot blocking
 * Strategy 2: Direct probe with userID pattern detection (fallback)
 *
 * SEARCH APPROACH (Primary):
 * - Search "facebook {username}" on Bing/Google
 * - If results contain https://www.facebook.com/{username}/ → profile EXISTS
 * - Avoids Facebook's anti-bot measures
 *
 * DIRECT PROBE (Fallback):
 * - EXISTS: Multiple "userID" fields (9+) with actual ID like "100051375944041"
 * - NOT EXISTS: Only 1 "userID" field with value "0"
 */
async function checkFacebook(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.facebook.com/${cleanUsername}`;

  try {
    // STRATEGY 1: Search-based detection (Google/Bing search approach)
    // Search for "facebook {username}" and check if Facebook URL appears in results
    const searchQuery = `facebook ${cleanUsername}`;
    const searchResults = await searchEngine(searchQuery, 10);

    // Look for Facebook URLs matching this username
    const fbUrlPatterns = [
      `facebook.com/${cleanUsername}`,
      `facebook.com/${cleanUsername}/`,
      `www.facebook.com/${cleanUsername}`,
      `www.facebook.com/${cleanUsername}/`,
      `web.facebook.com/${cleanUsername}`,
      `m.facebook.com/${cleanUsername}`
    ];

    const foundInSearch = searchResults.some(resultUrl => {
      const lowerUrl = resultUrl.toLowerCase();
      return fbUrlPatterns.some(pattern => lowerUrl.includes(pattern));
    });

    if (foundInSearch) {
      return {
        exists: true,
        url,
        status: 'taken',
        confidence: 'high',
        note: 'Found in search results (Google/Bing)'
      };
    }

    // If search returns no results OR no Facebook URL found, try direct probe
    // STRATEGY 2: Direct probe with userID pattern detection (fallback)

    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // Get response body to check userID pattern
    let html = '';
    try {
      html = await response.text();
    } catch (e) {
      // If we can't get body, fall back to status code check
      if (response.status === 200) {
        return { exists: true, url, status: 'taken', confidence: 'medium', note: 'Status 200 (body unreadable)' };
      }
      if (response.status === 404) {
        return { exists: false, url, status: 'available', confidence: 'high' };
      }
    }

    // Check userID pattern in response
    if (html) {
      // Count occurrences of "userID"
      const userIDMatches = html.match(/"userID"\s*:\s*"([^"]+)"/g) || [];
      const userIDCount = userIDMatches.length;

      // Extract userID values
      const userIDValues = userIDMatches.map(match => {
        const valueMatch = match.match(/"userID"\s*:\s*"([^"]+)"/);
        return valueMatch ? valueMatch[1] : null;
      }).filter(Boolean);

      // Check for userVanity (stronger indicator)
      const hasUserVanity = html.includes(`"userVanity":"${cleanUsername}"`);

      // Profile EXISTS if:
      // 1. Multiple userID fields (9+)
      // 2. userID values are not "0"
      // 3. Or has userVanity matching username
      const hasRealUserID = userIDValues.some(id => id !== "0" && id.length > 1);

      if (userIDCount >= 3 && hasRealUserID) {
        return {
          exists: true,
          url,
          status: 'taken',
          confidence: 'high',
          note: `Found ${userIDCount} userID fields with real IDs`
        };
      }

      if (hasUserVanity) {
        return {
          exists: true,
          url,
          status: 'taken',
          confidence: 'high',
          note: 'Found userVanity matching username'
        };
      }

      // Profile DOESN'T EXIST if:
      // Only 1 userID field with value "0"
      if (userIDCount <= 1 && userIDValues.every(id => id === "0")) {
        return {
          exists: false,
          url,
          status: 'available',
          confidence: 'high',
          note: 'Only found userID: "0" (no profile)'
        };
      }

      // Check for "Page Not Found" text
      if (html.includes('Page Not Found') ||
          html.includes('This content isn\'t available') ||
          html.includes('Content Not Available')) {
        return { exists: false, url, status: 'available', confidence: 'high' };
      }
    }

    // Fallback to HTTP status code checks

    // 404 = definitely doesn't exist
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    // 200 = likely exists (but couldn't parse body reliably)
    if (response.status === 200) {
      return { exists: true, url, status: 'taken', confidence: 'medium', note: 'Status 200 but could not verify userID pattern' };
    }

    // Redirect = page likely exists
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

    // 403 = Blocked
    if (response.status === 403) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Blocked by Facebook - check manually' };
    }

    // Other status codes
    return { exists: null, url, status: 'unknown', confidence: 'medium', note: `HTTP ${response.status} - check manually` };

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
 * Strategy 1: Search-based detection (Primary)
 * Strategy 2: Direct probe (Fallback)
 *
 * SEARCH APPROACH:
 * - Search "twitter {username}" or "x {username}" on Bing/Google
 * - If results contain twitter.com/{username} or x.com/{username} → account EXISTS
 */
async function checkTwitter(username) {
  const cleanUsername = username.replace(/^@/, '');

  try {
    // STRATEGY 1: Search-based detection
    const searchQuery = `twitter ${cleanUsername}`;
    const searchResults = await searchEngine(searchQuery, 10);

    // Look for Twitter/X URLs matching this username
    const twitterUrlPatterns = [
      `twitter.com/${cleanUsername}`,
      `www.twitter.com/${cleanUsername}`,
      `x.com/${cleanUsername}`,
      `www.x.com/${cleanUsername}`
    ];

    const foundInSearch = searchResults.some(resultUrl => {
      const lowerUrl = resultUrl.toLowerCase();
      return twitterUrlPatterns.some(pattern => lowerUrl.includes(pattern));
    });

    if (foundInSearch) {
      return {
        exists: true,
        url: `https://twitter.com/${cleanUsername}`,
        status: 'taken',
        confidence: 'high',
        note: 'Found in search results (Google/Bing)'
      };
    }

    // STRATEGY 2: Direct probe (fallback)
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

  } catch (error) {
    return { exists: null, url: `https://twitter.com/${cleanUsername}`, status: 'unknown', confidence: 'none', error: error.message };
  }
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

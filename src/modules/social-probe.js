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
 * Conservative detection: verify response body for 200 status
 * Philosophy: Better to say "unknown" than incorrectly say "taken"
 */
async function checkInstagram(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.instagram.com/${cleanUsername}/`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // 404 = account doesn't exist (RELIABLE)
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    // 200 = might exist, need to verify response body
    if (response.status === 200) {
      try {
        const html = await response.text();

        // Check for "Page Not Found" or similar messages in body
        if (html.includes('Sorry, this page isn\'t available') ||
            html.includes('The link you followed may be broken') ||
            html.includes('Page Not Found')) {
          return { exists: false, url, status: 'available', confidence: 'high', note: 'Page not found (verified)' };
        }

        // Check for profile indicators in body
        if (html.includes('"username":"' + cleanUsername + '"') ||
            html.includes('profilePage') ||
            html.includes('ProfilePage')) {
          return { exists: true, url, status: 'taken', confidence: 'high', note: 'Profile verified' };
        }

        // Got 200 but can't verify - be conservative
        return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify - check manually' };
      } catch (e) {
        // Can't read body - be conservative
        return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify response - check manually' };
      }
    }

    // 429 = rate limited (can't determine)
    if (response.status === 429) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Rate limited - check manually' };
    }

    // 403 = Forbidden (Instagram blocking, can't determine)
    if (response.status === 403) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Blocked by Instagram - check manually' };
    }

    // Redirect = uncertain without following
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Redirect detected - check manually' };
    }

    // 0 = network error, timeout, etc - can't determine
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    // Other status codes - be conservative
    return { exists: null, url, status: 'unknown', confidence: 'none', note: `HTTP ${response.status} - check manually` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check Facebook page/profile
 * Uses userID pattern detection (discovered by user)
 * - EXISTS: Multiple "userID" fields (3+) with actual ID like "100051375944041"
 * - NOT EXISTS: Only 1 "userID" field with value "0"
 * Conservative: defaults to "unknown" when can't verify
 */
async function checkFacebook(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.facebook.com/${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // 404 = definitely doesn't exist
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    // Get response body to check userID pattern
    let html = '';
    try {
      html = await response.text();
    } catch (e) {
      // Can't get body - be conservative
      if (response.status === 200) {
        return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify response - check manually' };
      }
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not read response - check manually' };
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
      // 1. Multiple userID fields (3+) with real IDs (not "0")
      // 2. Or has userVanity matching username
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

      // Check for "Sorry, this page isn't available" (mobile version)
      if (html.includes('Sorry, this page isn\'t available') ||
          html.includes('The link may be broken')) {
        return { exists: false, url, status: 'available', confidence: 'high' };
      }
    }

    // 200 but couldn't parse userID pattern - be conservative
    if (response.status === 200) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify userID pattern - check manually' };
    }

    // 403 = Blocked
    if (response.status === 403) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Blocked by Facebook - check manually' };
    }

    // Redirect = uncertain
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Redirect detected - check manually' };
    }

    // Network error
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    // Other status codes - be conservative
    return { exists: null, url, status: 'unknown', confidence: 'none', note: `HTTP ${response.status} - check manually` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check YouTube channel
 * Conservative detection: verify response body for 200 status
 */
async function checkYouTube(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.youtube.com/@${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // 404 = channel doesn't exist (RELIABLE)
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    // 200 = might exist, verify body
    if (response.status === 200) {
      try {
        const html = await response.text();

        // Check for "This channel doesn't exist" or similar
        if (html.includes('This channel doesn\'t exist') ||
            html.includes('This page isn\'t available') ||
            html.includes('Channel not found')) {
          return { exists: false, url, status: 'available', confidence: 'high', note: 'Channel not found (verified)' };
        }

        // Check for channel indicators
        if (html.includes('"channelId"') ||
            html.includes('"author":"' + cleanUsername + '"') ||
            html.includes('ytInitialData')) {
          return { exists: true, url, status: 'taken', confidence: 'high', note: 'Channel verified' };
        }

        // Got 200 but can't verify - be conservative
        return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify - check manually' };
      } catch (e) {
        // Can't read body - be conservative
        return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify response - check manually' };
      }
    }

    // 403 = blocked
    if (response.status === 403) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Blocked by YouTube - check manually' };
    }

    // Redirect = uncertain
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Redirect detected - check manually' };
    }

    // Network error
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    // Other status codes - be conservative
    return { exists: null, url, status: 'unknown', confidence: 'none', note: `HTTP ${response.status} - check manually` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check Twitter/X account
 * Conservative detection: verify response body for 200 status
 * Tries both twitter.com and x.com (Twitter redirects to x.com)
 */
async function checkTwitter(username) {
  const cleanUsername = username.replace(/^@/, '');

  try {
    // Try both twitter.com and x.com
    const urls = [
      `https://twitter.com/${cleanUsername}`,
      `https://x.com/${cleanUsername}`
    ];

    let last404Count = 0;

    for (const url of urls) {
      try {
        const response = await fetchWithHeaders(url, { timeout: 20000 });

        // 404 = doesn't exist on this domain
        if (response.status === 404) {
          last404Count++;
          // Only return available if BOTH URLs return 404
          if (last404Count >= 2) {
            return { exists: false, url: urls[0], status: 'available', confidence: 'high' };
          }
          continue; // Try next URL
        }

        // 200 = might exist, verify body
        if (response.status === 200) {
          try {
            const html = await response.text();

            // Check for "Account suspended" or "This account doesn't exist"
            if (html.includes('Account suspended') ||
                html.includes('This account doesn\'t exist') ||
                html.includes('User not found')) {
              last404Count++;
              if (last404Count >= 2) {
                return { exists: false, url: urls[0], status: 'available', confidence: 'high', note: 'Account not found (verified)' };
              }
              continue;
            }

            // Check for profile indicators
            if (html.includes('"screen_name":"' + cleanUsername + '"') ||
                html.includes('ProfilePage') ||
                html.includes('UserProfileHeader')) {
              return { exists: true, url, status: 'taken', confidence: 'high', note: 'Profile verified' };
            }

            // Got 200 but can't verify - be conservative
            return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify - check manually' };
          } catch (e) {
            // Can't read body - be conservative
            return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify response - check manually' };
          }
        }

        // Redirect - might be account exists (twitter.com → x.com)
        if (response.isRedirect || response.status === 302 || response.status === 301) {
          const redirUrl = response.redirectUrl || '';
          // Only trust redirect if it goes to x.com or twitter.com with same username
          if ((redirUrl.includes(`x.com/${cleanUsername}`) || redirUrl.includes(`twitter.com/${cleanUsername}`)) &&
              !redirUrl.includes('login') && !redirUrl.includes('error')) {
            // Don't immediately say taken - this could be a redirect loop
            // Continue to next URL to verify
            continue;
          }
          // Other redirects are uncertain
          return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Redirect detected - check manually' };
        }

        // 403 = blocked
        if (response.status === 403) {
          return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Blocked by platform - check manually' };
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
        return { exists: null, url: urls[0], status: 'unknown', confidence: 'none', note: `HTTP ${response.status} - check manually` };

      } catch (error) {
        if (url === urls[urls.length - 1]) {
          return { exists: null, url: urls[0], status: 'unknown', confidence: 'none', error: error.message };
        }
        continue; // Try next URL
      }
    }

    return { exists: null, url: urls[0], status: 'unknown', confidence: 'none', note: 'Could not verify - check manually' };

  } catch (error) {
    return { exists: null, url: `https://twitter.com/${cleanUsername}`, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check TikTok account
 * Conservative detection: verify response body for 200 status
 * TikTok has aggressive anti-bot protection
 */
async function checkTikTok(username) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.tiktok.com/@${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // 404 = account doesn't exist (RELIABLE)
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    // 200 = might exist, verify body
    if (response.status === 200) {
      try {
        const html = await response.text();

        // Check for "Couldn't find this account" or similar
        if (html.includes('Couldn\'t find this account') ||
            html.includes('User not found') ||
            html.includes('This account cannot be found')) {
          return { exists: false, url, status: 'available', confidence: 'high', note: 'Account not found (verified)' };
        }

        // Check for profile indicators
        if (html.includes('"uniqueId":"' + cleanUsername + '"') ||
            html.includes('"@' + cleanUsername + '"') ||
            html.includes('UserPage')) {
          return { exists: true, url, status: 'taken', confidence: 'high', note: 'Profile verified' };
        }

        // Got 200 but can't verify - be conservative
        return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify - check manually' };
      } catch (e) {
        // Can't read body - be conservative
        return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify response - check manually' };
      }
    }

    // 403 = Blocked by TikTok (common with anti-bot)
    if (response.status === 403) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Blocked by TikTok - check manually' };
    }

    // Redirect = uncertain
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Redirect detected - check manually' };
    }

    // Network error
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    // Other status codes - be conservative
    return { exists: null, url, status: 'unknown', confidence: 'none', note: `HTTP ${response.status} - check manually` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check LinkedIn company/profile
 * Conservative detection: LinkedIn often requires auth, so be careful
 */
async function checkLinkedIn(username) {
  const cleanUsername = username.replace(/^@/, '');
  // Try company first (more common for businesses)
  const url = `https://www.linkedin.com/company/${cleanUsername}`;

  try {
    const response = await fetchWithHeaders(url, { timeout: 20000 });

    // 404 = page doesn't exist (RELIABLE)
    if (response.status === 404) {
      return { exists: false, url, status: 'available', confidence: 'high' };
    }

    // 200 = might exist, verify body
    if (response.status === 200) {
      try {
        const html = await response.text();

        // Check for "Page not found" or similar
        if (html.includes('Page not found') ||
            html.includes('This page doesn\'t exist') ||
            html.includes('Company not found')) {
          return { exists: false, url, status: 'available', confidence: 'high', note: 'Page not found (verified)' };
        }

        // Check for company/profile indicators
        if (html.includes('"companyPageUrl"') ||
            html.includes('"organizationId"') ||
            html.includes('companyInfo')) {
          return { exists: true, url, status: 'taken', confidence: 'high', note: 'Company page verified' };
        }

        // Got 200 but can't verify - be conservative
        return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify - check manually' };
      } catch (e) {
        // Can't read body - be conservative
        return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Could not verify response - check manually' };
      }
    }

    // 999 = LinkedIn rate limiting (very common)
    if (response.status === 999) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'LinkedIn rate limit - check manually' };
    }

    // 403 = blocked
    if (response.status === 403) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Blocked by LinkedIn - check manually' };
    }

    // Redirect = uncertain (LinkedIn often redirects to login)
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Redirect/requires login - check manually' };
    }

    // Network error
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    // Other status codes - be conservative
    return { exists: null, url, status: 'unknown', confidence: 'none', note: `HTTP ${response.status} - check manually` };

  } catch (error) {
    return { exists: null, url, status: 'unknown', confidence: 'none', error: error.message };
  }
}

/**
 * Check GitHub account
 * GitHub is the most reliable - returns 404 for non-existent users/orgs
 * Very trustworthy for 200 and 404 status codes
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

    // 200 = user/org exists (GitHub is very reliable with this)
    if (response.status === 200) {
      try {
        const html = await response.text();

        // Verify it's actually a profile page
        if (html.includes('Not Found') || html.includes('404')) {
          return { exists: false, url, status: 'available', confidence: 'high', note: 'Page not found (verified)' };
        }

        // Check for profile indicators
        if (html.includes('"login":"' + cleanUsername + '"') ||
            html.includes('profileName') ||
            html.includes('user-profile')) {
          return { exists: true, url, status: 'taken', confidence: 'high', note: 'Profile verified' };
        }

        // GitHub 200 is usually reliable even without body parsing
        return { exists: true, url, status: 'taken', confidence: 'high' };
      } catch (e) {
        // Even if we can't read body, GitHub 200 is very reliable
        return { exists: true, url, status: 'taken', confidence: 'high' };
      }
    }

    // 429 = Rate limited
    if (response.status === 429) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Rate limited - check manually' };
    }

    // 403 = blocked
    if (response.status === 403) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Blocked by GitHub - check manually' };
    }

    // Redirect = uncertain (rare on GitHub)
    if (response.isRedirect || response.status === 302 || response.status === 301) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Redirect detected - check manually' };
    }

    // Network error
    if (response.status === 0) {
      return { exists: null, url, status: 'unknown', confidence: 'none', note: 'Network error - check manually' };
    }

    // Other status codes - be conservative
    return { exists: null, url, status: 'unknown', confidence: 'none', note: `HTTP ${response.status} - check manually` };

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

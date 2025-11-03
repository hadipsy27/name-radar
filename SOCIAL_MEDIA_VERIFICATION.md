# Social Media Verification Guide

## Overview

Name Radar Professional includes **direct social media verification** to check if handles/usernames are already taken on major platforms. This feature attempts to directly probe each platform to provide accurate availability status.

---

## How It Works

### Verification Process

1. **Direct Probing**: The tool sends HTTP HEAD requests to each platform to check if a username exists
2. **Status Detection**: Based on HTTP response codes:
   - `200 OK` = Account **exists** (Taken)
   - `404 Not Found` = Account **doesn't exist** (Available)
   - `302/301 Redirect` = Usually means account **exists**
   - Other codes = **Unknown** status (needs manual check)

3. **Confidence Levels**:
   - **High**: Reliable verification (e.g., GitHub 404 = definitely available)
   - **Medium**: Probably accurate but some uncertainty
   - **Low**: Result is uncertain
   - **None**: Couldn't verify (network error, rate limiting, etc.)

---

## Platforms Supported

| Platform | Reliability | Notes |
|----------|-------------|-------|
| **GitHub** | ⭐⭐⭐⭐⭐ | Very reliable - 404 means definitely available |
| **YouTube** | ⭐⭐⭐⭐ | Good - checks @username format |
| **LinkedIn** | ⭐⭐⭐ | Moderate - may require login for full access |
| **Twitter/X** | ⭐⭐⭐ | Moderate - anti-bot protections |
| **Instagram** | ⭐⭐ | Limited - aggressive anti-bot measures |
| **Facebook** | ⭐⭐ | Limited - requires authentication |
| **TikTok** | ⭐⭐ | Limited - may block automated requests |

---

## Report Status Meanings

### In Excel Report - Social Media Sheet

| Status | Color | Meaning | Action Required |
|--------|-------|---------|-----------------|
| **Taken (Verified)** | 🔴 Red | Username definitely exists | Choose different name |
| **Available (Verified)** | 🟢 Green | Username confirmed available | Safe to register |
| **Check Manually** | 🟡 Yellow | Couldn't verify automatically | Click URL to check manually |
| **Taken (Found in Search)** | 🔴 Red | Found in search results | Likely taken, verify manually |

---

## Why "Check Manually"?

You may see "Check Manually" status for several reasons:

### 1. **Network Limitations**
- DNS resolution issues
- Firewall blocks social media sites
- Network timeout or connectivity problems
- **Solution**: Run the tool from a machine with unrestricted internet access

### 2. **Platform Anti-Bot Protection**
- Instagram, Facebook, TikTok have aggressive bot detection
- May block automated requests
- Require authentication/cookies to verify
- **Solution**: Manually click the provided URL to check

### 3. **Rate Limiting**
- Too many requests in short time
- Platform temporarily blocks the IP
- **Solution**: Wait a few minutes and try again, or check manually

### 4. **Platform Changes**
- Social media platforms frequently change their response codes
- New anti-scraping measures
- **Solution**: Always manually verify critical platforms

---

## Best Practices

### ✅ DO:

1. **Always manually verify critical platforms** before registration
   - Click the URLs provided in the report
   - Create test accounts to confirm availability
   - Check platform's official registration page

2. **Use verified results as guidance**, not absolute truth
   - "Available (Verified)" = Good sign, but double-check
   - "Taken (Verified)" = Reliable, name is taken

3. **Check multiple name variations**
   - Test with hyphens: `your-name`
   - Test without: `yourname`
   - Test with numbers: `yourname2025`

4. **Register immediately when available**
   - Social media handles can be claimed quickly
   - Secure critical platforms first (Instagram, Twitter, LinkedIn)

### ❌ DON'T:

1. **Don't rely solely on "Check Manually" status**
   - This means verification failed
   - Must manually check before deciding

2. **Don't assume "Check Manually" = Available**
   - Could be taken but we couldn't verify
   - Could be available but network issue prevented check

3. **Don't skip manual verification for important names**
   - Always check personally for business-critical names
   - Anti-bot measures may give false negatives

---

## Manual Verification Steps

When you see "Check Manually", follow these steps:

### For Each Platform:

1. **Click the URL** in the Excel report
2. Check the result:
   - ✅ **"Page not found" / "User not found"** = Available
   - ❌ **Profile/page loads** = Taken
   - ⚠️ **Login required** = Check after logging in

3. **Try to register** the username:
   - Go to platform's signup page
   - Attempt to create account with that username
   - Platform will tell you if it's taken

### Platform-Specific Checks:

#### Instagram
```
URL: https://www.instagram.com/USERNAME/
- "Sorry, this page isn't available" = Available ✅
- Profile loads with posts = Taken ❌
```

#### Facebook
```
URL: https://www.facebook.com/USERNAME
- "This Page Isn't Available" = Available ✅
- Page/profile loads = Taken ❌
```

#### YouTube
```
URL: https://www.youtube.com/@USERNAME
- "404 This page isn't available" = Available ✅
- Channel page loads = Taken ❌
```

#### GitHub
```
URL: https://github.com/USERNAME
- "404 Not Found" = Available ✅ (most reliable!)
- User/org page loads = Taken ❌
```

#### LinkedIn
```
URL: https://www.linkedin.com/company/USERNAME
- "Page Not Found" = Available ✅
- Company page loads = Taken ❌
```

---

## Troubleshooting

### Problem: All platforms show "Check Manually"

**Causes:**
- Network connectivity issues
- DNS resolution problems
- Firewall blocking social media sites
- Running in restricted environment

**Solutions:**
1. Check internet connection
2. Try from different network
3. Use VPN if sites are blocked
4. Run on personal computer vs server environment

### Problem: Some platforms verified, others not

**This is normal!** Different platforms have different:
- Anti-bot protection levels
- Response time (timeout issues)
- Authentication requirements

**Solution:** Manually check the ones that couldn't be verified.

### Problem: False positives/negatives

**Social media verification is best-effort**, not 100% accurate because:
- Platforms change their APIs
- Anti-bot measures evolve
- Network conditions vary

**Solution:** Always manually verify before registering important names.

---

## Recommendations

For **Business-Critical Names** (PT/CV/Startup):

1. ✅ Use the tool for **initial screening**
2. ✅ **Manually verify ALL platforms** before deciding
3. ✅ **Register immediately** when truly available
4. ✅ **Reserve variations** (with hyphen, without, etc.)
5. ✅ **Trademark search** for legal protection

For **Personal Projects**:

1. Trust "Taken (Verified)" status
2. Check "Available (Verified)" manually for critical ones
3. Always check "Check Manually" platforms yourself

---

## Technical Details

### Verification Method

```javascript
// Simplified verification logic
1. Send HTTP HEAD request to: https://platform.com/username
2. Analyze HTTP response code:
   - 200 = exists (taken)
   - 404 = doesn't exist (available)
   - 302/301 = likely exists (redirect)
   - 0/timeout = unknown (network error)
3. Return status with confidence level
```

### Why HEAD instead of GET?

- **Faster**: No need to download full page
- **Lighter**: Less bandwidth usage
- **Sufficient**: Status code is enough for verification
- **Polite**: Less load on target servers

### Timeout & Rate Limiting

- Default timeout: 20 seconds per platform
- Delay between requests: 800ms (configurable)
- Total verification time: ~30-60 seconds for all platforms
- Rate limiting: Built-in to avoid IP blocks

---

## API Alternative (Future)

For **100% accurate verification**, consider official APIs:

| Platform | API Available | Cost |
|----------|---------------|------|
| GitHub | ✅ Free API | Free |
| Twitter | ✅ Limited free tier | Paid for high volume |
| Instagram | ❌ No public username check | N/A |
| Facebook | ⚠️ Graph API (limited) | Paid |
| LinkedIn | ⚠️ Limited access | Enterprise only |

**Note**: These APIs require registration, authentication, and may have costs.

---

## Summary

✅ **Verified statuses are reliable** - Trust "Taken (Verified)" and "Available (Verified)"

⚠️ **"Check Manually" requires your action** - Click the URL and verify yourself

🎯 **Best practice**: Always manually check before registering business-critical names

📊 **Use reports as guidance**, not absolute truth

---

**Remember**: Social media username availability changes constantly. Register immediately when you find available names for your brand!

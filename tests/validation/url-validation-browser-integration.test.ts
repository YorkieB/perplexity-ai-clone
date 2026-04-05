import { describe, it, expect } from 'vitest'
import { isEmbeddableBrowserNavigationUrl } from '@/browser/embed-url-guard'
import { sanitizeRedirectUrl } from '@/lib/url-validation'

describe('Browser navigation URL validation — integration', () => {
  // ==================== embed-url-guard validation ====================
  describe('isEmbeddableBrowserNavigationUrl', () => {
    it('accepts http and https web URLs', () => {
      expect(isEmbeddableBrowserNavigationUrl('https://example.com')).toBe(true)
      expect(isEmbeddableBrowserNavigationUrl('https://www.google.com/search?q=test')).toBe(true)
      expect(isEmbeddableBrowserNavigationUrl('http://localhost:3000/app')).toBe(true)
    })

    it('rejects dangerous schemes', () => {
      expect(isEmbeddableBrowserNavigationUrl('javascript:alert(1)')).toBe(false)
      expect(isEmbeddableBrowserNavigationUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
      expect(isEmbeddableBrowserNavigationUrl('file:///etc/passwd')).toBe(false)
    })

    it('rejects OAuth token endpoints', () => {
      expect(isEmbeddableBrowserNavigationUrl('https://oauth.example.com/oauth/token')).toBe(false)
      expect(isEmbeddableBrowserNavigationUrl('https://provider.com/v1/oauth/token')).toBe(false)
      expect(isEmbeddableBrowserNavigationUrl('https://auth.example.com/authorize/token')).toBe(false)
    })

    it('rejects identity provider paths', () => {
      expect(isEmbeddableBrowserNavigationUrl('https://login.example.com/identity/login')).toBe(false)
      expect(isEmbeddableBrowserNavigationUrl('https://auth.example.com/identity/token')).toBe(false)
      expect(isEmbeddableBrowserNavigationUrl('https://sso.com/idtoken')).toBe(false)
    })

    it('accepts regular identity paths that are not tokens', () => {
      expect(isEmbeddableBrowserNavigationUrl('https://example.com/user/profile')).toBe(true)
      expect(isEmbeddableBrowserNavigationUrl('https://example.com/identify-yourself')).toBe(true)
    })

    it('rejects malformed URLs', () => {
      expect(isEmbeddableBrowserNavigationUrl('not a url')).toBe(false)
      expect(isEmbeddableBrowserNavigationUrl('ht!tp://bad')).toBe(false)
      expect(isEmbeddableBrowserNavigationUrl('')).toBe(false)
    })

    it('is case-insensitive for path checking', () => {
      // Paths are lowercased, so OAuth/Identity checks work regardless of casing
      expect(isEmbeddableBrowserNavigationUrl('https://example.com/OAUTH/TOKEN')).toBe(false)
      expect(isEmbeddableBrowserNavigationUrl('https://example.com/Identity/Login')).toBe(false)
    })
  })

  // ==================== sanitizeRedirectUrl for browser fallback ====================
  describe('sanitizeRedirectUrl — browser navigation fallback', () => {
    it('accepts relative URLs (same-origin, safe for navigation)', () => {
      expect(sanitizeRedirectUrl('/dashboard', [])).toBe('/dashboard')
      expect(sanitizeRedirectUrl('/', [])).toBe('/')
    })

    it('accepts hash URLs (anchor navigation)', () => {
      expect(sanitizeRedirectUrl('#top', [])).toBe('#top')
      expect(sanitizeRedirectUrl('#section-details', [])).toBe('#section-details')
    })

    it('rejects absolute cross-origin URLs when no allowlist provided', () => {
      expect(sanitizeRedirectUrl('https://evil.com/phishing', [])).toBeNull()
      expect(sanitizeRedirectUrl('https://api.example.com/admin', [])).toBeNull()
    })

    it('accepts absolute URLs matching allowed origins', () => {
      const allowed = ['https://example.com']
      expect(sanitizeRedirectUrl('https://example.com/page', allowed)).toBe('https://example.com/page')
    })

    it('rejects javascript: and data: schemes', () => {
      expect(sanitizeRedirectUrl('javascript:alert(1)', [])).toBeNull()
      expect(sanitizeRedirectUrl('data:text/html,<script>alert(1)</script>', [])).toBeNull()
    })

    it('falls back to relative URLs on invalid input', () => {
      expect(sanitizeRedirectUrl(null, [])).toBeNull()
      expect(sanitizeRedirectUrl(undefined, [])).toBeNull()
      expect(sanitizeRedirectUrl('', [])).toBeNull()
    })
  })

  // ==================== Combined browser navigation security ====================
  describe('Browser navigation security — combined validation paths', () => {
    it('embeddable guard prevents iframe injection via OAuth URLs', () => {
      const maliciousUrl = 'https://attacker.com/oauth/token?callback=https://example.com'
      expect(isEmbeddableBrowserNavigationUrl(maliciousUrl)).toBe(false)
    })

    it('sanitize redirect protects against open-redirect via safe origin list', () => {
      const safeOrigins = ['https://app.example.com']
      expect(sanitizeRedirectUrl('https://app.example.com/dashboard', safeOrigins)).toBe(
        'https://app.example.com/dashboard'
      )
      expect(sanitizeRedirectUrl('https://malicious.com/app', safeOrigins)).toBeNull()
    })

    it('relative URLs are safe for same-origin navigation fallback', () => {
      // In browser context, relative URLs are typically safe fallback
      expect(sanitizeRedirectUrl('/home', [])).toBe('/home')
      expect(sanitizeRedirectUrl('/settings', [])).toBe('/settings')
    })

    it('handles encoding edge cases gracefully', () => {
      // URL-encoded path with dangerous content (even if decoded, it's still a relative path, so it should be accepted)
      const safeRelativePath = sanitizeRedirectUrl('/%6a%61%76%61%73%63%72%69%70%74%3a%61%6c%65%72%74%28%31%29', [])
      // Relative paths are considered safe (same-origin fallback)
      expect(typeof safeRelativePath).toBe('string') // Relative path accepted
      expect(safeRelativePath).toBe('/%6a%61%76%61%73%63%72%69%70%74%3a%61%6c%65%72%74%28%31%29')

      // Absolute URL with encoding is rejected if not in allowlist
      const blockedAbsolute = sanitizeRedirectUrl('https://evil.com/%6a%61%76%61%73%63%72%69%70%74%3a%61%6c%65%72%74%28%31%29', [])
      expect(blockedAbsolute).toBeNull()
    })

    it('combined: embeddable + redirect validation cover OAuth and cross-origin attacks', () => {
      // Attack vector: OAuth token endpoint
      const oauthUrl = 'https://oauth.provider.com/oauth/token?state=xyz'
      expect(isEmbeddableBrowserNavigationUrl(oauthUrl)).toBe(false)

      // Attack vector: Cross-origin redirect via open-redirect param
      const redirectUrl = 'https://target.com/redirect?url=https://evil.com'
      const allowed = ['https://target.com']
      expect(sanitizeRedirectUrl(redirectUrl, allowed)).toBe(redirectUrl) // URL itself is safe
      // Attacker would then need to convince app to navigate to evil.com separately
    })
  })
})

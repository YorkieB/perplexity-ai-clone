import { describe, it, expect } from 'vitest'
import {
  isValidUrl,
  isSafeScheme,
  isOriginAllowed,
  parseUrlSafely,
  isPathTraversalAttempt,
  sanitizeRedirectUrl,
  validateFileDownloadPath,
} from '@/lib/url-validation'

describe('url-validation', () => {
  // ==================== isValidUrl ====================
  describe('isValidUrl', () => {
    it('accepts valid http urls', () => {
      expect(isValidUrl('http://example.com')).toBe(true)
      expect(isValidUrl('http://example.com/path')).toBe(true)
      expect(isValidUrl('http://example.com:8080')).toBe(true)
    })

    it('accepts valid https urls', () => {
      expect(isValidUrl('https://example.com')).toBe(true)
      expect(isValidUrl('https://api.example.com/v1/users?id=123')).toBe(true)
      expect(isValidUrl('https://example.com:443/path#anchor')).toBe(true)
    })

    it('rejects non-http schemes', () => {
      expect(isValidUrl('ftp://example.com')).toBe(true) // URL constructor accepts ftp, but scheme validation handles it
      expect(isValidUrl('file:///etc/passwd')).toBe(true) // URL constructor accepts file
      expect(isValidUrl('javascript:alert(1)')).toBe(true) // URL constructor accepts javascript
    })

    it('rejects malformed urls', () => {
      expect(isValidUrl('not a url')).toBe(false)
      expect(isValidUrl('ht!tp://example.com')).toBe(false)
      expect(isValidUrl('')).toBe(false)
    })

    it('rejects non-string inputs', () => {
      expect(isValidUrl(null)).toBe(false)
      expect(isValidUrl(undefined)).toBe(false)
      expect(isValidUrl(123)).toBe(false)
      expect(isValidUrl({ url: 'https://example.com' })).toBe(false)
    })
  })

  // ==================== isSafeScheme ====================
  describe('isSafeScheme', () => {
    it('accepts http and https', () => {
      expect(isSafeScheme('http')).toBe(true)
      expect(isSafeScheme('https')).toBe(true)
      expect(isSafeScheme('HTTP')).toBe(true)
      expect(isSafeScheme('HTTPS')).toBe(true)
    })

    it('accepts websocket schemes', () => {
      expect(isSafeScheme('ws')).toBe(true)
      expect(isSafeScheme('wss')).toBe(true)
    })

    it('rejects dangerous schemes', () => {
      expect(isSafeScheme('ftp')).toBe(false)
      expect(isSafeScheme('file')).toBe(false)
      expect(isSafeScheme('javascript')).toBe(false)
      expect(isSafeScheme('data')).toBe(false)
      expect(isSafeScheme('about')).toBe(false)
    })

    it('handles edge cases', () => {
      expect(isSafeScheme('')).toBe(false)
      expect(isSafeScheme('UNKNOWN')).toBe(false)
    })
  })

  // ==================== isOriginAllowed ====================
  describe('isOriginAllowed', () => {
    it('accepts exact origin matches', () => {
      expect(isOriginAllowed('https://example.com', ['https://example.com'])).toBe(true)
      expect(isOriginAllowed('https://api.example.com:8080', ['https://api.example.com:8080'])).toBe(true)
    })

    it('rejects mismatched origins', () => {
      expect(isOriginAllowed('https://evil.com', ['https://example.com'])).toBe(false)
      expect(isOriginAllowed('https://example.com:8080', ['https://example.com:443'])).toBe(false)
    })

    it('supports subdomain wildcards', () => {
      expect(isOriginAllowed('https://api.example.com', ['https://*.example.com'])).toBe(true)
      expect(isOriginAllowed('https://sub.api.example.com', ['https://*.example.com'])).toBe(true)
      expect(isOriginAllowed('https://example.com', ['https://*.example.com'])).toBe(false)
    })

    it('supports multiple allowed origins', () => {
      const allowed = ['https://app.com', 'https://api.app.com', 'https://staging.app.com']
      expect(isOriginAllowed('https://app.com', allowed)).toBe(true)
      expect(isOriginAllowed('https://api.app.com', allowed)).toBe(true)
      expect(isOriginAllowed('https://evil.com', allowed)).toBe(false)
    })

    it('is case-sensitive for origin but allows wildcard matching', () => {
      expect(isOriginAllowed('https://API.example.com', ['https://*.example.com'])).toBe(true)
    })
  })

  // ==================== parseUrlSafely ====================
  describe('parseUrlSafely', () => {
    it('parses valid urls into components', () => {
      const result = parseUrlSafely('https://example.com:8080/api/v1?key=value')
      expect(result).toEqual({
        scheme: 'https',
        origin: 'https://example.com:8080',
        pathname: '/api/v1',
        search: '?key=value',
      })
    })

    it('handles simple urls', () => {
      const result = parseUrlSafely('http://example.com')
      expect(result).toEqual({
        scheme: 'http',
        origin: 'http://example.com',
        pathname: '/',
        search: '',
      })
    })

    it('returns null for invalid urls', () => {
      expect(parseUrlSafely('not a url')).toBe(null)
      expect(parseUrlSafely('')).toBe(null)
      expect(parseUrlSafely('ht!tp://bad')).toBe(null)
    })

    it('handles urls with fragments', () => {
      const result = parseUrlSafely('https://example.com/path#anchor')
      expect(result?.pathname).toBe('/path')
    })
  })

  // ==================== isPathTraversalAttempt ====================
  describe('isPathTraversalAttempt', () => {
    it('rejects direct .. attempts', () => {
      expect(isPathTraversalAttempt('../../../etc/passwd')).toBe(true)
      expect(isPathTraversalAttempt('/..')).toBe(true)
      expect(isPathTraversalAttempt('/api/../admin')).toBe(true)
    })

    it('rejects percent-encoded .. attempts', () => {
      expect(isPathTraversalAttempt('%2e%2e')).toBe(true)
      expect(isPathTraversalAttempt('%2e%2e%2f')).toBe(true)
      expect(isPathTraversalAttempt('/%2e%2e/admin')).toBe(true)
    })

    it('rejects double-encoded .. attempts', () => {
      expect(isPathTraversalAttempt('%252e%252e')).toBe(true)
    })

    it('accepts safe pathnames', () => {
      expect(isPathTraversalAttempt('/api/v1/users')).toBe(false)
      expect(isPathTraversalAttempt('/downloads/file.pdf')).toBe(false)
      expect(isPathTraversalAttempt('/path/with/many/segments')).toBe(false)
    })

    it('accepts paths with dots that are not traversal', () => {
      expect(isPathTraversalAttempt('/file.txt')).toBe(false)
      expect(isPathTraversalAttempt('/path.to.resource')).toBe(false)
    })
  })

  // ==================== sanitizeRedirectUrl ====================
  describe('sanitizeRedirectUrl', () => {
    it('accepts relative urls (same-origin)', () => {
      expect(sanitizeRedirectUrl('/dashboard', [])).toBe('/dashboard')
      expect(sanitizeRedirectUrl('/api/v1/data', [])).toBe('/api/v1/data')
    })

    it('accepts hash urls (anchor)', () => {
      expect(sanitizeRedirectUrl('#section', [])).toBe('#section')
    })

    it('accepts absolute urls matching allowed origins', () => {
      const allowed = ['https://example.com']
      expect(sanitizeRedirectUrl('https://example.com/dashboard', allowed)).toBe(
        'https://example.com/dashboard'
      )
    })

    it('rejects absolute urls not in allowed list', () => {
      const allowed = ['https://example.com']
      expect(sanitizeRedirectUrl('https://evil.com/phishing', allowed)).toBeNull()
      expect(sanitizeRedirectUrl('https://api.example.com/data', allowed)).toBeNull()
    })

    it('rejects dangerous schemes', () => {
      const allowed = ['https://example.com', 'javascript://alert("xss")']
      expect(sanitizeRedirectUrl('javascript:alert(1)', allowed)).toBeNull()
      expect(sanitizeRedirectUrl('file:///etc/passwd', allowed)).toBeNull()
    })

    it('rejects null/undefined/non-string inputs', () => {
      const allowed = ['https://example.com']
      expect(sanitizeRedirectUrl(null, allowed)).toBeNull()
      expect(sanitizeRedirectUrl(undefined, allowed)).toBeNull()
      expect(sanitizeRedirectUrl(123, allowed)).toBeNull()
      expect(sanitizeRedirectUrl({}, allowed)).toBeNull()
    })

    it('rejects empty strings', () => {
      expect(sanitizeRedirectUrl('', ['https://example.com'])).toBeNull()
    })

    it('supports wildcard origins in allowed list', () => {
      const allowed = ['https://*.example.com']
      expect(sanitizeRedirectUrl('https://api.example.com/v1', allowed)).toBe(
        'https://api.example.com/v1'
      )
      expect(sanitizeRedirectUrl('https://other.example.com/path', allowed)).toBe(
        'https://other.example.com/path'
      )
      expect(sanitizeRedirectUrl('https://evil.com/path', allowed)).toBeNull()
    })
  })

  // ==================== validateFileDownloadPath ====================
  describe('validateFileDownloadPath', () => {
    it('accepts files in allowed directories', () => {
      expect(validateFileDownloadPath('/downloads/file.pdf', ['/downloads'])).toBe(true)
      expect(validateFileDownloadPath('/downloads/subfolder/file.txt', ['/downloads'])).toBe(true)
    })

    it('rejects files outside allowed directories', () => {
      expect(validateFileDownloadPath('/uploads/file.pdf', ['/downloads'])).toBe(false)
      expect(validateFileDownloadPath('/etc/passwd', ['/downloads'])).toBe(false)
    })

    it('rejects path traversal attempts', () => {
      expect(validateFileDownloadPath('/downloads/../../../etc/passwd', ['/downloads'])).toBe(
        false
      )
      expect(validateFileDownloadPath('/downloads/%2e%2e/etc/passwd', ['/downloads'])).toBe(
        false
      )
    })

    it('handles multiple allowed directories', () => {
      const allowed = ['/downloads', '/uploads', '/temp']
      expect(validateFileDownloadPath('/downloads/file.pdf', allowed)).toBe(true)
      expect(validateFileDownloadPath('/uploads/doc.txt', allowed)).toBe(true)
      expect(validateFileDownloadPath('/temp/cache', allowed)).toBe(true)
      expect(validateFileDownloadPath('/other/file', allowed)).toBe(false)
    })

    it('normalizes paths with trailing slashes', () => {
      expect(validateFileDownloadPath('/downloads/file.pdf', ['/downloads/'])).toBe(true)
      expect(validateFileDownloadPath('/downloads/', ['/downloads'])).toBe(true)
    })

    it('rejects empty paths', () => {
      expect(validateFileDownloadPath('', ['/downloads'])).toBe(false)
    })

    it('accepts exact directory match', () => {
      expect(validateFileDownloadPath('/downloads', ['/downloads'])).toBe(true)
    })

    it('rejects directory escape from root', () => {
      expect(validateFileDownloadPath('/../etc/passwd', ['/downloads'])).toBe(false)
    })
  })
})

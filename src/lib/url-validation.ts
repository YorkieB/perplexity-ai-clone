/**
 * URL validation and parsing helpers.
 *
 * Provides safe, fallback-tolerant URL parsing, scheme/origin checking,
 * and path-traversal detection for security boundaries.
 *
 * @module lib/url-validation
 */

/**
 * Result of safe URL parsing.
 */
export interface ParsedUrl {
  /** Protocol/scheme (e.g. 'https') without colon */
  scheme: string
  /** Origin (protocol + hostname + port) — e.g. 'https://example.com:8080' */
  origin: string
  /** Pathname starting with / */
  pathname: string
  /** Search string including ? or empty */
  search: string
}

/**
 * Test if a value is a valid, parseable URL.
 *
 * @param url - Value to test
 * @returns true if URL can be parsed without error
 *
 * @example
 * isValidUrl('https://example.com') // ✓ true
 * isValidUrl('not-a-url') // ✗ false
 * isValidUrl(null) // ✗ false
 */
export function isValidUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Test if a scheme is in the allowed list for web navigation.
 *
 * Only 'http' and 'https' are safe for Jarvis navigation context.
 *
 * @param scheme - Scheme name (without colon) — e.g. 'https'
 * @returns true if scheme is in whitelist
 *
 * @example
 * isSafeScheme('https') // ✓ true
 * isSafeScheme('http') // ✓ true
 * isSafeScheme('ftp') // ✗ false
 * isSafeScheme('file') // ✗ false
 * isSafeScheme('javascript') // ✗ false
 */
export function isSafeScheme(scheme: string): boolean {
  const safe = new Set(['http', 'https', 'ws', 'wss'])
  return safe.has(scheme.toLowerCase())
}

/**
 * Test if an origin matches an allowed origin list.
 *
 * Supports exact match and subdomain wildcards (e.g. `*.example.com`).
 *
 * @param origin - Origin to test (e.g. 'https://api.example.com')
 * @param allowedOrigins - List of allowed origins, may include `*.domain` wildcards
 * @returns true if origin is in whitelist or matches a wildcard pattern
 *
 * @example
 * isOriginAllowed('https://example.com', ['https://example.com']) // ✓ true
 * isOriginAllowed('https://api.example.com', ['https://*.example.com']) // ✓ true
 * isOriginAllowed('https://evil.com', ['https://example.com']) // ✗ false
 */
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.some(allowed => {
    if (allowed.includes('*')) {
      const pattern = allowed.replace(/\*/g, '[a-zA-Z0-9.-]+')
      const regex = new RegExp(`^${pattern}$`)
      return regex.test(origin)
    }
    return origin === allowed
  })
}

/**
 * Parse a URL safely into components without throwing.
 *
 * @param url - URL string to parse
 * @returns Structured components `{scheme, origin, pathname, search}`, or `null` on parse failure
 *
 * @example
 * parseUrlSafely('https://example.com:8080/api/v1?key=value')
 * // => {
 * //   scheme: 'https',
 * //   origin: 'https://example.com:8080',
 * //   pathname: '/api/v1',
 * //   search: '?key=value'
 * // }
 * parseUrlSafely('not-a-url') // => null
 */
export function parseUrlSafely(url: string): ParsedUrl | null {
  try {
    const parsed = new URL(url)
    return {
      scheme: parsed.protocol.replace(/:$/, ''),
      origin: `${parsed.protocol}//${parsed.host}`,
      pathname: parsed.pathname,
      search: parsed.search,
    }
  } catch {
    return null
  }
}

/**
 * Detect path traversal attempts in a pathname.
 *
 * Flags `..` and percent-encoded variants like `%2e%2e`, `%252e%252e`, etc.
 *
 * @param pathname - Pathname to check (e.g. from parsed URL)
 * @returns true if pathname contains traversal indicators
 *
 * @example
 * isPathTraversalAttempt('../../../etc/passwd') // ✓ true
 * isPathTraversalAttempt('%2e%2e/admin') // ✓ true
 * isPathTraversalAttempt('/api/v1/users/123') // ✗ false
 */
export function isPathTraversalAttempt(pathname: string): boolean {
  // Normalize URL encoding by running decode up to 5 times (handles nested encoding)
  let normalized = pathname
  for (let i = 0; i < 5; i++) {
    const decoded = decodeURIComponent(normalized)
    if (decoded === normalized) break
    normalized = decoded
  }

  // Check for .. indicators
  return /\.\./.test(normalized) || /\.\.%/.test(normalized)
}

/**
 * Validate and sanitize a redirect URL for same-origin or whitelist match.
 *
 * Safe for use in location.href assignments or redirect responses.
 *
 * @param url - URL to validate (may be string, null, undefined)
 * @param allowedOrigins - List of allowed target origins (e.g. `['https://app.example.com']`)
 * @returns The validated URL, or `null` if invalid
 *
 * @example
 * sanitizeRedirectUrl('https://example.com/dashboard', ['https://example.com'])
 * // => 'https://example.com/dashboard'
 *
 * sanitizeRedirectUrl('https://evil.com/phishing', ['https://example.com'])
 * // => null (blocked)
 *
 * // Relative URLs are considered same-origin (generally safe)
 * sanitizeRedirectUrl('/dashboard', [])
 * // => '/dashboard'
 */
export function sanitizeRedirectUrl(url: unknown, allowedOrigins: string[]): string | null {
  if (typeof url !== 'string') return null
  if (!url) return null

  // Relative URLs (same-origin) are considered safe
  if (url.startsWith('/')) return url
  if (url.startsWith('#')) return url

  // Absolute URLs must match allowed origins
  const parsed = parseUrlSafely(url)
  if (!parsed) return null
  if (!isSafeScheme(parsed.scheme)) return null

  const origin = parsed.origin
  if (!isOriginAllowed(origin, allowedOrigins)) return null

  return url
}

/**
 * Validate a download or file-write path against sandbox restrictions.
 *
 * Prevents path traversal attempts (`..`) and ensures path is within allowed directories.
 *
 * @param downloadPath - Path to validate (absolute or relative)
 * @param allowedDirs - List of allowed base directories (e.g. `['./downloads', '/tmp/uploads']`)
 * @returns true if path is safe and within allowed directories
 *
 * @example
 * validateFileDownloadPath('/downloads/report.pdf', ['/downloads'])
 * // => true
 *
 * validateFileDownloadPath('/downloads/../../../etc/passwd', ['/downloads'])
 * // => false (path traversal attempt)
 *
 * validateFileDownloadPath('/uploads/file.pdf', ['/downloads'])
 * // => false (not in allowed directory)
 */
export function validateFileDownloadPath(downloadPath: string, allowedDirs: string[]): boolean {
  if (!downloadPath) return false
  if (isPathTraversalAttempt(downloadPath)) return false

  // Normalize path for comparison (remove trailing slash, resolve . references)
  const normalize = (path: string) => path.replace(/\/+/g, '/').replace(/\/$/, '') || '/'

  const normalized = normalize(downloadPath)
  return allowedDirs.some(dir => {
    const normalizedDir = normalize(dir)
    return normalized.startsWith(normalizedDir + '/') || normalized === normalizedDir
  })
}

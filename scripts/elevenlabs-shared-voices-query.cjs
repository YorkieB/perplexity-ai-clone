'use strict'

/**
 * GET /v1/shared-voices — permitted query parameter names only.
 * @see https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared
 */
const ALLOWED_SHARED_VOICES_PARAMS = new Set([
  'page_size',
  'page',
  'category',
  'gender',
  'age',
  'accent',
  'language',
  'locale',
  'search',
  'use_cases',
  'descriptives',
  'featured',
  'min_notice_period_days',
  'include_custom_rates',
  'include_live_moderated',
  'reader_app_enabled',
  'owner_id',
  'sort',
])

const MAX_SEARCH_LEN = 500
const PAGE_SIZE_MAX = 100

/**
 * @param {string} rawQuery query string, with or without leading "?"
 * @returns {string} sanitized query string (no leading "?") for upstream fetch URL
 */
function buildAllowedElevenLabsSharedVoicesQuery(rawQuery) {
  const normalized = String(rawQuery || '').trim().replace(/^\?/, '')
  const incoming = new URLSearchParams(normalized)
  const out = new URLSearchParams()
  let pageSizeSet = false
  let pageSet = false

  for (const [key, value] of incoming) {
    if (!ALLOWED_SHARED_VOICES_PARAMS.has(key)) continue
    if (key === 'page_size') {
      if (pageSizeSet) continue
      pageSizeSet = true
      const n = parseInt(value, 10)
      if (!Number.isFinite(n)) continue
      out.set(key, String(Math.min(PAGE_SIZE_MAX, Math.max(1, n))))
      continue
    }
    if (key === 'page') {
      if (pageSet) continue
      pageSet = true
      const n = parseInt(value, 10)
      if (!Number.isFinite(n) || n < 0) continue
      out.set(key, String(n))
      continue
    }
    if (key === 'min_notice_period_days') {
      const n = parseInt(value, 10)
      if (!Number.isFinite(n) || n < 0) continue
      out.append(key, String(n))
      continue
    }
    if (key === 'search' || key === 'descriptives' || key === 'use_cases') {
      const v = value.length > MAX_SEARCH_LEN ? value.slice(0, MAX_SEARCH_LEN) : value
      out.append(key, v)
      continue
    }
    if (
      key === 'featured' ||
      key === 'include_custom_rates' ||
      key === 'include_live_moderated' ||
      key === 'reader_app_enabled'
    ) {
      const lower = String(value).toLowerCase()
      if (lower !== 'true' && lower !== 'false') continue
      out.append(key, lower)
      continue
    }
    out.append(key, value)
  }
  return out.toString()
}

module.exports = { buildAllowedElevenLabsSharedVoicesQuery }

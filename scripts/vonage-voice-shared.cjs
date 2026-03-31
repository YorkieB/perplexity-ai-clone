/**
 * Shared Vonage SMS/Voice: E.164-ish digits for Nexmo/Vonage APIs.
 *
 * Strips a leading `+`, then **repeatedly** strips international access `00` so values like
 * `+00447700900123` (duplicate prefix) normalize to `447700900123`. UK 11-digit national `0…` → `44…`.
 *
 * @param {string} raw
 */
function normalizeVonagePhoneDigits(raw) {
  let s = String(raw || '').trim().replace(/\s+/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  while (s.startsWith('00') && s.length > 2) {
    s = s.slice(2)
  }
  let digits = s.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = `44${digits.slice(1)}`
  }
  return digits
}

/**
 * @param {Record<string, string>} env
 */
function loadVonagePrivateKeyPem(env) {
  const b64 = (env.VONAGE_PRIVATE_KEY_BASE64 || '').trim()
  if (b64) {
    return Buffer.from(b64, 'base64').toString('utf8')
  }
  const pem = (env.VONAGE_PRIVATE_KEY || '').trim()
  if (pem) return pem.replace(/\\n/g, '\n')
  return ''
}

/**
 * Public WebSocket URL for Vonage `connect` → websocket (ngrok or similar → local bridge).
 * @param {Record<string, string>} env
 * @returns {string | null}
 */
function buildVonageAiVoiceWebSocketUri(env) {
  const raw = (env.VONAGE_PUBLIC_WS_URL || '').trim()
  if (!raw) return null
  let u
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/voice/ws'
  const secret = (env.VONAGE_WS_SECRET || '').trim()
  if (secret && !u.searchParams.has('token')) u.searchParams.set('token', secret)
  return u.toString()
}

module.exports = { normalizeVonagePhoneDigits, loadVonagePrivateKeyPem, buildVonageAiVoiceWebSocketUri }

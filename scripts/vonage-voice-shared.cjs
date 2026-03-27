/**
 * Shared Vonage Voice helpers for Electron main and Vite proxy (duplicated logic kept minimal).
 * @param {string} raw
 */
function normalizeVonagePhoneDigits(raw) {
  let digits = String(raw || '').trim().replace(/\s+/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('+')) digits = digits.slice(1)
  digits = digits.replace(/\D/g, '')
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

/**
 * Tier 5 — Vonage signed inbound webhooks (Voice / Messages style JWT callbacks).
 * Verifies `Authorization: Bearer <jwt>` (or `Vonage-Signature` / `X-Vonage-Signature`) with HS256
 * and optional `payload_hash` vs SHA-256 of the raw request body.
 *
 * Set `VONAGE_SIGNATURE_SECRET` from the Vonage dashboard (same signing secret used for your application).
 * If the secret is shown base64-encoded, paste it as-is; verification tries UTF-8 and base64-decoded key material.
 *
 * @see https://developer.vonage.com/en/getting-started/concepts/webhooks
 */

'use strict'

const crypto = require('node:crypto')

/** @param {import('node:http').IncomingMessage | Record<string, string | string[] | undefined>} req */
function getVonageWebhookJwt(req) {
  const headers = 'headers' in req && req.headers ? req.headers : req
  const auth = headers.authorization || headers.Authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  const vs =
    headers['vonage-signature'] ||
    headers['Vonage-Signature'] ||
    headers['x-vonage-signature'] ||
    headers['X-Vonage-Signature']
  if (typeof vs === 'string' && vs.trim()) return vs.trim()
  if (Array.isArray(vs) && vs[0]) return String(vs[0]).trim()
  return ''
}

/**
 * @param {string} secret
 * @returns {Buffer[]}
 */
function secretKeyCandidates(secret) {
  const s = String(secret || '').trim()
  if (!s) return []
  const out = [Buffer.from(s, 'utf8')]
  try {
    const b = Buffer.from(s, 'base64')
    if (b.length > 0) out.push(b)
  } catch {
    /* ignore */
  }
  return out
}

function b64UrlDecode(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

/**
 * @param {string} token
 * @param {Buffer} secretKey
 * @returns {{ ok: boolean, payload?: Record<string, unknown>, reason?: string }}
 */
function verifyJwtHs256(token, secretKey) {
  const parts = String(token).split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed_jwt' }
  const [h64, p64, sig64] = parts
  const signingInput = `${h64}.${p64}`
  let headerObj
  try {
    headerObj = JSON.parse(b64UrlDecode(h64).toString('utf8'))
  } catch {
    return { ok: false, reason: 'bad_header' }
  }
  if (headerObj.alg !== 'HS256') return { ok: false, reason: 'unsupported_alg' }

  let sig
  try {
    sig = b64UrlDecode(sig64)
  } catch {
    return { ok: false, reason: 'bad_signature_encoding' }
  }
  const expected = crypto.createHmac('sha256', secretKey).update(signingInput).digest()
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) {
    return { ok: false, reason: 'bad_signature' }
  }

  let payload
  try {
    payload = JSON.parse(b64UrlDecode(p64).toString('utf8'))
  } catch {
    return { ok: false, reason: 'bad_payload' }
  }
  return { ok: true, payload }
}

/**
 * @param {Buffer} rawBody
 * @returns {string} lowercase hex sha256
 */
function sha256Hex(rawBody) {
  return crypto.createHash('sha256').update(rawBody).digest('hex')
}

/**
 * @param {string} a
 * @param {string} b
 */
function timingSafeEqualHex(a, b) {
  const x = String(a || '').toLowerCase()
  const y = String(b || '').toLowerCase()
  if (x.length !== y.length || x.length % 2 !== 0) return false
  try {
    const bx = Buffer.from(x, 'hex')
    const by = Buffer.from(y, 'hex')
    if (bx.length !== by.length) return false
    return crypto.timingSafeEqual(bx, by)
  } catch {
    return false
  }
}

/**
 * @param {{ rawBody: Buffer, token: string, signatureSecret: string, maxSkewSec?: number }} opts
 * @returns {{ ok: true, payload: Record<string, unknown> } | { ok: false, reason: string }}
 */
function verifyVonageSignedWebhook(opts) {
  const rawBody = opts.rawBody || Buffer.alloc(0)
  const token = String(opts.token || '').trim()
  const secret = String(opts.signatureSecret || '').trim()
  if (!token) return { ok: false, reason: 'missing_token' }
  if (!secret) return { ok: false, reason: 'missing_secret' }

  const candidates = secretKeyCandidates(secret)
  let verified = /** @type {Record<string, unknown> | null} */ (null)
  for (const key of candidates) {
    const r = verifyJwtHs256(token, key)
    if (r.ok && r.payload) {
      verified = r.payload
      break
    }
  }
  if (!verified) return { ok: false, reason: 'jwt_verify_failed' }

  const now = Math.floor(Date.now() / 1000)
  const exp = typeof verified.exp === 'number' ? verified.exp : null
  if (exp != null && exp < now - 60) return { ok: false, reason: 'token_expired' }

  const ph = verified.payload_hash
  if (ph != null && ph !== '') {
    const digestHex = sha256Hex(rawBody)
    const phStr = String(ph).trim()
    const hexOk = timingSafeEqualHex(digestHex, phStr)
    const digestB64 = crypto.createHash('sha256').update(rawBody).digest('base64')
    const b64Ok = phStr.replace(/\s/g, '') === digestB64.replace(/\s/g, '')
    if (!hexOk && !b64Ok) {
      return { ok: false, reason: 'payload_hash_mismatch' }
    }
  }

  return { ok: true, payload: verified }
}

/**
 * @param {Record<string, string>} env
 * @returns {boolean}
 */
function vonageWebhookVerificationEnabled(env) {
  return Boolean(String(env.VONAGE_SIGNATURE_SECRET || '').trim())
}

module.exports = {
  getVonageWebhookJwt,
  b64UrlDecode,
  secretKeyCandidates,
  verifyJwtHs256,
  sha256Hex,
  verifyVonageSignedWebhook,
  vonageWebhookVerificationEnabled,
}

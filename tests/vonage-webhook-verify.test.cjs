/**
 * Tier 5 — `scripts/vonage-webhook-verify.cjs`
 * Run: node --test tests/vonage-webhook-verify.test.cjs
 */
'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const crypto = require('node:crypto')
const {
  verifyVonageSignedWebhook,
  sha256Hex,
  verifyJwtHs256,
} = require('../scripts/vonage-webhook-verify.cjs')

function b64url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function makeHs256Jwt(payload, secret) {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  const data = `${header}.${body}`
  const sig = b64url(crypto.createHmac('sha256', secret).update(data).digest())
  return `${data}.${sig}`
}

test('verifyVonageSignedWebhook accepts HS256 JWT and hex payload_hash', () => {
  const secret = 'test-secret-at-least-32-chars-long!!'
  const rawBody = Buffer.from('{"foo":"bar"}')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = makeHs256Jwt({ exp, payload_hash: sha256Hex(rawBody) }, secret)
  const v = verifyVonageSignedWebhook({ rawBody, token, signatureSecret: secret })
  assert.strictEqual(v.ok, true)
})

test('verifyVonageSignedWebhook accepts base64 payload_hash', () => {
  const secret = 'test-secret-at-least-32-chars-long!!'
  const rawBody = Buffer.from('hello')
  const digestB64 = crypto.createHash('sha256').update(rawBody).digest('base64')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = makeHs256Jwt({ exp, payload_hash: digestB64 }, secret)
  const v = verifyVonageSignedWebhook({ rawBody, token, signatureSecret: secret })
  assert.strictEqual(v.ok, true)
})

test('verifyVonageSignedWebhook rejects payload tampering', () => {
  const secret = 'test-secret-at-least-32-chars-long!!'
  const rawBody = Buffer.from('{"foo":"bar"}')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = makeHs256Jwt({ exp, payload_hash: 'abcd' }, secret)
  const v = verifyVonageSignedWebhook({ rawBody, token, signatureSecret: secret })
  assert.strictEqual(v.ok, false)
})

test('verifyJwtHs256 verifies signature', () => {
  const secret = Buffer.from('my-key', 'utf8')
  const token = makeHs256Jwt({ sub: 'test', exp: Math.floor(Date.now() / 1000) + 60 }, secret)
  const r = verifyJwtHs256(token, secret)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.payload.sub, 'test')
})

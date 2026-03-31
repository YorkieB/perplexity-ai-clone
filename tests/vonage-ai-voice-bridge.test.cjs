/**
 * Pure helpers for `electron/vonage-ai-voice-bridge.cjs` (Tier 1 skill — testable without network).
 * Run: node --test tests/vonage-ai-voice-bridge.test.cjs
 */
'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert')
const { computeRms, resample24kTo16k, parseDeepgramResults } = require('../electron/vonage-ai-voice-bridge.cjs')

describe('computeRms', () => {
  it('returns 0 for empty or tiny buffer', () => {
    assert.strictEqual(computeRms(Buffer.alloc(0)), 0)
    assert.strictEqual(computeRms(Buffer.alloc(1)), 0)
  })

  it('matches expected RMS for a constant tone', () => {
    const buf = Buffer.alloc(640)
    for (let i = 0; i < 320; i++) buf.writeInt16LE(1000, i * 2)
    const r = computeRms(buf)
    assert.ok(r > 990 && r < 1010, `expected ~1000, got ${String(r)}`)
  })
})

describe('parseDeepgramResults', () => {
  it('extracts final transcript', () => {
    const r = parseDeepgramResults({
      type: 'Results',
      is_final: true,
      channel: { alternatives: [{ transcript: '  hello world  ', confidence: 0.99, words: [] }] },
    })
    assert.ok(r)
    assert.strictEqual(r.isFinal, true)
    assert.strictEqual(r.transcript, 'hello world')
  })

  it('returns null for non-Results', () => {
    assert.strictEqual(parseDeepgramResults({ type: 'Metadata' }), null)
  })
})

describe('resample24kTo16k', () => {
  it('halves sample count approximately', () => {
    const samples24 = 2400
    const pcm24 = Buffer.alloc(samples24 * 2)
    for (let i = 0; i < samples24; i++) pcm24.writeInt16LE(i % 1000, i * 2)
    const out = resample24kTo16k(pcm24)
    assert.strictEqual(out.length % 2, 0)
    assert.ok(out.length > 0)
    assert.ok(out.length < pcm24.length)
  })
})

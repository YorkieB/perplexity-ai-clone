'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert')
const { validateAndNormalizePhone, normalizeVonagePhoneDigits } = require('../scripts/vonage-voice-shared.cjs')

describe('validateAndNormalizePhone', () => {
  it('parses UK mobile with +44', () => {
    assert.strictEqual(validateAndNormalizePhone('+447700900123'), '447700900123')
  })
  it('parses UK mobile with 0 prefix (default GB)', () => {
    assert.strictEqual(validateAndNormalizePhone('07700900123'), '447700900123')
  })
  it('parses US number', () => {
    assert.strictEqual(validateAndNormalizePhone('+14155552671'), '14155552671')
  })
  it('parses US number with default US country', () => {
    assert.strictEqual(validateAndNormalizePhone('(415) 555-2671', 'US'), '14155552671')
  })
  it('throws for empty input', () => {
    assert.throws(() => validateAndNormalizePhone(''), /required/)
  })
  it('throws for garbage input', () => {
    assert.throws(() => validateAndNormalizePhone('not a phone number'), /Invalid/)
  })
  it('falls back to regex for ambiguous but plausible input', () => {
    // A string of digits that libphonenumber may not validate but regex accepts
    const result = validateAndNormalizePhone('447700900123')
    assert.strictEqual(result, '447700900123')
  })
})

describe('normalizeVonagePhoneDigits (legacy)', () => {
  it('strips + prefix', () => {
    assert.strictEqual(normalizeVonagePhoneDigits('+447700900123'), '447700900123')
  })
  it('strips 00 prefix', () => {
    assert.strictEqual(normalizeVonagePhoneDigits('00447700900123'), '447700900123')
  })
  it('converts UK 0 to 44', () => {
    assert.strictEqual(normalizeVonagePhoneDigits('07700900123'), '447700900123')
  })
})

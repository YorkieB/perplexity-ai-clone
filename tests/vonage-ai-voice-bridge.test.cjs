/**
 * Pure helpers for `electron/vonage-ai-voice-bridge.cjs` (Tier 1 skill — testable without network).
 * Run: node --test tests/vonage-ai-voice-bridge.test.cjs
 */
'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert')
const { computeRms, resample24kTo16k, parseDeepgramResults, pullAllCompleteSentences } = require('../electron/vonage-ai-voice-bridge.cjs')

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

describe('pullAllCompleteSentences', () => {
  // 1. Basic: two complete sentences, nothing left over
  it('splits two complete sentences and returns empty remainder', () => {
    const { sentences, remainder } = pullAllCompleteSentences('Hello world. How are you?')
    assert.strictEqual(sentences.length, 2)
    assert.strictEqual(sentences[0], 'Hello world.')
    assert.strictEqual(sentences[1], 'How are you?')
    assert.strictEqual(remainder, '')
  })

  // 2. No punctuation at all — nothing can be matched
  it('returns no sentences and the full text as remainder when there is no terminal punctuation', () => {
    const { sentences, remainder } = pullAllCompleteSentences('Hello world')
    assert.strictEqual(sentences.length, 0)
    assert.strictEqual(remainder, 'Hello world')
  })

  // 3. Trailing incomplete fragment after a complete sentence
  it('returns one sentence and the incomplete fragment as remainder', () => {
    const { sentences, remainder } = pullAllCompleteSentences('Hello world. How are')
    assert.strictEqual(sentences.length, 1)
    assert.strictEqual(sentences[0], 'Hello world.')
    assert.strictEqual(remainder, 'How are')
  })

  // 4. Decimal numbers
  // The regex matches the shortest run ending in . / ! / ? followed by \s or end-of-string.
  // "3." is followed by a digit, not whitespace or end-of-string, so the regex skips it and
  // continues to the period at the end of the sentence. The whole sentence is therefore
  // captured as a single unit with no spurious split at the decimal point.
  it('does not split at a decimal point that is followed by a digit', () => {
    const { sentences, remainder } = pullAllCompleteSentences('The value is 3.14 and it works.')
    // Actual behavior: the regex sees "3." but the next char is "1" (not \s/$), so it keeps
    // scanning and emits the whole string as one sentence.
    assert.strictEqual(sentences.length, 1)
    assert.strictEqual(sentences[0], 'The value is 3.14 and it works.')
    assert.strictEqual(remainder, '')
  })

  // 5. URLs
  // "https://example.com." — the "." after "com" is followed by a space, so the regex
  // treats "Visit https://example.com." as the first sentence, then "Then continue." as
  // the second. The URL is consumed as part of the first sentence.
  it('treats the period after a URL domain as a sentence terminator', () => {
    const { sentences, remainder } = pullAllCompleteSentences('Visit https://example.com. Then continue.')
    // Actual behavior: splits into two sentences at the "." after "com".
    assert.strictEqual(sentences.length, 2)
    assert.strictEqual(sentences[0], 'Visit https://example.com.')
    assert.strictEqual(sentences[1], 'Then continue.')
    assert.strictEqual(remainder, '')
  })

  // 6. Ellipsis
  // The regex is non-greedy and matches the first [.!?] followed by \s or end-of-string.
  // In "Well... I think so. Yes." the third "." of the ellipsis is followed by a space,
  // so the regex matches "Well..." as the first sentence. It does NOT absorb the ellipsis
  // into the surrounding sentence — each terminal punctuation+whitespace boundary is a split.
  it('splits ellipsis as its own sentence token (the trailing dot is followed by space)', () => {
    const { sentences, remainder } = pullAllCompleteSentences('Well... I think so. Yes.')
    // Actual behavior: ["Well...", "I think so.", "Yes."], empty remainder.
    // "Well..." is emitted because the last "." in "..." is followed by a space.
    assert.strictEqual(sentences.length, 3)
    assert.strictEqual(sentences[0], 'Well...')
    assert.strictEqual(sentences[1], 'I think so.')
    assert.strictEqual(sentences[2], 'Yes.')
    assert.strictEqual(remainder, '')
  })

  // 7. Multiple consecutive punctuation marks
  // "?!" — the "?" is followed by "!", not whitespace, so the non-greedy scan continues
  // to the next terminal. The whole "Really?! Yes." is split at the "!" (followed by space)
  // giving "Really?!" as the first sentence and "Yes." as the second.
  it('handles multiple consecutive punctuation marks by matching the last one before whitespace', () => {
    const { sentences, remainder } = pullAllCompleteSentences('Really?! Yes.')
    // Actual behavior: ["Really?!", "Yes."], empty remainder
    assert.strictEqual(sentences.length, 2)
    assert.strictEqual(sentences[0], 'Really?!')
    assert.strictEqual(sentences[1], 'Yes.')
    assert.strictEqual(remainder, '')
  })

  // 8. Empty string — nothing to match
  it('returns no sentences and empty remainder for an empty string', () => {
    const { sentences, remainder } = pullAllCompleteSentences('')
    assert.strictEqual(sentences.length, 0)
    assert.strictEqual(remainder, '')
  })

  // 9. Single sentence with no trailing whitespace
  it('matches a single sentence that ends the string without a trailing space', () => {
    const { sentences, remainder } = pullAllCompleteSentences('Hello.')
    assert.strictEqual(sentences.length, 1)
    assert.strictEqual(sentences[0], 'Hello.')
    assert.strictEqual(remainder, '')
  })

  // 10. Abbreviations
  // "Dr." is followed by a space, which satisfies (?=\s|$), so the regex DOES split there.
  // This means "Dr." becomes the first sentence and "Smith is here." the second — which is
  // not semantically ideal, but it is the documented actual behavior of the function.
  it('splits at an abbreviation period that is followed by a space (known limitation)', () => {
    const { sentences, remainder } = pullAllCompleteSentences('Dr. Smith is here. Please wait.')
    // Actual behavior: ["Dr.", "Smith is here.", "Please wait."], empty remainder.
    // The regex cannot distinguish abbreviation dots from sentence-ending dots.
    assert.strictEqual(sentences.length, 3)
    assert.strictEqual(sentences[0], 'Dr.')
    assert.strictEqual(sentences[1], 'Smith is here.')
    assert.strictEqual(sentences[2], 'Please wait.')
    assert.strictEqual(remainder, '')
  })
})

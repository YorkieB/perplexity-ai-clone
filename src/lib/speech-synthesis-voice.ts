/**
 * Pick the most natural-sounding voice available in the browser.
 * Chromium often exposes neural / "Natural" / Online voices; Safari/macOS has high-quality local voices.
 */
export function scoreVoiceNaturalness(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase()
  let score = 0

  // Strong signals for modern neural / cloud voices
  if (/\(natural\)|\bneural\b|\bpremium\b|\benhanced\b|\bonline\b|\bwavenet\b|\bstudio\b|\bgenerative\b/i.test(v.name)) {
    score += 90
  }
  if (/\bgoogle\b.*\b(english|en)\b/i.test(n)) score += 45
  if (/microsoft\s+(aria|jenny|guy|michelle|sonia|davis|brandon|christopher|amber|ana|ashley).*(online|natural)/i.test(v.name)) {
    score += 75
  }
  // Cloud voices in Chromium are often higher quality than bundled SAPI
  if (v.localService === false) score += 30

  // macOS / Apple voices (usually pleasant)
  if (/\b(samantha|allison|ava|nicky|susan|daniel|karen|moira|tessa|veena)\b/i.test(n)) score += 40

  // Deprioritize classic robotic SAPI-style defaults when not "Natural"
  if (/^microsoft (david|mark|george|richard)\b/i.test(n) && !/online|natural/i.test(n)) score -= 55
  if (/^microsoft zira\b/i.test(n) && !/online|natural/i.test(n)) score -= 25
  if (/\brobot|compact|legacy|crisp/i.test(n)) score -= 50

  if (v.default) score += 8
  if (v.lang.toLowerCase() === 'en-us') score += 12
  else if (v.lang.toLowerCase().startsWith('en')) score += 6

  return score
}

/** Prefer female-sounding names when choosing among en-GB system voices. */
function scoreFemaleNameHint(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase()
  let s = 0
  if (/\b(female|woman)\b/i.test(n)) s += 55
  if (/\b(martha|maisie|kate|libby|amy|serena|fiona|holly|millie|poppy|emma|lucy|sarah)\b/i.test(n)) s += 45
  if (/\bmale\b/i.test(n)) s -= 40
  return s
}

export function pickPreferredSpeechVoice(
  voices: SpeechSynthesisVoice[],
  preferredLang = typeof navigator !== 'undefined'
    ? (navigator.language || 'en-US').replace('_', '-')
    : 'en-US',
  options?: { excludeMicrosoft?: boolean; preferBritishFemale?: boolean }
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null

  let source = voices
  if (options?.excludeMicrosoft) {
    const noMs = voices.filter((v) => !/microsoft/i.test(v.name))
    if (noMs.length > 0) source = noMs
  }

  if (options?.preferBritishFemale) {
    const gb = source.filter((v) =>
      v.lang.replace('_', '-').toLowerCase().startsWith('en-gb')
    )
    if (gb.length > 0) source = gb
  }

  const primary = preferredLang.split('-')[0]?.toLowerCase() ?? 'en'

  const exactLang = source.filter((v) => v.lang.replace('_', '-').toLowerCase() === preferredLang.toLowerCase())
  const langFamily = source.filter((v) => v.lang.toLowerCase().startsWith(primary + '-'))

  const pool =
    exactLang.length > 0 ? exactLang : langFamily.length > 0 ? langFamily : source.filter((v) => v.lang.toLowerCase().startsWith('en'))

  const finalPool = pool.length > 0 ? pool : source

  const ranked = [...finalPool].sort((a, b) => {
    const score = (v: SpeechSynthesisVoice) =>
      scoreVoiceNaturalness(v) + (options?.preferBritishFemale ? scoreFemaleNameHint(v) : 0)
    return score(b) - score(a)
  })
  return ranked[0] ?? null
}

/** Slightly below 1.0 often sounds less "announcement system" and more conversational. */
export const DEFAULT_SPEECH_RATE = 0.93
export const DEFAULT_SPEECH_PITCH = 1

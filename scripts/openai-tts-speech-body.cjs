'use strict'

/** OpenAI `input` max length per audio/speech API. */
const MAX_INPUT_LEN = 4096

const OPENAI_TTS_MODELS = new Set(['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'])

const VOICES_TTS_CLASSIC = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])

/** gpt-4o-mini-tts adds extra preset voices (see OpenAI docs). */
const VOICES_GPT4O_MINI = new Set([
  ...VOICES_TTS_CLASSIC,
  'ash',
  'ballad',
  'coral',
  'sage',
  'verse',
  'marin',
  'cedar',
])

function voicesForModel(model) {
  if (model === 'gpt-4o-mini-tts') return VOICES_GPT4O_MINI
  return VOICES_TTS_CLASSIC
}

const RESPONSE_FORMATS = new Set(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'])

/**
 * Validates and rebuilds JSON for `POST /v1/audio/speech`. Do not pass `provider: elevenlabs` bodies here.
 * @returns {{ ok: true, body: string } | { ok: false, status: number, message: string }}
 */
function normalizeOpenAiAudioSpeechBody(bodyStr) {
  let parsed
  try {
    parsed = JSON.parse(bodyStr || '{}')
  } catch {
    return { ok: false, status: 400, message: 'Invalid JSON body' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, status: 400, message: 'Body must be a JSON object' }
  }

  const model = typeof parsed.model === 'string' ? parsed.model.trim() : ''
  if (!OPENAI_TTS_MODELS.has(model)) {
    return { ok: false, status: 400, message: 'Invalid or unsupported TTS model' }
  }

  const input = typeof parsed.input === 'string' ? parsed.input : ''
  if (!input.length) {
    return { ok: false, status: 400, message: 'Missing or empty input' }
  }
  if (input.length > MAX_INPUT_LEN) {
    return { ok: false, status: 400, message: `input exceeds ${String(MAX_INPUT_LEN)} characters` }
  }

  const voice = typeof parsed.voice === 'string' ? parsed.voice.trim() : ''
  if (!voicesForModel(model).has(voice)) {
    return { ok: false, status: 400, message: 'Invalid or unsupported voice for this model' }
  }

  const out = { model, input, voice }

  if (parsed.speed !== undefined && parsed.speed !== null) {
    const s = Number(parsed.speed)
    if (!Number.isFinite(s) || s < 0.25 || s > 4) {
      return { ok: false, status: 400, message: 'speed must be a number between 0.25 and 4' }
    }
    out.speed = s
  } else {
    out.speed = 1
  }

  if (parsed.response_format !== undefined && parsed.response_format !== null) {
    const rf = String(parsed.response_format).trim()
    if (!RESPONSE_FORMATS.has(rf)) {
      return { ok: false, status: 400, message: 'Invalid response_format' }
    }
    out.response_format = rf
  }

  return { ok: true, body: JSON.stringify(out) }
}

module.exports = { normalizeOpenAiAudioSpeechBody, MAX_INPUT_LEN }

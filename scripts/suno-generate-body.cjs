'use strict'

/**
 * POST /api/v1/generate — permitted body fields only.
 * @see https://docs.sunoapi.org/suno-api/generate-music/
 */
const SUNO_MODELS = new Set(['V4', 'V4_5', 'V4_5PLUS', 'V4_5ALL', 'V5', 'V5_5'])
const PERSONA_MODELS = new Set(['style_persona', 'voice_persona'])

const MAX_PROMPT = 5000
const MAX_STYLE = 1000
const MAX_TITLE = 100
const MAX_NEGATIVE_TAGS = 500
const MAX_PERSONA_ID = 200
const MAX_CALLBACK_URL = 2000

/**
 * @param {unknown} parsed parsed JSON body from the client
 * @returns {Record<string, unknown>} body safe to send to api.sunoapi.org
 */
function buildAllowedSunoGenerateBody(parsed) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object')
  }

  /** @type {Record<string, unknown>} */
  const out = {}

  if (typeof parsed.prompt === 'string') {
    out.prompt = parsed.prompt.slice(0, MAX_PROMPT)
  }
  if (typeof parsed.style === 'string') {
    out.style = parsed.style.slice(0, MAX_STYLE)
  }
  if (typeof parsed.title === 'string') {
    out.title = parsed.title.slice(0, MAX_TITLE)
  }

  if (typeof parsed.customMode === 'boolean') {
    out.customMode = parsed.customMode
  }
  if (typeof parsed.instrumental === 'boolean') {
    out.instrumental = parsed.instrumental
  }

  if (typeof parsed.personaId === 'string' && parsed.personaId.length <= MAX_PERSONA_ID) {
    out.personaId = parsed.personaId
  }
  if (typeof parsed.personaModel === 'string' && PERSONA_MODELS.has(parsed.personaModel)) {
    out.personaModel = parsed.personaModel
  }

  if (typeof parsed.model === 'string' && SUNO_MODELS.has(parsed.model)) {
    out.model = parsed.model
  }

  if (typeof parsed.negativeTags === 'string') {
    out.negativeTags = parsed.negativeTags.slice(0, MAX_NEGATIVE_TAGS)
  }

  if (parsed.vocalGender === 'm' || parsed.vocalGender === 'f') {
    out.vocalGender = parsed.vocalGender
  }

  for (const key of ['styleWeight', 'weirdnessConstraint', 'audioWeight']) {
    const v = parsed[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      const clamped = Math.min(1, Math.max(0, v))
      out[key] = Math.round(clamped * 100) / 100
    }
  }

  if (typeof parsed.callBackUrl === 'string' && parsed.callBackUrl.length <= MAX_CALLBACK_URL) {
    try {
      const u = new URL(parsed.callBackUrl)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        out.callBackUrl = parsed.callBackUrl
      }
    } catch {
      /* ignore invalid URL */
    }
  }

  if (typeof out.customMode !== 'boolean') out.customMode = false
  if (typeof out.instrumental !== 'boolean') out.instrumental = false
  if (typeof out.model !== 'string' || !SUNO_MODELS.has(out.model)) {
    out.model = 'V4_5ALL'
  }
  if (typeof out.callBackUrl !== 'string') {
    out.callBackUrl = 'https://localhost/suno-callback'
  }

  return out
}

module.exports = { buildAllowedSunoGenerateBody }

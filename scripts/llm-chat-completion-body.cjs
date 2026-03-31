'use strict'

/**
 * Normalizes `model` on POST /api/llm (chat completions) so the client cannot
 * force arbitrary upstream model ids (e.g. premium models) when using the proxy.
 *
 * Non-OpenAI bases (OpenRouter, Azure, etc.): set `LLM_ALLOWED_CHAT_MODELS` to the
 * exact ids you permit, or every unknown id is replaced by `LLM_DEFAULT_CHAT_MODEL`.
 */

function parseEnvList(raw) {
  if (raw === undefined || raw === null) return []
  const s = String(raw).trim()
  if (!s) return []
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

function getDefaultOpenAiModel(env) {
  const d = env.LLM_DEFAULT_CHAT_MODEL || env.VITE_LLM_DEFAULT_CHAT_MODEL || 'gpt-4o-mini'
  const t = String(d).trim()
  return t || 'gpt-4o-mini'
}

function getDefaultDoModel(env) {
  const d = env.LLM_DEFAULT_DO_CHAT_MODEL || env.VITE_LLM_DEFAULT_DO_CHAT_MODEL || 'openai-gpt-4o-mini'
  const t = String(d).trim()
  return t || 'openai-gpt-4o-mini'
}

/** When set (comma-separated), only these exact ids are allowed for OpenAI routing. */
function resolveOpenAiModel(model, env) {
  const explicit = parseEnvList(env.LLM_ALLOWED_CHAT_MODELS || env.LLM_ALLOWED_OPENAI_CHAT_MODELS)
  if (explicit.length > 0) {
    return explicit.includes(model) ? model : getDefaultOpenAiModel(env)
  }
  return isBuiltInAllowedOpenAiModel(model) ? model : getDefaultOpenAiModel(env)
}

const OPENAI_ALLOWED_EXACT = new Set([
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'o1',
  'o1-mini',
  'o1-preview',
  'o3',
  'o3-mini',
  'o4-mini',
  'chatgpt-4o-latest',
])

function isBuiltInAllowedOpenAiModel(m) {
  if (OPENAI_ALLOWED_EXACT.has(m)) return true
  if (/^gpt-4o-mini-20\d{2}-\d{2}-\d{2}/.test(m)) return true
  if (/^gpt-4o-20\d{2}-\d{2}-\d{2}/.test(m)) return true
  if (/^gpt-4-turbo-20\d{2}-\d{2}-\d{2}/.test(m)) return true
  if (/^gpt-3\.5-turbo(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$/.test(m)) return true
  if (/^o[1-4](-mini|-preview)?(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$/.test(m)) return true
  return false
}

function isSafeDoModelId(m) {
  return typeof m === 'string' && m.length > 0 && m.length <= 200 && /^[A-Za-z0-9._/:-]+$/.test(m)
}

function resolveDoModel(model, env) {
  const explicit = parseEnvList(env.LLM_ALLOWED_DO_CHAT_MODELS)
  if (explicit.length > 0) {
    return explicit.includes(model) ? model : getDefaultDoModel(env)
  }
  return isSafeDoModelId(model) ? model : getDefaultDoModel(env)
}

/**
 * @param {string} bodyStr raw POST body
 * @param {Record<string, string | undefined>} env
 * @param {'openai' | 'digitalocean'} provider
 * @returns {string}
 */
function normalizeLlmChatCompletionBody(bodyStr, env, provider) {
  let parsed
  try {
    parsed = JSON.parse(bodyStr)
  } catch {
    return bodyStr
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return bodyStr
  }
  const rawModel = parsed.model
  if (typeof rawModel !== 'string') {
    parsed.model = provider === 'digitalocean' ? getDefaultDoModel(env) : getDefaultOpenAiModel(env)
    return JSON.stringify(parsed)
  }
  const model = rawModel.trim()
  if (!model) {
    parsed.model = provider === 'digitalocean' ? getDefaultDoModel(env) : getDefaultOpenAiModel(env)
    return JSON.stringify(parsed)
  }
  parsed.model = provider === 'digitalocean' ? resolveDoModel(model, env) : resolveOpenAiModel(model, env)
  return JSON.stringify(parsed)
}

module.exports = { normalizeLlmChatCompletionBody }

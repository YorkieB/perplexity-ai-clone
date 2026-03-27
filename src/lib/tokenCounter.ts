/**
 * OpenAI-accurate token counting via {@link https://github.com/dqbd/tiktoken tiktoken} (WASM).
 * Used for context budgeting and compaction decisions in Jarvis.
 */

import { encoding_for_model, type Tiktoken, type TiktokenModel } from 'tiktoken'

/**
 * Context window limits (input tokens) for models Jarvis uses.
 * Keys must match normalised OpenAI model ids (after stripping `do:` prefixes).
 */
export const TOKEN_LIMITS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
}

/**
 * Start compacting at 75% utilisation — preserves 25% as reasoning headroom.
 */
export const COMPACTION_THRESHOLD = 0.75

/**
 * Keep last 8 turns uncompressed regardless of token count.
 */
export const FULL_FIDELITY_TURNS = 8

const encoderCache = new Map<string, Tiktoken>()

const DEFAULT_MODEL = 'gpt-4o'

/**
 * Normalise a model id for tiktoken and limit lookup (strip `do:`, path-style ids).
 */
function normalizeModelId(model: string): string {
  let m = model.trim()
  if (m.startsWith('do:')) {
    m = m.slice(3)
  }
  const slash = m.indexOf('/')
  if (slash >= 0) {
    m = m.slice(0, slash)
  }
  return m
}

/**
 * Resolved context limit for `model`, falling back to {@link DEFAULT_MODEL}.
 */
function resolveTokenLimit(model: string): number {
  const key = normalizeModelId(model)
  return TOKEN_LIMITS[key] ?? TOKEN_LIMITS[DEFAULT_MODEL] ?? 128000
}

function approximateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Exact token count for `text` using the encoding for `model`.
 * Caches encoders per normalised model id. Falls back to ~chars/4 if tiktoken fails.
 */
export function countTokens(text: string, model: string = DEFAULT_MODEL): number {
  const key = normalizeModelId(model)
  try {
    let enc = encoderCache.get(key)
    if (enc === undefined) {
      enc = encoding_for_model(key as TiktokenModel)
      encoderCache.set(key, enc)
    }
    return enc.encode(text, 'all').length
  } catch {
    return approximateTokenCount(text)
  }
}

/**
 * Token estimate for a chat-style messages array: content (exact) + 4 tokens/message overhead
 * + 3 tokens reply priming (OpenAI chat formatting).
 */
export function countMessageTokens(
  messages: Array<{ role: string; content: string }>,
  model: string = DEFAULT_MODEL,
): number {
  let total = 3
  for (const m of messages) {
    total += 4
    total += countTokens(m.content ?? '', model)
  }
  return total
}

/**
 * Fraction of the model context window used by `messages` (0.0–1.0).
 */
export function getContextUtilisation(
  messages: Array<{ role: string; content: string }>,
  model: string = DEFAULT_MODEL,
): number {
  const used = countMessageTokens(messages, model)
  const max = resolveTokenLimit(model)
  if (max <= 0) {
    return 0
  }
  return Math.min(1, Math.max(0, used / max))
}

/**
 * Whether context usage has reached the compaction threshold.
 */
export function shouldCompact(
  messages: Array<{ role: string; content: string }>,
  model: string = DEFAULT_MODEL,
): boolean {
  return getContextUtilisation(messages, model) >= COMPACTION_THRESHOLD
}

/**
 * Tokens available for prompt/context after reserving space for the assistant reply.
 */
export function getTokenBudget(totalLimit: number, reserveForResponse: number = 2000): number {
  return Math.max(0, totalLimit - reserveForResponse)
}

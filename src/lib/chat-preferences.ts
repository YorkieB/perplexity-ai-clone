export const PREFERRED_CHAT_MODEL_KEY = 'preferred-chat-model'

/** OpenAI TTS voice id for read-aloud and voice conversation (see `OPENAI_TTS_VOICE_OPTIONS` in `@/lib/tts`). */
export const PREFERRED_TTS_VOICE_KEY = 'preferred-tts-voice'

export function getStoredTtsVoice(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(PREFERRED_TTS_VOICE_KEY)
    const v = raw?.trim()
    return v || null
  } catch {
    return null
  }
}

export function setStoredTtsVoice(voiceId: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (!voiceId?.trim()) {
      localStorage.removeItem(PREFERRED_TTS_VOICE_KEY)
    } else {
      localStorage.setItem(PREFERRED_TTS_VOICE_KEY, voiceId.trim())
    }
    window.dispatchEvent(new CustomEvent('preferred-tts-voice-changed'))
  } catch {
    /* quota / private mode */
  }
}

/**
 * IDs that still appear in some catalogs but return 404 at inference (retired, renamed, or no access).
 * Extend with `VITE_BLOCKED_CHAT_MODEL_IDS` (comma-separated) in `.env` without editing code.
 */
const BUILT_IN_REMOVED_MODEL_IDS = [
  'alibaba-qwen3-32b',
  'llama3-8b-instruct',
] as const

function parseEnvBlockedModelIds(): string[] {
  const raw = import.meta.env.VITE_BLOCKED_CHAT_MODEL_IDS
  if (raw === undefined || raw === null || String(raw).trim() === '') return []
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

let mergedRemovedModelIds: Set<string> | null = null

function getRemovedModelIds(): Set<string> {
  if (!mergedRemovedModelIds) {
    mergedRemovedModelIds = new Set<string>([
      ...BUILT_IN_REMOVED_MODEL_IDS,
      ...parseEnvBlockedModelIds(),
    ])
  }
  return mergedRemovedModelIds
}

export function isRemovedChatModelId(id: string): boolean {
  return getRemovedModelIds().has(id.trim())
}

/**
 * Embedding / rerank / sentence-transformer models are listed in some catalogs but cannot
 * answer questions or summarize — only generative chat models should appear in the selector.
 */
export function isNonGenerativeChatModelId(id: string): boolean {
  const s = id.trim().toLowerCase()
  if (!s) return true
  const markers = [
    'minilm',
    'text-embedding',
    'sentence-transformers',
    'sentence_transformers',
    'bge-m3',
    'bge-large',
    'bge-base',
    'e5-base',
    'e5-large',
    'e5-small',
    'rerank',
    'embed-english',
    'multilingual-e5',
  ] as const
  for (const m of markers) {
    if (s.includes(m)) return true
  }
  if (/^text-embedding-/.test(s)) return true
  return false
}

export function isInvalidChatModelId(id: string): boolean {
  return isRemovedChatModelId(id) || isNonGenerativeChatModelId(id)
}

export function filterAvailableChatModels<T extends { id: string }>(models: T[]): T[] {
  return models.filter((m) => !isInvalidChatModelId(m.id))
}

export function getPreferredChatModel(fallback = 'gpt-4o-mini'): string {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(PREFERRED_CHAT_MODEL_KEY)
    if (!raw) return fallback
    if (isInvalidChatModelId(raw)) {
      localStorage.removeItem(PREFERRED_CHAT_MODEL_KEY)
      return fallback
    }
    return raw
  } catch {
    return fallback
  }
}

export function setPreferredChatModel(modelId: string) {
  if (isInvalidChatModelId(modelId)) return
  try {
    localStorage.setItem(PREFERRED_CHAT_MODEL_KEY, modelId)
  } catch {
    /* ignore quota / private mode */
  }
}

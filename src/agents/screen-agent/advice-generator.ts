import { callLlmWithTools } from '@/lib/llm'

import type { ScreenState } from './types'

/** Default chat model for screen advice (matches `getPreferredChatModel` fallback in `@/lib/chat-preferences`). */
const DEFAULT_ADVICE_MODEL = 'gpt-4o-mini'

/** Same-origin LLM completion with explicit system + user roles (mirrors tool-calling path in `@/lib/llm`). */
export type JarvisAdviceLlm = (
  system: string,
  user: string,
  options?: { signal?: AbortSignal },
) => Promise<string>

const LLM_TIMEOUT_MS = 60_000

function createTimeoutSignal(ms: number): AbortSignal {
  const ac = new AbortController()
  setTimeout(() => ac.abort(), ms)
  return ac.signal
}

async function defaultJarvisAdviceLlm(
  system: string,
  user: string,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const signal = options?.signal ?? createTimeoutSignal(LLM_TIMEOUT_MS)

  const result = await callLlmWithTools(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    DEFAULT_ADVICE_MODEL,
    [],
    { signal },
  )
  return result.content?.trim() ?? ''
}

function clip(text: string, max: number): string {
  if (text.length <= max) {
    return text
  }
  return text.slice(0, max)
}

const SPOKEN_REASONS = new Set([
  'error_appeared',
  'failure_in_title',
  'critical_app_opened',
  'major_content_change',
])

/**
 * Produces short spoken advice for high-significance screen events (ADVISE mode).
 */
export class AdviceGenerator {
  private lastAdviceText = ''

  constructor(private readonly llm: JarvisAdviceLlm = defaultJarvisAdviceLlm) {}

  async generate(state: ScreenState, reason: string): Promise<string | null> {
    if (!SPOKEN_REASONS.has(reason)) {
      return null
    }

    const activeApp = state.activeApp ?? 'unknown'
    const windowTitle = state.windowTitle ?? ''

    let system: string
    let user: string

    if (reason === 'error_appeared') {
      system =
        "You are Jarvis, an AI assistant watching a developer's screen. An error just appeared. Be a senior developer helping them debug."
      user = `Error detected in ${activeApp} — ${windowTitle}.
Visible text: ${clip(state.fullText, 1500)}.
Give ONE specific, actionable fix suggestion. Max 2 sentences.`
    } else if (reason === 'failure_in_title') {
      system = "You are Jarvis, watching a developer's screen."
      user = `The window title shows a failure: ${windowTitle}.
Context: ${clip(state.fullText, 1000)}.
Give ONE concise observation. Max 1 sentence.`
    } else if (reason === 'critical_app_opened') {
      system = "You are Jarvis, watching a developer's screen."
      user = `The user just opened ${activeApp}.
Give ONE brief, helpful contextual tip. Max 1 sentence.`
    } else if (reason === 'major_content_change') {
      system = "You are Jarvis, watching a developer's screen."
      user = `Significant new content appeared in ${activeApp} — ${windowTitle}.
New content excerpt: ${clip(state.fullText, 800)}.
If this looks important, give ONE brief observation. 
If it looks routine, respond with exactly: SILENT`
    } else {
      return null
    }

    const raw = await this.llm(system, user)
    const response = raw.trim()
    if (response.length === 0 || /^silent$/i.test(response)) {
      return null
    }
    if (response === this.lastAdviceText) {
      return null
    }
    this.lastAdviceText = response
    return response
  }
}

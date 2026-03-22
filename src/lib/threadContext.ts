import type { Message } from '@/lib/types'
import type { LlmChatMessage } from '@/lib/llm'

/** Max prior messages (user + assistant) before the current turn. */
export const MAX_PRIOR_MESSAGES = 28

/** Hard cap on individual message body length after extraction (chars). */
export const MAX_CHARS_PER_HISTORY_MESSAGE = 8000

/** Total character budget for all prior turns combined (approximate context guard). */
export const MAX_TOTAL_HISTORY_CHARS = 40000

function truncate(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 20)}\n…[truncated]`
}

function userContent(m: Message): string {
  let base = m.content.trim()
  if (m.files && m.files.length > 0) {
    const names = m.files.map((f) => f.name).join(', ')
    base = `${base}\n\n[Attached ${m.files.length} file(s): ${names}]`
  }
  return truncate(base, MAX_CHARS_PER_HISTORY_MESSAGE)
}

function assistantContent(m: Message): string {
  if (m.isModelCouncil && m.modelResponses && m.modelResponses.length > 0) {
    const combined = m.modelResponses
      .map((r) => `### ${r.model}\n${r.content}`)
      .join('\n\n')
    return truncate(combined, MAX_CHARS_PER_HISTORY_MESSAGE)
  }
  return truncate(m.content, MAX_CHARS_PER_HISTORY_MESSAGE)
}

/**
 * Builds OpenAI-style prior turns from messages **before** the current user message.
 * Pass `thread.messages.slice(0, -1)` so the latest message is the in-flight user query.
 */
export function buildPriorLlmMessages(priorMessages: Message[]): LlmChatMessage[] {
  if (priorMessages.length === 0) return []

  let slice = priorMessages
  if (slice.length > MAX_PRIOR_MESSAGES) {
    slice = slice.slice(-MAX_PRIOR_MESSAGES)
  }

  const candidates: LlmChatMessage[] = []
  for (const m of slice) {
    const content = m.role === 'user' ? userContent(m) : assistantContent(m)
    if (!content.trim()) continue
    candidates.push({ role: m.role, content })
  }

  let total = candidates.reduce((s, m) => s + m.content.length, 0)
  let start = 0
  while (total > MAX_TOTAL_HISTORY_CHARS && start < candidates.length) {
    total -= candidates[start].content.length
    start++
  }

  let out = candidates.slice(start)

  while (out.length > 0 && out[0].role === 'assistant') {
    out = out.slice(1)
  }

  return out
}

/**
 * Matches {@link App.tsx} main-path system line: workspace prompt + advanced-mode instruction concatenated as one string.
 */
export function buildAssistantSystemContentFromCombined(combinedInstructions: string): string {
  const rest = combinedInstructions.trimStart()
  if (!rest) return 'You are an advanced AI research assistant.'
  return `You are an advanced AI research assistant. ${rest}`
}

/**
 * Final user turn for Model Council: web/file snippets + query + legacy council task instructions (unchanged from pre–Phase 3 single-blob prompt).
 */
export function buildCouncilResearchUserContent(
  contextSection: string,
  fileContext: string,
  query: string
): string {
  const taskInstruction = contextSection.trim()
    ? 'Using the web search results provided above, give a comprehensive answer that synthesizes information from multiple sources. Reference the sources naturally in your response.'
    : fileContext.trim()
      ? 'Analyze the provided files and answer the user query based on the file content.'
      : 'Provide a helpful, accurate answer based on your knowledge.'

  return `${contextSection}${fileContext}

User query: ${query}

${taskInstruction}`
}

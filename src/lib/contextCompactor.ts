/**
 * Progressive context compression for long Jarvis conversations: LLM summaries,
 * middle truncation, and intent-based selective filtering.
 */

import OpenAI from 'openai'

import { countMessageTokens, FULL_FIDELITY_TURNS, TOKEN_LIMITS, getTokenBudget } from './tokenCounter'

const SUMMARY_MODEL = 'gpt-4o-mini'

/** One conversational message with optional cached token estimate. */
export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system'
  content: string
  turnIndex: number
  tokenCount?: number
}

/** Outcome of {@link compactContext}. */
export interface CompactionResult {
  /** Compacted (or original / truncated) messages. */
  messages: ConversationTurn[]
  /** LLM summary of compressed older turns; empty when not compacted. */
  summary: string
  /** Number of user/assistant turns fed into summarisation. */
  turnsCompacted: number
  /** Approximate token reduction from replacing compressible turns with the summary. */
  tokensSaved: number
  /** True when older compressible turns were replaced by a summary. */
  wasCompacted: boolean
}

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summariser for an AI coding assistant called Jarvis.
Compress the provided conversation turns into a concise structured summary.

ALWAYS PRESERVE:
- All code snippets, file names, variable names, function names, component names
- All architectural decisions and technical requirements stated
- All file paths, API endpoints, configuration values
- All errors encountered and their resolutions
- User preferences and stated constraints

DISCARD:
- Pleasantries and filler responses ('Sure!', 'Great question', etc.)
- Repetitive explanations of the same concept
- Superseded requirements (keep only the latest version)

FORMAT:
## Prior Context Summary
### Code & Files Discussed
[bullet list of code artefacts, filenames, key functions]
### Technical Decisions
[bullet list of decisions made]
### Active Requirements
[bullet list of current task requirements]
### Errors & Resolutions
[bullet list if any]`

function modelTokenLimit(model: string): number {
  let m = model.trim()
  if (m.startsWith('replicate:')) {
    m = 'gpt-4o-mini'
  }
  if (m.startsWith('do:')) {
    m = m.slice(3)
  }
  const slash = m.indexOf('/')
  if (slash >= 0) {
    m = m.slice(0, slash)
  }
  return TOKEN_LIMITS[m] ?? TOKEN_LIMITS['gpt-4o'] ?? 128000
}

function turnsToTokenMessages(turns: ConversationTurn[]): Array<{ role: string; content: string }> {
  return turns.map((t) => ({ role: t.role, content: t.content ?? '' }))
}

/**
 * Generates a compression summary of older conversation turns.
 *
 * ⚠️  INTENTIONALLY DOES NOT USE assembleContext():
 * This is an internal utility called BY assembleContext() during
 * compaction. Routing it through assembleContext() would create
 * a circular dependency and potential infinite recursion.
 *
 * This call is bounded by design:
 * - Input: only the compressible older turns (never the full history)
 * - Model: gpt-4o-mini (sufficient for summarisation)
 * - max_tokens: 600 (fixed cap)
 * - System prompt: minimal, static (no RAG context needed)
 */
export async function _generateSummary(turns: ConversationTurn[]): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  const openai = new OpenAI({ apiKey: key })
  const userMessage = turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join('\n\n')

  const res = await openai.chat.completions.create({
    model: SUMMARY_MODEL,
    temperature: 0,
    max_tokens: 600,
    messages: [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  })
  return res.choices[0]?.message?.content?.trim() ?? ''
}

/**
 * Build keep-set for non-system indices: first two and last {@link FULL_FIDELITY_TURNS} user/assistant messages.
 */
function computeMiddleTruncationKeepSet(nonSystemIndices: number[]): Set<number> {
  if (nonSystemIndices.length === 0) {
    return new Set()
  }
  const firstTwo = nonSystemIndices.slice(0, Math.min(2, nonSystemIndices.length))
  const lastN = nonSystemIndices.slice(-Math.min(FULL_FIDELITY_TURNS, nonSystemIndices.length))
  return new Set([...firstTwo, ...lastN])
}

function buildMiddleTruncatedMessages(messages: ConversationTurn[]): ConversationTurn[] {
  const nonSystemIndices: number[] = []
  messages.forEach((m, i) => {
    if (m.role !== 'system') {
      nonSystemIndices.push(i)
    }
  })
  const keepNonSystem = computeMiddleTruncationKeepSet(nonSystemIndices)

  const out: ConversationTurn[] = []
  let insertedPlaceholder = false
  let lastKeptNonSystemIndex = -1

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!
    if (m.role === 'system') {
      out.push(m)
      continue
    }
    const keep = keepNonSystem.has(i)
    if (!keep) {
      continue
    }
    let droppedBetween = false
    for (let j = lastKeptNonSystemIndex + 1; j < i; j++) {
      const mid = messages[j]!
      if (mid.role !== 'system' && !keepNonSystem.has(j)) {
        droppedBetween = true
        break
      }
    }
    if (droppedBetween && !insertedPlaceholder) {
      out.push({
        role: 'system',
        content: '<omitted_context>Middle turns omitted to fit context window.</omitted_context>',
        turnIndex: -1,
      })
      insertedPlaceholder = true
    }
    out.push(m)
    lastKeptNonSystemIndex = i
  }

  return out
}

/**
 * Remove oldest user/assistant messages from `out` until under `maxTokens` (never removes system except by mistake — we skip system and summary placeholders with turnIndex -1? Spec: oldest non-system).
 */
function shrinkNonSystemUntilUnderBudget(
  out: ConversationTurn[],
  maxTokens: number,
  model: string,
): void {
  while (countMessageTokens(turnsToTokenMessages(out), model) > maxTokens && out.length > 0) {
    const idx = out.findIndex((m) => m.role === 'user' || m.role === 'assistant')
    if (idx < 0) {
      break
    }
    out.splice(idx, 1)
  }
}

/**
 * Keep start + end non-system slices; drop middle with a placeholder. Optionally shrink to `maxTokens`.
 */
export function applyMiddleTruncation(
  messages: ConversationTurn[],
  maxTokens: number,
  model: string = 'gpt-4o',
): ConversationTurn[] {
  const out = buildMiddleTruncatedMessages(messages)
  shrinkNonSystemUntilUnderBudget(out, maxTokens, model)
  return out
}

function addRecentWindow(keep: Set<number>, n: number, windowSize: number): void {
  for (let i = Math.max(0, n - windowSize); i < n; i++) {
    keep.add(i)
  }
}

function addIndicesWithCodeBlocks(messages: ConversationTurn[], keep: Set<number>): void {
  messages.forEach((m, i) => {
    if (m.content.includes('```')) {
      keep.add(i)
    }
  })
}

function contentLooksLikeKnowledgeLookup(content: string): boolean {
  const c = content.toLowerCase()
  if (c.includes('http://') || c.includes('https://') || c.includes('www.')) {
    return true
  }
  const factWords = ['according to', 'research', 'study', 'statistic', 'statistics', 'percent'] as const
  if (factWords.some((w) => c.includes(w))) {
    return true
  }
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (ch >= '0' && ch <= '9') {
      let j = i
      while (j < content.length && /[\d.]/.test(content[j]!)) j++
      if (content[j] === '%') {
        return true
      }
    }
  }
  return false
}

function addIndicesMatchingKnowledgeHeuristic(messages: ConversationTurn[], keep: Set<number>): void {
  messages.forEach((m, i) => {
    if (contentLooksLikeKnowledgeLookup(m.content)) {
      keep.add(i)
    }
  })
}

/**
 * Filter messages by intent: always keep system lines, recent window, and code/URL heuristics.
 */
export function selectiveFilter(messages: ConversationTurn[], intentRoute: string): ConversationTurn[] {
  const n = messages.length
  const keep = new Set<number>()
  const lastUserIndex = messages.reduce((acc, m, i) => (m.role === 'user' ? i : acc), -1)

  for (let i = 0; i < n; i++) {
    if (messages[i]!.role === 'system') {
      keep.add(i)
    }
  }

  const route = intentRoute.trim()
  if (route === 'conversational') {
    addRecentWindow(keep, n, 4)
  } else if (route === 'code_instruction') {
    addRecentWindow(keep, n, 6)
    addIndicesWithCodeBlocks(messages, keep)
  } else if (route === 'knowledge_lookup') {
    addRecentWindow(keep, n, 6)
    addIndicesMatchingKnowledgeHeuristic(messages, keep)
  } else {
    addRecentWindow(keep, n, 8)
  }

  if (lastUserIndex >= 0) {
    keep.add(lastUserIndex)
  }

  return messages.filter((_, i) => keep.has(i))
}

/**
 * Compress older turns into a structured summary while keeping recent turns verbatim.
 * On summarisation failure, falls back to {@link applyMiddleTruncation} (does not throw).
 */
export async function compactContext(
  messages: ConversationTurn[],
  model: string = 'gpt-4o',
): Promise<CompactionResult> {
  const empty = (m: ConversationTurn[]): CompactionResult => ({
    messages: m,
    summary: '',
    turnsCompacted: 0,
    tokensSaved: 0,
    wasCompacted: false,
  })

  if (messages.length <= FULL_FIDELITY_TURNS) {
    return empty(messages)
  }

  const recent = messages.slice(-FULL_FIDELITY_TURNS)
  const older = messages.slice(0, -FULL_FIDELITY_TURNS)
  const systemMessages = older.filter((m) => m.role === 'system')
  const compressible = older.filter((m) => m.role === 'user' || m.role === 'assistant')

  if (compressible.length === 0) {
    return empty(messages)
  }

  const originalTokens = countMessageTokens(turnsToTokenMessages(compressible), model)

  let summary: string
  try {
    summary = await _generateSummary(compressible)
  } catch (e) {
    console.warn('[ContextCompactor] Summary generation failed, returning recent turns only', e)
    const maxTokens = getTokenBudget(modelTokenLimit(model))
    const truncated = applyMiddleTruncation(messages, maxTokens, model)
    return {
      messages: truncated,
      summary: '',
      turnsCompacted: 0,
      tokensSaved: 0,
      wasCompacted: false,
    }
  }

  if (!summary.trim()) {
    const maxTokens = getTokenBudget(modelTokenLimit(model))
    const truncated = applyMiddleTruncation(messages, maxTokens, model)
    return {
      messages: truncated,
      summary: '',
      turnsCompacted: 0,
      tokensSaved: 0,
      wasCompacted: false,
    }
  }

  const summaryTokens = countMessageTokens([{ role: 'system', content: summary }], model)
  const tokensSaved = Math.max(0, originalTokens - summaryTokens)

  const summaryTurn: ConversationTurn = {
    role: 'system',
    content: `<context_summary>\n${summary}\n</context_summary>`,
    turnIndex: -1,
  }

  const compacted: ConversationTurn[] = [...systemMessages, summaryTurn, ...recent]

  return {
    messages: compacted,
    summary,
    turnsCompacted: compressible.length,
    tokensSaved,
    wasCompacted: true,
  }
}

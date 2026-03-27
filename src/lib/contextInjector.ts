/**
 * Assembles the optimal chat context for each Jarvis LLM call: system XML prompt,
 * RAG injection, intent-based filtering, compaction, and truncation against a token budget.
 */

import {
  applyMiddleTruncation,
  compactContext,
  selectiveFilter,
  type ConversationTurn,
} from './contextCompactor'
import { assembleSystemPrompt } from '@/lib/prompts/promptAssembler'
import {
  COMPACTION_THRESHOLD,
  countMessageTokens,
  countTokens,
  getTokenBudget,
  TOKEN_LIMITS,
} from './tokenCounter'

/** Inputs for {@link assembleContext}. */
export interface InjectionContext {
  /** Base system instructions (identity). */
  systemPrompt: string
  /** Conversation history (user / assistant / optional system summaries). */
  messages: ConversationTurn[]
  /** Optional RAG payload from the retrieval gate (XML-ready). */
  ragContext?: string
  /** Intent label from the orchestrator router. */
  intentRoute: string
  /** OpenAI-style model id (may include `do:` or provider path prefix). */
  model: string
  /** Tool names or descriptions for the system prompt; omit when none. */
  availableTools?: string[]
}

/** Normalised messages and token accounting for the upstream chat completion API. */
export interface AssembledContext {
  messages: Array<{ role: string; content: string }>
  totalTokens: number
  /** True when {@link compactContext} replaced older turns with a summary. */
  wasCompacted: boolean
  /** Token count of `ragContext` when present (for telemetry). */
  injectedRagTokens: number
  /** Sum of token estimates for all `system` messages in `messages`. */
  systemTokens?: number
  /** Sum of token estimates for `user` / `assistant` messages in `messages`. */
  historyTokens?: number
  /** Same as {@link injectedRagTokens}; alias for telemetry payloads. */
  ragTokens?: number
  /** Populated when compaction ran: token estimate before summary swap. */
  compactionTokensBefore?: number
  /** Populated when compaction ran: token estimate after summary swap. */
  compactionTokensAfter?: number
}

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

function turnsToApiMessages(turns: ConversationTurn[]): Array<{ role: string; content: string }> {
  return turns.map((t) => ({ role: t.role, content: t.content ?? '' }))
}

/** Full XML system message via {@link assembleSystemPrompt} (identity + rules + tools + RAG slot). */
function buildAssembledSystemMessage(ctx: InjectionContext, tools: string[]): string {
  return assembleSystemPrompt({
    basePrompt: ctx.systemPrompt,
    ragContext: ctx.ragContext,
    intentRoute: ctx.intentRoute,
    availableTools: tools,
    model: ctx.model,
    validate: true,
    useRegistry: false,
  })
}

function contentLooksKnowledgeRelevant(content: string): boolean {
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
      while (j < content.length && /[\d.]/.test(content[j]!)) {
        j++
      }
      if (content[j] === '%') {
        return true
      }
    }
  }
  return false
}

function contentLooksVoiceRelevant(content: string): boolean {
  return /\b(voice|audio|tts|text-to-speech|speech synthesis|ssml|speak|speaker|utterance)\b/i.test(content)
}

/**
 * Role-based pass: keep system lines, last four turns, and slices relevant to the intent
 * (code, voice, or knowledge heuristics) to limit cross-topic bleed.
 */
export function _buildRoleBasedContext(
  messages: ConversationTurn[],
  intentRoute: string,
): ConversationTurn[] {
  const n = messages.length
  const keep = new Set<number>()
  const route = intentRoute.trim()

  for (let i = 0; i < n; i++) {
    if (messages[i]!.role === 'system') {
      keep.add(i)
    }
  }

  for (let i = Math.max(0, n - 4); i < n; i++) {
    keep.add(i)
  }

  if (route === 'code_instruction') {
    messages.forEach((m, i) => {
      if (m.content.includes('```')) {
        keep.add(i)
      }
    })
  } else if (route === 'voice_synthesis' || route === 'voice_task') {
    messages.forEach((m, i) => {
      if (contentLooksVoiceRelevant(m.content)) {
        keep.add(i)
      }
    })
  } else if (route === 'knowledge_lookup') {
    messages.forEach((m, i) => {
      if (contentLooksKnowledgeRelevant(m.content)) {
        keep.add(i)
      }
    })
  }

  return messages.filter((_, i) => keep.has(i))
}

function degradedAssemble(ctx: InjectionContext): AssembledContext {
  const tools = ctx.availableTools ?? []
  const systemText = buildAssembledSystemMessage(ctx, tools)
  const tail = ctx.messages.slice(-4)
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemText },
    ...turnsToApiMessages(tail),
  ]
  const injectedRagTokens =
    ctx.ragContext !== undefined && ctx.ragContext.trim().length > 0
      ? countTokens(ctx.ragContext, ctx.model)
      : 0
  let systemTokens = 0
  let historyTokens = 0
  for (const m of messages) {
    const tk = countTokens(m.content ?? '', ctx.model)
    if (m.role === 'system') {
      systemTokens += tk
    } else {
      historyTokens += tk
    }
  }
  return {
    messages,
    totalTokens: countMessageTokens(messages, ctx.model),
    wasCompacted: false,
    injectedRagTokens,
    systemTokens,
    historyTokens,
    ragTokens: injectedRagTokens,
  }
}

/**
 * Produce API-ready messages: merged system prompt, filtered history, compaction, and truncation
 * to stay within the model budget minus a response reserve.
 */
export async function assembleContext(ctx: InjectionContext): Promise<AssembledContext> {
  const tools = ctx.availableTools ?? []
  const injectedRagTokens =
    ctx.ragContext !== undefined && ctx.ragContext.trim().length > 0
      ? countTokens(ctx.ragContext, ctx.model)
      : 0

  try {
    const key = normalizeModelId(ctx.model)
    const limit = TOKEN_LIMITS[key] ?? 128000
    const budget = getTokenBudget(limit, 2000)

    const systemText = buildAssembledSystemMessage(ctx, tools)
    const systemMsg = { role: 'system' as const, content: systemText }

    let conv = _buildRoleBasedContext(ctx.messages, ctx.intentRoute)
    conv = selectiveFilter(conv, ctx.intentRoute)

    let currentTokens = countMessageTokens([systemMsg, ...turnsToApiMessages(conv)], ctx.model)
    let wasCompacted = false
    let compactionTokensBefore: number | undefined
    let compactionTokensAfter: number | undefined

    if (currentTokens >= budget * COMPACTION_THRESHOLD) {
      try {
        const tokensBeforeCompaction = countMessageTokens(
          [systemMsg, ...turnsToApiMessages(conv)],
          ctx.model,
        )
        const compacted = await compactContext(conv, ctx.model)
        conv = compacted.messages
        wasCompacted = compacted.wasCompacted
        if (compacted.wasCompacted) {
          compactionTokensBefore = tokensBeforeCompaction
          compactionTokensAfter = countMessageTokens([systemMsg, ...turnsToApiMessages(conv)], ctx.model)
        }
      } catch (err) {
        console.warn('[ContextInjector] Compaction failed, using raw filtered context', err)
      }
    }

    currentTokens = countMessageTokens([systemMsg, ...turnsToApiMessages(conv)], ctx.model)
    if (currentTokens > budget) {
      const systemOnlyTokens = countMessageTokens([systemMsg], ctx.model)
      const convBudget = Math.max(0, budget - systemOnlyTokens)
      conv = applyMiddleTruncation(conv, convBudget, ctx.model)
    }

    const messages = [systemMsg, ...turnsToApiMessages(conv)]
    let systemTokens = 0
    let historyTokens = 0
    for (const m of messages) {
      const tk = countTokens(m.content ?? '', ctx.model)
      if (m.role === 'system') {
        systemTokens += tk
      } else {
        historyTokens += tk
      }
    }
    return {
      messages,
      totalTokens: countMessageTokens(messages, ctx.model),
      wasCompacted,
      injectedRagTokens,
      systemTokens,
      historyTokens,
      ragTokens: injectedRagTokens,
      compactionTokensBefore,
      compactionTokensAfter,
    }
  } catch (err) {
    console.warn('[ContextInjector] Context assembly failed, returning degraded context', err)
    return degradedAssemble(ctx)
  }
}

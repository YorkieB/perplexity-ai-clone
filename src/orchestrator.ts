/**
 * Jarvis orchestrator: indexes each user turn, classifies intent, runs {@link RetrievalGate},
 * then either answers from retrieved context (no tools) or delegates to the tool/web pipeline.
 */

import { v4 as uuidv4 } from 'uuid'
import OpenAI from 'openai'

import { assembleContext, type AssembledContext, type InjectionContext } from '@/lib/contextInjector'
import { alertSystem } from '@/lib/observability/alertSystem'
import { telemetry, type SessionSummary, type TelemetryEvent } from '@/lib/observability/telemetryCollector'
import { assembleSystemPrompt } from '@/lib/prompts/promptAssembler'
import { promptExperiments } from '@/lib/prompts/promptExperiments'
import { promptRegistry } from '@/lib/prompts/promptRegistry'
import { runBlockerTestsOnly } from '@/lib/prompts/promptRegressionTests'
import type { ConversationTurn } from '@/lib/contextCompactor'
import {
  formatToolsForOpenAI,
  formatToolsForSystemPrompt,
  loadToolsForIntent,
} from '@/lib/toolLoader'
import {
  COMPACTION_THRESHOLD,
  countMessageTokens,
  getTokenBudget,
  TOKEN_LIMITS,
} from '@/lib/tokenCounter'
import { applyOverrides } from '@/lib/router/overrideRules'
import { routeCache } from '@/lib/router/routeCache'
import { semanticRouter, type RouteResult } from '@/lib/router/semanticRouter'
import SessionIndex, { type SessionIndexOptions } from '@/memory/sessionIndex'
import { buildRagContext, evaluateRetrieval } from '@/rag/cragEvaluator'
/**
 * ⚠️  NODE.JS / ELECTRON MAIN ONLY
 * ingestOnStartup pulls in node:fs via ingestPipeline → longTermIndex.
 * If this orchestrator is ever imported from a browser bundle (Vite/webpack),
 * split this import into a conditional or a separate server-only entrypoint.
 * See: https://vitejs.dev/guide/ssr.html for conditional SSR imports.
 */
import { runStartupIngestion, shouldReIngest } from '@/rag/ingestOnStartup'
import LongTermIndex from '@/rag/longTermIndex'
import RetrievalGate from '@/rag/retrievalGate'
import type { GateResult, RetrievalGateSource } from '@/rag/retrievalGate'
import ManagerWorkerOrchestrator from '@/agents/managerWorkerOrchestrator'
import type { MWOrchestratorResult } from '@/agents/managerWorkerOrchestrator'
import type { Alert, SystemStatsSnapshot } from '@/lib/observability/alertSystem'

/** Routes understood by {@link RetrievalGate}, {@link semanticRouter}, and tool loading. */
export type OrchestratorIntentRoute =
  | 'code_instruction'
  | 'clarification_needed'
  | 'knowledge_lookup'
  | 'conversational'
  | 'general'
  | 'voice_task'
  | 'image_task'
  | 'browser_task'
  | 'file_task'

export interface OrchestratorOptions {
  /**
   * Base Jarvis identity / instructions; merged by {@link assembleContext} (not sent raw to the LLM).
   */
  systemPrompt?: string
  /** Model id for {@link assembleContext} + OpenAI chat calls on context-assembly paths (default `gpt-4o`). */
  contextAssemblyModel?: string
  /** Forwarded to {@link SessionIndex} (e.g. `openaiApiKey`, `embedTexts`). */
  sessionIndexOptions?: SessionIndexOptions
  /**
   * Existing web search / tool / RAG path. Invoked only when the gate sets `shouldSearchWeb: true`
   * (and not when answering from gate context). When omitted, {@link _searchAndRespond} uses OpenAI + assembled context.
   */
  executeToolPipeline?: (input: { userMessage: string; intentRoute: string }) => Promise<string>
}

export interface OrchestratorProcessResult {
  reply: string
  intentRoute: OrchestratorIntentRoute
  gateSource: RetrievalGateSource
  gateExplanation: string
  usedRetrievalContext: boolean
  skippedTools: boolean
  /** Set when {@link ManagerWorkerOrchestrator} handled this turn. */
  mwAction?: MWOrchestratorResult['action']
  /** Set when {@link ManagerWorkerOrchestrator} handled this turn. */
  verificationPassed?: boolean
}

/** Internal bundle so {@link Orchestrator.process} can run prompt telemetry once per turn. */
interface ProcessTurnOutcome {
  result: OrchestratorProcessResult
  intentRoute: OrchestratorIntentRoute
  mwResult?: MWOrchestratorResult
}

/**
 * Prompt registry slice from {@link Orchestrator.getContextHealth}.
 * `validationScore` and `activeVersionScore` are the same value; see field comment at construction site.
 */
export type OrchestratorContextHealthPromptStats = {
  activeVersion: string
  validationScore: number
  activeVersionScore: number
  totalVersions: number
}

/** Max interleaved user+assistant entries kept for end-of-session summarization (~20 turns). */
const SESSION_TRANSCRIPT_MAX_ENTRIES = 40

const DEFAULT_BASE_SYSTEM_PROMPT =
  'You are Jarvis, a helpful AI coding assistant. Follow user instructions precisely.'

/**
 * Ensures {@link alertSystem} is started at most once per process unless {@link Orchestrator.destroy} resets it.
 * Without this, each new session orchestrator would reset the global alert interval and spam logs.
 */
let alertMonitoringStarted = false

function isProbablyCodeRelated(message: string): boolean {
  if (message.includes('```')) return true
  return /\b(code|function|const |let |import |refactor|recode|rewrite|bug|error|stack|typescript|javascript|python)\b/i.test(
    message,
  )
}

export default class Orchestrator {
  readonly sessionId: string
  readonly sessionIndex: SessionIndex
  readonly retrievalGate: RetrievalGate
  private readonly longTermIndex: LongTermIndex
  private readonly executeToolPipeline?: OrchestratorOptions['executeToolPipeline']
  /** Base identity text; always merged via {@link assembleContext} for Phase 3 LLM calls. */
  private readonly baseSystemPrompt: string
  /** Model for assembled OpenAI chat completions (RAG + internal web path). */
  private readonly contextAssemblyModel: string
  private openaiClient: OpenAI | null = null
  /** Full-fidelity turns for {@link assembleContext} / compaction. */
  private readonly conversation_history: ConversationTurn[] = []
  /** Rolling transcript for {@link Orchestrator.ingestCurrentSession} (last ~20 turns). */
  private readonly sessionTranscriptBuffer: Array<{ role: 'user' | 'assistant'; text: string }> = []
  private readonly mwOrchestrator: ManagerWorkerOrchestrator

  constructor(options: OrchestratorOptions) {
    this.sessionId = uuidv4()
    this.baseSystemPrompt = options.systemPrompt?.trim() || DEFAULT_BASE_SYSTEM_PROMPT
    this.contextAssemblyModel = options.contextAssemblyModel?.trim() || 'gpt-4o'
    this.longTermIndex = new LongTermIndex()
    this.sessionIndex = new SessionIndex({
      ...options.sessionIndexOptions,
      sessionId: this.sessionId,
    })
    this.mwOrchestrator = new ManagerWorkerOrchestrator(
      this.sessionId,
      this.sessionIndex,
      () => this.getInjectionBasePrompt(),
    )
    this.retrievalGate = new RetrievalGate(this.sessionIndex, this.longTermIndex)
    this.executeToolPipeline = options.executeToolPipeline

    if (shouldReIngest(this.longTermIndex)) {
      // runStartupIngestion handles its own errors internally — no .catch() needed
      runStartupIngestion(this.longTermIndex)
    }

    semanticRouter.init().catch((err: unknown) => {
      console.error('[Orchestrator] SemanticRouter init failed:', err)
    })

    try {
      this.bootstrapPromptRegistry()
    } catch (err: unknown) {
      console.error('[Orchestrator] Prompt registry bootstrap failed:', err)
    }

    runBlockerTestsOnly()
      .then((result) => {
        if (result.hasBlockers) {
          console.error('[Orchestrator] ⚠️  BLOCKER regression tests FAILED on startup:')
          result.results
            .filter((r) => r.blockerFailed)
            .forEach((r) => console.error(`  [BLOCKER] ${r.testId}: ${r.description}`))
        } else {
          console.log(
            `[Orchestrator] ✅ All blocker regression tests passed (${String(result.passedTests)}/${String(result.totalTests)})`,
          )
        }
      })
      .catch((err: unknown) => {
        console.error('[Orchestrator] Regression test startup check failed:', err)
      })

    if (!alertMonitoringStarted) {
      alertMonitoringStarted = true
      alertSystem.start(30_000)
      console.info('[Orchestrator] Alert system started')
    }
  }

  /**
   * Stops global alert monitoring (e.g. clean server shutdown). Safe to call multiple times.
   */
  destroy(): void {
    alertSystem.stop()
    alertMonitoringStarted = false
    console.info('[Orchestrator] Alert system stopped')
  }

  /**
   * When nothing is active, register a structurally valid assembled prompt and activate it.
   * {@link promptRegistry.register} validates XML sections; raw {@link baseSystemPrompt} alone would fail.
   */
  private bootstrapPromptRegistry(): void {
    if (promptRegistry.getActive() !== null) {
      return
    }
    const initialPayload = assembleSystemPrompt({
      basePrompt: this.baseSystemPrompt,
      intentRoute: 'conversational',
      availableTools: [],
      model: this.contextAssemblyModel,
      validate: true,
      useRegistry: false,
    })
    const initialVersion = promptRegistry.register(
      'jarvis-system',
      initialPayload,
      'Initial registration from orchestrator constructor',
      'system',
    )
    promptRegistry.activate(initialVersion.id)
    console.info(`[Orchestrator] Base system prompt registered: v${initialVersion.version}`)
  }

  /**
   * Base text passed into {@link assembleContext} as `systemPrompt`: A/B assignment, registry snapshot, or ctor default.
   */
  private getInjectionBasePrompt(): string {
    const fromFlow = promptExperiments.getActivePromptForRequest(this.sessionId).trim()
    if (fromFlow.length > 0) {
      return fromFlow
    }
    const registered = promptRegistry.getActivePrompt()?.trim()
    if (registered !== undefined && registered.length > 0) {
      return registered
    }
    return this.baseSystemPrompt
  }

  /**
   * Per-turn experiment counters and registry metrics (after a reply is ready).
   */
  private finalizePromptRound(
    intentRoute: OrchestratorIntentRoute,
    mwResult?: MWOrchestratorResult,
  ): void {
    let verificationScore = 1.0
    if (mwResult !== undefined) {
      verificationScore = mwResult.workerResult !== undefined ? 1.0 : 0.0
    }
    promptExperiments.recordOutcome(this.sessionId, {
      misrouted: false,
      verificationScore,
    })

    const outcome = {
      toolMisrouted: false,
      contextIgnored: false,
      neededClarification: intentRoute === 'clarification_needed',
    }

    if (promptRegistry.getActive() === null) {
      console.warn(
        '[Orchestrator] No active prompt version found during finalizePromptRound. Attempting re-registration.',
      )
      try {
        const recoveredPayload = assembleSystemPrompt({
          basePrompt: this.baseSystemPrompt,
          intentRoute: 'conversational',
          availableTools: [],
          model: this.contextAssemblyModel,
          validate: true,
          useRegistry: false,
        })
        const recovered = promptRegistry.register(
          'jarvis-system-recovered',
          recoveredPayload,
          'Auto-recovered: no active version found',
          'system',
        )
        promptRegistry.activate(recovered.id)
        console.log('[Orchestrator] Re-registered and activated base prompt:', recovered.version)
      } catch (err) {
        console.error('[Orchestrator] Re-registration failed — telemetry skipped for this call:', err)
        return
      }
    }

    const version = promptRegistry.getActive()
    if (version !== null) {
      promptRegistry.recordCall(version.id, {
        toolMisrouted: outcome.toolMisrouted ?? false,
        contextIgnored: outcome.contextIgnored ?? false,
        neededClarification: outcome.neededClarification ?? false,
      })
    }
  }

  /**
   * Phase 4: {@link semanticRouter} + {@link routeCache}. Returns a full {@link RouteResult}
   * (cache hits use `processingTimeMs: 0` and omit optional debug fields).
   */
  private async _classifyIntent(message: string): Promise<RouteResult> {
    const cached = routeCache.get(message)
    if (cached !== null) {
      const override = applyOverrides(message)
      if (override !== null) {
        return {
          route: override.route,
          confidence: override.confidence,
          method: 'override',
          processingTimeMs: 0,
        }
      }
      console.info(
        `[Orchestrator] Route cache hit: ${cached.route} (${cached.confidence.toFixed(2)})`,
      )
      return {
        route: cached.route,
        confidence: cached.confidence,
        method: cached.method as RouteResult['method'],
        processingTimeMs: 0,
      }
    }

    const result = await semanticRouter.classify(message)
    routeCache.set(message, {
      route: result.route,
      confidence: result.confidence,
      method: result.method,
      cachedAt: Date.now(),
    })
    console.info(
      `[Orchestrator] Intent classified: ${result.route} (${result.method}, confidence: ${result.confidence.toFixed(2)}, ${String(result.processingTimeMs)}ms)`,
    )
    return result
  }

  // DEPRECATED: replaced by SemanticRouter in Phase 4
  // Remove once Phase 4 is validated in production for 1 week
  private _legacyClassifyIntent(userMessage: string): OrchestratorIntentRoute {
    const m = userMessage.trim().toLowerCase()
    if (m.length === 0) return 'conversational'

    if (/^(hi|hello|hey|thanks|thank you|ok thanks|bye)\b/.test(m) && m.length < 100) {
      return 'conversational'
    }

    if (
      /\b(what do you mean|clarify|not sure what|which (file|one)|can you explain what you)\b/.test(m) ||
      (m.length < 40 && /\?/.test(m) && !isProbablyCodeRelated(userMessage))
    ) {
      return 'clarification_needed'
    }

    if (
      /\b(who was|when did|what year|capital of|define |what is the difference|how does .+ work|population of)\b/.test(
        m,
      )
    ) {
      return 'knowledge_lookup'
    }

    if (isProbablyCodeRelated(userMessage)) {
      return 'code_instruction'
    }

    return 'general'
  }

  /** Model context-window cap for {@link TOKEN_LIMITS} (telemetry budget %). */
  private getContextAssemblyTokenLimit(): number {
    let limitKey = this.contextAssemblyModel.trim()
    if (limitKey.startsWith('do:')) {
      limitKey = limitKey.slice(3)
    }
    const slash = limitKey.indexOf('/')
    if (slash >= 0) {
      limitKey = limitKey.slice(0, slash)
    }
    return TOKEN_LIMITS[limitKey] ?? TOKEN_LIMITS['gpt-4o'] ?? 128000
  }

  /** Phase 7: prompt assembly + optional compaction rollup. */
  private recordAssembledContextTelemetry(assembled: AssembledContext): void {
    const limit = this.getContextAssemblyTokenLimit()
    telemetry.record('prompt_assembled', this.sessionId, {
      tokensUsed: assembled.totalTokens,
      totalTokens: assembled.totalTokens,
      systemTokens: assembled.systemTokens ?? 0,
      historyTokens: assembled.historyTokens ?? 0,
      ragTokens: assembled.ragTokens ?? assembled.injectedRagTokens,
      budgetUsedPct: limit > 0 ? (assembled.totalTokens / limit) * 100 : 0,
    })
    if (
      assembled.wasCompacted &&
      assembled.compactionTokensBefore !== undefined &&
      assembled.compactionTokensAfter !== undefined
    ) {
      telemetry.record('context_compacted', this.sessionId, {
        tokensBefore: assembled.compactionTokensBefore,
        tokensAfter: assembled.compactionTokensAfter,
        reduction: assembled.compactionTokensBefore - assembled.compactionTokensAfter,
      })
    }
  }

  private getOpenAI(): OpenAI {
    if (this.openaiClient === null) {
      const key = process.env.OPENAI_API_KEY?.trim()
      if (!key) {
        throw new Error('[Orchestrator] OPENAI_API_KEY is required for context-assembled chat completions.')
      }
      this.openaiClient = new OpenAI({ apiKey: key })
    }
    return this.openaiClient
  }

  /**
   * Append the current user turn to {@link conversation_history} (call once per `process` after validation).
   */
  private pushUserTurn(userMessage: string): void {
    const content = userMessage.trim()
    if (!content) return
    this.conversation_history.push({
      role: 'user',
      content,
      turnIndex: this.conversation_history.length,
    })
  }

  /**
   * Append the assistant reply to {@link conversation_history} after a successful model response.
   */
  private pushAssistantTurn(assistantReply: string): void {
    const content = assistantReply.trim()
    if (!content) return
    this.conversation_history.push({
      role: 'assistant',
      content,
      turnIndex: this.conversation_history.length,
    })
  }

  /**
   * Append user + assistant lines for session-end summarization; capped at {@link SESSION_TRANSCRIPT_MAX_ENTRIES}.
   */
  private recordSessionExchange(userMessage: string, assistantReply: string): void {
    const u = userMessage.trim()
    const a = assistantReply.trim()
    if (!u || !a) return
    this.sessionTranscriptBuffer.push({ role: 'user', text: u })
    this.sessionTranscriptBuffer.push({ role: 'assistant', text: a })
    while (this.sessionTranscriptBuffer.length > SESSION_TRANSCRIPT_MAX_ENTRIES) {
      this.sessionTranscriptBuffer.shift()
    }
    this.pushAssistantTurn(a)
  }

  /**
   * Extract plain text from a chat completion (tool-call-only responses get a generic fallback).
   */
  private completionText(response: OpenAI.Chat.Completions.ChatCompletion): string {
    const msg = response.choices[0]?.message
    const text = msg?.content?.trim() ?? ''
    if (text.length > 0) {
      return text
    }
    if (msg?.tool_calls !== undefined && msg.tool_calls.length > 0) {
      return 'Tool calls were requested; wire a tool executor to continue this turn.'
    }
    return ''
  }

  /**
   * Web-style turn using {@link assembleContext} + `knowledge_lookup` tools (when no external `executeToolPipeline`).
   */
  private async _searchAndRespond(_trimmed: string): Promise<string> {
    const tools = loadToolsForIntent('knowledge_lookup')
    const availableTools =
      tools.length > 0 ? formatToolsForSystemPrompt(tools).split('\n').filter((line) => line.length > 0) : []
    // intentRoute is intentionally pinned to 'knowledge_lookup' here.
    // _searchAndRespond is only ever reached when the retrieval gate
    // has determined web search is needed (shouldSearchWeb: true).
    // By definition, that means the intent is knowledge-seeking —
    // regardless of what the classifier returned (e.g. 'browser_task'
    // might also reach here if no browser tool is wired up).
    // The classified intentRoute is still available on the returned
    // OrchestratorProcessResult for callers that need it.
    const injectionCtx: InjectionContext = {
      systemPrompt: this.getInjectionBasePrompt(),
      messages: [...this.conversation_history],
      intentRoute: 'knowledge_lookup',
      model: this.contextAssemblyModel,
      availableTools,
    }
    const assembled = await assembleContext(injectionCtx)
    this.recordAssembledContextTelemetry(assembled)
    const openaiTools = formatToolsForOpenAI(tools)
    console.info(
      `[Orchestrator] Context assembled — tokens: ${String(assembled.totalTokens)}, compacted: ${String(assembled.wasCompacted)}`,
    )
    const response = await this.getOpenAI().chat.completions.create({
      model: this.contextAssemblyModel,
      messages: assembled.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      temperature: 0.2,
    })
    const text = this.completionText(response)
    telemetry.record('search_fired', this.sessionId, {
      query: _trimmed.slice(0, 100),
      intentRoute: 'knowledge_lookup',
    })
    return text
  }

  /**
   * Answer using RAG XML context via {@link assembleContext} and OpenAI chat completions.
   */
  private async _answerWithRagContext(
    userMessage: string,
    ragContext: string,
    intentRoute: OrchestratorIntentRoute,
    gateSource: RetrievalGateSource,
  ): Promise<string> {
    console.info(`[Orchestrator] Answering from RAG context (source: ${gateSource})`)
    const tools = loadToolsForIntent(intentRoute)
    const availableTools =
      tools.length > 0 ? formatToolsForSystemPrompt(tools).split('\n').filter((line) => line.length > 0) : []
    const injectionCtx: InjectionContext = {
      systemPrompt: this.getInjectionBasePrompt(),
      messages: this.conversation_history as ConversationTurn[],
      ragContext,
      intentRoute,
      model: this.contextAssemblyModel,
      availableTools,
    }
    const assembled = await assembleContext(injectionCtx)
    this.recordAssembledContextTelemetry(assembled)
    const openaiTools = formatToolsForOpenAI(tools)
    console.info(
      `[Orchestrator] Context assembled — tokens: ${String(assembled.totalTokens)}, compacted: ${String(assembled.wasCompacted)}`,
    )
    const response = await this.getOpenAI().chat.completions.create({
      model: this.contextAssemblyModel,
      messages: assembled.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      temperature: 0.2,
    })
    return this.completionText(response)
  }

  /**
   * Summarize recent session turns and persist into the hybrid long-term index.
   */
  async ingestCurrentSession(): Promise<void> {
    if (this.sessionTranscriptBuffer.length === 0) {
      return
    }
    try {
      const summarySystem =
        'You are a conversation summariser. Compress the provided conversation into a structured summary preserving all technical details, code names, decisions, and requirements. Be concise.'
      // Exclude any trailing user turn without an assistant response
      // to avoid summarising an incomplete exchange
      const history = this.conversation_history
      const safeHistory =
        history.length > 0 && history[history.length - 1]?.role === 'user'
          ? history.slice(0, -1)
          : history
      const recentHistory = safeHistory
        .slice(-20)
        .map((t) => ({ role: t.role, content: t.content }))
      const ingestMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: summarySystem },
        ...recentHistory,
      ]
      const ingestRes = await this.getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 800,
        messages: ingestMessages,
      })
      const summary = ingestRes.choices[0]?.message?.content?.trim() ?? ''
      await this.longTermIndex.ingestText(summary, `session:${this.sessionId}`, 'conversation_summary')
      console.info('[Orchestrator] Session persisted to long-term index')
    } catch (err) {
      console.error('[Orchestrator] ingestCurrentSession failed:', err)
    } finally {
      console.info('[Orchestrator] Session persistence attempt complete (success or failure)')
    }
  }

  /**
   * Returns a diagnostic snapshot of current context window health.
   *
   * NOTE: shouldCompact and assembledTokens are computed on
   * [systemMsg (base, no RAG), ...raw conversation_history].
   * This is a close approximation of what assembleContext() measures,
   * but will differ slightly after selectiveFilter() and compaction
   * have been applied during a live assembly call.
   *
   * Use this for monitoring and alerting, not for exact token accounting.
   * For exact pre-call token counts, inspect AssembledContext.totalTokens
   * returned by assembleContext() directly.
   */
  getContextHealth(): {
    totalTurns: number
    assembledTokens: number
    shouldCompact: boolean
    sessionIndexSize: unknown
    longTermIndexStats: ReturnType<LongTermIndex['getStats']>
    routerStats: Record<string, number>
    routeCacheStats: ReturnType<typeof routeCache.getStats>
    mwoStats: ReturnType<ManagerWorkerOrchestrator['getStats']>
    promptStats: OrchestratorContextHealthPromptStats
    observabilityStats: {
      recentEvents: TelemetryEvent[]
      sessionSummary: SessionSummary | null
      firedAlerts: Alert[]
      systemStats: SystemStatsSnapshot
    }
  } {
    const systemMsg = {
      role: 'system' as const,
      content: this.getInjectionBasePrompt(),
    }
    const historyAsApiMessages = this.conversation_history.map((t) => ({
      role: t.role as 'user' | 'assistant' | 'system',
      content: t.content,
    }))
    const assembledTokens = countMessageTokens(
      [systemMsg, ...historyAsApiMessages],
      this.contextAssemblyModel,
    )
    let limitKey = this.contextAssemblyModel.trim()
    if (limitKey.startsWith('do:')) {
      limitKey = limitKey.slice(3)
    }
    const slash = limitKey.indexOf('/')
    if (slash >= 0) {
      limitKey = limitKey.slice(0, slash)
    }
    const limit = TOKEN_LIMITS[limitKey] ?? 128000
    const budget = getTokenBudget(limit, 2000)
    const active = promptRegistry.getActive()
    return {
      totalTurns: this.conversation_history.length,
      assembledTokens,
      shouldCompact: assembledTokens >= budget * COMPACTION_THRESHOLD,
      sessionIndexSize: 'unknown',
      longTermIndexStats: this.longTermIndex.getStats(),
      routerStats: semanticRouter.getRouteStats(),
      routeCacheStats: routeCache.getStats(),
      mwoStats: this.mwOrchestrator.getStats(),
      promptStats: {
        activeVersion: active?.version ?? 'none',
        // validationScore and activeVersionScore are the same value.
        // validationScore is the canonical name per promptValidator.ts.
        // activeVersionScore kept for backward compatibility with existing callers.
        validationScore: active?.validationScore ?? 0,
        activeVersionScore: active?.validationScore ?? 0,
        totalVersions: promptRegistry.getVersionHistory().length,
      },
      observabilityStats: {
        recentEvents: telemetry.getRecentEvents(10, this.sessionId),
        sessionSummary: telemetry.getSessionSummary(this.sessionId),
        firedAlerts: alertSystem.getFiredAlerts(5),
        systemStats: telemetry.getSystemStats(),
      },
    }
  }

  /**
   * Web / tool pipeline when `shouldSearchWeb` is set (same behaviour as the default gate branch).
   */
  private runExecuteToolPipeline(
    trimmed: string,
    intentRoute: OrchestratorIntentRoute,
    gateResult: GateResult,
  ): Promise<OrchestratorProcessResult> {
    if (!this.executeToolPipeline) {
      return (async () => {
        try {
          const reply = await this._searchAndRespond(trimmed)
          if (!reply.trim()) {
            throw new Error('Empty completion')
          }
          this.recordSessionExchange(trimmed, reply)
          return {
            reply,
            intentRoute,
            gateSource: gateResult.source,
            gateExplanation: gateResult.explanation,
            usedRetrievalContext: false,
            skippedTools: false,
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          telemetry.record(
            'error',
            this.sessionId,
            { message: msg, context: 'orchestrator._searchAndRespond' },
            undefined,
            msg,
          )
          console.warn('[Orchestrator] Internal search/OpenAI path failed.', err)
          const reply =
            'Search and tools are not configured for this orchestrator. Set `executeToolPipeline` in options or provide OPENAI_API_KEY.'
          this.recordSessionExchange(trimmed, reply)
          return {
            reply,
            intentRoute,
            gateSource: gateResult.source,
            gateExplanation: gateResult.explanation,
            usedRetrievalContext: false,
            skippedTools: true,
          }
        }
      })()
    }
    // ⚠️  PHASE 3 NOTE: executeToolPipeline is an external callback.
    // Any LLM calls made inside this callback are NOT routed through
    // assembleContext() and therefore bypass context window management,
    // XML prompt structure, and dynamic tool loading.
    //
    // If executeToolPipeline ever calls an LLM internally:
    // - Pass this.baseSystemPrompt to it so it can assemble its own context
    // - Or refactor it to accept an AssembledContext from this orchestrator
    //
    // For now this is acceptable: the callback is for specialised tool
    // execution, not general conversation.
    return this.executeToolPipeline({ userMessage: trimmed, intentRoute })
      .then((reply) => {
        this.recordSessionExchange(trimmed, reply)
        return {
          reply,
          intentRoute,
          gateSource: gateResult.source,
          gateExplanation: gateResult.explanation,
          usedRetrievalContext: false,
          skippedTools: false,
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        telemetry.record(
          'error',
          this.sessionId,
          { message: msg, context: 'orchestrator.executeToolPipeline' },
          undefined,
          msg,
        )
        console.error('[Orchestrator] executeToolPipeline failed.', err)
        const reply = 'The request could not be completed. Please try again.'
        this.recordSessionExchange(trimmed, reply)
        return {
          reply,
          intentRoute,
          gateSource: gateResult.source,
          gateExplanation: gateResult.explanation,
          usedRetrievalContext: false,
          skippedTools: false,
        }
      })
  }

  /**
   * Session / session_fallback hits: {@link buildRagContext} fast path (no CRAG).
   */
  private async tryAnswerFromSessionRag(
    trimmed: string,
    intentRoute: OrchestratorIntentRoute,
    gateResult: GateResult,
  ): Promise<OrchestratorProcessResult | undefined> {
    if (!['session', 'session_fallback'].includes(gateResult.source) || gateResult.content.length === 0) {
      return undefined
    }
    try {
      const ragContext = buildRagContext(gateResult.content)
      const reply = await this._answerWithRagContext(trimmed, ragContext, intentRoute, gateResult.source)
      this.recordSessionExchange(trimmed, reply)
      return {
        reply,
        intentRoute,
        gateSource: gateResult.source,
        gateExplanation: gateResult.explanation,
        usedRetrievalContext: true,
        skippedTools: true,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      telemetry.record(
        'error',
        this.sessionId,
        { message: msg, context: 'orchestrator.tryAnswerFromSessionRag' },
        undefined,
        msg,
      )
      console.warn('[Orchestrator] context answer failed (tools remain skipped for this gate path).', err)
      const reply = 'Something went wrong while answering from retrieved context. Please try again.'
      this.recordSessionExchange(trimmed, reply)
      return {
        reply,
        intentRoute,
        gateSource: gateResult.source,
        gateExplanation: gateResult.explanation,
        usedRetrievalContext: true,
        skippedTools: true,
      }
    }
  }

  /**
   * Long-term hits: {@link evaluateRetrieval} (CRAG); empty filter may fall through to web search.
   */
  private async tryAnswerFromLongTermRag(
    trimmed: string,
    intentRoute: OrchestratorIntentRoute,
    gateResult: GateResult,
  ): Promise<OrchestratorProcessResult | undefined> {
    if (gateResult.source !== 'long_term' || gateResult.content.length === 0) {
      return undefined
    }
    try {
      const evaluated = await evaluateRetrieval(trimmed, gateResult.content)
      if (evaluated.filteredChunks.length === 0) {
        if (gateResult.shouldSearchWeb) {
          return this.runExecuteToolPipeline(trimmed, intentRoute, gateResult)
        }
        const reply =
          "I found some related information but it wasn't relevant enough. Could you provide more context?"
        this.recordSessionExchange(trimmed, reply)
        return {
          reply,
          intentRoute,
          gateSource: gateResult.source,
          gateExplanation: gateResult.explanation,
          usedRetrievalContext: false,
          skippedTools: true,
        }
      }
      const reply = await this._answerWithRagContext(
        trimmed,
        evaluated.ragContext,
        intentRoute,
        gateResult.source,
      )
      this.recordSessionExchange(trimmed, reply)
      return {
        reply,
        intentRoute,
        gateSource: gateResult.source,
        gateExplanation: gateResult.explanation,
        usedRetrievalContext: true,
        skippedTools: true,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      telemetry.record(
        'error',
        this.sessionId,
        { message: msg, context: 'orchestrator.tryAnswerFromLongTermRag' },
        undefined,
        msg,
      )
      console.warn('[Orchestrator] context answer failed (tools remain skipped for this gate path).', err)
      const reply = 'Something went wrong while answering from retrieved context. Please try again.'
      this.recordSessionExchange(trimmed, reply)
      return {
        reply,
        intentRoute,
        gateSource: gateResult.source,
        gateExplanation: gateResult.explanation,
        usedRetrievalContext: true,
        skippedTools: true,
      }
    }
  }

  /**
   * Main entry: index turn → intent → gate → context answer OR tool pipeline OR clarification.
   */
  async process(userMessage: string): Promise<OrchestratorProcessResult> {
    telemetry.record('turn_started', this.sessionId, {
      messageLength: userMessage.length,
      turnIndex: this.conversation_history.length,
    })
    const turnStart = Date.now()
    try {
      const outcome = await this._executeProcessTurn(userMessage)
      this.finalizePromptRound(outcome.intentRoute, outcome.mwResult)
      telemetry.record(
        'turn_completed',
        this.sessionId,
        {
          route: outcome.intentRoute,
          responseLength: outcome.result.reply.length,
          mwoAction: outcome.mwResult?.action,
          verificationPassed: outcome.mwResult?.verificationPassed,
        },
        Date.now() - turnStart,
      )
      return outcome.result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      telemetry.record(
        'error',
        this.sessionId,
        { message: msg, context: 'orchestrator.process' },
        undefined,
        msg,
      )
      telemetry.record(
        'turn_completed',
        this.sessionId,
        {
          route: 'conversational',
          responseLength: 0,
          mwoAction: undefined,
          verificationPassed: undefined,
        },
        Date.now() - turnStart,
      )
      throw err
    }
  }

  private async _executeProcessTurn(userMessage: string): Promise<ProcessTurnOutcome> {
    const trimmed = userMessage.trim()
    if (!trimmed) {
      return {
        result: {
          reply: 'Please send a non-empty message.',
          intentRoute: 'conversational',
          gateSource: 'none',
          gateExplanation: 'empty input',
          usedRetrievalContext: false,
          skippedTools: true,
        },
        intentRoute: 'conversational',
      }
    }

    this.pushUserTurn(trimmed)
    this.sessionIndex.indexTurn(trimmed, 'user')

    const intentResult = await this._classifyIntent(trimmed)
    const intentRoute = intentResult.route as OrchestratorIntentRoute
    telemetry.record('route_classified', this.sessionId, {
      route: intentResult.route,
      confidence: intentResult.confidence,
      method: intentResult.method,
      processingTimeMs: intentResult.processingTimeMs,
    })

    let gateResult: GateResult
    try {
      gateResult = await this.retrievalGate.check(trimmed, intentRoute)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      telemetry.record(
        'error',
        this.sessionId,
        { message: msg, context: 'orchestrator.retrievalGate' },
        undefined,
        msg,
      )
      console.warn('[Orchestrator] retrieval gate failed; falling back to tool pipeline if available.', err)
      gateResult = {
        source: 'none',
        content: [],
        bestScore: 0,
        shouldSearchWeb: true,
        explanation: 'Gate error — defaulting to open pipeline.',
      }
    }
    telemetry.record('retrieval_gate_decision', this.sessionId, {
      source: gateResult.source,
      shouldSearchWeb: gateResult.shouldSearchWeb,
      chunksReturned: gateResult.content.length,
    })

    const MW_ROUTES: readonly OrchestratorIntentRoute[] = [
      'code_instruction',
      'voice_task',
      'image_task',
      'browser_task',
      'file_task',
      'clarification_needed',
    ]
    if (MW_ROUTES.includes(intentRoute)) {
      const mwResult = await this.mwOrchestrator.process(trimmed, intentResult, gateResult.content)
      this.sessionIndex.indexTurn(mwResult.response, 'assistant')
      this.recordSessionExchange(trimmed, mwResult.response)
      console.info(
        `[Orchestrator] MWO completed — action: ${mwResult.action}, verified: ${String(mwResult.verificationPassed)}, iterations: ${String(mwResult.iterationCount)}`,
      )
      return {
        result: {
          reply: mwResult.response,
          intentRoute,
          gateSource: gateResult.source,
          gateExplanation: gateResult.explanation,
          usedRetrievalContext: gateResult.content.length > 0,
          skippedTools: true,
          mwAction: mwResult.action,
          verificationPassed: mwResult.verificationPassed,
        },
        intentRoute,
        mwResult,
      }
    }

    const sessionRag = await this.tryAnswerFromSessionRag(trimmed, intentRoute, gateResult)
    if (sessionRag !== undefined) {
      return { result: sessionRag, intentRoute }
    }

    const longTermRag = await this.tryAnswerFromLongTermRag(trimmed, intentRoute, gateResult)
    if (longTermRag !== undefined) {
      return { result: longTermRag, intentRoute }
    }

    if (gateResult.shouldSearchWeb) {
      const result = await this.runExecuteToolPipeline(trimmed, intentRoute, gateResult)
      return { result, intentRoute }
    }

    const reply =
      "Could you re-share the content you'd like me to work with? I don't have it in the current session."
    this.recordSessionExchange(trimmed, reply)
    return {
      result: {
        reply,
        intentRoute,
        gateSource: gateResult.source,
        gateExplanation: gateResult.explanation,
        usedRetrievalContext: false,
        skippedTools: true,
      },
      intentRoute,
    }
  }
}

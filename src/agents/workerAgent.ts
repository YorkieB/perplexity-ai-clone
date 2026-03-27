/**
 * Stateless Worker agent: executes a Manager brief in isolation — no chat history or session bleed.
 */

import OpenAI from 'openai'

import type { TaskType } from './taskState'
import { formatToolsForOpenAI, loadToolsForIntent, type OpenAiToolSpec } from '@/lib/toolLoader'
import { countTokens, TOKEN_LIMITS } from '@/lib/tokenCounter'
import { modelRouter } from '@/reasoning/modelRouter'
import type { RoutingSignals } from '@/reasoning/routingClassifier'
import { confidenceOrchestrator } from '@/reasoning/confidenceOrchestrator'
import { ELICITATION_INSTRUCTION } from '@/reasoning/confidenceTypes'
import { lessonsStore } from '@/reasoning/lessonsStore'

const LOG = '[WorkerAgent]'

/** Normalise model id for {@link TOKEN_LIMITS} lookup (strip provider prefixes). */
function normalizeModelKey(model: string): string {
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

function resolveContextLimit(model: string): number {
  const key = normalizeModelKey(model)
  return TOKEN_LIMITS[key] ?? TOKEN_LIMITS['gpt-4o'] ?? 128000
}

/** Escape `]]>` inside CDATA payloads. */
function cdataSafe(text: string): string {
  return text.replace(/\]\]>/g, ']]]]><![CDATA[>')
}

/**
 * Outcome of {@link WorkerAgent.execute} / {@link WorkerAgent.refine}.
 */
export interface WorkerResult {
  content: string
  taskType: TaskType
  tokensUsed: number
  iterationCount: number
  success: boolean
  error?: string
  /** Dual-process AUQ scalar after {@link confidenceOrchestrator.evaluate} (session path). */
  confidenceScore?: number
  /** Discrete band aligned with {@link confidenceScore}. */
  confidenceLevel?: string
  /** Optional Reflexion / critic score (0–1) for composite confidence. */
  critiqueScore?: number
}

function truncateBriefForBudget(
  workerSystemPrompt: string,
  brief: string,
  model: string,
  maxInputTokens: number,
): string {
  let b = brief
  let combined = countTokens(workerSystemPrompt + b, model)
  const reqOpen = '<requirements>'
  const reqClose = '</requirements>'
  while (combined > maxInputTokens && b.length > 200) {
    const reqStart = b.indexOf(reqOpen)
    const reqEnd = reqStart >= 0 ? b.indexOf(reqClose, reqStart + reqOpen.length) : -1
    if (reqStart >= 0 && reqEnd > reqStart) {
      const before = b.slice(0, reqStart)
      const reqBlock = b.slice(reqStart, reqEnd + reqClose.length)
      const after = b.slice(reqEnd + reqClose.length)
      const mid = before + after
      if (mid.length < 100) break
      const shrink = Math.max(50, Math.floor(mid.length * 0.15))
      b =
        before.slice(0, Math.max(0, before.length - shrink)) +
        '\n\n[…artefact content truncated…]\n\n' +
        reqBlock +
        after.slice(shrink)
    } else {
      const cut = Math.max(100, Math.floor(b.length * 0.12))
      b = b.slice(0, Math.floor(b.length / 2) - cut) + '\n\n[…]\n\n' + b.slice(Math.floor(b.length / 2) + cut)
    }
    combined = countTokens(workerSystemPrompt + b, model)
  }
  return b
}

/**
 * Executes a single brief with no retained conversation state.
 */
export default class WorkerAgent {
  private static readonly MAX_TOOL_ROUNDS = 5

  private readonly openai: OpenAI

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
  }

  private _isReasoningChatModel(modelId: string): boolean {
    const m = modelId.trim()
    return m === 'o3' || m === 'o3-mini'
  }

  /**
   * NOTE: reasoning_effort is only added for exact model id matches:
   * 'o3' and 'o3-mini'. Prefixed variants (e.g. 'openai/o3'),
   * aliased ids, or future versioned ids (e.g. 'o3-2025-04') will
   * NOT receive reasoning_effort and will use model defaults.
   * If OpenAI releases versioned o3 ids, update the exact match
   * list here: ['o3', 'o3-mini', 'o3-2025-XX', 'o3-mini-2025-XX']
   */
  private _completionParams(
    modelToUse: string,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    openAITools: OpenAiToolSpec[],
    reasoningEffort?: string,
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: modelToUse,
      messages,
      tools: openAITools.length > 0 ? openAITools : undefined,
      temperature: 0.1,
      max_tokens: 4000,
      stream: false,
    }
    if (reasoningEffort !== undefined && reasoningEffort.length > 0 && this._isReasoningChatModel(modelToUse)) {
      Object.assign(params, {
        reasoning_effort: reasoningEffort as 'low' | 'medium' | 'high',
      })
    }
    return params
  }

  private _estimateOutputLength(taskType: TaskType): RoutingSignals['estimatedOutputLength'] {
    switch (taskType) {
      case 'code_instruction':
        return 'long'
      case 'browser_task':
        return 'medium'
      case 'voice_task':
        return 'short'
      case 'image_task':
        return 'short'
      case 'knowledge_lookup':
        return 'medium'
      default:
        return 'medium'
    }
  }

  /**
   * Task-specific system preamble (not the full Jarvis orchestrator prompt).
   */
  private _buildWorkerSystemPrompt(taskType: TaskType): string {
    const base = `<worker_identity>
You are Jarvis Worker — a precise, focused execution agent.
You receive a complete task brief and execute it fully.
You do NOT ask clarifying questions — the brief contains everything you need.
You do NOT explain your process — return the result directly.
You return COMPLETE implementations, never partial snippets.
</worker_identity>

<execution_rules>
1. Execute the task exactly as specified in the brief.
2. If modifying code: return the COMPLETE updated file, not just the changed section.
3. If generating content: return the complete output.
4. If the brief contains a <previous_output>: improve on it, do not repeat it verbatim.
5. Never apologise, never explain what you are about to do — just do it.
</execution_rules>
`

    let focus: string
    switch (taskType) {
      case 'code_instruction':
        focus =
          '<task_focus>You are modifying or creating code. Return complete, working, production-ready code with proper TypeScript types, error handling, and no TODOs or placeholders.</task_focus>'
        break
      case 'voice_task':
        focus =
          '<task_focus>You are working with voice synthesis parameters. Return a complete, valid JSON configuration object. All emotion scores must sum to 1.0 or be individually bounded between 0.0 and 1.0.</task_focus>'
        break
      case 'image_task':
        focus =
          '<task_focus>You are working with image generation prompts. Return a complete, detailed prompt string optimised for the target model. Include style, composition, lighting, and quality tags.</task_focus>'
        break
      case 'knowledge_lookup':
        focus =
          '<task_focus>Answer the question comprehensively using the provided context. Cite sources where available. Be precise and factual.</task_focus>'
        break
      default:
        focus = '<task_focus>Execute the task as specified. Return a complete result.</task_focus>'
    }

    return `${base}\n${focus}`
  }

  /**
   * Run the Worker on a Manager brief: system + user only — no history.
   *
   * @param brief - XML brief from {@link buildWorkerBrief} (or refinement wrapper)
   * @param taskType - Drives tool loading and task-focus block
   * @param model - OpenAI chat model id
   * @param sessionId - When set, injects relevant {@link lessonsStore} lessons into the user brief
   * @param orchestratorBasePrompt - Optional Jarvis main system text (experiment/registry) prepended to worker rules
   * @param complexityScore - Drives {@link modelRouter} when `sessionId` is set
   * @param critiqueScore - Optional critic score for {@link confidenceOrchestrator} composite path
   * @param skipConfidenceEvaluation - When true, skip post-run {@link confidenceOrchestrator.evaluate} (orchestrator runs it after Reflexion).
   */
  async execute(
    brief: string,
    taskType: TaskType,
    model: string = 'gpt-4o',
    sessionId?: string,
    orchestratorBasePrompt?: string,
    complexityScore?: number,
    critiqueScore?: number,
    skipConfidenceEvaluation?: boolean,
  ): Promise<WorkerResult> {
    let routerResult: Awaited<ReturnType<typeof modelRouter.route>> | null = null
    let modelToUse = model
    let reasoningEffort: string | undefined

    if (sessionId !== undefined) {
      routerResult = await modelRouter.route({
        sessionId,
        taskType,
        taskDescription: brief.slice(0, 500),
        complexityScore: complexityScore ?? 0.5,
        iterationNumber: 0,
        estimatedOutputLength: this._estimateOutputLength(taskType),
        requiresStructuredOutput: taskType === 'voice_task',
      })
      modelToUse = routerResult.model
      reasoningEffort = routerResult.reasoningEffort
    }

    let enrichedBrief = brief
    if (sessionId !== undefined) {
      const relevantLessons = await lessonsStore.getRelevantLessons({
        sessionId,
        taskType,
        currentOutput: brief.slice(0, 500),
      })
      if (relevantLessons.length > 0) {
        const lessonsBlock = lessonsStore.formatForPrompt(relevantLessons)
        enrichedBrief = `${brief}\n\n${lessonsBlock}`
        console.log(`${LOG} Injected ${String(relevantLessons.length)} lessons into brief`)
      }
    }

    const workerSystemPrompt = this._buildWorkerSystemPrompt(taskType)
    const trimmedBase = orchestratorBasePrompt?.trim() ?? ''
    const withElicitation = `${workerSystemPrompt}\n\n${ELICITATION_INSTRUCTION}`
    const systemContent =
      trimmedBase.length > 0 ? `${trimmedBase}\n\n---\n\n${withElicitation}` : withElicitation
    const tools = loadToolsForIntent(taskType)
    const openAITools = formatToolsForOpenAI(tools)

    const limit = resolveContextLimit(modelToUse)
    const maxInputTokens = Math.floor(limit * 0.8)

    let userContent = enrichedBrief
    const inputTokens = countTokens(systemContent + userContent, modelToUse)
    if (inputTokens > maxInputTokens) {
      console.warn(`${LOG} Brief exceeds 80% of context window — truncating brief`)
      userContent = truncateBriefForBudget(systemContent, enrichedBrief, modelToUse, maxInputTokens)
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ]

    try {
      const response = await this.openai.chat.completions.create(
        this._completionParams(modelToUse, messages, openAITools, reasoningEffort),
      )

      const wrapped = await this._completeExecuteAfterFirstResponse(
        modelToUse,
        taskType,
        messages,
        openAITools,
        response,
        reasoningEffort,
      )

      if (sessionId !== undefined && routerResult !== null) {
        modelRouter.recordActualUsage(
          sessionId,
          routerResult.tier,
          modelToUse,
          wrapped.promptTokens,
          wrapped.completionTokens,
          taskType,
        )
      }

      const workerResult = wrapped.result

      if (
        sessionId !== undefined &&
        workerResult.success &&
        workerResult.content.trim().length > 0 &&
        skipConfidenceEvaluation !== true
      ) {
        const confidenceResult = await confidenceOrchestrator.evaluate(
          workerResult.content,
          {
            sessionId,
            taskType,
            taskDescription: brief.slice(0, 300),
            turnIndex: 0,
            complexityScore: complexityScore ?? 0.5,
            iterationNumber: 0,
          },
          critiqueScore !== undefined ? { critiqueScore } : undefined,
        )

        if (confidenceResult.uarResult?.resolvedContent !== undefined) {
          workerResult.content = confidenceResult.uarResult.resolvedContent
          console.log(
            `${LOG} UAR improved output (confidence: ${confidenceResult.uarResult.originalScore.toFixed(2)} → ${confidenceResult.uarResult.resolvedScore.toFixed(2)})`,
          )
        }

        if (confidenceResult.uncertaintyNotice !== undefined) {
          workerResult.content += `\n\n${confidenceResult.uncertaintyNotice}`
        }

        workerResult.confidenceScore = confidenceResult.score.scalar
        workerResult.confidenceLevel = confidenceResult.score.level
        if (critiqueScore !== undefined) {
          workerResult.critiqueScore = critiqueScore
        }
      }

      return workerResult
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: '',
        taskType,
        tokensUsed: 0,
        iterationCount: 1,
        success: false,
        error: message,
      }
    }
  }

  /**
   * Handles `stop` / `length` vs `tool_calls`, runs the tool loop when needed, and builds {@link WorkerResult}.
   */
  private async _completeExecuteAfterFirstResponse(
    model: string,
    taskType: TaskType,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    openAITools: OpenAiToolSpec[],
    response: OpenAI.Chat.Completions.ChatCompletion,
    reasoningEffort?: string,
  ): Promise<{
    result: WorkerResult
    promptTokens: number
    completionTokens: number
  }> {
    let promptTok = response.usage?.prompt_tokens ?? 0
    let completionTok = response.usage?.completion_tokens ?? 0

    const firstChoice = response.choices[0]
    const firstFinish = firstChoice?.finish_reason ?? 'stop'
    let lastGoodContent = firstChoice?.message?.content?.trim() ?? ''

    if (firstFinish !== 'tool_calls') {
      const msg = firstChoice?.message
      const text = msg?.content?.trim() ?? ''
      const tokensUsed =
        response.usage !== undefined
          ? response.usage.prompt_tokens + response.usage.completion_tokens
          : countTokens(text, model)

      return {
        result: {
          content: text,
          taskType,
          tokensUsed,
          iterationCount: 1,
          success: true,
        },
        promptTokens: promptTok,
        completionTokens: completionTok,
      }
    }

    let loopResponse: OpenAI.Chat.Completions.ChatCompletion
    try {
      loopResponse = await this._runToolCompletionLoop(
        model,
        messages,
        openAITools,
        response,
        reasoningEffort,
        (p, c) => {
          promptTok += p
          completionTok += c
        },
        (text) => {
          if (text.length > 0) {
            lastGoodContent = text
          }
        },
      )
    } catch (loopErr: unknown) {
      const loopMessage = loopErr instanceof Error ? loopErr.message : String(loopErr)
      if (lastGoodContent.length > 0) {
        return {
          result: {
            content: lastGoodContent,
            taskType,
            tokensUsed: promptTok + completionTok,
            iterationCount: 1,
            success: true,
          },
          promptTokens: promptTok,
          completionTokens: completionTok,
        }
      }
      return {
        result: {
          content: '',
          taskType,
          tokensUsed: promptTok + completionTok,
          iterationCount: 1,
          success: false,
          error: loopMessage,
        },
        promptTokens: promptTok,
        completionTokens: completionTok,
      }
    }

    const finalText = (loopResponse.choices[0]?.message?.content ?? '').trim()
    const content = finalText.length > 0 ? finalText : lastGoodContent
    const tokensUsed =
      promptTok + completionTok > 0 ? promptTok + completionTok : countTokens(content, model)

    if (content.length === 0 && loopResponse.choices[0]?.finish_reason === 'tool_calls') {
      return {
        result: {
          content: lastGoodContent,
          taskType,
          tokensUsed,
          iterationCount: 1,
          success: lastGoodContent.length > 0,
          ...(lastGoodContent.length === 0 ? { error: 'Tool loop ended without assistant text' } : {}),
        },
        promptTokens: promptTok,
        completionTokens: completionTok,
      }
    }

    return {
      result: {
        content,
        taskType,
        tokensUsed,
        iterationCount: 1,
        success: true,
      },
      promptTokens: promptTok,
      completionTokens: completionTok,
    }
  }

  /**
   * Runs follow-up completions until the model stops, hits length, or rounds are exhausted.
   */
  private async _runToolCompletionLoop(
    model: string,
    seedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    openAITools: OpenAiToolSpec[],
    initialResponse: OpenAI.Chat.Completions.ChatCompletion,
    reasoningEffort: string | undefined,
    addTokens: (prompt: number, completion: number) => void,
    onAssistantText: (text: string) => void,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const loopMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...seedMessages]
    let loopResponse = initialResponse
    let rounds = 0

    while (
      loopResponse.choices[0]?.finish_reason === 'tool_calls' &&
      rounds < WorkerAgent.MAX_TOOL_ROUNDS
    ) {
      rounds++
      const assistantMsg = loopResponse.choices[0]?.message
      if (assistantMsg === undefined) {
        break
      }

      loopMessages.push(assistantMsg as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam)

      const rawCalls = assistantMsg.tool_calls ?? []
      if (rawCalls.length === 0) {
        break
      }

      const functionCalls = rawCalls.filter(
        (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall =>
          tc.type === 'function',
      )
      const toolResults = await this._executeToolCalls(functionCalls)

      for (const result of toolResults) {
        loopMessages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: result.output,
        })
      }

      loopResponse = await this.openai.chat.completions.create(
        this._completionParams(model, loopMessages, openAITools, reasoningEffort),
      )

      const u = loopResponse.usage
      if (u !== undefined) {
        addTokens(u.prompt_tokens, u.completion_tokens)
      }

      const nextText = loopResponse.choices[0]?.message?.content?.trim() ?? ''
      onAssistantText(nextText)
    }

    return loopResponse
  }

  /** Validates `function.arguments` parses as JSON (empty → `{}`). */
  private _isValidToolArgumentsJson(argumentsJson: string | undefined): boolean {
    const raw = argumentsJson !== undefined && argumentsJson.length > 0 ? argumentsJson : '{}'
    try {
      JSON.parse(raw)
      return true
    } catch {
      return false
    }
  }

  /**
   * Dispatches model tool calls to integrations (stubs until Phase 7 wiring).
   */
  private async _executeToolCalls(
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
  ): Promise<Array<{ toolCallId: string; output: string }>> {
    const results: Array<{ toolCallId: string; output: string }> = []

    for (const toolCall of toolCalls) {
      if (toolCall.type !== 'function') {
        results.push({
          toolCallId: toolCall.id,
          output: `Tool type ${toolCall.type} not implemented in Worker`,
        })
        continue
      }

      const name = toolCall.function.name
      console.info(`${LOG} Executing tool: ${name}`)

      if (!this._isValidToolArgumentsJson(toolCall.function.arguments)) {
        results.push({
          toolCallId: toolCall.id,
          output: 'Invalid JSON in tool arguments',
        })
        continue
      }

      switch (name) {
        case 'web_search':
          // STUB: Replace with real web_search integration when wiring Phase 7
          results.push({
            toolCallId: toolCall.id,
            output: '[web_search not wired in Worker — handled by Orchestrator]',
          })
          break
        case 'code_runner':
          // STUB: Replace with real code_runner integration when wiring Phase 7
          results.push({
            toolCallId: toolCall.id,
            output: '[code_runner stub — wire to your sandbox here]',
          })
          break
        case 'voice_synthesis':
          // STUB: Replace with real voice_synthesis integration when wiring Phase 7
          results.push({
            toolCallId: toolCall.id,
            output: '[voice_synthesis stub — wire to your voice engine here]',
          })
          break
        case 'image_generation':
          // STUB: Replace with real image_generation integration when wiring Phase 7
          results.push({
            toolCallId: toolCall.id,
            output: '[image_generation stub — wire to your image engine here]',
          })
          break
        default:
          results.push({
            toolCallId: toolCall.id,
            output: `Tool ${name} not implemented in Worker`,
          })
      }
    }

    return results
  }

  /**
   * Second pass: refine prior Worker output using an explicit instruction.
   */
  async refine(
    brief: string,
    previousOutput: string,
    refinementInstruction: string,
    taskType: TaskType,
    model: string = 'gpt-4o',
    sessionId?: string,
    complexityScore?: number,
    critiqueScore?: number,
  ): Promise<WorkerResult> {
    const refinementBrief = `<refinement_brief>
<original_brief><![CDATA[${cdataSafe(brief)}]]></original_brief>
<previous_output><![CDATA[${cdataSafe(previousOutput)}]]></previous_output>
<refinement_instruction><![CDATA[${cdataSafe(refinementInstruction)}]]></refinement_instruction>
</refinement_brief>`

    const result = await this.execute(
      refinementBrief,
      taskType,
      model,
      sessionId,
      undefined,
      complexityScore,
      critiqueScore,
    )
    return {
      ...result,
      iterationCount: result.iterationCount + 1,
    }
  }
}

/**
 * Manager agent: accumulates task state, artefacts, and requirements; decides when to brief a Worker.
 */

import OpenAI from 'openai'

import SessionIndex from '@/memory/sessionIndex'
import type { RouteResult } from '@/lib/router/semanticRouter'
import { buildScratchpadSummary, getActiveSubGoal } from '@/reasoning/cotScratchpad'
import type { ReActDecision } from '@/reasoning/reactEngine'
import ProblemDecomposer from '@/reasoning/problemDecomposer'
import ReActLoopController, { type LoopResult } from '@/reasoning/reactLoopController'
import { scratchpadStore } from '@/reasoning/scratchpadStore'
import type { ThoughtContext } from '@/reasoning/thoughtGenerator'
import {
  buildWorkerBrief,
  createTaskState,
  getActiveRequirements,
  updateTaskState,
  type ArtefactRef,
  type TaskRequirement,
  type TaskState,
  type TaskType,
} from './taskState'

const LOG = '[ManagerAgent]'

function hasTopicShiftSignal(message: string): boolean {
  const m = message.toLowerCase()
  const signals = [
    "let's talk about",
    "now let's",
    'new task',
    'different question',
    'moving on',
    'by the way',
    'on another note',
    'forget that',
    'ignore that',
    'start over',
    'new topic',
  ] as const
  return signals.some((s) => m.includes(s))
}

const DIRECT_ACKS = ['Got it.', 'Understood.', "Sure, let's proceed.", 'Sounds good.', 'Okay.']

const TASK_COMPLETION_SIGNALS = [
  'task complete',
  'done',
  'finished',
  'all done',
  'implemented',
  'here is the final',
] as const

const ASSISTANT_ERROR_SNIPPETS = ['error', 'failed', 'sorry', 'could not', "couldn't", 'went wrong'] as const

type ManagerTurnRole = 'user' | 'assistant'

type ManagerTurn = { role: ManagerTurnRole; content: string; turnIndex: number }

/** Routes returned by the semantic router mapped into {@link TaskType}. */
function normalizeRoute(route: string): TaskType {
  const r = route.trim()
  if (r === 'general') {
    return 'unknown'
  }
  const allowed: readonly TaskType[] = [
    'code_instruction',
    'knowledge_lookup',
    'voice_task',
    'image_task',
    'browser_task',
    'file_task',
    'conversational',
    'clarification_needed',
    'unknown',
  ]
  return (allowed as readonly string[]).includes(r) ? (r as TaskType) : 'unknown'
}

function dedupeArtefacts(items: ArtefactRef[]): ArtefactRef[] {
  const seen = new Set<string>()
  const out: ArtefactRef[] = []
  for (const a of items) {
    const key = `${a.type}:${a.content.trim().slice(0, 2000)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

function classifyArtefactContent(content: string): Pick<ArtefactRef, 'type' | 'language' | 'sourceName'> {
  const t = content.trim()
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>
      const keys = Object.keys(o).map((k) => k.toLowerCase())
      const voiceHints = ['voice', 'tone', 'emotion', 'tts', 'speaker', 'speech']
      const imageHints = ['image', 'prompt', 'negative', 'steps', 'seed', 'width', 'height']
      if (keys.some((k) => voiceHints.some((h) => k.includes(h)))) {
        return { type: 'voice_config', sourceName: 'json' }
      }
      if (keys.some((k) => imageHints.some((h) => k.includes(h)))) {
        return { type: 'image_prompt', sourceName: 'json' }
      }
      return { type: 'config', sourceName: 'json' }
    } catch {
      /* fall through */
    }
  }
  const tsxMarkers = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'jsx', 'tsx', 'React.']
  if (tsxMarkers.some((k) => t.includes(k)) || (t.includes('<') && t.includes('>'))) {
    return { type: 'code', language: 'tsx' }
  }
  if (
    (t.includes('def ') || t.includes('class ') || t.includes('import ') || t.includes('async def')) &&
    t.includes(':')
  ) {
    return { type: 'code', language: 'python' }
  }
  if (t.length > 100) {
    return { type: 'text' }
  }
  return { type: 'other' }
}

/**
 * Accumulates {@link TaskState} and decides Manager-Worker actions for a session.
 */
export default class ManagerAgent {
  private readonly sessionId: string
  private readonly sessionIndex: SessionIndex
  private readonly openai: OpenAI
  private currentTaskState: TaskState | null = null
  private turnHistory: ManagerTurn[] = []
  private reactController: ReActLoopController | null = null
  private lastReActResult: LoopResult | null = null
  private readonly decomposer: ProblemDecomposer = new ProblemDecomposer()
  private currentScratchpadId: string | null = null

  /**
   * @param sessionId - Session id (matches orchestrator / index scope)
   * @param sessionIndex - Session memory index (reserved for future retrieval hooks)
   */
  constructor(sessionId: string, sessionIndex: SessionIndex) {
    this.sessionId = sessionId
    /** Reserved for session-scoped retrieval (RAG / index hooks). */
    this.sessionIndex = sessionIndex
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
  }

  /** Session index passed at construction (for future retrieval wiring). */
  getSessionIndex(): SessionIndex {
    return this.sessionIndex
  }

  /** Latest task snapshot for debugging. */
  getTaskState(): TaskState | null {
    return this.currentTaskState
  }

  /** Clears the active task so the next turn starts fresh. */
  resetTask(): void {
    this.currentTaskState = null
    this.currentScratchpadId = null
  }

  /** Scratchpad summary for the current task, or null if none. */
  getScratchpadSummary(): string | null {
    if (this.currentScratchpadId === null) return null
    const pad = scratchpadStore.get(this.currentScratchpadId)
    if (pad === null) return null
    return buildScratchpadSummary(pad)
  }

  /**
   * Persists the last full {@link ReActLoopController.run} result so the next
   * {@link processTurn} can pass prior ReAct steps into {@link ThoughtContext}.
   */
  ingestReActLoopResult(result: LoopResult): void {
    this.lastReActResult = result
  }

  /**
   * Records a Worker / assistant reply so {@link turnHistory} stays aligned with executed outputs.
   */
  recordAssistantTurn(content: string): void {
    const turnIndex = this.turnHistory.length
    this.turnHistory.push({
      role: 'assistant',
      content,
      turnIndex,
    })
    console.info(`${LOG} Assistant turn recorded (turn ${String(turnIndex)})`)

    if (this.currentScratchpadId !== null && content.length > 50) {
      const pad = scratchpadStore.get(this.currentScratchpadId)
      if (pad !== null) {
        // NOTE: This auto-completes the active sub-goal on any assistant reply
        // longer than 50 chars. This works well for single-step tasks but
        // can be over-eager on multi-step tasks where one Worker reply
        // satisfies only part of the active sub-goal.
        //
        // Future improvement (Phase 3+): use VerifierAgent.evaluateCompletion()
        // to confirm the sub-goal is actually satisfied before marking complete.
        // For now, the optimistic completion is acceptable — worst case is a
        // sub-goal is marked complete slightly early, and the next ReAct thought
        // will detect the gap via scratchpad state.
        const activeSubGoal = getActiveSubGoal(pad)
        if (activeSubGoal !== null) {
          try {
            scratchpadStore.completeSubGoal(
              this.currentScratchpadId,
              activeSubGoal.id,
              content.slice(0, 100),
            )
          } catch (err) {
            console.warn(`${LOG} completeSubGoal after Worker output failed`, err)
          }
        }
      }
    }
  }

  /** Most recent assistant entry (walks back from end; skips trailing user). */
  private _getLastAssistantTurn(): ManagerTurn | undefined {
    for (let i = this.turnHistory.length - 1; i >= 0; i--) {
      const t = this.turnHistory[i]!
      if (t.role === 'assistant') {
        return t
      }
    }
    return undefined
  }

  private _assistantSuggestsCompletionOrError(assistantContent: string): boolean {
    const lower = assistantContent.toLowerCase()
    if (TASK_COMPLETION_SIGNALS.some((s) => lower.includes(s))) {
      return true
    }
    return ASSISTANT_ERROR_SNIPPETS.some((s) => lower.includes(s))
  }

  private _isNewTask(message: string): boolean {
    if (hasTopicShiftSignal(message)) {
      return true
    }

    const lastAssistantTurn = this._getLastAssistantTurn()
    const m = message.toLowerCase()
    const userContinuesSameTask =
      m.includes('also') || m.includes('additionally') || m.includes('and also')

    const userStartsNewAfterCompletion =
      lastAssistantTurn !== undefined &&
      this._assistantSuggestsCompletionOrError(lastAssistantTurn.content) &&
      !userContinuesSameTask

    return userStartsNewAfterCompletion
  }

  private _similarRequirementDesc(a: string, b: string): boolean {
    const x = a.trim().toLowerCase()
    const y = b.trim().toLowerCase()
    if (x === y) return true
    if (x.length < 8 || y.length < 8) return false
    return x.includes(y.slice(0, Math.min(32, y.length))) || y.includes(x.slice(0, Math.min(32, x.length)))
  }

  private _buildClarificationQuestion(): string {
    const s = this.currentTaskState
    if (s === null || s.primaryArtefact === null) {
      return "Could you share the code, config, or file you'd like me to work with?"
    }
    const active = getActiveRequirements(s)
    if (active.length === 0) {
      return 'What would you like me to do with this?'
    }
    const name = s.primaryArtefact.sourceName ?? s.primaryArtefact.type
    return `Are you referring to ${name}?`
  }

  private _buildDirectAnswer(message: string): string {
    const i = Math.abs(message.length + this.turnHistory.length) % DIRECT_ACKS.length
    return DIRECT_ACKS[i] ?? 'Got it.'
  }

  /**
   * Pulls code fences, JSON-ish blocks, and RAG chunks into {@link ArtefactRef} rows.
   */
  private async _extractArtefacts(message: string, ragContent: string[]): Promise<ArtefactRef[]> {
    const turnIndex = Math.max(0, this.turnHistory.length - 1)
    const out: ArtefactRef[] = []

    // eslint-disable-next-line sonarjs/slow-regex -- bounded code fences in user messages
    const fenceRe = /```(\w*)\n?([\s\S]*?)```/g
    let m: RegExpExecArray | null
    while ((m = fenceRe.exec(message)) !== null) {
      const lang = (m[1] ?? '').trim()
      const body = (m[2] ?? '').trim()
      if (body.length === 0) continue
      const langNorm = lang.length > 0 ? lang : undefined
      out.push({
        type: 'code',
        content: body,
        language: langNorm,
        turnIndex,
      })
    }

    const jsonish = /\{[\s\S]{50,8000}\}/g
    let jm: RegExpExecArray | null
    while ((jm = jsonish.exec(message)) !== null) {
      const chunk = jm[0]!
      const meta = classifyArtefactContent(chunk)
      out.push({
        type: meta.type,
        content: chunk,
        language: meta.language,
        sourceName: meta.sourceName,
        turnIndex,
      })
    }

    ragContent.forEach((chunk, i) => {
      const c = chunk.trim()
      if (c.length === 0) return
      const meta = classifyArtefactContent(c)
      out.push({
        type: meta.type === 'other' ? 'text' : meta.type,
        content: c,
        language: meta.language,
        sourceName: `rag_chunk_${String(i + 1)}`,
        turnIndex,
      })
    })

    if (out.length === 0 && message.trim().length > 100) {
      const meta = classifyArtefactContent(message)
      out.push({
        type: meta.type === 'other' ? 'text' : meta.type,
        content: message.trim(),
        language: meta.language,
        turnIndex,
      })
    }

    return dedupeArtefacts(out)
  }

  /**
   * Uses a small model to split the user message into discrete requirements; merges with supersession.
   */
  private _requirementsExtractionSystemPrompt(assistantContextSnippet: string): string {
    return `Extract the specific requirements from this user message as a JSON array of strings. Each requirement should be a single, actionable item. Return ONLY: {"requirements":["...","..."]}

Context: the assistant's last response was:
${assistantContextSnippet}`
  }

  private async _extractRequirements(
    message: string,
    state: TaskState,
    basePrompt?: string,
  ): Promise<TaskRequirement[]> {
    const turnIdx = Math.max(0, this.turnHistory.length - 1)
    const lastAssistantTurn = this._getLastAssistantTurn()
    const assistantContextSnippet =
      lastAssistantTurn !== undefined ? lastAssistantTurn.content.slice(0, 500) : 'none'

    const extractionSystem = this._requirementsExtractionSystemPrompt(assistantContextSnippet)
    const systemContent =
      basePrompt !== undefined && basePrompt.trim().length > 0
        ? `${basePrompt.trim()}\n\n---\n\n${extractionSystem}`
        : extractionSystem

    let llmStrings: string[] = []
    try {
      const res = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: systemContent,
          },
          { role: 'user', content: message },
        ],
      })
      let text = res.choices[0]?.message?.content?.trim() ?? ''
      // eslint-disable-next-line sonarjs/slow-regex -- single LLM reply, small
      const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/m)
      if (fence?.[1] !== undefined) {
        text = fence[1]!.trim()
      }
      const parsed = JSON.parse(text) as { requirements?: unknown }
      if (Array.isArray(parsed.requirements)) {
        llmStrings = parsed.requirements.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      }
    } catch (err) {
      console.warn(`${LOG} Requirement extraction failed, using raw message as requirement`, err)
      llmStrings = [message.trim()]
    }

    if (llmStrings.length === 0) {
      llmStrings = [message.trim()]
    }

    return this._mergeExtractedRequirements(llmStrings, state, turnIdx)
  }

  private _mergeExtractedRequirements(
    llmStrings: string[],
    state: TaskState,
    turnIdx: number,
  ): TaskRequirement[] {
    const merged: TaskRequirement[] = state.requirements.map((r) => ({ ...r }))

    for (const s of llmStrings) {
      const desc = s.trim()
      if (desc.length === 0) continue
      for (let i = 0; i < merged.length; i++) {
        const ex = merged[i]!
        if (ex.supersededBy !== undefined) continue
        if (this._similarRequirementDesc(ex.description, desc)) {
          merged[i] = { ...ex, supersededBy: turnIdx }
        }
      }
      merged.push({ description: desc, addedAtTurn: turnIdx })
    }

    return merged
  }

  /**
   * Single-step ReAct {@link ReActEngine.decide} before artefact merge (skipped for conversational turns).
   */
  private async _maybeRunReActDecide(
    userMessage: string,
    intentResult: RouteResult,
    ragContent: string[],
    state: TaskState,
    skipReAct: boolean,
  ): Promise<
    | { decision: ReActDecision | null; earlyClarify?: undefined }
    | { decision: null; earlyClarify: string }
  > {
    if (skipReAct) {
      return { decision: null }
    }

    const thoughtContext: ThoughtContext = {
      userMessage,
      taskType: intentResult.route,
      priorSteps: this.lastReActResult?.trace.steps ?? [],
      ragContent,
      taskBrief:
        this.currentTaskState !== null ? buildWorkerBrief(this.currentTaskState) : undefined,
      lastObservation: this.lastReActResult?.trace.steps.at(-1)?.observation.content,
      iterationCount: this.currentTaskState?.iterationCount ?? 0,
      scratchpadId: this.currentScratchpadId ?? undefined,
    }

    this.reactController = new ReActLoopController({
      taskType: intentResult.route,
      sessionId: this.sessionId,
      model: 'gpt-4o',
      enableUncertaintyChecks: true,
      scratchpadId: this.currentScratchpadId ?? undefined,
    })

    const decision = await this.reactController.engine.decide(thoughtContext)
    console.log(
      `${LOG} ReAct decision: ${decision.action} (confidence: ${decision.thought.confidence.toFixed(2)})`,
    )

    if (decision.action === 'request_clarification' && decision.thought.confidence < 0.5) {
      return { decision: null, earlyClarify: decision.thought.content }
    }

    return { decision }
  }

  /** Appends CoT scratchpad summary when the Worker brief should carry task understanding. */
  private _briefWithScratchpad(baseBrief: string): string {
    if (this.currentScratchpadId === null) {
      return baseBrief
    }
    const pad = scratchpadStore.get(this.currentScratchpadId)
    if (pad === null || (pad.subGoals.length === 0 && pad.keyInsights.length === 0)) {
      return baseBrief
    }
    return `${baseBrief}\n\n<task_understanding>\n${buildScratchpadSummary(pad)}\n</task_understanding>`
  }

  /** Creates a CoT scratchpad and optionally decomposes the task into sub-goals. */
  private async _bootstrapScratchpadForNewTask(
    userMessage: string,
    route: string,
    ragContent: string[],
  ): Promise<void> {
    const pad = scratchpadStore.create(this.sessionId, route, userMessage)
    this.currentScratchpadId = pad.scratchpadId

    const shouldDecompose = await this.decomposer.shouldDecompose(userMessage, route)
    if (!shouldDecompose) {
      return
    }
    await this.decomposer.decompose(userMessage, route, ragContent, pad.scratchpadId)
    console.log(`${LOG} Task decomposed into sub-goals`)
  }

  private _pickPrimaryAndAdditional(artefacts: ArtefactRef[]): {
    primary: ArtefactRef | null
    additional: ArtefactRef[]
  } {
    if (artefacts.length === 0) {
      return { primary: null, additional: [] }
    }
    const codeFirst = artefacts.find((a) => a.type === 'code')
    const primary = codeFirst ?? artefacts[0]!
    const rest = artefacts.filter((a) => a !== primary)
    return { primary, additional: rest }
  }

  /**
   * Processes one user turn: history → task boundary → artefacts → requirements → action.
   */
  async processTurn(
    userMessage: string,
    intentResult: RouteResult,
    ragContent: string[],
    basePrompt?: string,
  ): Promise<{
    action: 'brief_worker' | 'clarify' | 'answer_directly'
    taskState: TaskState
    brief?: string
    clarificationQuestion?: string
    directAnswer?: string
  }> {
    this.turnHistory.push({
      role: 'user',
      content: userMessage,
      turnIndex: this.turnHistory.length,
    })
    const turnIdx = this.turnHistory.length - 1
    const taskType = normalizeRoute(intentResult.route)

    const routeChanged =
      this.currentTaskState !== null && this.currentTaskState.taskType !== taskType
    const isNewTask =
      this.currentTaskState === null || this._isNewTask(userMessage) || routeChanged

    let state: TaskState = isNewTask ? createTaskState(this.sessionId, taskType) : this.currentTaskState!

    if (isNewTask) {
      await this._bootstrapScratchpadForNewTask(userMessage, intentResult.route, ragContent)
    }

    const skipReAct = intentResult.route === 'conversational'
    const reActOutcome = await this._maybeRunReActDecide(
      userMessage,
      intentResult,
      ragContent,
      state,
      skipReAct,
    )
    if (reActOutcome.earlyClarify !== undefined) {
      return {
        action: 'clarify',
        taskState: state,
        clarificationQuestion: reActOutcome.earlyClarify,
      }
    }
    const reactDecision = reActOutcome.decision

    const artefacts = await this._extractArtefacts(userMessage, ragContent)
    const { primary, additional } = this._pickPrimaryAndAdditional(artefacts)

    const mergedRequirements = await this._extractRequirements(userMessage, state, basePrompt)

    const nextTurnCount = isNewTask ? 1 : state.turnCount + 1
    const nextFirst = isNewTask || state.turnCount === 0 ? turnIdx : state.firstTurnIndex

    state = updateTaskState(state, {
      taskType,
      primaryArtefact: primary,
      additionalArtefacts: additional,
      requirements: mergedRequirements,
      turnCount: nextTurnCount,
      firstTurnIndex: nextFirst,
      lastTurnIndex: turnIdx,
      needsClarification: false,
    })

    const active = getActiveRequirements(state)
    state = updateTaskState(state, {
      isReadyForWorker: state.primaryArtefact !== null && active.length > 0,
    })

    this.currentTaskState = state

    if (intentResult.route === 'conversational') {
      return {
        action: 'answer_directly',
        taskState: state,
        directAnswer: this._buildDirectAnswer(userMessage),
      }
    }

    if (intentResult.route === 'clarification_needed' && state.primaryArtefact === null) {
      return {
        action: 'clarify',
        taskState: state,
        clarificationQuestion: "Could you re-share the content you'd like me to work with?",
      }
    }

    if (state.primaryArtefact !== null && active.length > 0) {
      let outState = state
      if (!skipReAct && reactDecision !== null) {
        outState = updateTaskState(state, {
          reasoningThought: {
            content: reactDecision.thought.content,
            confidence: reactDecision.thought.confidence,
            assumptions: reactDecision.thought.assumptions,
            risks: reactDecision.thought.risks,
          },
        })
        this.currentTaskState = outState
      }
      return {
        action: 'brief_worker',
        taskState: outState,
        brief: this._briefWithScratchpad(buildWorkerBrief(outState)),
      }
    }

    return {
      action: 'clarify',
      taskState: state,
      clarificationQuestion: this._buildClarificationQuestion(),
    }
  }
}

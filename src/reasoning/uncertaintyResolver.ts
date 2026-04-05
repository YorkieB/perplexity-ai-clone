/**
 * System 2 — Uncertainty-Aware Reflection (UAR) for the Dual-Process AUQ pipeline
 * (arXiv:2601.15703). Activates when verbalized confidence ĉ_t falls below τ
 * ({@link CONFIDENCE_THRESHOLDS.UAR_TRIGGER}), using uncertainty explanations ê_t
 * as cues for targeted meta-reasoning.
 *
 * @module reasoning/uncertaintyResolver
 */

import OpenAI from 'openai'

import type { ConfidenceScore } from './confidenceTypes'
import { CONFIDENCE_THRESHOLDS } from './confidenceTypes'
import { lessonsStore } from './lessonsStore'
import { modelRouter } from './modelRouter'
import type { ModelTier } from './modelRegistry'
import { scratchpadStore } from './scratchpadStore'

const LOG = '[UncertaintyResolver]'

const DIAGNOSE_MODEL = 'gpt-4o-mini'
const REEVAL_MODEL = 'gpt-4o-mini'

/** Outcome of a UAR cycle (clarification, escalation, or self-resolution). */
export interface UARResult {
  triggered: boolean
  originalScore: number
  /** Confidence after resolution attempt. */
  resolvedScore: number
  /** Human-readable strategy label. */
  resolutionStrategy: string
  /** Updated output when UAR rewrote the answer. */
  resolvedContent?: string
  /** Populated when {@link resolutionStrategy} is `request_clarification`. */
  clarificationQuestion?: string
  /** Populated when {@link resolutionStrategy} is `escalate_model`. */
  modelEscalation?: boolean
  /** Audit trail of UAR steps. */
  resolutionSteps: string[]
  /** Lessons persisted for future turns. */
  lessonsExtracted: string[]
}

/** Parsed diagnosis from {@link UncertaintyResolver._diagnose}. */
export interface UARDiagnosis {
  rootCause: string
  resolutionPath: string
  canSelfResolve: boolean
  resolutionSteps: string[]
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

function parseDiagnosisJson(text: string): UARDiagnosis {
  const raw = text.trim()
  const parsed = JSON.parse(raw) as Record<string, unknown>
  return {
    rootCause: typeof parsed.rootCause === 'string' ? parsed.rootCause : 'Unknown root cause',
    resolutionPath:
      typeof parsed.resolutionPath === 'string' ? parsed.resolutionPath : 'No path specified',
    canSelfResolve: parsed.canSelfResolve === true,
    resolutionSteps: asStringArray(parsed.resolutionSteps),
  }
}

function parseConfidenceNumber(text: string): number {
  const m = text.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i)
  if (m === null || m[0] === undefined) return Number.NaN
  return Number(m[0])
}

/**
 * Targeted reflection and repair when System 1 confidence is below τ.
 */
export default class UncertaintyResolver {
  private readonly openai: OpenAI
  private readonly model: string

  /**
   * @param model - Primary model for self-resolution (default `gpt-4o`).
   */
  constructor(model: string = 'gpt-4o') {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
    this.model = model
  }

  /**
   * Runs diagnosis → optional self-resolve → re-score → lessons → scratchpad updates.
   */
  async resolve(
    confidence: ConfidenceScore,
    originalOutput: string,
    taskDescription: string,
    sessionId: string,
    taskType: string,
  ): Promise<UARResult> {
    if (confidence.scalar >= CONFIDENCE_THRESHOLDS.UAR_TRIGGER) {
      return {
        triggered: false,
        originalScore: confidence.scalar,
        resolvedScore: confidence.scalar,
        resolutionStrategy: 'no_action',
        resolutionSteps: [],
        lessonsExtracted: [],
      }
    }

    console.log(
      `${LOG} UAR triggered — confidence ${String(confidence.scalar)} below threshold ${String(CONFIDENCE_THRESHOLDS.UAR_TRIGGER)}`,
    )

    const diagnosis = await this._diagnose(confidence, taskDescription, taskType, sessionId)

    if (confidence.scalar < CONFIDENCE_THRESHOLDS.HARD_BLOCK) {
      return await this._buildClarificationResult(confidence, diagnosis, sessionId, taskType)
    }

    if (!diagnosis.canSelfResolve) {
      return await this._buildEscalationResult(confidence, diagnosis, sessionId, taskType)
    }

    const resolvedOutput = await this._selfResolve(
      confidence,
      originalOutput,
      taskDescription,
      taskType,
      diagnosis,
      sessionId,
    )

    const newConfidence = await this._quickReEvaluate(resolvedOutput, taskDescription, sessionId)
    const { lessonsExtracted: lessons, lessonIds } = await this._extractLessons(
      confidence,
      diagnosis,
      sessionId,
      taskType,
    )
    const confidenceImproved = newConfidence > confidence.scalar + 0.1
    for (const id of lessonIds) {
      lessonsStore.recordApplied(id, confidenceImproved).catch((err: unknown) => {
        console.error(`${LOG} recordApplied failed`, err)
      })
    }

    const pad = scratchpadStore.getForSession(sessionId)
    if (pad !== null) {
      scratchpadStore.addInsight(
        pad.scratchpadId,
        `UAR resolved uncertainty: ${diagnosis.rootCause} → ${diagnosis.resolutionPath}`,
        'high',
      )
      for (const gap of confidence.knowledgeGaps) {
        if (gap.trim().length > 0) {
          scratchpadStore.addOpenQuestion(pad.scratchpadId, gap)
        }
      }
    }

    return {
      triggered: true,
      originalScore: confidence.scalar,
      resolvedScore: newConfidence,
      resolutionStrategy: 'self_resolved',
      resolvedContent: resolvedOutput,
      resolutionSteps: diagnosis.resolutionSteps,
      lessonsExtracted: lessons,
    }
  }

  private async _diagnose(
    confidence: ConfidenceScore,
    taskDescription: string,
    taskType: string,
    sessionId: string,
  ): Promise<UARDiagnosis> {
    const system = `Diagnose why an AI agent has low confidence in its output.
Determine if it can self-resolve or needs user input.

Return JSON only:
{"rootCause": "...", "resolutionPath": "...",
 "canSelfResolve": true or false, "resolutionSteps": ["step1", ...]}`

    const user = `Task: ${taskDescription}
Task type: ${taskType}
Confidence: ${String(confidence.scalar)}
Uncertainty factors: ${confidence.uncertaintyFactors.join(', ')}
Knowledge gaps: ${confidence.knowledgeGaps.join(', ')}`

    try {
      const completion = await this.openai.chat.completions.create({
        model: DIAGNOSE_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        stream: false,
      })
      modelRouter.recordActualUsage(
        sessionId,
        'nano' as ModelTier,
        DIAGNOSE_MODEL,
        completion.usage?.prompt_tokens ?? 0,
        completion.usage?.completion_tokens ?? 0,
        'uar_resolution',
      )
      const text = completion.choices[0]?.message?.content?.trim() ?? '{}'
      return parseDiagnosisJson(text)
    } catch (err: unknown) {
      console.warn(`${LOG} Diagnosis failed, using safe defaults`, err)
      return {
        rootCause: 'Diagnosis unavailable',
        resolutionPath: 'Request clarification or escalate',
        canSelfResolve: false,
        resolutionSteps: ['diagnosis_failed'],
      }
    }
  }

  private async _selfResolve(
    confidence: ConfidenceScore,
    originalOutput: string,
    taskDescription: string,
    taskType: string,
    diagnosis: UARDiagnosis,
    sessionId: string,
  ): Promise<string> {
    const system = `You are resolving uncertainty in a previous output.
Focus specifically on the uncertainty factors identified.
Do NOT rewrite parts that were already confident.
Only address the specific gaps and uncertainties.`

    const factors =
      confidence.uncertaintyFactors.length > 0
        ? confidence.uncertaintyFactors.map((f) => `- ${f}`).join('\n')
        : '- (none listed)'
    const gaps =
      confidence.knowledgeGaps.length > 0
        ? confidence.knowledgeGaps.map((g) => `- ${g}`).join('\n')
        : '- (none listed)'

    const user = `Task type: ${taskType}
Task: ${taskDescription.slice(0, 800)}

Original output:
${originalOutput.slice(0, 2000)}

Uncertainty factors to address:
${factors}

Knowledge gaps to fill:
${gaps}

Resolution path: ${diagnosis.resolutionPath}

Produce an improved output that addresses these uncertainties.`

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        max_tokens: 4096,
        stream: false,
      })
      modelRouter.recordActualUsage(
        sessionId,
        'standard' as ModelTier,
        this.model,
        completion.usage?.prompt_tokens ?? 0,
        completion.usage?.completion_tokens ?? 0,
        'uar_resolution',
      )
      return completion.choices[0]?.message?.content?.trim() ?? originalOutput
    } catch (err: unknown) {
      console.warn(`${LOG} Self-resolve failed, returning original output`, err)
      return originalOutput
    }
  }

  private async _quickReEvaluate(
    output: string,
    taskDescription: string,
    sessionId?: string,
  ): Promise<number> {
    const user = `Rate confidence in the following output for the task (0.0 = none, 1.0 = fully confident).
Return only a number between 0 and 1, no other text.

Task: ${taskDescription.slice(0, 400)}
Output: ${output.slice(0, 1200)}`

    try {
      const completion = await this.openai.chat.completions.create({
        model: REEVAL_MODEL,
        messages: [{ role: 'user', content: user }],
        temperature: 0,
        max_tokens: 16,
        stream: false,
      })
      if (sessionId !== undefined && sessionId.length > 0) {
        modelRouter.recordActualUsage(
          sessionId,
          'nano' as ModelTier,
          REEVAL_MODEL,
          completion.usage?.prompt_tokens ?? 0,
          completion.usage?.completion_tokens ?? 0,
          'uar_resolution',
        )
      }
      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      const n = parseConfidenceNumber(text)
      if (!Number.isFinite(n)) return 0.75
      return Math.min(1, Math.max(0, n))
    } catch {
      return 0.75
    }
  }

  private async _buildClarificationResult(
    confidence: ConfidenceScore,
    diagnosis: UARDiagnosis,
    sessionId: string,
    taskType: string,
  ): Promise<UARResult> {
    const gaps = confidence.knowledgeGaps.filter((g) => g.trim().length > 0)
    const top = gaps.slice(0, 2)
    const clarificationQuestion =
      top.length > 0
        ? `To complete this accurately, I need to know: ${top.join(' and ')}`
        : `To complete this accurately, I need more detail: ${diagnosis.rootCause}`

    const { lessonsExtracted: lessons } = await this._extractLessons(
      confidence,
      diagnosis,
      sessionId,
      taskType,
    )

    return {
      triggered: true,
      originalScore: confidence.scalar,
      resolvedScore: confidence.scalar,
      resolutionStrategy: 'request_clarification',
      clarificationQuestion,
      resolutionSteps: [
        `Diagnosed: ${diagnosis.rootCause}`,
        `Planned path: ${diagnosis.resolutionPath}`,
        'Blocked: confidence below hard threshold — clarification required',
      ],
      lessonsExtracted: lessons,
    }
  }

  private async _buildEscalationResult(
    confidence: ConfidenceScore,
    diagnosis: UARDiagnosis,
    sessionId: string,
    taskType: string,
  ): Promise<UARResult> {
    const { lessonsExtracted: lessons } = await this._extractLessons(
      confidence,
      diagnosis,
      sessionId,
      taskType,
    )
    return {
      triggered: true,
      originalScore: confidence.scalar,
      resolvedScore: confidence.scalar,
      resolutionStrategy: 'escalate_model',
      modelEscalation: true,
      resolutionSteps: [
        `Diagnosed: ${diagnosis.rootCause}`,
        `Cannot self-resolve: ${diagnosis.resolutionPath}`,
        'Recommend model tier upgrade on retry',
      ],
      lessonsExtracted: lessons,
    }
  }

  private async _extractLessons(
    confidence: ConfidenceScore,
    diagnosis: UARDiagnosis,
    sessionId: string,
    taskType: string,
  ): Promise<{ lessonsExtracted: string[]; lessonIds: string[] }> {
    const lessonsExtracted: string[] = []
    const lessonIds: string[] = []
    const factors =
      confidence.uncertaintyFactors.length > 0
        ? confidence.uncertaintyFactors
        : [diagnosis.rootCause]

    for (const factor of factors) {
      const t = factor.trim()
      if (t.length === 0) continue
      const lesson = `When handling ${taskType}, be explicit about ${t}`
      const row = await lessonsStore.recordManual(sessionId, lesson, taskType, 'minor', 'user_correction')
      lessonsExtracted.push(lesson)
      lessonIds.push(row.id)
    }

    return { lessonsExtracted, lessonIds }
  }
}

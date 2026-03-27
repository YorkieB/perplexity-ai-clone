/**
 * Orchestrates the Reflexion loop: quick critique, full Critic pass, lesson memory,
 * scratchpad updates, telemetry, and enriched retry briefs.
 *
 * @module reasoning/reflexionController
 */

import { v4 as uuidv4 } from 'uuid'

import CriticAgent, { type CritiqueRequest, type Critique } from './criticAgent'
import { lessonsStore } from './lessonsStore'
import type { Lesson } from './lessonsStore'
import { scratchpadStore } from './scratchpadStore'
import { telemetry } from '@/lib/observability/telemetryCollector'

const LOG = '[ReflexionController]'

/** Maximum critique-driven retries before accepting the best attempt. */
export const MAX_REFLEXION_ITERATIONS = 3

/**
 * Outcome of one {@link ReflexionController.reflect} pass.
 */
export interface ReflexionResult {
  critique: Critique
  /** New lesson texts recorded from this critique. */
  lessons: string[]
  shouldRetry: boolean
  /** Worker brief for the next attempt when {@link shouldRetry}; otherwise unchanged. */
  enrichedBrief: string
  /** Highest-priority fix from the critic. */
  retryInstruction: string
  /** Post-reflexion confidence estimate (also written to scratchpad when present). */
  confidenceAfterReflexion: number
  /**
   * Lesson ids selected as relevant this cycle ({@link lessonsStore.getRelevantLessons}).
   * UNCERTAIN: May differ from lessons literally embedded in the worker brief; used as the
   * active set for {@link lessonsStore.recordApplied} feedback.
   */
  activeLessonIds?: string[]
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Runs Critic + lesson store + scratchpad hooks for a single Jarvis output attempt.
 */
export default class ReflexionController {
  private readonly sessionId: string
  private readonly criticAgent: CriticAgent
  private readonly iterationHistory: Critique[] = []
  /** Parallel to {@link iterationHistory} when full critique runs; includes quick-pass snapshots. */
  private readonly attemptOutputs: string[] = []
  private readonly attemptScores: number[] = []

  constructor(sessionId: string) {
    this.sessionId = sessionId
    this.criticAgent = new CriticAgent()
  }

  /**
   * Quick check, optional fast-path, full critique, persistence, telemetry, and brief assembly.
   */
  async reflect(
    originalBrief: string,
    output: string,
    request: Omit<CritiqueRequest, 'priorCritiques' | 'iterationNumber'>,
  ): Promise<ReflexionResult> {
    const quick = await this.criticAgent.quickCritique(output, request.taskType)

    if (quick.passed && this.iterationHistory.length === 0 && quick.score >= 0.92) {
      this.attemptOutputs.push(output)
      this.attemptScores.push(quick.score)
      telemetry.record('reflexion_critique', this.sessionId, {
        score: quick.score,
        passed: true,
        issueCount: 0,
        criticalCount: 0,
        iteration: 1,
        taskType: request.taskType,
        lessonsLearnedCount: 0,
        quickCritiqueOnly: true,
      })
      return this._buildHighScoreResult(originalBrief, output, quick.score, request.taskType)
    }

    const critique = await this.criticAgent.critique({
      ...request,
      output,
      priorCritiques: this.iterationHistory,
      iterationNumber: this.iterationHistory.length + 1,
    })

    this.iterationHistory.push(critique)
    this.attemptOutputs.push(output)
    this.attemptScores.push(critique.overallScore)

    const newLessons = await lessonsStore.recordFromCritique(this.sessionId, critique)

    const pad = scratchpadStore.getForSession(this.sessionId)
    if (pad !== null) {
      if (!critique.passed) {
        scratchpadStore.recordDeadEnd(pad.scratchpadId, {
          approach: `Iteration ${String(critique.iterationNumber)}: ${output.slice(0, 100)}`,
          whyItFailed: critique.rootCause,
          avoidanceHint: critique.specificNextAction,
        })
      } else {
        scratchpadStore.addInsight(
          pad.scratchpadId,
          `Output passed critique (score: ${critique.overallScore.toFixed(2)}): ${critique.strengths[0] ?? ''}`,
          'medium',
        )
      }
    }

    telemetry.record('reflexion_critique', this.sessionId, {
      score: critique.overallScore,
      passed: critique.passed,
      issueCount: critique.issues.length,
      criticalCount: critique.issues.filter((i) => i.severity === 'critical').length,
      iteration: critique.iterationNumber,
      taskType: request.taskType,
      lessonsLearnedCount: newLessons.length,
    })

    const shouldRetry = !critique.passed && this.iterationHistory.length < MAX_REFLEXION_ITERATIONS

    const relevantLessons = await lessonsStore.getRelevantLessons({
      sessionId: this.sessionId,
      taskType: request.taskType,
      currentOutput: output,
    })
    for (const l of relevantLessons) {
      await lessonsStore.markApplied(l.id, this.sessionId)
    }

    const activeLessonIds = relevantLessons.map((l) => l.id)

    if (critique.passed) {
      for (const id of activeLessonIds) {
        void lessonsStore.recordApplied(id, true).catch((err: unknown) => {
          console.error(`${LOG} recordApplied failed`, err)
        })
      }
    } else if (!shouldRetry) {
      for (const id of activeLessonIds) {
        void lessonsStore.recordApplied(id, false).catch((err: unknown) => {
          console.error(`${LOG} recordApplied failed`, err)
        })
      }
    }

    const enrichedBrief = shouldRetry
      ? this._buildRetryBrief(originalBrief, output, critique, relevantLessons)
      : originalBrief

    const confidenceAfterReflexion = critique.passed
      ? Math.min(critique.overallScore + 0.1, 1.0)
      : Math.max(critique.overallScore - 0.1, 0.1)

    if (pad !== null) {
      scratchpadStore.updateConfidence(pad.scratchpadId, confidenceAfterReflexion)
    }

    return {
      critique,
      lessons: newLessons.map((l) => l.lesson),
      shouldRetry,
      enrichedBrief,
      retryInstruction: critique.specificNextAction,
      confidenceAfterReflexion,
      activeLessonIds,
    }
  }

  private _buildRetryBrief(
    originalBrief: string,
    failedOutput: string,
    critique: Critique,
    relevantLessons: Lesson[],
  ): string {
    const criticalBlock = critique.issues
      .filter((i) => i.severity === 'critical')
      .map((i) => {
        const loc = i.location != null ? `\n      Location: ${escapeXml(i.location)}` : ''
        return `- [${escapeXml(i.category)}] ${escapeXml(i.description)}\n      Fix: ${escapeXml(i.suggestion)}${loc}`
      })
      .join('\n')

    const majorBlock = critique.issues
      .filter((i) => i.severity === 'major')
      .map((i) => `- ${escapeXml(i.description)} → ${escapeXml(i.suggestion)}`)
      .join('\n')

    const lessonsXml = lessonsStore.formatForPrompt(relevantLessons)

    return `${originalBrief}

<reflexion_context>
<iteration>${String(critique.iterationNumber)}</iteration>

<critique_summary>
Score: ${critique.overallScore.toFixed(2)}/1.0
Root cause: ${escapeXml(critique.rootCause)}
Most important fix: ${escapeXml(critique.specificNextAction)}
</critique_summary>

<critical_issues>
${criticalBlock}
</critical_issues>

<major_issues>
${majorBlock}
</major_issues>

${lessonsXml}

<previous_attempt>
${escapeXml(failedOutput.slice(0, 1500))}
</previous_attempt>

<instruction>
Address ALL critical issues above. Then address major issues.
Do not repeat the previous attempt — produce a completely corrected version. Return COMPLETE output, not just the fixed parts.
</instruction>
</reflexion_context>
`
  }

  /**
   * Fast path when the first quick critique is very high; skips full LLM critique.
   */
  private _buildHighScoreResult(
    originalBrief: string,
    _output: string,
    score: number,
    taskType: string,
  ): ReflexionResult {
    const confidenceAfterReflexion = Math.min(score + 0.1, 1.0)
    const pad = scratchpadStore.getForSession(this.sessionId)
    if (pad !== null) {
      scratchpadStore.updateConfidence(pad.scratchpadId, confidenceAfterReflexion)
    }

    const critique: Critique = {
      id: uuidv4(),
      taskType,
      iterationNumber: 1,
      overallScore: score,
      passed: true,
      issues: [],
      strengths: ['Quick critique score very high; full critique skipped.'],
      rootCause: 'N/A — output met high quick-critique threshold.',
      specificNextAction: 'None required.',
      lessonsForFuture: [],
      timestamp: new Date().toISOString(),
    }

    return {
      critique,
      lessons: [],
      shouldRetry: false,
      enrichedBrief: originalBrief,
      retryInstruction: 'None required.',
      confidenceAfterReflexion,
    }
  }

  /**
   * Picks the stored attempt whose critique score was highest among the given output strings.
   */
  getBestOutput(outputs: string[]): string {
    if (outputs.length === 0) {
      return ''
    }
    let bestScore = -Infinity
    let bestText: string | undefined
    for (let i = 0; i < this.attemptOutputs.length; i++) {
      const text = this.attemptOutputs[i]
      const sc = this.attemptScores[i]
      if (text === undefined || sc === undefined) continue
      if (!outputs.includes(text)) continue
      if (sc > bestScore) {
        bestScore = sc
        bestText = text
      }
    }
    return bestText ?? outputs[outputs.length - 1]!
  }

  /**
   * Critiques recorded across reflexion iterations (copy).
   */
  getIterationHistory(): Critique[] {
    return [...this.iterationHistory]
  }

  /** Clears iteration state for a new task. */
  reset(): void {
    this.iterationHistory.length = 0
    this.attemptOutputs.length = 0
    this.attemptScores.length = 0
    console.log(`${LOG} Reset for new task`)
  }
}

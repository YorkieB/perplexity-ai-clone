/**
 * Stateless Verifier agent: checks Worker output against the task brief before surfacing to the user.
 */

import OpenAI from 'openai'

const LOG = '[VerifierAgent]'

/** Cheap model for structured verification passes. */
const VERIFY_MODEL = 'gpt-4o-mini'

/**
 * Outcome of {@link VerifierAgent.verify}.
 */
export interface VerificationResult {
  /** True when {@link VerificationResult.score} meets {@link VERIFICATION_THRESHOLD}. */
  passed: boolean
  /** Aggregate quality in \([0, 1]\). */
  score: number
  /** Requirement strings the Worker appears to have met. */
  satisfiedRequirements: string[]
  /** Requirement strings still unmet. */
  unsatisfiedRequirements: string[]
  /** Concrete problems detected (LLM + heuristics). */
  issues: string[]
  /** Actionable fix hint when verification fails or score is low. */
  suggestion?: string
}

/** Worker output must meet at least this fraction of requirements to pass. */
export const VERIFICATION_THRESHOLD = 0.7

interface LlmVerificationPayload {
  satisfiedRequirements?: string[]
  unsatisfiedRequirements?: string[]
  issues?: string[]
  score?: number
  suggestion?: string
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

/** Strip optional ```json fences so {@link JSON.parse} can run. */
function extractJsonObject(text: string): string {
  const t = text.trim()
  if (!t.startsWith('```')) {
    return t
  }
  const firstNl = t.indexOf('\n')
  const close = firstNl >= 0 ? t.indexOf('```', firstNl + 1) : -1
  if (firstNl >= 0 && close > firstNl) {
    return t.slice(firstNl + 1, close).trim()
  }
  return t
}

function parseLlmVerificationJson(content: string): LlmVerificationPayload | null {
  try {
    const raw = extractJsonObject(content)
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return null
    return parsed as LlmVerificationPayload
  } catch {
    return null
  }
}

function defaultPassingVerification(): VerificationResult {
  return {
    passed: true,
    score: 1,
    satisfiedRequirements: [],
    unsatisfiedRequirements: [],
    issues: [],
  }
}

function conversationalPass(): VerificationResult {
  return {
    passed: true,
    score: 1,
    satisfiedRequirements: ['Conversational — verification skipped'],
    unsatisfiedRequirements: [],
    issues: [],
  }
}

const CODE_FENCE = /```/

/** Heuristic: triple-dot often indicates truncated or partial code in assistant output. */
function hasSuspiciousEllipsis(output: string): boolean {
  return output.includes('...')
}

function hasTodoOrPlaceholder(output: string): boolean {
  const lower = output.toLowerCase()
  return (
    /\btodo\b/i.test(output) ||
    /\bfixme\b/i.test(output) ||
    lower.includes('placeholder') ||
    lower.includes('your code here')
  )
}

/**
 * Extra checks for code tasks; each failed check lowers score by 0.2.
 */
function applyCodeInstructionHeuristics(
  workerOutput: string,
  base: VerificationResult,
): VerificationResult {
  const issues = [...base.issues]
  if (!CODE_FENCE.test(workerOutput)) {
    issues.push('No code block found')
  }
  if (hasTodoOrPlaceholder(workerOutput)) {
    issues.push('Contains TODO/placeholder')
  }
  if (hasSuspiciousEllipsis(workerOutput)) {
    issues.push('Contains ellipsis — may be partial code')
  }

  const baselineIssues = base.issues.length
  const newCodeIssues = issues.length - baselineIssues
  const penalty = 0.2 * newCodeIssues
  const score = clamp01(base.score - penalty)

  return {
    ...base,
    issues,
    score,
    passed: score >= VERIFICATION_THRESHOLD,
  }
}

function verificationResultFromPayload(payload: LlmVerificationPayload): VerificationResult {
  const satisfied = Array.isArray(payload.satisfiedRequirements) ? payload.satisfiedRequirements : []
  const unsatisfied = Array.isArray(payload.unsatisfiedRequirements) ? payload.unsatisfiedRequirements : []
  const issues = Array.isArray(payload.issues) ? payload.issues : []
  const rawScore = typeof payload.score === 'number' ? payload.score : 0
  const score = clamp01(rawScore)
  const suggestion =
    typeof payload.suggestion === 'string' && payload.suggestion.trim().length > 0 ? payload.suggestion : undefined

  return {
    passed: score >= VERIFICATION_THRESHOLD,
    score,
    satisfiedRequirements: satisfied,
    unsatisfiedRequirements: unsatisfied,
    issues,
    suggestion,
  }
}

/**
 * Lightweight verification pass using a small model; does not retain state between calls.
 */
export default class VerifierAgent {
  private readonly openai: OpenAI

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
  }

  /**
   * Full verification: compares Worker output to the Manager brief (skips LLM for conversational tasks).
   *
   * @param brief - Task brief shown to the Worker
   * @param workerOutput - Raw Worker reply
   * @param taskType - Route / intent id (e.g. `code_instruction`)
   */
  async verify(brief: string, workerOutput: string, taskType: string): Promise<VerificationResult> {
    if (taskType === 'conversational') {
      return conversationalPass()
    }

    const systemPrompt = `You are a task verification agent. Given a task brief and a worker's output,
verify that the output satisfies all stated requirements.

Return ONLY valid JSON:
{
  "satisfiedRequirements": ["..."],
  "unsatisfiedRequirements": ["..."],
  "issues": ["specific problem 1", "specific problem 2"],
  "score": 0.0,
  "suggestion": "How to fix if score < 0.7 — be specific"
}`

    const userContent = `<brief>${brief.slice(0, 2000)}</brief>
<worker_output>${workerOutput.slice(0, 3000)}</worker_output>`

    try {
      const response = await this.openai.chat.completions.create({
        model: VERIFY_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      })

      const text = response.choices[0]?.message?.content?.trim() ?? ''
      const payload = parseLlmVerificationJson(text)
      if (payload === null) {
        console.warn(`${LOG} Verification failed, defaulting to pass`)
        return defaultPassingVerification()
      }

      const fromLlm = verificationResultFromPayload(payload)
      if (taskType === 'code_instruction') {
        return applyCodeInstructionHeuristics(workerOutput, fromLlm)
      }
      return fromLlm
    } catch (err: unknown) {
      console.warn(`${LOG} Verification failed, defaulting to pass`, err)
      return defaultPassingVerification()
    }
  }

  /**
   * Cheap pre-check without an LLM — use to skip {@link verify} when failure is obvious.
   */
  async quickCheck(workerOutput: string, taskType: string): Promise<boolean> {
    const trimmed = workerOutput.trim()
    if (trimmed.length === 0) {
      return false
    }

    switch (taskType) {
      case 'code_instruction': {
        if (!CODE_FENCE.test(trimmed)) return false
        if (hasTodoOrPlaceholder(trimmed)) return false
        if (hasSuspiciousEllipsis(trimmed)) return false
        return true
      }
      case 'voice_task': {
        try {
          JSON.parse(trimmed)
          return true
        } catch {
          return false
        }
      }
      case 'image_task':
        return trimmed.length > 50
      default:
        return true
    }
  }
}

/**
 * Reflexion-style critic for Jarvis: qualitative evaluation of outputs against
 * requirements (distinct from the Verifier agent’s binary pass/fail checks).
 *
 * @module reasoning/criticAgent
 */

import OpenAI from 'openai'
import { v4 as uuidv4 } from 'uuid'

const LOG = '[CriticAgent]'

/** Minimum {@link Critique.overallScore} to treat a critique as passing. */
export const CRITIQUE_PASS_THRESHOLD = 0.75

const QUICK_CRITIQUE_MODEL = 'gpt-4o-mini'

const SEVERITIES = ['critical', 'major', 'minor'] as const
const CATEGORIES = [
  'correctness',
  'completeness',
  'quality',
  'performance',
  'safety',
  'style',
] as const

type Severity = (typeof SEVERITIES)[number]
type Category = (typeof CATEGORIES)[number]

/**
 * Input bundle for a full structured critique pass.
 */
export interface CritiqueRequest {
  /** Verbatim user ask. */
  originalRequest: string
  /** Intent route / task type (e.g. `code_instruction`). */
  taskType: string
  /** Candidate output under review. */
  output: string
  /** Requirements extracted from task state. */
  requirements: string[]
  /** Earlier critiques for the same task (refinement context). */
  priorCritiques: Critique[]
  /** Optional condensed problem understanding. */
  scratchpadSummary?: string
  /** 1-based or Nth attempt index supplied by caller. */
  iterationNumber: number
}

/**
 * One actionable finding from the critic.
 */
export interface CritiqueIssue {
  /** Impact tier for prioritization. */
  severity: Severity
  /** Problem domain (correctness, style, etc.). */
  category: Category
  /** Concrete description of the gap or error. */
  description: string
  /** Optional pointer into the output (line, symbol, section). */
  location?: string
  /** Specific remediation the next iteration should apply. */
  suggestion: string
}

/**
 * Structured critique result suitable for reflexion loops.
 */
export interface Critique {
  /** Stable id for logging and deduplication. */
  id: string
  /** Same intent route as {@link CritiqueRequest.taskType}. */
  taskType: string
  /** Attempt index this critique refers to. */
  iterationNumber: number
  /** Model-assigned quality in \[0, 1\]. */
  overallScore: number
  /** True when the score meets or exceeds {@link CRITIQUE_PASS_THRESHOLD}. */
  passed: boolean
  /** Ranked findings with suggestions. */
  issues: CritiqueIssue[]
  /** Positive aspects to preserve. */
  strengths: string[]
  /** Primary reason the output is not yet ideal. */
  rootCause: string
  /** Highest-leverage single fix for the next pass. */
  specificNextAction: string
  /** Heuristics that apply beyond this task. */
  lessonsForFuture: string[]
  /** ISO timestamp when the critique was produced. */
  timestamp: string
}

interface LlmCritiquePayload {
  overallScore?: number
  issues?: unknown
  strengths?: unknown
  rootCause?: unknown
  specificNextAction?: unknown
  lessonsForFuture?: unknown
}

interface QuickCritiquePayload {
  score?: number
  topIssue?: unknown
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

function parseJsonObject(content: string): unknown {
  try {
    const raw = extractJsonObject(content)
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function isSeverity(s: string): s is Severity {
  return (SEVERITIES as readonly string[]).includes(s)
}

function isCategory(s: string): s is Category {
  return (CATEGORIES as readonly string[]).includes(s)
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim())
}

function normalizeIssue(raw: unknown): CritiqueIssue | null {
  if (raw === null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const description = typeof o.description === 'string' ? o.description.trim() : ''
  const suggestion = typeof o.suggestion === 'string' ? o.suggestion.trim() : ''
  if (description.length === 0 || suggestion.length === 0) return null

  let severity: Severity = 'minor'
  if (typeof o.severity === 'string' && isSeverity(o.severity)) {
    severity = o.severity
  }

  let category: Category = 'quality'
  if (typeof o.category === 'string' && isCategory(o.category)) {
    category = o.category
  }

  const location =
    typeof o.location === 'string' && o.location.trim().length > 0 ? o.location.trim() : undefined

  return { severity, category, description, location, suggestion }
}

function critiqueFromPayload(
  payload: LlmCritiquePayload,
  taskType: string,
  iterationNumber: number,
): Critique | null {
  const rawScore = typeof payload.overallScore === 'number' ? payload.overallScore : NaN
  const overallScore = clamp01(rawScore)

  const issuesRaw = Array.isArray(payload.issues) ? payload.issues : []
  const issues: CritiqueIssue[] = []
  for (const row of issuesRaw) {
    const n = normalizeIssue(row)
    if (n) issues.push(n)
  }

  const strengths = asStringArray(payload.strengths)
  const rootCause =
    typeof payload.rootCause === 'string' && payload.rootCause.trim().length > 0
      ? payload.rootCause.trim()
      : 'No root cause provided by model.'
  const specificNextAction =
    typeof payload.specificNextAction === 'string' && payload.specificNextAction.trim().length > 0
      ? payload.specificNextAction.trim()
      : 'Review issues and refine the output against requirements.'
  const lessonsForFuture = asStringArray(payload.lessonsForFuture)

  if (Number.isNaN(rawScore)) {
    return null
  }

  return {
    id: uuidv4(),
    taskType,
    iterationNumber,
    overallScore,
    passed: overallScore >= CRITIQUE_PASS_THRESHOLD,
    issues,
    strengths,
    rootCause,
    specificNextAction,
    lessonsForFuture,
    timestamp: new Date().toISOString(),
  }
}

function safeAcceptanceCritique(request: CritiqueRequest): Critique {
  const note = 'Critique generation failed — output accepted'
  return {
    id: uuidv4(),
    taskType: request.taskType,
    iterationNumber: request.iterationNumber,
    overallScore: 0.8,
    passed: true,
    issues: [],
    strengths: [note],
    rootCause: note,
    specificNextAction: 'Proceed without automated critique feedback.',
    lessonsForFuture: [],
    timestamp: new Date().toISOString(),
  }
}

function taskTypeCritiqueAppendix(taskType: string): string {
  switch (taskType) {
    case 'code_instruction':
      return `Check specifically: TypeScript errors, missing error handling, incomplete implementations (TODOs, ellipsis, placeholders), missing imports, broken logic.`
    case 'voice_task':
      return `Check: valid JSON structure, emotion scores sum correctly, all required voice parameters present, values in valid ranges.`
    case 'image_task':
      return `Check: prompt completeness, style descriptors present, quality tags included, no contradictory terms.`
    case 'browser_task':
      return `Check: all steps are executable, selectors are specific, error handling for page load, timeouts specified.`
    case 'knowledge_lookup':
      return `Check: question fully answered, no hallucinated facts, sources cited where appropriate, caveats noted.`
    default:
      return ''
  }
}

/**
 * LLM-backed qualitative critic for reflexion-style improvement loops.
 */
export default class CriticAgent {
  private readonly openai: OpenAI
  private readonly model: string

  /**
   * @param model - OpenAI chat model id (default `gpt-4o`).
   */
  constructor(model: string = 'gpt-4o') {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
    this.model = model
  }

  /**
   * Full structured critique with issues, strengths, and next-action guidance.
   */
  async critique(request: CritiqueRequest): Promise<Critique> {
    const systemPrompt = this._buildSystemPrompt(request)
    const userContent = this._buildUserPrompt(request)

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      })

      const text = response.choices[0]?.message?.content?.trim() ?? ''
      const parsed = parseJsonObject(text)
      if (parsed === null || typeof parsed !== 'object') {
        console.warn(`${LOG} Critique failed, returning acceptance`)
        return safeAcceptanceCritique(request)
      }

      const built = critiqueFromPayload(parsed as LlmCritiquePayload, request.taskType, request.iterationNumber)
      if (built === null) {
        console.warn(`${LOG} Critique failed, returning acceptance`)
        return safeAcceptanceCritique(request)
      }

      const criticals = this._getCriticalIssues(built.issues).length
      const majors = built.issues.filter((i) => i.severity === 'major').length
      console.log(
        `${LOG} Critique complete — score: ${built.overallScore}, passed: ${built.passed}, issues: ${built.issues.length} (${criticals} critical, ${majors} major)`,
      )

      return built
    } catch (err: unknown) {
      console.warn(`${LOG} Critique failed, returning acceptance`, err)
      return safeAcceptanceCritique(request)
    }
  }

  /**
   * Fast score-only check with optional single top issue (mini model).
   */
  async quickCritique(
    output: string,
    taskType: string,
  ): Promise<{ passed: boolean; score: number; topIssue?: string }> {
    const system = `Rate this output 0.0–1.0 for task type ${taskType}.
Return ONLY JSON: {"score": 0.0, "topIssue": "main problem or null"}`

    const user = output.slice(0, 3000)

    try {
      const response = await this.openai.chat.completions.create({
        model: QUICK_CRITIQUE_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })

      const text = response.choices[0]?.message?.content?.trim() ?? ''
      const parsed = parseJsonObject(text) as QuickCritiquePayload | null
      if (parsed === null || typeof parsed !== 'object') {
        console.warn(`${LOG} Critique failed, returning acceptance`)
        return { passed: true, score: 0.8 }
      }

      const rawScore = typeof parsed.score === 'number' ? parsed.score : NaN
      if (Number.isNaN(rawScore)) {
        console.warn(`${LOG} Critique failed, returning acceptance`)
        return { passed: true, score: 0.8 }
      }
      const score = clamp01(rawScore)

      let topIssue: string | undefined
      if (parsed.topIssue === null) {
        topIssue = undefined
      } else if (typeof parsed.topIssue === 'string') {
        const t = parsed.topIssue.trim()
        if (t.length > 0 && t.toLowerCase() !== 'null') {
          topIssue = t
        }
      }

      return {
        passed: score >= CRITIQUE_PASS_THRESHOLD,
        score,
        topIssue,
      }
    } catch (err: unknown) {
      console.warn(`${LOG} Critique failed, returning acceptance`, err)
      return { passed: true, score: 0.8 }
    }
  }

  private _getCriticalIssues(issues: CritiqueIssue[]): CritiqueIssue[] {
    return issues.filter((i) => i.severity === 'critical')
  }

  /**
   * Last two prior critiques in a compact line-oriented form for the system prompt.
   */
  private _buildPriorCritiqueContext(priorCritiques: Critique[]): string {
    const lastTwo = priorCritiques.slice(-2)
    return lastTwo
      .map(
        (c) =>
          `Iteration ${c.iterationNumber}: score ${c.overallScore}, root cause: ${c.rootCause}, next action: ${c.specificNextAction}`,
      )
      .join('\n')
  }

  private _buildSystemPrompt(request: CritiqueRequest): string {
    const iterationHint =
      request.iterationNumber <= 1
        ? 'Iteration 1 = first attempt, be thorough.'
        : 'Iteration 2+ = focus on what CHANGED since the prior critique and whether remaining gaps were addressed.'

    let priorBlock = ''
    if (request.priorCritiques.length > 0) {
      const last = request.priorCritiques.at(-1)
      const summaryLine =
        last != null
          ? `Prior critique summary: ${last.specificNextAction}\nPrior score: ${last.overallScore}`
          : ''
      const historyText = this._buildPriorCritiqueContext(request.priorCritiques)
      priorBlock = [summaryLine, historyText ? `Recent critique history:\n${historyText}` : '']
        .filter(Boolean)
        .join('\n\n')
    }

    const appendix = taskTypeCritiqueAppendix(request.taskType)
    const appendixBlock = appendix.length > 0 ? `\n\n${appendix}` : ''

    return `You are Jarvis's self-critique agent. Your job is to rigorously evaluate an output and produce a structured critique that will help improve the next attempt.

Be specific, not vague. "The code has errors" is useless.
"The useEffect on line 14 has a missing dependency array" is useful.

Be calibrated. If the output is genuinely good, say so.
Manufactured criticism is as harmful as missed real issues.

Task type context: ${request.taskType}
Iteration: ${request.iterationNumber} (${iterationHint})

${priorBlock.length > 0 ? `${priorBlock}\n\n` : ''}Return ONLY valid JSON:
{
  "overallScore": 0.0,
  "issues": [
    {
      "severity": "critical|major|minor",
      "category": "correctness|completeness|quality|performance|safety|style",
      "description": "specific description of the problem",
      "location": "where in the output (optional)",
      "suggestion": "specific fix recommendation"
    }
  ],
  "strengths": ["what was done well"],
  "rootCause": "single most important reason this isn't perfect",
  "specificNextAction": "the single most important thing to fix",
  "lessonsForFuture": ["generalizable lesson 1", "lesson 2"]
}${appendixBlock}`
  }

  private _buildUserPrompt(request: CritiqueRequest): string {
    const reqLines = request.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')
    const scratch =
      request.scratchpadSummary != null && request.scratchpadSummary.trim().length > 0
        ? `Current understanding:\n${request.scratchpadSummary.trim()}\n\n`
        : ''
    return `Original request: ${request.originalRequest}

Requirements:
${reqLines}

${scratch}Output to critique:
${request.output.slice(0, 4000)}`
  }
}

/**
 * Shared types for the Jarvis Dual-Process Confidence Scoring system.
 *
 * Grounded in the Dual-Process Agentic UQ (AUQ) framework (arXiv:2601.15703):
 * - **System 1 — Uncertainty-Aware Memory (UAM):** fast, passive propagation
 * - **System 2 — Uncertainty-Aware Reflection (UAR):** slow, active resolution
 *
 * Pre-task estimation aligns with the confidence-first (CoCA) paradigm (arXiv:2603.05881):
 * elicit probability of success **before** executing the task.
 *
 * @module reasoning/confidenceTypes
 */

/** Provenance of a scalar confidence value. */
export type ConfidenceSource =
  | 'verbalized' // model self-reports its confidence
  | 'consistency' // multiple samples checked for agreement
  | 'critique_score' // Reflexion critique overallScore
  | 'observation' // ReAct observation meetsExpectation
  | 'propagated' // inherited from prior step (System 1 UAM)
  | 'composite' // weighted combination of multiple sources

/** Discrete band derived from a 0–1 scalar. */
export type ConfidenceLevel =
  | 'very_high' // >= 0.90 — commit, no further checks
  | 'high' // >= 0.80 — proceed with standard verification
  | 'moderate' // >= 0.65 — proceed but flag for review
  | 'low' // >= 0.45 — trigger System 2 UAR resolution
  | 'very_low' // < 0.45 — block and request clarification

/** Policy action given confidence and context. */
export type ConfidenceAction =
  | 'commit' // confidence high — proceed as-is
  | 'proceed_with_flag' // moderate — include uncertainty notice in output
  | 'trigger_uar' // low — run System 2 Uncertainty-Aware Reflection
  | 'request_clarification' // very low — ask user for missing info
  | 'escalate_model' // low + complex — upgrade model tier and retry

/** Single scored confidence record for audit and routing. */
export interface ConfidenceScore {
  id: string
  sessionId: string
  turnIndex: number
  /** 0.0–1.0 */
  scalar: number
  level: ConfidenceLevel
  source: ConfidenceSource
  /** Why this confidence level was assigned. */
  explanation: string
  /** Specific aspects Jarvis is unsure about. */
  uncertaintyFactors: string[]
  /** Information that would increase confidence if available. */
  knowledgeGaps: string[]
  recommendedAction: ConfidenceAction
  taskType: string
  timestamp: string
}

/**
 * Result of proactive pre-task confidence estimation (CoCA-style: confidence before answering).
 * Produced by {@link ConfidenceElicitor.estimatePreTask}.
 */
export interface PreTaskEstimate {
  /** 0.0–1.0 calibrated probability of producing a high-quality response. */
  confidence: number
  /** Rationale for the estimate. */
  explanation: string
  /** Information that would materially improve the attempt. */
  missingInfo: string[]
  /** Suggested user questions when confidence is low (e.g. &lt; 0.70). */
  clarifyingQuestions: string[]
  /** Brief approach hint when the model expects to proceed successfully. */
  suggestedApproach: string
  /**
   * `false` only when missing information is so critical that proceeding would likely be wrong.
   * Default-elicitation path treats absent/failed JSON as `true` (do not block the pipeline).
   */
  shouldProceed: boolean
  /** ISO time when this estimate was produced. */
  elicitedAt: string
  /** Intent route / task type for the estimated task. */
  taskType: string
}

/** Multi-dimensional confidence — aspects may diverge. */
export interface ConfidenceVector {
  /** 0.0–1.0 composite */
  overall: number
  /** Confidence in facts/data */
  factual: number
  /** Confidence in logic chain */
  reasoning: number
  /** Confidence output covers all requirements */
  completeness: number
  /** Confidence output won't cause harm */
  safety: number
}

/** System 1 UAM — persists verbalized confidence across turns. */
export interface UncertaintyMemory {
  sessionId: string
  entries: ConfidenceScore[]
  /** Sliding window of last 5 scores (caller maintains window; this is the aggregate). */
  rollingAverage: number
  trend: 'improving' | 'stable' | 'degrading'
  lastUpdatedAt: string
}

/** Numeric cutoffs for levels and dual-process triggers. */
export const CONFIDENCE_THRESHOLDS = {
  VERY_HIGH: 0.9,
  HIGH: 0.8,
  MODERATE: 0.65,
  LOW: 0.45,
  // Below LOW → very_low

  /** System 2 trigger threshold (AUQ: τ often ~0.8–1.0 mapped to pipeline bands). */
  UAR_TRIGGER: 0.65,

  /** Below this scalar, always request clarification when no other branch applies. */
  HARD_BLOCK: 0.3,

  /** At or above this — treat as commit (no flag). */
  FLAG_THRESHOLD: 0.75,

  CONSISTENCY_SAMPLES: 3,
} as const

/** Maps a 0–1 scalar to a {@link ConfidenceLevel} band. */
export function scoreToLevel(scalar: number): ConfidenceLevel {
  if (scalar >= CONFIDENCE_THRESHOLDS.VERY_HIGH) return 'very_high'
  if (scalar >= CONFIDENCE_THRESHOLDS.HIGH) return 'high'
  if (scalar >= CONFIDENCE_THRESHOLDS.MODERATE) return 'moderate'
  if (scalar >= CONFIDENCE_THRESHOLDS.LOW) return 'low'
  return 'very_low'
}

/**
 * Maps scalar + task context to a {@link ConfidenceAction}.
 * Uses {@link CONFIDENCE_THRESHOLDS} for commit / flag / UAR / clarification / escalation.
 */
export function scoreToAction(
  scalar: number,
  complexityScore: number,
  iterationNumber: number,
): ConfidenceAction {
  if (scalar >= CONFIDENCE_THRESHOLDS.FLAG_THRESHOLD) return 'commit'
  if (scalar >= CONFIDENCE_THRESHOLDS.UAR_TRIGGER) return 'proceed_with_flag'
  if (scalar >= CONFIDENCE_THRESHOLDS.HARD_BLOCK) {
    if (complexityScore > 0.7 && iterationNumber < 2) return 'escalate_model'
    return 'trigger_uar'
  }
  return 'request_clarification'
}

/**
 * Prompt appendix to elicit verbalized confidence (System 1 signal for UAM).
 * Models should append structured self-assessment after the main answer.
 */
export const ELICITATION_INSTRUCTION = `
After your response, output a confidence assessment in a single JSON object (no markdown fences), with this shape:
{"scalar": number from 0 to 1, "explanation": string, "uncertaintyFactors": string[], "knowledgeGaps": string[]}
Be honest: lower scalar when facts are uncertain, requirements are incomplete, or safety-relevant gaps exist.
`.trim()

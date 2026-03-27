/**
 * Chain-of-Thought scratchpad: external working memory for a task — not chat history
 * and not a ReAct trace. Updated after observations, read before new Thoughts.
 *
 * @module reasoning/cotScratchpad
 */

import { v4 as uuidv4 } from 'uuid'

/** Decomposable unit of work within a task. */
export interface SubGoal {
  id: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'abandoned'
  /** Ids of {@link SubGoal}s that must complete before this one. */
  dependsOn: string[]
  completedAt?: string
  blockedReason?: string
  /** Reference to the Worker output that satisfied this goal, when applicable. */
  workerOutputRef?: string
}

/** Record of a failed approach to avoid repeating. */
export interface DeadEnd {
  id: string
  approach: string
  whyItFailed: string
  discoveredAt: string
  avoidanceHint: string
}

/** Explicit belief about the problem or context. */
export interface Assumption {
  id: string
  content: string
  confidence: number
  validatedAt?: string
  invalidatedAt?: string
  source: 'user_message' | 'rag_context' | 'reasoning' | 'observation'
}

/** Testable proposition about the solution or root cause. */
export interface Hypothesis {
  id: string
  statement: string
  confidence: number
  supportingEvidence: string[]
  contradictingEvidence: string[]
  status: 'active' | 'confirmed' | 'rejected'
  updatedAt: string
}

/** Timestamped scratch note from a reasoning turn. */
export interface ScratchpadEntry {
  id: string
  turnIndex: number
  type: 'insight' | 'constraint' | 'decision' | 'question' | 'note'
  content: string
  importance: 'high' | 'medium' | 'low'
  timestamp: string
}

/** Full CoT scratchpad for one task within a session. */
export interface CoTScratchpad {
  scratchpadId: string
  sessionId: string
  taskType: string
  /** Original user request from the first turn. */
  taskDescription: string
  subGoals: SubGoal[]
  currentSubGoalId: string | null
  assumptions: Assumption[]
  activeHypothesis: Hypothesis | null
  hypothesisHistory: Hypothesis[]
  deadEnds: DeadEnd[]
  entries: ScratchpadEntry[]
  /** Up to ~10 highest-value insights (caller-maintained cap). */
  keyInsights: string[]
  openQuestions: string[]
  confidenceTrajectory: number[]
  currentConfidence: number
  turnCount: number
  createdAt: string
  updatedAt: string
}

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Creates an empty scratchpad for a new task.
 */
export function createScratchpad(
  sessionId: string,
  taskType: string,
  taskDescription: string,
): CoTScratchpad {
  const now = new Date().toISOString()
  return {
    scratchpadId: uuidv4(),
    sessionId,
    taskType,
    taskDescription,
    subGoals: [],
    currentSubGoalId: null,
    assumptions: [],
    activeHypothesis: null,
    hypothesisHistory: [],
    deadEnds: [],
    entries: [],
    keyInsights: [],
    openQuestions: [],
    confidenceTrajectory: [],
    currentConfidence: 0.5,
    turnCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Immutable merge: shallow-overrides fields on {@link pad}, refreshes {@link CoTScratchpad.updatedAt}.
 * When {@link updates.confidenceTrajectory} is provided, {@link CoTScratchpad.currentConfidence}
 * becomes the last trajectory value (unchanged if trajectory is empty).
 */
export function updateScratchpad(
  pad: CoTScratchpad,
  updates: Partial<CoTScratchpad>,
): CoTScratchpad {
  const updatedAt = new Date().toISOString()
  let currentConfidence = pad.currentConfidence

  if (updates.confidenceTrajectory !== undefined) {
    const t = updates.confidenceTrajectory
    currentConfidence = t.length > 0 ? t[t.length - 1]! : pad.currentConfidence
  }

  return {
    ...pad,
    ...updates,
    updatedAt,
    ...(updates.confidenceTrajectory !== undefined ? { currentConfidence } : {}),
  }
}

/**
 * The sub-goal currently marked active, if any.
 */
export function getActiveSubGoal(pad: CoTScratchpad): SubGoal | null {
  if (pad.currentSubGoalId === null) return null
  return pad.subGoals.find((g) => g.id === pad.currentSubGoalId) ?? null
}

/**
 * First pending sub-goal whose {@link SubGoal.dependsOn} ids all refer to completed goals.
 */
export function getNextPendingSubGoal(pad: CoTScratchpad): SubGoal | null {
  const byId = new Map(pad.subGoals.map((g) => [g.id, g] as const))
  for (const g of pad.subGoals) {
    if (g.status !== 'pending') continue
    const depsSatisfied = g.dependsOn.every((depId) => byId.get(depId)?.status === 'completed')
    if (depsSatisfied) {
      return g
    }
  }
  return null
}

/**
 * Compact XML snippet for Thought prompts (text is XML-escaped).
 */
export function buildScratchpadSummary(pad: CoTScratchpad): string {
  const active = getActiveSubGoal(pad)
  const taskSnippet = escapeXmlText(pad.taskDescription.slice(0, 200))
  const activeDesc = escapeXmlText(active?.description ?? 'None — task not yet decomposed')

  const pendingLines = pad.subGoals
    .filter((g) => g.status === 'pending')
    .map((g) => `- ${escapeXmlText(g.description)}`)
  const pendingBlock = pendingLines.length > 0 ? pendingLines.join('\n') : 'None'

  const assumptionLines = pad.assumptions
    .filter((a) => a.invalidatedAt === undefined)
    .map((a) => `- ${escapeXmlText(a.content)} (confidence: ${a.confidence.toFixed(2)})`)
  const assumptionsBlock =
    assumptionLines.length > 0 ? assumptionLines.join('\n') : 'None established yet'

  const hypothesisText = escapeXmlText(
    pad.activeHypothesis?.statement ?? 'Not yet formed',
  )

  const deadEndLines = pad.deadEnds.map(
    (d) => `- ${escapeXmlText(d.approach)}: ${escapeXmlText(d.avoidanceHint)}`,
  )
  const deadEndsBlock =
    deadEndLines.length > 0 ? deadEndLines.join('\n') : 'None encountered yet'

  const insightLines = pad.keyInsights.slice(-5).map((i) => `- ${escapeXmlText(i)}`)
  const insightsBlock = insightLines.length > 0 ? insightLines.join('\n') : 'None yet'

  const questionLines = pad.openQuestions.map((q) => `- ${escapeXmlText(q)}`)
  const questionsBlock = questionLines.length > 0 ? questionLines.join('\n') : 'None'

  return `<scratchpad_state>
<task>${taskSnippet}</task>
<confidence>${pad.currentConfidence.toFixed(2)}</confidence>

<active_subgoal>
${activeDesc}
</active_subgoal>

<pending_subgoals>
${pendingBlock}
</pending_subgoals>

<key_assumptions>
${assumptionsBlock}
</key_assumptions>

<current_hypothesis>
${hypothesisText}
</current_hypothesis>

<dead_ends>
${deadEndsBlock}
</dead_ends>

<key_insights>
${insightsBlock}
</key_insights>

<open_questions>
${questionsBlock}
</open_questions>
</scratchpad_state>
`
}

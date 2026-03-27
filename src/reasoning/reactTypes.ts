/**
 * Shared types for the Jarvis ReAct (Reason + Act) reasoning engine:
 * {@link Thought}, {@link Action}, {@link Observation}, step traces, and limits.
 *
 * @module reasoning/reactTypes
 */

/**
 * Category of internal reasoning produced before or after an action.
 */
export type ThoughtType =
  /** Understanding what the user actually wants. */
  | 'problem_analysis'
  /** Deciding the approach before acting. */
  | 'plan_formation'
  /** Explaining why this specific action. */
  | 'action_justification'
  /** Evaluating what happened after an action. */
  | 'observation_analysis'
  /** Understanding what went wrong. */
  | 'error_diagnosis'
  /** Planning how to improve on a prior attempt. */
  | 'refinement_reasoning'
  /** Assessing confidence before committing. */
  | 'uncertainty_check'
  /** Verifying the task is actually done. */
  | 'completion_check'

/**
 * Kind of external or orchestrated step the engine may take after a thought.
 */
export type ActionType =
  /** Run a Worker on the current brief. */
  | 'execute_task'
  /** Query session or long-term index. */
  | 'retrieve_context'
  /** Fire a web search. */
  | 'search_web'
  /** Ask user for missing information. */
  | 'request_clarification'
  /** Break complex task into sub-tasks. */
  | 'decompose_task'
  /** Choose a Tree-of-Thoughts branch (Phase 4 integration point). */
  | 'select_branch'
  /** Task is finished; return final answer. */
  | 'complete'

/**
 * High-level outcome of an action relative to the preceding thought’s expectations.
 */
export type ObservationStatus =
  /** Action achieved what the thought expected. */
  | 'success'
  /** Action worked but output is incomplete. */
  | 'partial'
  /** Action failed or produced wrong result. */
  | 'failure'
  /** Result differed from what the thought predicted. */
  | 'unexpected'
  /** Result is close but needs iteration. */
  | 'needs_refinement'

/**
 * One reasoning beat: structured internal monologue before acting.
 */
export interface Thought {
  /** Stable identifier (e.g. uuid). */
  id: string
  type: ThoughtType
  /** Natural-language reasoning content. */
  content: string
  /** Intent route / task channel, e.g. `code_instruction`. */
  taskType: string
  /** Self-assessed certainty in [0, 1]. */
  confidence: number
  /** Explicit assumptions the thought relies on. */
  assumptions: string[]
  /** Potential failure modes or downside risks. */
  risks: string[]
  /** Rejected approaches and brief rationale. */
  alternativesConsidered: string[]
  /** ISO-8601 creation time. */
  timestamp: string
  /** Position within the parent conversation or trace. */
  turnIndex: number
}

/**
 * A concrete step to execute, linked to the thought that authorised it.
 */
export interface Action {
  id: string
  type: ActionType
  /** Human-readable summary of what this action does. */
  description: string
  /** Type-specific payload (tool args, query text, etc.). */
  parameters: Record<string, unknown>
  /** {@link Thought.id} that led to this action. */
  triggeredByThoughtId: string
  /** ISO-8601 creation time. */
  timestamp: string
}

/**
 * Feedback from the environment or executor after an {@link Action}.
 */
export interface Observation {
  id: string
  status: ObservationStatus
  /** Summary of what was observed or returned. */
  content: string
  /** {@link Action.id} that produced this observation. */
  triggeredByActionId: string
  /** Whether the outcome matched the preceding thought’s prediction. */
  meetsExpectation: boolean
  /** Notable unexpected aspects of the result. */
  surprises: string[]
  /** Optional hint for the next reasoning iteration. */
  nextThoughtHint?: string
  /** ISO-8601 creation time. */
  timestamp: string
}

/**
 * One full Reason → Act → Observe cycle in order.
 */
export interface ReActStep {
  stepIndex: number
  thought: Thought
  action: Action
  observation: Observation
  /** Wall-clock milliseconds for this cycle. */
  durationMs: number
}

/**
 * Full episodic record of a ReAct run for a session / task.
 */
export interface ReActTrace {
  /** Trace identifier (e.g. uuid). */
  traceId: string
  sessionId: string
  taskType: string
  steps: ReActStep[]
  /** Final user-facing answer when {@link ActionType} `complete` succeeds. */
  finalAnswer?: string
  totalThoughts: number
  totalActions: number
  completedSuccessfully: boolean
  /** Set when the trace stops without a successful completion. */
  abortReason?: string
  /** ISO-8601 trace start. */
  startedAt: string
  /** ISO-8601 trace end, if finished. */
  completedAt?: string
  totalDurationMs: number
}

/**
 * Maximum Thought → Action → Observation cycles before forcing completion.
 * Guards against unbounded reasoning loops.
 */
export const MAX_REACT_STEPS = 8

/**
 * Minimum {@link Thought.confidence} required before emitting an {@link Action}.
 * Below this, the engine should elaborate with another thought first.
 */
export const THOUGHT_CONFIDENCE_THRESHOLD = 0.65

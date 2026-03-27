/**
 * Shared task state for Manager ↔ Worker agent handoff in Jarvis.
 */

import { v4 as uuidv4 } from 'uuid'

/** High-level intent shape aligned with the semantic router / orchestrator. */
export type TaskType =
  | 'code_instruction'
  | 'knowledge_lookup'
  | 'voice_task'
  | 'image_task'
  | 'browser_task'
  | 'file_task'
  | 'conversational'
  | 'clarification_needed'
  | 'unknown'

/** Reference to a concrete artefact (code, config, media prompt, etc.). */
export interface ArtefactRef {
  type: 'code' | 'config' | 'data' | 'text' | 'image_prompt' | 'voice_config' | 'other'
  /** Full body of the artefact. */
  content: string
  /** Programming or markup language when {@link ArtefactRef.type} is `code`. */
  language?: string
  /** Human label: filename, path, or short description. */
  sourceName?: string
  /** Conversation turn index where this artefact appeared. */
  turnIndex: number
}

/** A user-stated goal that may later be superseded. */
export interface TaskRequirement {
  /** Natural-language description of what the user wants. */
  description: string
  /** Turn index when this requirement was added. */
  addedAtTurn: number
  /** When set, a later requirement index or id that replaces this one (optional convention). */
  supersededBy?: number
}

/** Full mutable snapshot of a single task within a session. */
export interface TaskState {
  /** Stable id for this task instance. */
  taskId: string
  taskType: TaskType
  sessionId: string

  /** Main focus of work (e.g. current file or snippet). */
  primaryArtefact: ArtefactRef | null
  /** Supporting snippets or attachments. */
  additionalArtefacts: ArtefactRef[]
  /** All requirements ever recorded (including superseded). */
  requirements: TaskRequirement[]
  /** Derived: non-superseded requirements; kept in sync by {@link updateTaskState}. */
  activeRequirements: TaskRequirement[]

  turnCount: number
  firstTurnIndex: number
  lastTurnIndex: number

  /** Manager believes it can brief the Worker. */
  isReadyForWorker: boolean
  /** Manager must ask the user for more detail. */
  needsClarification: boolean
  clarificationQuestion?: string

  lastWorkerOutput?: string
  iterationCount: number

  createdAt: string
  updatedAt: string
}

function filterActiveRequirementsSorted(requirements: TaskRequirement[]): TaskRequirement[] {
  return requirements
    .filter((r) => r.supersededBy === undefined)
    .slice()
    .sort((a, b) => a.addedAtTurn - b.addedAtTurn)
}

/**
 * Create an empty {@link TaskState} for a new task in `sessionId`.
 *
 * @param sessionId - Owning chat/session id
 * @param taskType - Classified or provisional task kind
 */
export function createTaskState(sessionId: string, taskType: TaskType): TaskState {
  const now = new Date().toISOString()
  return {
    taskId: uuidv4(),
    taskType,
    sessionId,
    primaryArtefact: null,
    additionalArtefacts: [],
    requirements: [],
    activeRequirements: [],
    turnCount: 0,
    firstTurnIndex: 0,
    lastTurnIndex: 0,
    isReadyForWorker: false,
    needsClarification: false,
    iterationCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Immutable merge: shallow-spread `updates` over `state`, refresh {@link TaskState.updatedAt},
 * and recompute {@link TaskState.activeRequirements} from {@link TaskState.requirements}.
 */
export function updateTaskState(state: TaskState, updates: Partial<TaskState>): TaskState {
  const merged: TaskState = {
    ...state,
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  merged.activeRequirements = filterActiveRequirementsSorted(merged.requirements)
  return merged
}

/**
 * Active requirements: `supersededBy` unset, ordered by {@link TaskRequirement.addedAtTurn}.
 */
export function getActiveRequirements(state: TaskState): TaskRequirement[] {
  return filterActiveRequirementsSorted(state.requirements)
}

/** Escape `]]>` sequences inside CDATA payloads. */
function cdataBody(text: string): string {
  return text.replace(/\]\]>/g, ']]]]><![CDATA[>')
}

function wrapCdata(content: string): string {
  return `<![CDATA[${cdataBody(content)}]]>`
}

/**
 * Single XML-like brief for the Worker (only context it should rely on).
 * Empty sections are omitted. Content is embedded in CDATA to preserve code and markup.
 */
export function buildWorkerBrief(state: TaskState): string {
  const lines: string[] = ['<task_brief>', `  <task_type>${state.taskType}</task_type>`]

  if (state.primaryArtefact !== null) {
    const a = state.primaryArtefact
    const langAttr = a.language !== undefined && a.language.length > 0 ? ` language="${a.language}"` : ''
    lines.push(`  <primary_artefact type="${a.type}"${langAttr}>`)
    lines.push(`  ${wrapCdata(a.content)}`)
    lines.push(`  </primary_artefact>`)
  }

  if (state.additionalArtefacts.length > 0) {
    lines.push('  <additional_artefacts>')
    state.additionalArtefacts.forEach((a, i) => {
      const n = i + 1
      const langAttr = a.language !== undefined && a.language.length > 0 ? ` language="${a.language}"` : ''
      lines.push(`    <artefact_${String(n)} type="${a.type}"${langAttr}>`)
      lines.push(`    ${wrapCdata(a.content)}`)
      lines.push(`    </artefact_${String(n)}>`)
    })
    lines.push('  </additional_artefacts>')
  }

  const active = getActiveRequirements(state)
  if (active.length > 0) {
    lines.push('  <requirements>')
    active.forEach((r, idx) => {
      lines.push(`    ${String(idx + 1)}. ${r.description}`)
    })
    lines.push('  </requirements>')
  }

  lines.push(`  <iteration>${String(state.iterationCount)}</iteration>`)

  if (state.lastWorkerOutput !== undefined && state.lastWorkerOutput.trim().length > 0) {
    lines.push('  <previous_output>')
    lines.push(`  ${wrapCdata(state.lastWorkerOutput)}`)
    lines.push('  </previous_output>')
  }

  lines.push('</task_brief>')
  return lines.join('\n')
}

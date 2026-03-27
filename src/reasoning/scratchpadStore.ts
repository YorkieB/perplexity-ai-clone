/**
 * In-memory store for {@link CoTScratchpad} instances keyed by scratchpad and session.
 *
 * @module reasoning/scratchpadStore
 */

import { v4 as uuidv4 } from 'uuid'

import type {
  Assumption,
  CoTScratchpad,
  DeadEnd,
  Hypothesis,
  ScratchpadEntry,
  SubGoal,
} from './cotScratchpad'
import { createScratchpad, getNextPendingSubGoal, updateScratchpad } from './cotScratchpad'
import { telemetry } from '@/lib/observability/telemetryCollector'

const LOG = '[ScratchpadStore]'

/**
 * Persists and mutates CoT scratchpads for Jarvis tasks.
 */
export default class ScratchpadStore {
  private readonly pads = new Map<string, CoTScratchpad>()
  /** sessionId → active scratchpadId */
  private readonly sessionIndex = new Map<string, string>()

  /**
   * Starts a new scratchpad and binds it as the active pad for {@link sessionId}.
   */
  create(sessionId: string, taskType: string, taskDescription: string): CoTScratchpad {
    const pad = createScratchpad(sessionId, taskType, taskDescription)
    this.sessionIndex.set(sessionId, pad.scratchpadId)
    console.log(`${LOG} Created scratchpad ${pad.scratchpadId} for session ${sessionId}`)
    return this.save(pad)
  }

  /** Lookup by scratchpad id. */
  get(scratchpadId: string): CoTScratchpad | null {
    return this.pads.get(scratchpadId) ?? null
  }

  /** Active scratchpad for the session, if any. */
  getForSession(sessionId: string): CoTScratchpad | null {
    const id = this.sessionIndex.get(sessionId)
    if (id === undefined) return null
    return this.pads.get(id) ?? null
  }

  /**
   * Appends sub-goals with generated ids; may set {@link CoTScratchpad.currentSubGoalId}.
   */
  addSubGoals(scratchpadId: string, subGoals: Omit<SubGoal, 'id'>[]): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    const withIds: SubGoal[] = subGoals.map((g) => ({ ...g, id: uuidv4() }))
    let next = updateScratchpad(pad, {
      subGoals: [...pad.subGoals, ...withIds],
    })
    if (next.currentSubGoalId === null) {
      const first = getNextPendingSubGoal(next)
      next = updateScratchpad(next, { currentSubGoalId: first?.id ?? null })
    }
    console.log(`${LOG} Added ${String(withIds.length)} sub-goals to ${scratchpadId}`)
    return this.save(next)
  }

  /**
   * Appends sub-goals that already have ids and {@link SubGoal.dependsOn} links
   * (e.g. LLM decomposition with stable dependency ids).
   */
  appendStructuredSubGoals(scratchpadId: string, goals: SubGoal[]): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    let next = updateScratchpad(pad, {
      subGoals: [...pad.subGoals, ...goals],
    })
    if (next.currentSubGoalId === null) {
      const first = getNextPendingSubGoal(next)
      next = updateScratchpad(next, { currentSubGoalId: first?.id ?? null })
    }
    console.log(`${LOG} Appended ${String(goals.length)} structured sub-goals to ${scratchpadId}`)
    return this.save(next)
  }

  /**
   * Marks non-completed sub-goals as abandoned (e.g. before redecomposition).
   */
  abandonIncompleteSubGoals(scratchpadId: string): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    const subGoals = pad.subGoals.map((g) =>
      g.status === 'completed' || g.status === 'abandoned'
        ? g
        : { ...g, status: 'abandoned' as const },
    )
    return this.save(
      updateScratchpad(pad, {
        subGoals,
        currentSubGoalId: null,
      }),
    )
  }

  /**
   * Marks a sub-goal completed and advances {@link CoTScratchpad.currentSubGoalId}.
   */
  completeSubGoal(
    scratchpadId: string,
    subGoalId: string,
    workerOutputRef?: string,
  ): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    const now = new Date().toISOString()
    const subGoals = pad.subGoals.map((g) =>
      g.id === subGoalId
        ? {
            ...g,
            status: 'completed' as const,
            completedAt: now,
            ...(workerOutputRef !== undefined ? { workerOutputRef } : {}),
          }
        : g,
    )
    let next = updateScratchpad(pad, { subGoals })
    const nxt = getNextPendingSubGoal(next)
    next = updateScratchpad(next, { currentSubGoalId: nxt?.id ?? null })
    console.log(`${LOG} SubGoal completed: ${subGoalId}`)
    return this.save(next)
  }

  /** Records a new assumption. */
  addAssumption(scratchpadId: string, assumption: Omit<Assumption, 'id'>): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    const row: Assumption = { ...assumption, id: uuidv4() }
    return this.save(
      updateScratchpad(pad, {
        assumptions: [...pad.assumptions, row],
      }),
    )
  }

  /**
   * Marks an assumption invalid and logs a high-importance note.
   */
  invalidateAssumption(
    scratchpadId: string,
    assumptionId: string,
    reason: string,
  ): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    const now = new Date().toISOString()
    const assumptions = pad.assumptions.map((a) =>
      a.id === assumptionId ? { ...a, invalidatedAt: now } : a,
    )
    const entry = this.makeEntry(pad, {
      type: 'note',
      content: `Assumption invalidated: ${reason}`,
      importance: 'high',
    })
    return this.save(
      updateScratchpad(pad, {
        assumptions,
        entries: [...pad.entries, entry],
      }),
    )
  }

  /**
   * Rotates the active hypothesis into history and sets a new active one.
   */
  updateHypothesis(
    scratchpadId: string,
    hypothesis: Omit<Hypothesis, 'id' | 'updatedAt'>,
  ): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    const now = new Date().toISOString()
    const history =
      pad.activeHypothesis !== null
        ? [...pad.hypothesisHistory, pad.activeHypothesis]
        : pad.hypothesisHistory
    const active: Hypothesis = {
      ...hypothesis,
      id: uuidv4(),
      updatedAt: now,
    }
    console.log(`${LOG} Hypothesis updated: ${hypothesis.statement.slice(0, 60)}`)
    return this.save(
      updateScratchpad(pad, {
        activeHypothesis: active,
        hypothesisHistory: history,
      }),
    )
  }

  /**
   * PERSISTENCE BOUNDARY — Dead Ends vs Lessons
   *
   * Dead ends are SESSION-SCOPED:
   * - Reset when the session ends
   * - Represent specific failed approaches in THIS context
   * - Example: "tried direct implementation with inline styles — failed"
   * - Used by: BranchGenerator (avoids dead ends in ToT branching)
   *            ComplexityDetector (dead ends increase complexity score)
   *
   * Cross-session memory is in {@link lessonsStore} (persisted):
   * - Survives across sessions — loaded on startup
   * - Represent DISTILLED learnings from failures
   * - Example: "when refactoring auth, always handle token refresh first"
   * - Used by: BranchScorer (lesson alignment score in ToT)
   *            ReflexionController (informs enriched brief on retry)
   *            UncertaintyResolver (informs resolution strategy)
   *
   * How they relate:
   * When a dead end produces a Reflexion failure or UAR trigger,
   * the failure is DISTILLED into a lesson via {@link LessonsStore.recordFromCritique}
   * or {@link LessonsStore.recordManual} and persisted. The raw dead end stays session-only.
   *
   * If raw dead-end persistence across sessions is needed in future,
   * add a deadEndsPersistenceAdapter following the same pattern as
   * `src/lib/persistence/lessonsPersistenceAdapter.ts`.
   *
   * Records a dead end and a high-importance note with the avoidance hint.
   */
  recordDeadEnd(
    scratchpadId: string,
    deadEnd: Omit<DeadEnd, 'id' | 'discoveredAt'>,
  ): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    const now = new Date().toISOString()
    const row: DeadEnd = { ...deadEnd, id: uuidv4(), discoveredAt: now }
    const entry = this.makeEntry(pad, {
      type: 'note',
      content: deadEnd.avoidanceHint,
      importance: 'high',
    })
    console.log(`${LOG} Dead end recorded: ${deadEnd.approach.slice(0, 60)}`)
    return this.save(
      updateScratchpad(pad, {
        deadEnds: [...pad.deadEnds, row],
        entries: [...pad.entries, entry],
      }),
    )
  }

  /**
   * Adds an insight entry; high importance also pushes {@link CoTScratchpad.keyInsights} (max 10).
   */
  addInsight(
    scratchpadId: string,
    insight: string,
    importance: 'high' | 'medium' | 'low' = 'medium',
  ): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    const entry = this.makeEntry(pad, {
      type: 'insight',
      content: insight,
      importance,
    })
    let keyInsights = pad.keyInsights
    if (importance === 'high') {
      keyInsights = [...pad.keyInsights, insight].slice(-10)
    }
    return this.save(
      updateScratchpad(pad, {
        entries: [...pad.entries, entry],
        keyInsights,
      }),
    )
  }

  /**
   * Appends to confidence trajectory and records telemetry.
   */
  updateConfidence(scratchpadId: string, confidence: number): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    const trajectory = [...pad.confidenceTrajectory, confidence]
    const next = updateScratchpad(pad, { confidenceTrajectory: trajectory })
    // Event: scratchpad_confidence_update — must match TelemetryEventType in telemetryCollector.ts
    telemetry.record('scratchpad_confidence_update', pad.sessionId, {
      scratchpadId,
      confidence,
      trajectory: trajectory.slice(-5),
    })
    return this.save(next)
  }

  /** Appends an open question if it is not already listed. */
  addOpenQuestion(scratchpadId: string, question: string): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    if (pad.openQuestions.includes(question)) {
      return pad
    }
    return this.save(
      updateScratchpad(pad, {
        openQuestions: [...pad.openQuestions, question],
      }),
    )
  }

  /** Removes a question and records a resolution insight. */
  resolveOpenQuestion(
    scratchpadId: string,
    question: string,
    resolution: string,
  ): CoTScratchpad {
    const pad = this.requirePad(scratchpadId)
    const openQuestions = pad.openQuestions.filter((q) => q !== question)
    const entry = this.makeEntry(pad, {
      type: 'insight',
      content: `Resolved: ${question} → ${resolution}`,
      importance: 'medium',
    })
    return this.save(
      updateScratchpad(pad, {
        openQuestions,
        entries: [...pad.entries, entry],
      }),
    )
  }

  /**
   * Supersedes the session’s current scratchpad and creates a new one for a new task.
   */
  newTaskDetected(
    sessionId: string,
    newTaskType: string,
    newTaskDescription: string,
  ): CoTScratchpad {
    const currentId = this.sessionIndex.get(sessionId)
    if (currentId !== undefined) {
      const old = this.pads.get(currentId)
      if (old !== undefined) {
        const entry = this.makeEntry(old, {
          type: 'note',
          content: 'Task shifted to new topic',
          importance: 'high',
        })
        this.save(
          updateScratchpad(old, {
            entries: [...old.entries, entry],
          }),
        )
      }
    }
    return this.create(sessionId, newTaskType, newTaskDescription)
  }

  private makeEntry(
    pad: CoTScratchpad,
    partial: Pick<ScratchpadEntry, 'type' | 'content' | 'importance'>,
  ): ScratchpadEntry {
    return {
      id: uuidv4(),
      turnIndex: pad.turnCount,
      timestamp: new Date().toISOString(),
      ...partial,
    }
  }

  private requirePad(scratchpadId: string): CoTScratchpad {
    const pad = this.pads.get(scratchpadId)
    if (pad === undefined) {
      throw new Error(`Unknown scratchpad: ${scratchpadId}`)
    }
    return pad
  }

  private save(pad: CoTScratchpad): CoTScratchpad {
    this.pads.set(pad.scratchpadId, pad)
    return pad
  }
}

/** Shared process-wide scratchpad store. */
export const scratchpadStore = new ScratchpadStore()

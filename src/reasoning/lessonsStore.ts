/**
 * Session-scoped Reflexion memory: persists verbal lessons from the Critic
 * and related signals so later turns can inject them into prompts.
 * Cross-session durability via {@link lessonsAdapter}.
 *
 * @module reasoning/lessonsStore
 */

import { v4 as uuidv4 } from 'uuid'

import {
  lessonsAdapter,
  type PersistedLesson,
} from '@/lib/persistence/lessonsPersistenceAdapter'

import type { Critique, CritiqueIssue } from './criticAgent'

const LOG = '[LessonsStore]'

const SEVERITY_ORDER: Record<Lesson['severity'], number> = {
  critical: 3,
  major: 2,
  minor: 1,
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'have',
  'has',
  'are',
  'was',
  'were',
  'not',
  'but',
  'can',
  'should',
  'must',
  'will',
  'all',
  'any',
  'use',
  'using',
  'when',
  'what',
  'your',
  'into',
  'than',
  'then',
  'also',
  'only',
  'such',
  'each',
  'which',
  'their',
])

/** Stopwords for {@link LessonsStore.extractTags} (keyword extraction). */
const EXTRACT_TAG_STOPWORDS = new Set([
  'that',
  'this',
  'with',
  'from',
  'have',
  'when',
  'will',
  'been',
  'were',
  'they',
  'them',
  'then',
  'than',
  'what',
  'your',
  'into',
  'also',
  'more',
])

/** Provenance of a stored lesson. */
export type LessonSource = 'critique' | 'dead_end' | 'assumption_violation' | 'user_correction'

/**
 * One generalizable insight tied to a session and optional task route.
 */
export interface Lesson {
  id: string
  sessionId: string
  /** Intent route that produced this lesson, or `all` when route-agnostic. */
  taskType: string
  /** Generalizable insight text. */
  lesson: string
  source: LessonSource
  severity: 'critical' | 'major' | 'minor'
  /** Number of times injected or applied in downstream logic. */
  appliedCount: number
  /** Whether applying the lesson correlated with a better outcome. */
  confirmedEffective: boolean
  createdAt: string
  lastAppliedAt?: string
}

/**
 * Parameters for selecting lessons to inject into a prompt.
 */
export interface LessonContext {
  sessionId: string
  taskType: string
  /** When set, narrows lessons via keyword / heuristic overlap with output. */
  currentOutput?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function mapPersistedSourceToLessonSource(s: PersistedLesson['source']): LessonSource {
  if (s === 'uar') {
    return 'user_correction'
  }
  if (s === 'manual') {
    return 'user_correction'
  }
  return 'critique'
}

/**
 * Hydrate an in-memory {@link Lesson} from disk row (severity defaults to `minor` — not stored).
 */
function persistedToLesson(p: PersistedLesson): Lesson {
  return {
    id: p.id,
    sessionId: p.sessionId,
    taskType: p.taskType,
    lesson: p.content,
    source: mapPersistedSourceToLessonSource(p.source),
    severity: 'minor',
    appliedCount: p.appliedCount,
    confirmedEffective: p.successRate >= 0.5,
    createdAt: p.createdAt,
    lastAppliedAt: p.lastAppliedAt ?? undefined,
  }
}

function baseLesson(
  sessionId: string,
  taskType: string,
  lessonText: string,
  source: LessonSource,
  severity: Lesson['severity'],
): Lesson {
  return {
    id: uuidv4(),
    sessionId,
    taskType,
    lesson: lessonText.trim(),
    source,
    severity,
    appliedCount: 0,
    confirmedEffective: false,
    createdAt: nowIso(),
  }
}

function isMajorWithClearPattern(issue: CritiqueIssue): boolean {
  if (issue.severity !== 'major') return false
  if (issue.suggestion.trim().length >= 30) return true
  return issue.category === 'correctness' || issue.category === 'completeness' || issue.category === 'safety'
}

/**
 * Heuristic overlap between lesson text and current output (plus error-handling example).
 */
function lessonRelevantToOutput(lesson: Lesson, output: string): boolean {
  const l = lesson.lesson.toLowerCase()
  const o = output.toLowerCase()

  if (/\b(error handling|exception handling)\b/i.test(l) || /try\s*/i.test(l) || /\bcatch\b/i.test(l)) {
    if (/\btry\s*\{/.test(o) || /\bcatch\s*\(/.test(o)) {
      return true
    }
  }

  const words = l
    .split(/[^a-z0-9_]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))

  if (words.length === 0) {
    return true
  }

  for (const w of words) {
    if (o.includes(w)) return true
  }
  return false
}

function sortLessons(a: Lesson, b: Lesson): number {
  const sev = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
  if (sev !== 0) return sev
  return a.appliedCount - b.appliedCount
}

/**
 * LessonsStore — Cross-Session Reasoning Memory
 *
 * Stores distilled lessons from Reflexion failures and UAR resolutions.
 * Persists to disk via {@link lessonsAdapter} (`lessonsPersistenceAdapter`: JSON in dev, SQLite in prod).
 * Loaded lazily on first access — does not block startup (constructor pre-warm is non-blocking).
 *
 * Lesson lifecycle:
 * 1. Reflexion critique produces lessons → {@link ReflexionController} calls {@link LessonsStore.recordFromCritique}
 * 2. UAR resolves uncertainty → {@link UncertaintyResolver} calls {@link LessonsStore.recordManual}
 * 3. Lesson tagged, persisted (fire-and-forget), and indexed by `taskType` for retrieval
 * 4. Next session: {@link LessonsStore.loadFromPersistence} merges rows into memory (via {@link LessonsStore.ensureLoaded})
 * 5. {@link BranchScorer} uses {@link LessonsStore.getRelevantLessons} for lesson alignment in ToT
 * 6. {@link ReflexionController} injects lessons into enriched brief on retry
 * 7. When a lesson is applied: {@link LessonsStore.recordApplied} updates rolling `successRate` in persistence
 * 8. Lessons with successRate &lt; 0.3 after 5+ applications are candidates
 *    for pruning (not yet implemented — future enhancement)
 *
 * Contrast with {@link ScratchpadStore} / scratchpad `deadEnds`:
 * - Dead ends: raw, session-scoped, approach-specific
 * - Lessons: distilled, cross-session, generalised
 *
 * **Loading**
 *
 * Pre-warmed at singleton construction time (non-blocking).
 * All public methods await {@link LessonsStore.ensureLoaded} / {@link LessonsStore._ensureLoaded}
 * before use, so concurrent first callers share one load and never double-merge.
 */
export default class LessonsStore {
  /** sessionId → ordered list of lessons (append-only per record call). */
  private readonly lessons: Map<string, Lesson[]> = new Map()

  /**
   * Rolling success rate from persistence / {@link recordApplied} (not on {@link Lesson} interface).
   */
  private readonly successRateByLessonId = new Map<string, number>()

  /** True after a successful full merge from persistence (idempotent guard for {@link loadFromPersistence}). */
  private diskMerged = false

  /**
   * In-flight load; cleared in `finally` so a failed load releases the lock and the next
   * public method call can retry. Prevents parallel duplicate loads while allowing retries after errors.
   */
  private _loadPromise: Promise<void> | null = null

  constructor() {
    // PRE-WARM: Schedule persistence load at singleton construction (import time).
    // void = non-blocking; correctness still guaranteed via _ensureLoaded() on every entrypoint.
    this.ensureLoaded().catch(() => {})
  }

  /**
   * Public alias for {@link LessonsStore._ensureLoaded} (tests / external pre-warm).
   */
  async ensureLoaded(): Promise<void> {
    await this._ensureLoaded()
  }

  /**
   * Single-flight load: concurrent awaiters share one {@link loadFromPersistence} call until it settles.
   */
  private async _ensureLoaded(): Promise<void> {
    if (this.diskMerged) return
    if (this._loadPromise === null) {
      this._loadPromise = this.loadFromPersistence()
        .catch((err: unknown) => {
          console.error(`${LOG} Load failed:`, err)
        })
        .finally(() => {
          this._loadPromise = null
        })
    }
    await this._loadPromise
  }

  /**
   * Merge {@link lessonsAdapter} rows into memory (once per process); skips duplicate ids per bucket.
   */
  async loadFromPersistence(): Promise<void> {
    if (this.diskMerged) {
      return
    }
    const rows = await lessonsAdapter.getAll()
    for (const p of rows) {
      const lesson = persistedToLesson(p)
      const bucket = this.getBucket(lesson.sessionId)
      if (bucket.some((l) => l.id === lesson.id)) {
        continue
      }
      bucket.push(lesson)
      this.successRateByLessonId.set(lesson.id, p.successRate)
    }
    this.diskMerged = true
    console.log(`${LOG} Loaded ${String(rows.length)} lessons from persistence`)
  }

  private inferPersistedSource(lesson: Lesson): PersistedLesson['source'] {
    if (lesson.source === 'user_correction') {
      return 'uar'
    }
    return 'reflexion'
  }

  /**
   * Simple keyword extraction for persisted tags (length ≥ 4, stopword-filtered).
   */
  private extractTags(content: string): string[] {
    const lower = content.toLowerCase()
    const tokens = lower
      .split(/[^a-z0-9_]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 4 && !EXTRACT_TAG_STOPWORDS.has(w))
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of tokens) {
      if (seen.has(t)) continue
      seen.add(t)
      out.push(t)
      if (out.length >= 10) break
    }
    return out
  }

  /**
   * Write a new lesson snapshot to disk (appliedCount / successRate start at 0 per spec).
   */
  async persistLesson(lesson: Lesson): Promise<void> {
    const persisted: PersistedLesson = {
      id: lesson.id,
      content: lesson.lesson,
      taskType: lesson.taskType,
      sessionId: lesson.sessionId,
      appliedCount: 0,
      successRate: 0,
      createdAt: lesson.createdAt,
      lastAppliedAt: lesson.lastAppliedAt ?? null,
      tags: this.extractTags(lesson.lesson),
      source: this.inferPersistedSource(lesson),
    }
    await lessonsAdapter.save(persisted)
    this.successRateByLessonId.set(lesson.id, 0)
    console.log(`${LOG} Persisted lesson ${lesson.id}`)
  }

  private getBucket(sessionId: string): Lesson[] {
    let bucket = this.lessons.get(sessionId)
    if (bucket === undefined) {
      bucket = []
      this.lessons.set(sessionId, bucket)
    }
    return bucket
  }

  private findLesson(sessionId: string, lessonId: string): Lesson | undefined {
    const bucket = this.lessons.get(sessionId)
    if (bucket === undefined) return undefined
    return bucket.find((x) => x.id === lessonId)
  }

  private findLessonByIdAcrossSessions(lessonId: string): Lesson | undefined {
    for (const bucket of this.lessons.values()) {
      const hit = bucket.find((l) => l.id === lessonId)
      if (hit !== undefined) {
        return hit
      }
    }
    return undefined
  }

  /**
   * Records lessons distilled from a Reflexion critique ({@link Critique.lessonsForFuture}
   * and high-signal issue suggestions).
   *
   * Persists non-blocking (fire-and-forget via {@link LessonsStore.persistLesson}).
   *
   * Called by: {@link ReflexionController.reflect} after each full Critic pass (whether the
   * critique passed or failed).
   */
  async recordFromCritique(sessionId: string, critique: Critique): Promise<Lesson[]> {
    await this.ensureLoaded()
    const bucket = this.getBucket(sessionId)
    const created: Lesson[] = []
    const taskType = critique.taskType

    for (const text of critique.lessonsForFuture) {
      const t = text.trim()
      if (t.length === 0) continue
      const row = baseLesson(sessionId, taskType, t, 'critique', 'minor')
      bucket.push(row)
      created.push(row)
    }

    for (const issue of critique.issues) {
      if (issue.severity === 'critical') {
        const s = issue.suggestion.trim()
        if (s.length === 0) continue
        const row = baseLesson(sessionId, taskType, s, 'critique', 'critical')
        bucket.push(row)
        created.push(row)
      } else if (isMajorWithClearPattern(issue)) {
        const s = issue.suggestion.trim()
        if (s.length === 0) continue
        const row = baseLesson(sessionId, taskType, s, 'critique', 'major')
        bucket.push(row)
        created.push(row)
      }
    }

    console.log(`${LOG} Recorded ${String(created.length)} lessons from critique (session: ${sessionId})`)

    for (const row of created) {
      this.persistLesson(row).catch((err: unknown) => {
        console.error(`${LOG} Persist failed:`, err)
      })
    }

    return created
  }

  /**
   * Records a manually specified or UAR-derived lesson outside the Reflexion critique path.
   *
   * Persists non-blocking (fire-and-forget via {@link LessonsStore.persistLesson}).
   *
   * Called by: {@link UncertaintyResolver} (UAR lesson extraction) and any manual lesson injection.
   */
  async recordManual(
    sessionId: string,
    lesson: string,
    taskType: string,
    severity: Lesson['severity'],
    source: Lesson['source'],
  ): Promise<Lesson> {
    await this.ensureLoaded()
    const row = baseLesson(sessionId, taskType, lesson.trim(), source, severity)
    this.getBucket(sessionId).push(row)
    this.persistLesson(row).catch((err: unknown) => {
      console.error(`${LOG} Persist failed:`, err)
    })
    return row
  }

  /**
   * Returns up to five lessons for the session, prioritized by severity and reuse.
   */
  async getRelevantLessons(context: LessonContext): Promise<Lesson[]> {
    await this.ensureLoaded()
    const bucket = this.lessons.get(context.sessionId)
    if (bucket === undefined || bucket.length === 0) {
      return []
    }

    let candidates = bucket.filter(
      (l) => l.taskType === context.taskType || l.taskType === 'all',
    )

    candidates = [...candidates].sort(sortLessons)

    const outputTrim = context.currentOutput?.trim() ?? ''
    if (outputTrim.length > 0) {
      candidates = candidates.filter((l) => lessonRelevantToOutput(l, outputTrim))
    }

    return candidates.slice(0, 5)
  }

  /**
   * Serializes lessons into an XML fragment for Worker / thought prompts.
   */
  formatForPrompt(lessons: Lesson[]): string {
    if (lessons.length === 0) return ''
    const inner = lessons
      .map((l) => {
        const body = escapeXml(l.lesson)
        return `<lesson severity="${escapeXml(l.severity)}">\n${body}\n</lesson>`
      })
      .join('\n')
    return `<lessons_learned>\n${inner}\n</lessons_learned>`
  }

  /**
   * Call when a lesson was injected or acted on.
   */
  async markApplied(lessonId: string, sessionId: string): Promise<void> {
    await this.ensureLoaded()
    const lesson = this.findLesson(sessionId, lessonId)
    if (lesson === undefined) return
    lesson.appliedCount += 1
    lesson.lastAppliedAt = nowIso()
  }

  /**
   * Updates outcome tracking after a follow-up verification or user signal.
   */
  async markEffective(lessonId: string, sessionId: string, effective: boolean): Promise<void> {
    await this.ensureLoaded()
    const lesson = this.findLesson(sessionId, lessonId)
    if (lesson === undefined) return
    lesson.confirmedEffective = effective
    console.log(`${LOG} Lesson ${effective ? 'confirmed' : 'refuted'}: ${lessonId}`)
  }

  /**
   * Persisted rolling average update + in-memory mirror.
   * UNCERTAIN: {@link Lesson} has no `successRate` field — `confirmedEffective` is set to the latest `improved`
   * flag; rolling average is kept in {@link successRateByLessonId} only.
   */
  async recordApplied(lessonId: string, improved: boolean): Promise<void> {
    await this.ensureLoaded()
    await lessonsAdapter.updateApplied(lessonId, improved)
    const lesson = this.findLessonByIdAcrossSessions(lessonId)
    if (lesson !== undefined) {
      const prevN = lesson.appliedCount
      const prevR = this.successRateByLessonId.get(lessonId) ?? 0
      const n = prevN + 1
      const newR = ((prevR * (n - 1)) + (improved ? 1 : 0)) / n
      lesson.appliedCount = n
      lesson.lastAppliedAt = nowIso()
      this.successRateByLessonId.set(lessonId, newR)
      lesson.confirmedEffective = improved
    }
    console.log(`${LOG} Applied lesson ${lessonId} — improved: ${String(improved)}`)
  }

  /**
   * Row count in persistence (may differ from in-memory while async writes are in flight).
   */
  async getPersistedCount(): Promise<number> {
    return lessonsAdapter.count()
  }

  /**
   * Aggregate counts for dashboards or telemetry.
   */
  async getSessionStats(sessionId: string): Promise<{
    totalLessons: number
    byTaskType: Record<string, number>
    bySeverity: Record<string, number>
    appliedLessons: number
    effectiveLessons: number
  }> {
    await this.ensureLoaded()
    const bucket = this.lessons.get(sessionId) ?? []
    const byTaskType: Record<string, number> = {}
    const bySeverity: Record<string, number> = {}
    let appliedLessons = 0
    let effectiveLessons = 0

    for (const l of bucket) {
      byTaskType[l.taskType] = (byTaskType[l.taskType] ?? 0) + 1
      bySeverity[l.severity] = (bySeverity[l.severity] ?? 0) + 1
      if (l.appliedCount > 0) appliedLessons += 1
      if (l.confirmedEffective) effectiveLessons += 1
    }

    return {
      totalLessons: bucket.length,
      byTaskType,
      bySeverity,
      appliedLessons,
      effectiveLessons,
    }
  }

  /**
   * Drops all lessons for a session (e.g. new chat).
   */
  clearSession(sessionId: string): void {
    this.lessons.delete(sessionId)
  }

  /**
   * Finds a lesson by exact stored text (e.g. to mark effectiveness after a passing reflexion).
   */
  async findLessonByExactContent(sessionId: string, lessonText: string): Promise<Lesson | undefined> {
    await this.ensureLoaded()
    const norm = lessonText.trim()
    if (norm.length === 0) return undefined
    return (this.lessons.get(sessionId) ?? []).find((l) => l.lesson === norm)
  }
}

/** Shared {@link LessonsStore} for the app runtime. */
export const lessonsStore = new LessonsStore()

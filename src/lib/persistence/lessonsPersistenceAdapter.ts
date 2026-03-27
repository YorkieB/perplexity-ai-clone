/**
 * Cross-session lessons persistence for Jarvis (DigitalOcean self-hosted).
 *
 * @packageDocumentation
 * TODO(package.json): add runtime dependency `better-sqlite3` and dev dependency
 * `@types/better-sqlite3` when enabling production SQLite at `data/jarvis.db`.
 */

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

/**
 * STORAGE STRATEGY
 *
 * Development  → JsonFileLessonsAdapter → data/lessons.json
 *   Simple, human-readable, no dependencies, zero setup
 *   Fine for hundreds of lessons — no performance concern at this scale
 *
 * Production   → SQLiteLessonsAdapter → data/jarvis.db
 *   better-sqlite3, indexed by taskType, efficient tag search
 *   Jarvis is self-hosted on DigitalOcean — SQLite is appropriate
 *   No external database dependency, file-based, zero network latency
 *
 * Future       → If Jarvis becomes multi-instance or cloud-deployed:
 *   Replace with a PostgreSQL adapter following the same interface
 *   {@link LessonsPersistenceAdapter} remains unchanged
 *   Only {@link createLessonsAdapter} factory function needs updating
 */

// ─── DEPLOYMENT NOTE ──────────────────────────────────────────────────────
// TODO (production): Install better-sqlite3 on the DigitalOcean server:
//   npm install better-sqlite3
//
// TODO (production): Mount a persistent volume at /data in App Platform.
//   Without it, data/jarvis.db is wiped on every re-deploy.
//   All cross-session lessons (LessonsStore) depend on this volume.
//
// In development: data/lessons.json is used — no extra setup needed.
// See createLessonsAdapter() JSDoc for the full deployment checklist.
// ─────────────────────────────────────────────────────────────────────────

/** Lesson row stored by {@link LessonsPersistenceAdapter} implementations. */
export interface PersistedLesson {
  id: string
  /** The lesson text. */
  content: string
  taskType: string
  sessionId: string
  /** How many times this lesson was used. */
  appliedCount: number
  /** 0.0–1.0: when applied, did outcome improve? */
  successRate: number
  createdAt: string
  lastAppliedAt: string | null
  /** Extracted keywords for fast lookup. */
  tags: string[]
  source: 'reflexion' | 'uar' | 'manual'
}

/** Storage backend for {@link PersistedLesson} records. */
export interface LessonsPersistenceAdapter {
  save(lesson: PersistedLesson): Promise<void>
  getAll(): Promise<PersistedLesson[]>
  getByTaskType(taskType: string): Promise<PersistedLesson[]>
  getByTags(tags: string[]): Promise<PersistedLesson[]>
  updateApplied(id: string, success: boolean): Promise<void>
  delete(id: string): Promise<void>
  count(): Promise<number>
}

function isPersistedLessonSource(s: string): s is PersistedLesson['source'] {
  return s === 'reflexion' || s === 'uar' || s === 'manual'
}

function parseLessonRow(row: Record<string, unknown>): PersistedLesson | null {
  const id = typeof row.id === 'string' ? row.id : ''
  const content = typeof row.content === 'string' ? row.content : ''
  const taskType = typeof row.taskType === 'string' ? row.taskType : ''
  const sessionId = typeof row.sessionId === 'string' ? row.sessionId : ''
  const appliedCount = typeof row.appliedCount === 'number' ? row.appliedCount : 0
  const successRate = typeof row.successRate === 'number' ? row.successRate : 0
  const createdAt = typeof row.createdAt === 'string' ? row.createdAt : ''
  const lastAppliedAt =
    row.lastAppliedAt === null || row.lastAppliedAt === undefined
      ? null
      : typeof row.lastAppliedAt === 'string'
        ? row.lastAppliedAt
        : null
  let tags: string[] = []
  if (typeof row.tags === 'string') {
    try {
      const parsed: unknown = JSON.parse(row.tags)
      tags = Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
    } catch {
      tags = []
    }
  } else if (Array.isArray(row.tags)) {
    tags = row.tags.filter((t): t is string => typeof t === 'string')
  }
  const srcRaw = typeof row.source === 'string' ? row.source : ''
  const source: PersistedLesson['source'] = isPersistedLessonSource(srcRaw) ? srcRaw : 'manual'
  if (id.length === 0) {
    return null
  }
  return {
    id,
    content,
    taskType,
    sessionId,
    appliedCount,
    successRate,
    createdAt,
    lastAppliedAt,
    tags,
    source,
  }
}

/** Minimal better-sqlite3 surface (optional peer dependency). */
interface SqliteDatabase {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number }
    all(...params: unknown[]): Record<string, unknown>[]
    get(...params: unknown[]): Record<string, unknown> | undefined
  }
  exec(sql: string): void
}

const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  taskType TEXT NOT NULL,
  sessionId TEXT NOT NULL,
  appliedCount INTEGER DEFAULT 0,
  successRate REAL DEFAULT 0,
  createdAt TEXT NOT NULL,
  lastAppliedAt TEXT,
  tags TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_taskType ON lessons(taskType);
`

/**
 * JSON file–backed adapter for development (`data/lessons.json`).
 */
export class JsonFileLessonsAdapter implements LessonsPersistenceAdapter {
  private readonly filePath: string

  // NOTE: Constructor is now side-effect free (no FS calls).
  // File system init is deferred to _ensureFile() on first _read().
  // This makes the adapter safe to instantiate in test environments
  // without requiring mock FS setup before import.
  constructor(filePath: string = 'data/lessons.json') {
    this.filePath = path.resolve(filePath)
    // NOTE: File system init is deferred to _ensureFile(),
    // called on first read/write. Constructor is now synchronous
    // and safe to call at import time without any FS side effects.
  }

  /**
   * Idempotent setup: creates data/ directory and initialises lessons.json
   * if either is missing. Called before every read so construction is
   * free of file system side effects. Safe to call multiple times.
   */
  private _ensureFile(): void {
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '[]', 'utf-8')
    }
  }

  private _read(): PersistedLesson[] {
    this._ensureFile()
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return []
      }
      const out: PersistedLesson[] = []
      for (const item of parsed) {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          const row = parseLessonRow(item as Record<string, unknown>)
          if (row !== null) {
            out.push(row)
          }
        }
      }
      return out
    } catch {
      return []
    }
  }

  // All public mutating methods call _read() before _write(), so the file
  // and parent directory are always ensured. No _ensureFile() here.
  private _write(lessons: PersistedLesson[]): void {
    fs.writeFileSync(this.filePath, `${JSON.stringify(lessons, null, 2)}\n`, 'utf-8')
  }

  /** @inheritdoc */
  async save(lesson: PersistedLesson): Promise<void> {
    const lessons = this._read()
    const i = lessons.findIndex((l) => l.id === lesson.id)
    if (i >= 0) {
      lessons[i] = lesson
    } else {
      lessons.push(lesson)
    }
    this._write(lessons)
  }

  /** @inheritdoc */
  async getAll(): Promise<PersistedLesson[]> {
    return this._read()
  }

  /** @inheritdoc */
  async getByTaskType(taskType: string): Promise<PersistedLesson[]> {
    return this._read().filter((l) => l.taskType === taskType)
  }

  /** @inheritdoc */
  async getByTags(tags: string[]): Promise<PersistedLesson[]> {
    if (tags.length === 0) {
      return []
    }
    const query = new Set(tags)
    return this._read().filter((lesson) => lesson.tags.some((t) => query.has(t)))
  }

  /** @inheritdoc */
  async updateApplied(id: string, success: boolean): Promise<void> {
    const lessons = this._read()
    const lesson = lessons.find((l) => l.id === id)
    if (lesson === undefined) {
      return
    }
    const appliedCount = lesson.appliedCount + 1
    const newRate =
      ((lesson.successRate * (appliedCount - 1)) + (success ? 1 : 0)) / appliedCount
    lesson.appliedCount = appliedCount
    lesson.successRate = newRate
    lesson.lastAppliedAt = new Date().toISOString()
    this._write(lessons)
  }

  /** @inheritdoc */
  async delete(id: string): Promise<void> {
    this._write(this._read().filter((l) => l.id !== id))
  }

  /** @inheritdoc */
  async count(): Promise<number> {
    return this._read().length
  }
}

/**
 * SQLite-backed adapter for production (`data/jarvis.db`).
 */
export class SQLiteLessonsAdapter implements LessonsPersistenceAdapter {
  private readonly resolvedPath: string
  private db: SqliteDatabase | null = null
  private initPromise: Promise<SqliteDatabase> | null = null

  constructor(dbPath: string = 'data/jarvis.db') {
    this.resolvedPath = path.resolve(dbPath)
  }

  private async getDb(): Promise<SqliteDatabase> {
    if (this.db !== null) {
      return this.db
    }
    if (this.initPromise === null) {
      this.initPromise = (async () => {
        const { default: Database } = await import('better-sqlite3')
        fs.mkdirSync(path.dirname(this.resolvedPath), { recursive: true })
        const database = new Database(this.resolvedPath) as SqliteDatabase
        database.exec(SQLITE_DDL)
        this.db = database
        return database
      })()
    }
    return this.initPromise
  }

  private rowToLesson(row: Record<string, unknown>): PersistedLesson | null {
    return parseLessonRow(row)
  }

  /** @inheritdoc */
  async save(lesson: PersistedLesson): Promise<void> {
    const db = await this.getDb()
    db.prepare(
      `INSERT OR REPLACE INTO lessons (id, content, taskType, sessionId, appliedCount, successRate, createdAt, lastAppliedAt, tags, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      lesson.id,
      lesson.content,
      lesson.taskType,
      lesson.sessionId,
      lesson.appliedCount,
      lesson.successRate,
      lesson.createdAt,
      lesson.lastAppliedAt,
      JSON.stringify(lesson.tags),
      lesson.source,
    )
  }

  /** @inheritdoc */
  async getAll(): Promise<PersistedLesson[]> {
    const db = await this.getDb()
    const rows = db.prepare('SELECT * FROM lessons ORDER BY createdAt DESC').all()
    const out: PersistedLesson[] = []
    for (const row of rows) {
      const lesson = this.rowToLesson(row)
      if (lesson !== null) {
        out.push(lesson)
      }
    }
    return out
  }

  /** @inheritdoc */
  async getByTaskType(taskType: string): Promise<PersistedLesson[]> {
    const db = await this.getDb()
    const rows = db.prepare('SELECT * FROM lessons WHERE taskType = ? ORDER BY createdAt DESC').all(taskType)
    const out: PersistedLesson[] = []
    for (const row of rows) {
      const lesson = this.rowToLesson(row)
      if (lesson !== null) {
        out.push(lesson)
      }
    }
    return out
  }

  /** @inheritdoc */
  async getByTags(tags: string[]): Promise<PersistedLesson[]> {
    const all = await this.getAll()
    if (tags.length === 0) {
      return []
    }
    const query = new Set(tags)
    return all.filter((lesson) => lesson.tags.some((t) => query.has(t)))
  }

  /** @inheritdoc */
  async updateApplied(id: string, success: boolean): Promise<void> {
    const db = await this.getDb()
    const row = db.prepare('SELECT appliedCount, successRate FROM lessons WHERE id = ?').get(id)
    if (row === undefined) {
      return
    }
    const appliedCountPrev =
      typeof row.appliedCount === 'number' && !Number.isNaN(row.appliedCount) ? row.appliedCount : 0
    const successRatePrev =
      typeof row.successRate === 'number' && !Number.isNaN(row.successRate) ? row.successRate : 0
    const appliedCount = appliedCountPrev + 1
    const newRate = ((successRatePrev * (appliedCount - 1)) + (success ? 1 : 0)) / appliedCount
    db.prepare(
      'UPDATE lessons SET appliedCount = ?, successRate = ?, lastAppliedAt = ? WHERE id = ?',
    ).run(appliedCount, newRate, new Date().toISOString(), id)
  }

  /** @inheritdoc */
  async delete(id: string): Promise<void> {
    const db = await this.getDb()
    db.prepare('DELETE FROM lessons WHERE id = ?').run(id)
  }

  /** @inheritdoc */
  async count(): Promise<number> {
    const db = await this.getDb()
    const row = db.prepare('SELECT COUNT(*) AS n FROM lessons').get()
    const n = row !== undefined && typeof row.n === 'number' ? row.n : 0
    return n
  }
}

/**
 * Selects the appropriate lessons persistence adapter for the environment.
 *
 * DEVELOPMENT (NODE_ENV !== 'production'):
 *   JsonFileLessonsAdapter → data/lessons.json
 *   Zero dependencies, human-readable, easy to inspect and reset.
 *
 * PRODUCTION (NODE_ENV === 'production'):
 *   SQLiteLessonsAdapter → data/jarvis.db  (requires better-sqlite3)
 *   Falls back to JsonFileLessonsAdapter if better-sqlite3 is missing,
 *   with a console.warn telling you how to fix it.
 *
 * ─── DIGITALOCEAN DEPLOYMENT CHECKLIST ───────────────────────────────
 * 1. npm install better-sqlite3        (on the server, not just locally)
 * 2. Ensure the Node process has write access to the data/ directory
 * 3. Confirm data/ is in .gitignore    (lessons are runtime state, not source)
 * 4. data/jarvis.db is created automatically on first run
 * 5. IMPORTANT: Mount a persistent volume at /data in App Platform config.
 *    Without a persistent volume, the db file is wiped on every re-deploy
 *    and all cross-session lessons are lost.
 *    DigitalOcean docs: App Platform → your app → Settings → Volumes
 *    Mount path: /data   Size: 1GB minimum
 * ─────────────────────────────────────────────────────────────────────
 */
export function createLessonsAdapter(): LessonsPersistenceAdapter {
  const production = process.env.NODE_ENV === 'production'
  if (production) {
    try {
      createRequire(import.meta.url).resolve('better-sqlite3')
      // eslint-disable-next-line no-console -- adapter diagnostics
      console.log(
        '[LessonsPersistence] SQLiteLessonsAdapter initialised (production). ' +
          'Lessons persisted to data/jarvis.db.',
      )
      return new SQLiteLessonsAdapter()
    } catch {
      // eslint-disable-next-line no-console -- adapter diagnostics
      console.warn(
        '[LessonsPersistence] WARNING: better-sqlite3 is not resolvable ' +
          'in production. Falling back to JsonFileLessonsAdapter. ' +
          'Lessons will still persist to data/lessons.json, but SQLite is ' +
          'strongly recommended for production. ' +
          'Fix: run "npm install better-sqlite3" on the DigitalOcean server, ' +
          'then restart the app.',
      )
      return new JsonFileLessonsAdapter()
    }
  }
  // eslint-disable-next-line no-console -- adapter diagnostics
  console.log('[LessonsPersistence] Using JsonFileLessonsAdapter (development)')
  return new JsonFileLessonsAdapter()
}

/** Process-wide lessons store backend. */
export const lessonsAdapter = createLessonsAdapter()

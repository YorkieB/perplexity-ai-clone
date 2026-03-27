/**
 * File-backed HTTP chat session persistence for Jarvis (single-instance / DigitalOcean).
 *
 * Mount a persistent volume so `data/sessions.json` (or env `JARVIS_SESSIONS_FILE`) survives deploys.
 */

import fs from 'fs'
import path from 'path'

/** Env override: absolute or cwd-relative path to the sessions JSON file. */
const JARVIS_SESSIONS_FILE = 'JARVIS_SESSIONS_FILE'

export interface PersistedSession {
  sessionId: string
  createdAt: string
  lastActiveAt: string
  contextHistory: Array<{ role: string; content: string }>
  scratchpadSummary?: string
  taskType?: string
  metadata?: Record<string, unknown>
}

export class SessionPersistenceAdapter {
  private readonly filePath: string
  private readonly ttlMs: number

  constructor(filePath?: string, ttlHours = 24) {
    const raw =
      filePath?.trim() ||
      process.env[JARVIS_SESSIONS_FILE]?.trim() ||
      path.join('data', 'sessions.json')
    this.filePath = path.isAbsolute(raw) ? raw : path.resolve(raw)
    this.ttlMs = ttlHours * 60 * 60 * 1000
  }

  private _ensureFile(): void {
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '{}', 'utf-8')
    }
  }

  private _read(): Record<string, PersistedSession> {
    this._ensureFile()
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<string, PersistedSession>
    } catch {
      return {}
    }
  }

  private _write(sessions: Record<string, PersistedSession>): void {
    fs.writeFileSync(this.filePath, JSON.stringify(sessions, null, 2), 'utf-8')
  }

  get(sessionId: string): PersistedSession | null {
    const sessions = this._read()
    return sessions[sessionId] ?? null
  }

  save(session: PersistedSession): void {
    const sessions = this._read()
    sessions[session.sessionId] = {
      ...session,
      lastActiveAt: new Date().toISOString(),
    }
    this._write(sessions)
  }

  touch(sessionId: string): void {
    const sessions = this._read()
    if (sessions[sessionId]) {
      sessions[sessionId].lastActiveAt = new Date().toISOString()
      this._write(sessions)
    }
  }

  /** Remove sessions older than TTL. Call periodically (e.g. on server startup). */
  prune(): number {
    const sessions = this._read()
    const cutoff = Date.now() - this.ttlMs
    let pruned = 0
    for (const [id, session] of Object.entries(sessions)) {
      const t = new Date(session.lastActiveAt).getTime()
      if (!Number.isFinite(t) || t < cutoff) {
        delete sessions[id]
        pruned++
      }
    }
    if (pruned > 0) {
      this._write(sessions)
      console.log(`[SessionPersistence] Pruned ${String(pruned)} expired sessions`)
    }
    return pruned
  }

  count(): number {
    return Object.keys(this._read()).length
  }
}

export const sessionPersistenceAdapter = new SessionPersistenceAdapter()

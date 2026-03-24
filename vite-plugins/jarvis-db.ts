import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

let _db: Database.Database | null = null

function dbPath(projectRoot?: string): string {
  const root = projectRoot || process.cwd()
  return resolve(root, 'data', 'jarvis.db')
}

export function getDb(projectRoot?: string): Database.Database {
  if (_db) return _db

  const p = dbPath(projectRoot)
  const dir = dirname(p)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  _db = new Database(p)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  _db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      summary    TEXT,
      topics     TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content         TEXT NOT NULL,
      timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, timestamp);

    CREATE TABLE IF NOT EXISTS user_facts (
      id         TEXT PRIMARY KEY,
      category   TEXT NOT NULL DEFAULT 'general',
      fact       TEXT NOT NULL,
      source     TEXT,
      confidence REAL NOT NULL DEFAULT 1.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category, fact)
    );

    CREATE INDEX IF NOT EXISTS idx_facts_category ON user_facts(category);
  `)

  return _db
}

// ── Conversations ────────────────────────────────────────────────────────────

export function createConversation(projectRoot?: string): string {
  const db = getDb(projectRoot)
  const id = randomUUID()
  db.prepare('INSERT INTO conversations (id) VALUES (?)').run(id)
  return id
}

export interface TurnRow { role: string; content: string }

export function saveMessages(
  conversationId: string,
  messages: TurnRow[],
  projectRoot?: string,
): void {
  const db = getDb(projectRoot)
  const ins = db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)',
  )
  const upd = db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
  )

  const tx = db.transaction(() => {
    for (const m of messages) {
      ins.run(randomUUID(), conversationId, m.role, m.content)
    }
    upd.run(conversationId)
  })
  tx()
}

export function saveConversationSummary(
  conversationId: string,
  summary: string,
  topics: string,
  projectRoot?: string,
): void {
  const db = getDb(projectRoot)
  db.prepare('UPDATE conversations SET summary = ?, topics = ? WHERE id = ?')
    .run(summary, topics, conversationId)
}

// ── Short-term memory ────────────────────────────────────────────────────────

export function loadShortTermMemory(projectRoot?: string): TurnRow[] {
  const db = getDb(projectRoot)
  const rows = db.prepare(`
    SELECT m.role, m.content
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.id IN (
      SELECT id FROM conversations ORDER BY updated_at DESC LIMIT 3
    )
    ORDER BY m.timestamp DESC
    LIMIT 20
  `).all() as TurnRow[]

  return rows.reverse()
}

// ── Long-term memory ─────────────────────────────────────────────────────────

export interface FactRow {
  id: string
  category: string
  fact: string
  confidence: number
}

export function loadLongTermMemory(projectRoot?: string): FactRow[] {
  const db = getDb(projectRoot)
  return db.prepare(
    'SELECT id, category, fact, confidence FROM user_facts ORDER BY category, created_at',
  ).all() as FactRow[]
}

export interface SummaryRow {
  summary: string
  topics: string
  created_at: string
}

export function loadConversationSummaries(
  limit = 5,
  projectRoot?: string,
): SummaryRow[] {
  const db = getDb(projectRoot)
  return db.prepare(`
    SELECT summary, topics, created_at
    FROM conversations
    WHERE summary IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit) as SummaryRow[]
}

// ── Facts management ─────────────────────────────────────────────────────────

export interface NewFact {
  category: string
  fact: string
  source?: string
}

export function addFacts(facts: NewFact[], projectRoot?: string): void {
  const db = getDb(projectRoot)
  const stmt = db.prepare(`
    INSERT INTO user_facts (id, category, fact, source)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(category, fact) DO UPDATE SET updated_at = datetime('now')
  `)
  const tx = db.transaction(() => {
    for (const f of facts) {
      stmt.run(randomUUID(), f.category, f.fact, f.source || null)
    }
  })
  tx()
}

export function removeFact(id: string, projectRoot?: string): void {
  const db = getDb(projectRoot)
  db.prepare('DELETE FROM user_facts WHERE id = ?').run(id)
}

// ── Full conversation messages (for summarization) ───────────────────────────

export function getConversationMessages(
  conversationId: string,
  projectRoot?: string,
): TurnRow[] {
  const db = getDb(projectRoot)
  return db.prepare(
    'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY timestamp',
  ).all(conversationId) as TurnRow[]
}

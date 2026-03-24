const Database = require('better-sqlite3')
const { randomUUID } = require('node:crypto')
const { resolve, dirname } = require('node:path')
const { mkdirSync, existsSync } = require('node:fs')

let _db = null

function dbPath(projectRoot) {
  const root = projectRoot || process.cwd()
  return resolve(root, 'data', 'jarvis.db')
}

function getDb(projectRoot) {
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

function createConversation(projectRoot) {
  const db = getDb(projectRoot)
  const id = randomUUID()
  db.prepare('INSERT INTO conversations (id) VALUES (?)').run(id)
  return id
}

function saveMessages(conversationId, messages, projectRoot) {
  const db = getDb(projectRoot)
  const ins = db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
  const upd = db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?")
  const tx = db.transaction(() => {
    for (const m of messages) ins.run(randomUUID(), conversationId, m.role, m.content)
    upd.run(conversationId)
  })
  tx()
}

function saveConversationSummary(conversationId, summary, topics, projectRoot) {
  const db = getDb(projectRoot)
  db.prepare('UPDATE conversations SET summary = ?, topics = ? WHERE id = ?').run(summary, topics, conversationId)
}

function loadShortTermMemory(projectRoot) {
  const db = getDb(projectRoot)
  const rows = db.prepare(`
    SELECT m.role, m.content FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.id IN (SELECT id FROM conversations ORDER BY updated_at DESC LIMIT 3)
    ORDER BY m.timestamp DESC LIMIT 20
  `).all()
  return rows.reverse()
}

function loadLongTermMemory(projectRoot) {
  const db = getDb(projectRoot)
  return db.prepare('SELECT id, category, fact, confidence FROM user_facts ORDER BY category, created_at').all()
}

function loadConversationSummaries(limit, projectRoot) {
  const db = getDb(projectRoot)
  return db.prepare('SELECT summary, topics, created_at FROM conversations WHERE summary IS NOT NULL ORDER BY updated_at DESC LIMIT ?').all(limit || 5)
}

const SINGLE_VALUE_CATEGORIES = new Set(['name', 'location', 'occupation', 'age', 'birthday'])

function addFacts(facts, projectRoot) {
  const db = getDb(projectRoot)
  const del = db.prepare('DELETE FROM user_facts WHERE category = ?')
  const ins = db.prepare(`INSERT INTO user_facts (id, category, fact, source) VALUES (?, ?, ?, ?)
    ON CONFLICT(category, fact) DO UPDATE SET updated_at = datetime('now')`)
  const tx = db.transaction(() => {
    for (const f of facts) {
      if (SINGLE_VALUE_CATEGORIES.has(f.category.toLowerCase())) del.run(f.category)
      ins.run(randomUUID(), f.category, f.fact, f.source || null)
    }
  })
  tx()
}

function getConversationMessages(conversationId, projectRoot) {
  const db = getDb(projectRoot)
  return db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY timestamp').all(conversationId)
}

module.exports = {
  getDb, createConversation, saveMessages, saveConversationSummary,
  loadShortTermMemory, loadLongTermMemory, loadConversationSummaries,
  addFacts, getConversationMessages
}

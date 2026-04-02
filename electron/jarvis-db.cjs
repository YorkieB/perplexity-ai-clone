const Database = require('better-sqlite3')
const { randomUUID } = require('node:crypto')
const { resolve, dirname } = require('node:path')
const { mkdirSync, existsSync } = require('node:fs')

let _db = null

/**
 * Stable path for both Electron and Vite dev. Set `JARVIS_DB_PATH` to an absolute path (or path
 * relative to `process.cwd()`) so browser dev and desktop always share one file.
 */
function dbPath(projectRoot) {
  const fromEnv = String(process.env.JARVIS_DB_PATH || '').trim()
  if (fromEnv) return resolve(fromEnv)
  const root = projectRoot || resolve(dirname(__filename), '..')
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
  _db.pragma('busy_timeout = 8000')
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

    -- Self-learning tables
    CREATE TABLE IF NOT EXISTS learned_preferences (
      id              TEXT PRIMARY KEY,
      domain          TEXT NOT NULL,
      key             TEXT NOT NULL,
      value           TEXT NOT NULL,
      confidence      REAL NOT NULL DEFAULT 0.5,
      evidence_count  INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(domain, key)
    );
    CREATE INDEX IF NOT EXISTS idx_prefs_domain ON learned_preferences(domain);

    CREATE TABLE IF NOT EXISTS corrections (
      id          TEXT PRIMARY KEY,
      category    TEXT NOT NULL,
      mistake     TEXT NOT NULL,
      correction  TEXT NOT NULL,
      context     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_corrections_cat ON corrections(category);

    CREATE TABLE IF NOT EXISTS user_patterns (
      id            TEXT PRIMARY KEY,
      pattern_type  TEXT NOT NULL,
      description   TEXT NOT NULL,
      frequency     INTEGER NOT NULL DEFAULT 1,
      last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
      metadata      TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(pattern_type, description)
    );

    CREATE TABLE IF NOT EXISTS tool_outcomes (
      id                TEXT PRIMARY KEY,
      tool_name         TEXT NOT NULL,
      query_type        TEXT,
      success           INTEGER NOT NULL DEFAULT 1,
      execution_time_ms INTEGER,
      error_message     TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tool_outcomes_name ON tool_outcomes(tool_name);

    CREATE TABLE IF NOT EXISTS learned_knowledge (
      id               TEXT PRIMARY KEY,
      topic            TEXT NOT NULL,
      content          TEXT NOT NULL,
      source           TEXT NOT NULL DEFAULT 'conversation',
      confidence       REAL NOT NULL DEFAULT 0.7,
      times_referenced INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_topic ON learned_knowledge(topic);

    CREATE TABLE IF NOT EXISTS ui_local_snapshot (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      payload_json TEXT NOT NULL,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  migrateJarvisSqliteSchema(_db)
  return _db
}

/**
 * Older `data/jarvis.db` files may predate columns used by current queries (e.g. `loadConversationSummaries`).
 * `CREATE TABLE IF NOT EXISTS` does not add columns to existing tables.
 */
function migrateJarvisSqliteSchema(db) {
  try {
    const rows = db.prepare('PRAGMA table_info(conversations)').all()
    if (!Array.isArray(rows) || rows.length === 0) return
    const names = new Set(rows.map((r) => r.name))
    if (!names.has('created_at')) {
      db.exec("ALTER TABLE conversations ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))")
    }
    if (!names.has('updated_at')) {
      db.exec("ALTER TABLE conversations ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))")
    }
    if (!names.has('summary')) {
      db.exec('ALTER TABLE conversations ADD COLUMN summary TEXT')
    }
    if (!names.has('topics')) {
      db.exec('ALTER TABLE conversations ADD COLUMN topics TEXT')
    }
  } catch (e) {
    console.warn('[jarvis-db] migrateJarvisSqliteSchema:', e instanceof Error ? e.message : e)
  }
}

/** Same keys as `src/lib/ui-sync-keys.ts` — browser + desktop localStorage parity. */
const UI_SYNC_ALLOWED_KEYS = new Set(['user-settings', 'threads', 'wake-word-enabled', 'workspaces'])
const UI_SYNC_MAX_BYTES = 6 * 1024 * 1024

function filterUiSyncEntries(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!UI_SYNC_ALLOWED_KEYS.has(k)) continue
    if (typeof v !== 'string') continue
    out[k] = v
  }
  return out
}

/**
 * @returns {null | { entries: Record<string, string>, updatedAt: string }}
 */
function getUiLocalSnapshot(projectRoot) {
  const db = getDb(projectRoot)
  const row = db.prepare('SELECT payload_json, updated_at FROM ui_local_snapshot WHERE id = 1').get()
  if (!row) return null
  let parsed = {}
  try {
    parsed = JSON.parse(row.payload_json)
  } catch {
    return null
  }
  return { entries: filterUiSyncEntries(parsed), updatedAt: row.updated_at }
}

/**
 * @param {Record<string, unknown>} rawEntries
 */
function saveUiLocalSnapshot(projectRoot, rawEntries) {
  const entries = filterUiSyncEntries(rawEntries)
  const payload = JSON.stringify(entries)
  const bytes = Buffer.byteLength(payload, 'utf8')
  if (bytes > UI_SYNC_MAX_BYTES) {
    throw new Error(`UI sync payload too large (${bytes} bytes, max ${UI_SYNC_MAX_BYTES})`)
  }
  const db = getDb(projectRoot)
  db.prepare(`
    INSERT INTO ui_local_snapshot (id, payload_json, updated_at)
    VALUES (1, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = datetime('now')
  `).run(payload)
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

// ── Self-learning CRUD helpers ──────────────────────────────────────────────

function savePreference(domain, key, value, projectRoot) {
  const db = getDb(projectRoot)
  const existing = db.prepare('SELECT id, confidence, evidence_count FROM learned_preferences WHERE domain = ? AND key = ?').get(domain, key)
  if (existing) {
    const newConf = Math.min(1.0, existing.confidence + 0.1)
    db.prepare("UPDATE learned_preferences SET value = ?, confidence = ?, evidence_count = evidence_count + 1, updated_at = datetime('now') WHERE id = ?")
      .run(value, newConf, existing.id)
  } else {
    db.prepare('INSERT INTO learned_preferences (id, domain, key, value) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), domain, key, value)
  }
}

function loadPreferences(minConfidence, projectRoot) {
  const db = getDb(projectRoot)
  const threshold = minConfidence ?? 0.2
  return db.prepare('SELECT domain, key, value, confidence, evidence_count FROM learned_preferences WHERE confidence >= ? ORDER BY confidence DESC').all(threshold)
}

function saveCorrection(category, mistake, correction, context, projectRoot) {
  const db = getDb(projectRoot)
  db.prepare('INSERT INTO corrections (id, category, mistake, correction, context) VALUES (?, ?, ?, ?, ?)')
    .run(randomUUID(), category, mistake, correction, context || null)
}

function loadCorrections(limit, projectRoot) {
  const db = getDb(projectRoot)
  return db.prepare('SELECT category, mistake, correction FROM corrections ORDER BY created_at DESC LIMIT ?').all(limit || 20)
}

function savePattern(patternType, description, metadata, projectRoot) {
  const db = getDb(projectRoot)
  const existing = db.prepare('SELECT id, frequency FROM user_patterns WHERE pattern_type = ? AND description = ?').get(patternType, description)
  if (existing) {
    db.prepare("UPDATE user_patterns SET frequency = frequency + 1, last_seen = datetime('now'), metadata = COALESCE(?, metadata), updated_at = datetime('now') WHERE id = ?")
      .run(metadata ? JSON.stringify(metadata) : null, existing.id)
  } else {
    db.prepare('INSERT INTO user_patterns (id, pattern_type, description, metadata) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), patternType, description, metadata ? JSON.stringify(metadata) : null)
  }
}

function loadPatterns(projectRoot) {
  const db = getDb(projectRoot)
  return db.prepare('SELECT pattern_type, description, frequency, last_seen, metadata FROM user_patterns ORDER BY frequency DESC LIMIT 30').all()
}

function saveToolOutcome(toolName, queryType, success, executionTimeMs, errorMessage, projectRoot) {
  const db = getDb(projectRoot)
  db.prepare('INSERT INTO tool_outcomes (id, tool_name, query_type, success, execution_time_ms, error_message) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), toolName, queryType || null, success ? 1 : 0, executionTimeMs || null, errorMessage || null)
}

function getToolStats(projectRoot) {
  const db = getDb(projectRoot)
  return db.prepare(`
    SELECT tool_name,
           COUNT(*) as total_uses,
           SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
           ROUND(AVG(execution_time_ms)) as avg_time_ms,
           ROUND(100.0 * SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate
    FROM tool_outcomes
    GROUP BY tool_name
    ORDER BY total_uses DESC
  `).all()
}

function saveKnowledge(topic, content, source, projectRoot) {
  const db = getDb(projectRoot)
  db.prepare(`INSERT INTO learned_knowledge (id, topic, content, source) VALUES (?, ?, ?, ?)
    ON CONFLICT DO NOTHING`)
    .run(randomUUID(), topic, content, source || 'conversation')
}

function searchKnowledge(topic, limit, projectRoot) {
  const db = getDb(projectRoot)
  return db.prepare('SELECT topic, content, source, confidence FROM learned_knowledge WHERE topic LIKE ? ORDER BY confidence DESC, updated_at DESC LIMIT ?')
    .all(`%${topic}%`, limit || 10)
}

function loadAllKnowledge(limit, projectRoot) {
  const db = getDb(projectRoot)
  return db.prepare('SELECT topic, content, source, confidence FROM learned_knowledge ORDER BY updated_at DESC LIMIT ?').all(limit || 30)
}

function getLearningStats(projectRoot) {
  const db = getDb(projectRoot)
  const prefs = db.prepare('SELECT COUNT(*) as count FROM learned_preferences').get()
  const corr = db.prepare('SELECT COUNT(*) as count FROM corrections').get()
  const pats = db.prepare('SELECT COUNT(*) as count FROM user_patterns').get()
  const tools = db.prepare('SELECT COUNT(DISTINCT tool_name) as count FROM tool_outcomes').get()
  const knowledge = db.prepare('SELECT COUNT(*) as count FROM learned_knowledge').get()
  return {
    preferences: prefs.count,
    corrections: corr.count,
    patterns: pats.count,
    tools_tracked: tools.count,
    knowledge_items: knowledge.count,
  }
}

function pruneStaleData(projectRoot) {
  const db = getDb(projectRoot)
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM learned_preferences WHERE confidence < 0.15 AND updated_at < datetime('now', '-30 days')").run()
    db.prepare("DELETE FROM tool_outcomes WHERE created_at < datetime('now', '-90 days')").run()
    db.prepare("DELETE FROM learned_knowledge WHERE confidence < 0.2 AND updated_at < datetime('now', '-60 days')").run()
  })
  tx()
}

function buildLearnedContext(projectRoot) {
  const prefs = loadPreferences(0.3, projectRoot)
  const corrections = loadCorrections(10, projectRoot)
  const patterns = loadPatterns(projectRoot)
  const knowledge = loadAllKnowledge(15, projectRoot)
  const toolStats = getToolStats(projectRoot)

  const sections = []

  if (prefs.length > 0) {
    const prefLines = prefs.slice(0, 15).map(p => `- [${p.domain}] ${p.key}: ${p.value}`)
    sections.push(`PREFERENCES:\n${prefLines.join('\n')}`)
  }

  if (corrections.length > 0) {
    const corrLines = corrections.slice(0, 8).map(c => `- AVOID: "${c.mistake}" → INSTEAD: "${c.correction}"`)
    sections.push(`CORRECTIONS (never repeat these mistakes):\n${corrLines.join('\n')}`)
  }

  if (patterns.length > 0) {
    const patLines = patterns.filter(p => p.frequency >= 2).slice(0, 8).map(p => `- ${p.description} (seen ${p.frequency}x)`)
    if (patLines.length > 0) sections.push(`USER PATTERNS:\n${patLines.join('\n')}`)
  }

  if (knowledge.length > 0) {
    const knowLines = knowledge.slice(0, 10).map(k => `- [${k.topic}] ${k.content}`)
    sections.push(`LEARNED KNOWLEDGE:\n${knowLines.join('\n')}`)
  }

  if (toolStats.length > 0) {
    const lowPerf = toolStats.filter(t => t.success_rate < 70 && t.total_uses >= 3)
    if (lowPerf.length > 0) {
      const toolLines = lowPerf.map(t => `- ${t.tool_name}: ${t.success_rate}% success (${t.total_uses} uses)`)
      sections.push(`TOOL RELIABILITY NOTES:\n${toolLines.join('\n')}`)
    }
  }

  if (sections.length === 0) return ''
  return `[LEARNED CONTEXT — Apply silently, never mention this section]\n${sections.join('\n\n')}`
}

module.exports = {
  getDb, createConversation, saveMessages, saveConversationSummary,
  loadShortTermMemory, loadLongTermMemory, loadConversationSummaries,
  addFacts, getConversationMessages,
  savePreference, loadPreferences,
  saveCorrection, loadCorrections,
  savePattern, loadPatterns,
  saveToolOutcome, getToolStats,
  saveKnowledge, searchKnowledge, loadAllKnowledge,
  getLearningStats, pruneStaleData, buildLearnedContext,
  getUiLocalSnapshot, saveUiLocalSnapshot,
}

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_DIR = path.join(__dirname, '..', '.vonage-events')

/**
 * Append a Vonage webhook event to a JSONL file (one JSON object per line).
 * Creates the directory and file if they don't exist.
 * @param {Record<string, unknown>} event - The parsed webhook payload
 * @param {{ dir?: string, type?: string }} [opts]
 */
function persistEvent(event, opts = {}) {
  const dir = opts.dir || process.env.VONAGE_EVENT_STORE_DIR || DEFAULT_DIR
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  } catch { /* ignore */ }
  const type = opts.type || 'voice-event'
  const filename = `${type}-${new Date().toISOString().slice(0, 10)}.jsonl`
  const filepath = path.join(dir, filename)
  const line = JSON.stringify({
    ...event,
    _receivedAt: new Date().toISOString(),
    _type: type,
  }) + '\n'
  try {
    fs.appendFileSync(filepath, line, 'utf8')
  } catch (e) {
    console.error('[vonage-event-store] write failed:', e instanceof Error ? e.message : e)
  }
}

/**
 * Read recent events from today's file (or a specific date).
 * @param {{ dir?: string, type?: string, date?: string, limit?: number }} [opts]
 * @returns {Array<Record<string, unknown>>}
 */
function readRecentEvents(opts = {}) {
  const dir = opts.dir || process.env.VONAGE_EVENT_STORE_DIR || DEFAULT_DIR
  const type = opts.type || 'voice-event'
  const date = opts.date || new Date().toISOString().slice(0, 10)
  const filepath = path.join(dir, `${type}-${date}.jsonl`)
  try {
    if (!fs.existsSync(filepath)) return []
    const lines = fs.readFileSync(filepath, 'utf8').trim().split('\n').filter(Boolean)
    const events = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    const limit = opts.limit || 100
    return events.slice(-limit)
  } catch {
    return []
  }
}

module.exports = { persistEvent, readRecentEvents, DEFAULT_DIR }

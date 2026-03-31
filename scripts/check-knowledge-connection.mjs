/**
 * Verifies DigitalOcean Spaces + PostgreSQL (RAG) using the same env as Electron.
 * Run: node scripts/check-knowledge-connection.mjs
 * Does not print secrets.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const require = createRequire(import.meta.url)

function loadDotenv() {
  try {
    const raw = fs.readFileSync(path.join(root, '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = val
    }
  } catch {
    /* no .env */
  }
}

loadDotenv()

const spacesClient = require(path.join(root, 'electron', 'spaces-client.cjs'))

async function checkSpaces() {
  console.log('--- DigitalOcean Spaces (knowledge file storage) ---')
  if (!spacesClient.isConfigured()) {
    console.log('Result: NOT CONFIGURED — set DO_SPACES_ENDPOINT, DO_SPACES_BUCKET, DO_SPACES_KEY, DO_SPACES_SECRET')
    return false
  }
  try {
    await spacesClient.listFiles('rag-docs/')
    console.log('Result: OK — ListObjects on prefix rag-docs/ succeeded')
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log('Result: FAILED —', msg)
    return false
  }
}

async function checkPostgres() {
  console.log('--- PostgreSQL (RAG / DATABASE_URL) ---')
  const ragOff = ['false', '0', 'no'].includes((process.env.RAG_DB_ENABLED || '').trim().toLowerCase())
  if (ragOff) {
    console.log('Result: SKIPPED — RAG_DB_ENABLED=false')
    return null
  }
  const rawUrl = (process.env.DATABASE_URL || '').trim()
  if (!rawUrl) {
    console.log('Result: NOT CONFIGURED — DATABASE_URL empty')
    return false
  }
  const { default: pg } = await import('pg')
  const { Pool } = pg
  const url = rawUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '')
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 12_000,
  })
  try {
    await pool.query('SELECT 1 AS ok')
    console.log('Result: OK — database accepted a connection')
    await pool.end()
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log('Result: FAILED —', msg)
    try {
      await pool.end()
    } catch {
      /* ignore */
    }
    return false
  }
}

const s = await checkSpaces()
const p = await checkPostgres()
console.log('--- summary ---')
console.log('Spaces:  ', s === true ? 'connected' : s === false ? 'failed or not configured' : 'unknown')
console.log(
  'Postgres:',
  p === true ? 'connected' : p === false ? 'failed or not configured' : 'skipped',
)

/**
 * Diagnoses why Jarvis might not read the knowledge base:
 * DB connectivity, schema readiness, chunk counts, embedding API.
 * Run: node scripts/diagnose-rag.mjs
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

const ragDb = require(path.join(root, 'electron', 'rag-db.cjs'))

async function main() {
  console.log('=== RAG / Knowledge base diagnosis ===\n')

  console.log('1) Environment')
  console.log('   RAG_DB_ENABLED:', process.env.RAG_DB_ENABLED ?? '(default true)')
  console.log('   DATABASE_URL:', process.env.DATABASE_URL ? 'set' : 'MISSING')
  console.log('   OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'set' : 'MISSING (required for embeddings + search)')
  console.log('   DO_SPACES_* / Spaces:', require(path.join(root, 'electron', 'spaces-client.cjs')).isConfigured() ? 'configured' : 'not set (files still in DB if ingested)')

  console.log('\n2) rag-db module')
  console.log('   isConfigured():', ragDb.isConfigured())
  if (!ragDb.isConfigured()) {
    console.log('\n   Fix: set DATABASE_URL in .env (Managed Postgres + pgvector).')
    process.exit(0)
  }

  await ragDb.initSchema()
  console.log('   isReady():', ragDb.isReady())
  if (!ragDb.isReady()) {
    console.log('\n   Schema init did not complete — check Electron logs for [rag-db].')
    console.log('   Common causes: DB unreachable, missing vector extension, wrong credentials.')
    await ragDb.shutdown().catch(() => {})
    process.exit(0)
  }

  const { default: pg } = await import('pg')
  const rawUrl = (process.env.DATABASE_URL || '').trim().replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '')
  const testPool = new pg.Pool({
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
  })
  let chunkRowCount = 0
  try {
    const docCount = await testPool.query('SELECT COUNT(*)::int AS n FROM documents')
    const chunkCount = await testPool.query('SELECT COUNT(*)::int AS n FROM chunks')
    chunkRowCount = Number(chunkCount.rows[0]?.n) || 0
    console.log('\n3) Data')
    console.log('   documents row count:', docCount.rows[0]?.n ?? '?')
    console.log('   chunks row count:', chunkRowCount)
    if (chunkRowCount === 0) {
      console.log('\n   No indexed chunks — Jarvis has nothing to retrieve. Upload/ingest files in the app, or use create_document / ingest.')
    }
  } catch (e) {
    console.log('\n3) Data — query failed:', e instanceof Error ? e.message : e)
  } finally {
    await testPool.end().catch(() => {})
  }

  console.log('\n4) Embedding API (needed for search)')
  try {
    const emb = await ragDb.embedSingle('connectivity test')
    console.log('   embedSingle: OK (vector length', emb?.length ?? 0, ')')
    const hits = await ragDb.searchSimilar(emb, 3, 0.01)
    console.log('   searchSimilar (threshold 0.01):', hits.length, 'row(s)')
    if (chunkRowCount > 0 && hits.length === 0) {
      console.log('   Note: try a query related to your document text; default voice search uses similarity > 0.3.')
    }
  } catch (e) {
    console.log('   FAILED:', e instanceof Error ? e.message : e)
    console.log('   Fix: ensure OPENAI_API_KEY is valid and billing allows text-embedding-3-small.')
  }

  await ragDb.shutdown().catch(() => {})

  console.log('\n5) Where RAG runs')
  console.log('   Full /api/rag/* is implemented in Electron (main.cjs), not in plain `npm run dev` browser.')
  console.log('   Use: npm run desktop:dev or npm run desktop — same .env as this script.')

  console.log('\n=== done ===')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

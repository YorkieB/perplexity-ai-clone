/**
 * RAG database layer — PostgreSQL + pgvector.
 *
 * Manages document metadata, text chunks with vector embeddings,
 * and semantic similarity search for retrieval-augmented generation.
 */
const { Pool } = require('pg')

let _pool = null
/** True only after initSchema() completes successfully. */
let _schemaReady = false
/** True after a failed init — do not retry connecting on every request. */
let _initFailed = false

function isRagEnvEnabled() {
  const v = (process.env.RAG_DB_ENABLED ?? 'true').trim().toLowerCase()
  return v !== 'false' && v !== '0' && v !== 'no'
}

function getPool() {
  if (_initFailed) {
    throw new Error('RAG database unavailable — initial connection failed. Set RAG_DB_ENABLED=false in .env to run without RAG, or fix DATABASE_URL / network access.')
  }
  if (_pool) return _pool
  const rawUrl = (process.env.DATABASE_URL || '').trim()
  if (!rawUrl) throw new Error('DATABASE_URL not set — add your DigitalOcean Managed PostgreSQL connection string to .env')
  // Strip sslmode from the URL — we handle SSL via the ssl option to avoid
  // pg treating sslmode=require as verify-full (which rejects DO's self-signed certs)
  const url = rawUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '')
  _pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 12_000,
  })
  _pool.on('error', (err) => console.error('[rag-db] pool error:', err.message))
  return _pool
}

function isConfigured() {
  return Boolean((process.env.DATABASE_URL || '').trim()) && isRagEnvEnabled()
}

function isReady() {
  return _schemaReady
}

// ── Schema ──────────────────────────────────────────────────────────────────

async function initSchema() {
  if (!isConfigured()) return
  let pool
  try {
    pool = getPool()
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector')
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title TEXT NOT NULL,
      filename TEXT,
      spaces_key TEXT,
      mime_type TEXT,
      source TEXT NOT NULL DEFAULT 'upload',
      size_bytes INTEGER,
      chunk_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB DEFAULT '{}'
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chunks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER,
      embedding vector(1536),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Indexes — use IF NOT EXISTS via DO block to avoid errors on repeat runs
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'chunks_document_idx') THEN
        CREATE INDEX chunks_document_idx ON chunks (document_id);
      END IF;
    END $$
  `)

  // IVFFlat index needs rows to exist; create only if table has data
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'chunks_embedding_idx') THEN
        BEGIN
          CREATE INDEX chunks_embedding_idx ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
        EXCEPTION WHEN others THEN
          RAISE NOTICE 'Skipping IVFFlat index — will be created after data is loaded';
        END;
      END IF;
    END $$
  `)

    _schemaReady = true
    console.info('[jarvis] RAG: PostgreSQL schema ready — knowledge base (pgvector) is up')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    _initFailed = true
    _schemaReady = false
    try {
      await shutdown()
    } catch {
      /* ignore */
    }
    console.warn('[rag-db] Schema init skipped — RAG disabled for this session:', msg)
    console.warn(
      '[rag-db] Fix DATABASE_URL / firewall / DigitalOcean trusted sources, or add RAG_DB_ENABLED=false to .env to silence this and run without the knowledge base.',
    )
  }
}

// ── Embeddings (OpenAI) ─────────────────────────────────────────────────────

async function embedTexts(texts) {
  const key = (process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || '').trim()
  if (!key) throw new Error('OPENAI_API_KEY required for embeddings')
  const base = (process.env.OPENAI_BASE_URL || process.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')

  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Embedding API ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.data.map((d) => d.embedding)
}

async function embedSingle(text) {
  const [emb] = await embedTexts([text])
  return emb
}

// ── Text Chunking ───────────────────────────────────────────────────────────

const CHUNK_MAX_CHARS = 3200
const CHUNK_OVERLAP_CHARS = 800

function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

function chunkText(text) {
  if (!text || text.trim().length === 0) return []

  const paragraphs = text.split(/\n{2,}/)
  const chunks = []
  let current = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    if (current.length + trimmed.length + 1 > CHUNK_MAX_CHARS && current.length > 0) {
      chunks.push(current.trim())
      // Overlap: keep the tail of the current chunk
      const overlapStart = Math.max(0, current.length - CHUNK_OVERLAP_CHARS)
      current = current.slice(overlapStart) + '\n\n' + trimmed
    } else {
      current = current ? current + '\n\n' + trimmed : trimmed
    }
  }
  if (current.trim()) chunks.push(current.trim())

  // If a single chunk is still too long, split by sentences
  const finalChunks = []
  for (const chunk of chunks) {
    if (chunk.length <= CHUNK_MAX_CHARS * 1.5) {
      finalChunks.push(chunk)
    } else {
      const sentences = chunk.split(/(?<=[.!?])\s+/)
      let buf = ''
      for (const s of sentences) {
        if (buf.length + s.length + 1 > CHUNK_MAX_CHARS && buf.length > 0) {
          finalChunks.push(buf.trim())
          const overlapStart = Math.max(0, buf.length - CHUNK_OVERLAP_CHARS)
          buf = buf.slice(overlapStart) + ' ' + s
        } else {
          buf = buf ? buf + ' ' + s : s
        }
      }
      if (buf.trim()) finalChunks.push(buf.trim())
    }
  }
  return finalChunks
}

// ── Document CRUD ───────────────────────────────────────────────────────────

async function insertDocument({ title, filename, spacesKey, mimeType, source, sizeBytes, metadata }) {
  const pool = getPool()
  const res = await pool.query(
    `INSERT INTO documents (title, filename, spaces_key, mime_type, source, size_bytes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [title, filename || null, spacesKey || null, mimeType || null, source || 'upload', sizeBytes || 0, JSON.stringify(metadata || {})]
  )
  return res.rows[0]
}

async function insertChunks(documentId, chunkTexts, embeddings) {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < chunkTexts.length; i++) {
      const text = chunkTexts[i]
      const emb = embeddings[i]
      const embStr = `[${emb.join(',')}]`
      await client.query(
        `INSERT INTO chunks (document_id, chunk_index, content, token_count, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [documentId, i, text, estimateTokens(text), embStr]
      )
    }
    await client.query(
      'UPDATE documents SET chunk_count = $1, updated_at = NOW() WHERE id = $2',
      [chunkTexts.length, documentId]
    )
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function searchSimilar(queryEmbedding, limit, threshold) {
  const pool = getPool()
  limit = typeof limit === 'number' && limit > 0 ? limit : 5
  threshold = typeof threshold === 'number' && !Number.isNaN(threshold) ? threshold : 0.3
  const embStr = `[${queryEmbedding.join(',')}]`
  const res = await pool.query(
    `SELECT c.id AS chunk_id, c.content, c.chunk_index, c.token_count,
            d.id AS document_id, d.title AS document_title, d.filename, d.source,
            1 - (c.embedding <=> $1::vector) AS similarity
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE 1 - (c.embedding <=> $1::vector) > $2
     ORDER BY c.embedding <=> $1::vector
     LIMIT $3`,
    [embStr, threshold, limit]
  )
  return res.rows
}

async function listDocuments(limit, offset) {
  const pool = getPool()
  const res = await pool.query(
    `SELECT id, title, filename, spaces_key, mime_type, source, size_bytes, chunk_count, created_at, updated_at, metadata
     FROM documents ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit || 50, offset || 0]
  )
  return res.rows
}

async function getDocument(id) {
  const pool = getPool()
  const res = await pool.query(
    `SELECT id, title, filename, spaces_key, mime_type, source, size_bytes, chunk_count, created_at, updated_at, metadata
     FROM documents WHERE id = $1`,
    [id]
  )
  return res.rows[0] || null
}

async function getDocumentChunks(documentId) {
  const pool = getPool()
  const res = await pool.query(
    'SELECT id, chunk_index, content, token_count FROM chunks WHERE document_id = $1 ORDER BY chunk_index',
    [documentId]
  )
  return res.rows
}

async function deleteDocument(id) {
  const pool = getPool()
  const doc = await getDocument(id)
  if (!doc) return null
  await pool.query('DELETE FROM documents WHERE id = $1', [id])
  return doc
}

async function shutdown() {
  if (_pool) {
    await _pool.end()
    _pool = null
  }
}

// ── High-level ingest pipeline ──────────────────────────────────────────────

async function ingestText(text, { title, filename, spacesKey, mimeType, source, sizeBytes, metadata }) {
  const chunks = chunkText(text)
  if (chunks.length === 0) throw new Error('No text to index — document is empty')

  // Batch embed (OpenAI accepts up to 2048 inputs per call; chunk further if needed)
  const BATCH = 128
  const allEmbeddings = []
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH)
    const embs = await embedTexts(batch)
    allEmbeddings.push(...embs)
  }

  const doc = await insertDocument({ title, filename, spacesKey, mimeType, source, sizeBytes, metadata })
  await insertChunks(doc.id, chunks, allEmbeddings)
  return { documentId: doc.id, chunkCount: chunks.length, createdAt: doc.created_at }
}

module.exports = {
  isConfigured,
  isReady,
  initSchema,
  embedTexts,
  embedSingle,
  chunkText,
  estimateTokens,
  insertDocument,
  insertChunks,
  searchSimilar,
  listDocuments,
  getDocument,
  getDocumentChunks,
  deleteDocument,
  ingestText,
  shutdown,
}

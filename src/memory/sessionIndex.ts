/**
 * Ephemeral session vector index for Jarvis: chunks each conversation turn (code fences,
 * prose, structured text) and retrieves by semantic similarity.
 *
 * The `chromadb` npm client speaks to a Chroma **server**; there is no bundled in-process
 * DB on all platforms. This module therefore uses an in-memory cosine index (no disk I/O)
 * with the same embedding + metadata workflow as Chroma collections. When
 * `useChromaServer` is true and `CHROMA_HOST` (or options) points at a reachable server,
 * storage and query delegate to a dedicated `chromadb` collection (still session-scoped).
 */

import { randomIdSegment } from '@/lib/secure-random'

const LOG = '[SessionIndex]'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const HIT_THRESHOLD = 0.82
const MAX_CHUNK_CHARS = 6000
const MIN_TEXT_CHUNK_CHARS = 48

/** Normalised query result (cosine similarity in [0, 1]). */
export interface SessionQueryResult {
  hit: boolean
  chunks: string[]
  bestScore: number
  /** Per-hit metadata from Chroma or the in-memory index (shape matches Chroma metadatas). */
  metadatas: unknown[]
}

export type SessionArtifactType = 'code' | 'text' | 'output' | 'analysis'

export interface SessionIndexOptions {
  /** Stable id for this chat session (collection naming / debugging). */
  sessionId?: string
  /** OpenAI API key for text-embedding-3-small. Required unless `embedTexts` is set. */
  openaiApiKey?: string
  /** OpenAI API base (no trailing slash). Use a same-origin proxy in the browser if needed. */
  openaiBaseUrl?: string
  /** Custom embedder; must return one vector per input string (same dim for all). */
  embedTexts?: (texts: string[]) => Promise<number[][]>
  /** Try Chroma HTTP server first (default false = pure in-memory, zero disk). */
  useChromaServer?: boolean
  chromaHost?: string
  chromaPort?: number
  chromaSsl?: boolean
}

type ChunkKind = SessionArtifactType | 'structured'

interface ExtractedChunk {
  readonly text: string
  readonly kind: ChunkKind
  readonly language: string | null
  readonly source: 'fence' | 'heuristic' | 'paragraph' | 'structured' | 'full_turn'
}

interface StoredRow {
  readonly id: string
  readonly document: string
  readonly embedding: number[]
  readonly metadata: Record<string, unknown>
}

function logWarn(message: string, cause?: unknown): void {
  if (cause !== undefined) {
    console.warn(`${LOG} ${message}`, cause)
  } else {
    console.warn(`${LOG} ${message}`)
  }
}

function logInfo(message: string): void {
  console.info(`${LOG} ${message}`)
}

function clampText(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}\n… [truncated]`
}

function l2Normalize(v: number[]): number[] {
  let sum = 0
  for (const x of v) sum += x * x
  const n = Math.sqrt(sum)
  if (n === 0 || !Number.isFinite(n)) return v
  return v.map((x) => x / n)
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  if (!Number.isFinite(dot)) return 0
  return Math.max(0, Math.min(1, dot))
}

/** Chroma cosine distance is typically (1 - cos_sim) for unit vectors. */
function chromaDistanceToSimilarity(distance: number): number {
  if (!Number.isFinite(distance)) return 0
  const sim = 1 - distance
  return Math.max(0, Math.min(1, sim))
}

const CODE_LINE_START =
  /^(def |class |import |from |function |const |let |var |public |private |fn |impl |use |async |await |SELECT |CREATE |#include|package )/i

function lineLooksCodeish(line: string): boolean {
  const t = line.trimStart()
  if (CODE_LINE_START.test(t)) return true
  if (t.startsWith('//') || t.startsWith('/*')) return true
  if (t.startsWith('{') || t.startsWith('[')) return true
  return false
}

function detectLanguageFromFence(lang: string | undefined): string | null {
  if (!lang || !lang.trim()) return null
  const l = lang.trim().toLowerCase()
  if (l === 'ts' || l === 'tsx') return l
  if (l === 'js' || l === 'jsx') return l
  return l
}

function looksLikeCodeBlock(body: string): boolean {
  const t = body.trim()
  if (t.length < 12) return false
  const lines = t.split('\n').filter((l) => l.trim().length > 0)
  if (lines.some(lineLooksCodeish)) return true
  if (lines.length >= 3) {
    let indented = 0
    for (const l of lines) {
      if (/^\s{2,}\S/.test(l)) indented += 1
    }
    if (indented / lines.length > 0.4) return true
  }
  return false
}

function classifyParagraph(text: string): SessionArtifactType {
  const lower = text.toLowerCase()
  if (/^(error|warning|result|output|stdout|stderr|exit code)/m.test(lower)) return 'output'
  if (
    /\b(therefore|in conclusion|analysis|summary|recommendation|finding)\b/.test(lower) ||
    /^\d+\.\s/m.test(text)
  ) {
    return 'analysis'
  }
  return 'text'
}

function tryStructuredSnippet(raw: string): ExtractedChunk | null {
  const t = raw.trim()
  if (t.length < MIN_TEXT_CHUNK_CHARS) return null
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      JSON.parse(t)
      return {
        text: clampText(t, MAX_CHUNK_CHARS),
        kind: 'structured',
        language: 'json',
        source: 'structured',
      }
    } catch {
      /* not JSON */
    }
  }
  const lines = t.split('\n').filter((l) => l.length > 0)
  const first = lines[0].trim()
  const commaCount = (first.match(/,/g) ?? []).length
  if (lines.length >= 2 && commaCount >= 2 && !first.includes('\t')) {
    return {
      text: clampText(t, MAX_CHUNK_CHARS),
      kind: 'structured',
      language: 'csv',
      source: 'structured',
    }
  }
  if (/^#{1,6}\s+\S/m.test(t) || /\n[-*]\s+\S/m.test(t)) {
    return {
      text: clampText(t, MAX_CHUNK_CHARS),
      kind: 'structured',
      language: 'markdown',
      source: 'structured',
    }
  }
  return null
}

function extractFencedCodeChunks(parts: string[]): ExtractedChunk[] {
  const fenced: ExtractedChunk[] = []
  for (let i = 1; i < parts.length; i += 2) {
    const segment = parts[i] ?? ''
    const nl = segment.indexOf('\n')
    const langRaw = nl >= 0 ? segment.slice(0, nl).trim() : segment.trim()
    const body = (nl >= 0 ? segment.slice(nl + 1) : '').replace(/\r\n/g, '\n')
    if (!body.trim()) continue
    fenced.push({
      text: clampText(body, MAX_CHUNK_CHARS),
      kind: 'code',
      language: detectLanguageFromFence(langRaw),
      source: 'fence',
    })
  }
  return fenced
}

function remainderOutsideFences(parts: string[]): string {
  let remainder = ''
  for (let i = 0; i < parts.length; i += 2) {
    remainder += parts[i] ?? ''
  }
  return remainder
}

function pushParagraphChunks(remainder: string, out: ExtractedChunk[]): void {
  const paras = remainder
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= MIN_TEXT_CHUNK_CHARS)

  for (const p of paras) {
    if (/```/.test(p)) continue
    const structured = tryStructuredSnippet(p)
    if (structured) {
      out.push(structured)
      continue
    }
    if (looksLikeCodeBlock(p)) {
      out.push({
        text: clampText(p, MAX_CHUNK_CHARS),
        kind: 'code',
        language: null,
        source: 'heuristic',
      })
      continue
    }
    const kind = classifyParagraph(p)
    out.push({
      text: clampText(p, MAX_CHUNK_CHARS),
      kind,
      language: null,
      source: 'paragraph',
    })
  }
}

/**
 * Pull fenced code, heuristic code, structured snippets, and paragraph-level text from a turn.
 */
export function extractChunksFromMessage(message: string, role: 'user' | 'assistant'): ExtractedChunk[] {
  const out: ExtractedChunk[] = []
  if (!message || !message.trim()) return out

  const full = clampText(message.trim(), MAX_CHUNK_CHARS * 2)
  const parts = message.split('```')
  out.push(...extractFencedCodeChunks(parts))
  pushParagraphChunks(remainderOutsideFences(parts), out)

  out.push({
    text: full,
    kind: role === 'assistant' ? 'analysis' : 'text',
    language: null,
    source: 'full_turn',
  })

  return out
}

async function defaultOpenAiEmbed(apiKey: string, baseUrl: string, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const root = baseUrl.replace(/\/$/, '')
  const res = await fetch(`${root}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`OpenAI embeddings ${String(res.status)}: ${err}`)
  }
  const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> }
  const rows = data.data ?? []
  return rows.map((r) => l2Normalize(r.embedding ?? []))
}

/** In-memory cosine index (Chroma-compatible semantics, no disk). */
class EphemeralVectorCollection {
  private readonly rows: StoredRow[] = []

  addBatch(batch: StoredRow[]): void {
    this.rows.push(...batch)
  }

  queryCosine(queryEmbedding: number[], nResults: number): Array<{ document: string; metadata: Record<string, unknown>; similarity: number }> {
    const q = l2Normalize(queryEmbedding)
    const scored = this.rows.map((r) => ({
      document: r.document,
      metadata: r.metadata,
      similarity: cosineSimilarity(q, r.embedding),
    }))
    scored.sort((a, b) => b.similarity - a.similarity)
    return scored.slice(0, Math.max(0, nResults))
  }

  count(): number {
    return this.rows.length
  }
}

type ChromaCollectionLike = {
  add: (args: {
    ids: string[]
    embeddings?: number[][]
    metadatas?: Record<string, unknown>[]
    documents?: string[]
  }) => Promise<void>
  query: (args: {
    queryEmbeddings: number[][]
    nResults: number
    include?: string[]
  }) => Promise<{
    documents: (string | null)[][] | null
    distances: number[][] | null
    metadatas: (Record<string, unknown> | null)[][] | null
  }>
}

export default class SessionIndex {
  private readonly options: SessionIndexOptions
  private readonly collectionName: string
  private readonly memory = new EphemeralVectorCollection()
  private chromaCollection: ChromaCollectionLike | null = null
  private chromaReady: Promise<void> | null = null
  private turnSeq = 0
  private indexQueue: Promise<void> = Promise.resolve()
  private latestCode: string | null = null
  private readonly latestByType = new Map<SessionArtifactType, { payload: unknown; metadata: Record<string, unknown> }>()

  constructor(options: SessionIndexOptions = {}) {
    this.options = options
    const sid =
      options.sessionId?.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) ||
      `${Date.now().toString(36)}_${randomIdSegment()}`
    this.collectionName = `jarvis_session_${sid}`
    if (options.useChromaServer) {
      this.chromaReady = this.initChromaServer().catch((e) => {
        logWarn('Chroma server unavailable; using in-memory index only.', e)
        this.chromaCollection = null
      })
    }
  }

  private async initChromaServer(): Promise<void> {
    const host = this.options.chromaHost ?? (typeof process !== 'undefined' ? process.env.CHROMA_HOST : undefined) ?? '127.0.0.1'
    const port = this.options.chromaPort ?? Number((typeof process !== 'undefined' ? process.env.CHROMA_PORT : undefined) ?? 8000)
    const ssl = this.options.chromaSsl ?? false
    const { ChromaClient } = await import('chromadb')
    const client = new ChromaClient({ host, port, ssl })
    await client.heartbeat()
    let col
    try {
      col = await client.getOrCreateCollection({
        name: this.collectionName,
        configuration: {
          hnsw: { space: 'cosine' },
        },
      })
    } catch {
      col = await client.getOrCreateCollection({ name: this.collectionName })
    }
    this.chromaCollection = col as unknown as ChromaCollectionLike
    logInfo(`Attached to Chroma collection "${this.collectionName}" at ${host}:${String(port)}`)
  }

  private async getEmbedder(): Promise<(texts: string[]) => Promise<number[][]>> {
    if (this.options.embedTexts) return this.options.embedTexts
    const key = this.options.openaiApiKey?.trim()
    if (!key) {
      throw new Error('SessionIndex: provide openaiApiKey or embedTexts for embeddings')
    }
    const base = this.options.openaiBaseUrl?.replace(/\/$/, '') ?? 'https://api.openai.com/v1'
    return (texts: string[]) => defaultOpenAiEmbed(key, base, texts)
  }

  private updateLatestArtifacts(chunks: ExtractedChunk[], metas: Record<string, unknown>[]): void {
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i]
      const meta = metas[i] ?? {}
      if (ch.kind === 'code') {
        this.latestCode = ch.text
      }
      if (ch.kind === 'code' || ch.kind === 'text' || ch.kind === 'output' || ch.kind === 'analysis') {
        this.latestByType.set(ch.kind, { payload: ch.text, metadata: { ...meta } })
      }
      if (ch.kind === 'structured') {
        this.latestByType.set('text', { payload: ch.text, metadata: { ...meta, structured: true } })
      }
    }
  }

  /**
   * Index one conversation turn (async behind a serialized queue). Safe to call from UI threads;
   * failures are logged and do not throw to the caller.
   */
  indexTurn(message: string, role: 'user' | 'assistant'): void {
    this.indexQueue = this.indexQueue
      .then(() => this.indexTurnAsync(message, role))
      .catch((e) => {
        logWarn('indexTurn failed', e)
      })
  }

  private async indexTurnAsync(message: string, role: 'user' | 'assistant'): Promise<void> {
    if (!message || !message.trim()) {
      logInfo('indexTurn skipped: empty message')
      return
    }
    if (this.chromaReady) {
      await this.chromaReady.catch(() => {})
    }

    const turnId = ++this.turnSeq
    const chunks = extractChunksFromMessage(message, role)
    if (chunks.length === 0) return

    const texts = chunks.map((c) => c.text)
    let embeddings: number[][]
    try {
      const embed = await this.getEmbedder()
      embeddings = await embed(texts)
    } catch (e) {
      logWarn('embedding failed; turn not indexed', e)
      return
    }
    if (embeddings.length !== chunks.length) {
      logWarn(`embedding count mismatch: ${String(embeddings.length)} vs ${String(chunks.length)}`)
      return
    }

    const ids: string[] = []
    const metadatas: Record<string, unknown>[] = []
    const batch: StoredRow[] = []

    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i]
      const id = `${this.collectionName}_${String(turnId)}_${String(i)}`
      ids.push(id)
      const meta: Record<string, unknown> = {
        role,
        turnId,
        chunkType: ch.kind,
        language: ch.language,
        source: ch.source,
      }
      metadatas.push(meta)
      batch.push({
        id,
        document: ch.text,
        embedding: l2Normalize(embeddings[i] ?? []),
        metadata: meta,
      })
    }

    this.updateLatestArtifacts(chunks, metadatas)
    this.memory.addBatch(batch)

    if (this.chromaCollection) {
      try {
        await this.chromaCollection.add({
          ids,
          embeddings,
          metadatas,
          documents: texts,
        })
      } catch (e) {
        logWarn('Chroma add failed; data retained in memory only', e)
      }
    }
  }

  /**
   * Semantic search over indexed chunks. Uses OpenAI embeddings for the query string.
   * (Network I/O; returns a Promise.)
   */
  async query(message: string, nResults: number): Promise<SessionQueryResult> {
    const k = Math.max(1, Math.floor(nResults))
    if (!message || !message.trim()) {
      return { hit: false, chunks: [], bestScore: 0, metadatas: [] }
    }
    if (this.chromaReady) {
      await this.chromaReady.catch(() => {})
    }

    let queryEmbedding: number[]
    try {
      const embed = await this.getEmbedder()
      const [vec] = await embed([message.trim()])
      queryEmbedding = l2Normalize(vec ?? [])
    } catch (e) {
      logWarn('query: embedding failed', e)
      return { hit: false, chunks: [], bestScore: 0, metadatas: [] }
    }

    if (this.chromaCollection) {
      try {
        const qr = await this.chromaCollection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: k,
          include: ['distances', 'documents', 'metadatas'],
        })
        const docs = qr.documents?.[0] ?? []
        const dists = qr.distances?.[0] ?? []
        const metas = qr.metadatas?.[0] ?? []
        const chunks: string[] = []
        const metadatas: unknown[] = []
        let best = 0
        for (let i = 0; i < docs.length; i++) {
          const d = docs[i]
          const dist = dists[i] ?? 1
          const sim = chromaDistanceToSimilarity(dist)
          if (d) chunks.push(d)
          metadatas.push(metas[i] ?? {})
          if (sim > best) best = sim
        }
        return { hit: best >= HIT_THRESHOLD, chunks, bestScore: best, metadatas }
      } catch (e) {
        logWarn('Chroma query failed; falling back to memory', e)
      }
    }

    const hits = this.memory.queryCosine(queryEmbedding, k)
    const chunks = hits.map((h) => h.document)
    const metadatas: unknown[] = hits.map((h) => h.metadata)
    const best = hits.length > 0 ? hits[0].similarity : 0
    return { hit: best >= HIT_THRESHOLD, chunks, bestScore: best, metadatas }
  }

  getLatestCode(): string | null {
    return this.latestCode
  }

  getLatestArtifactByType(type: SessionArtifactType): { content: unknown; metadata: Record<string, unknown> } | null {
    const row = this.latestByType.get(type)
    return row ? { content: row.payload, metadata: row.metadata } : null
  }
}

/**
 * Jarvis long-term hybrid RAG: OpenAI embeddings + FAISS `IndexFlatIP` (cosine via L2-normalized
 * inner product), {@link BM25Index} sparse retrieval, and Reciprocal Rank Fusion (RRF).
 *
 * Persists under `indexPath`: `faiss.index` and `metadata.json`. Node.js / Electron main only.
 */

import fs from 'node:fs'
import path from 'node:path'

import { IndexFlatIP } from 'faiss-node'
import OpenAI from 'openai'

import type { LongTermIndex as LongTermIndexContract } from '@/rag/retrievalGate'
import { BM25Index } from '@/rag/bm25Index'
import { chunkCode, detectLanguage } from './codeChunker'

const LOG = '[LongTermIndex]'

const TEXT_CHUNK_SIZE = 500
const TEXT_CHUNK_OVERLAP = 50
const RRF_K = 60

/** One stored chunk with provenance and optional code-span metadata. */
export interface LongTermChunk {
  content: string
  source: string
  type: 'code' | 'text' | 'conversation_summary' | 'documentation'
  language?: string
  chunkType?: string
  name?: string
  startLine?: number
  endLine?: number
  addedAt: string
}

/** Hybrid retrieval outcome for {@link LongTermIndex.query}. */
export interface LongTermQueryResult {
  hit: boolean
  chunks: string[]
  metadatas: LongTermChunk[]
  bestScore: number
}

interface PersistedMetadataFile {
  readonly metadata: LongTermChunk[]
  readonly bm25: object
  readonly totalDocs: number
}

function isPersistedMetadataFile(data: unknown): data is PersistedMetadataFile {
  if (data === null || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return Array.isArray(d.metadata) && typeof d.bm25 === 'object' && d.bm25 !== null && typeof d.totalDocs === 'number'
}

function pushCharWindows(s: string, chunkSize: number, overlap: number, out: string[]): void {
  const step = Math.max(1, chunkSize - overlap)
  for (let i = 0; i < s.length; i += step) {
    out.push(s.slice(i, i + chunkSize))
  }
}

function appendOverflowSentence(sent: string, chunkSize: number, overlap: number, out: string[]): string {
  if (sent.length <= chunkSize) {
    return sent
  }
  pushCharWindows(sent, chunkSize, overlap, out)
  return ''
}

function appendParagraphChunks(p: string, chunkSize: number, overlap: number, out: string[]): void {
  const sentences = p.split(/(?<=[.!?])\s+/)
  if (sentences.length <= 1) {
    pushCharWindows(p, chunkSize, overlap, out)
    return
  }
  let buf = ''
  for (const s of sentences) {
    const sent = s.trim()
    if (sent.length === 0) continue
    const gap = buf ? 1 : 0
    if (buf.length + sent.length + gap <= chunkSize) {
      buf = buf ? `${buf} ${sent}` : sent
      continue
    }
    if (buf) out.push(buf)
    buf = appendOverflowSentence(sent, chunkSize, overlap, out)
  }
  if (buf) out.push(buf)
}

/**
 * Split long text: prefer paragraph boundaries, then sentences, then fixed windows with overlap.
 */
function splitTextRecursive(text: string, chunkSize: number, overlap: number): string[] {
  const t = text.trim()
  if (t.length === 0) return []
  const out: string[] = []
  for (const para of t.split(/\n\s*\n/)) {
    const p = para.trim()
    if (p.length === 0) continue
    if (p.length <= chunkSize) {
      out.push(p)
    } else {
      appendParagraphChunks(p, chunkSize, overlap, out)
    }
  }
  return out.filter((c) => c.trim().length > 0)
}

function reciprocalRankFusion(denseOrder: number[], bm25Order: number[], k: number): Map<number, number> {
  const scores = new Map<number, number>()
  denseOrder.forEach((docId, rank) => {
    scores.set(docId, (scores.get(docId) ?? 0) + 1 / (k + rank + 1))
  })
  bm25Order.forEach((docId, rank) => {
    scores.set(docId, (scores.get(docId) ?? 0) + 1 / (k + rank + 1))
  })
  return scores
}

function denseFaissOrder(
  faiss: IndexFlatIP | null,
  qArr: number[],
  pool: number,
  logPrefix: string,
): { order: number[]; bestDense: number } {
  const order: number[] = []
  let bestDense = 0
  try {
    if (faiss === null || faiss.ntotal() <= 0) {
      return { order, bestDense }
    }
    const kSearch = Math.min(pool, faiss.ntotal())
    const res = faiss.search(qArr, kSearch)
    const pairs: { idx: number; sim: number }[] = []
    for (let i = 0; i < res.labels.length; i++) {
      const label = res.labels[i]!
      if (label < 0) continue
      const sim = res.distances[i] ?? 0
      pairs.push({ idx: label, sim })
      if (sim > bestDense) bestDense = sim
    }
    pairs.sort((a, b) => b.sim - a.sim)
    for (const p of pairs) order.push(p.idx)
  } catch (e) {
    console.warn(`${logPrefix} FAISS search failed`, e)
  }
  return { order, bestDense }
}

/**
 * Hybrid long-term index: dense (FAISS + embeddings) + sparse (BM25) + RRF, persisted on disk.
 */
class LongTermIndex implements LongTermIndexContract {
  private static readonly EMBED_MODEL = 'text-embedding-3-small'
  private static readonly EMBED_DIM = 1536
  private static readonly CONFIDENCE_THRESHOLD = 0.75
  private static readonly BATCH_SIZE = 50

  private readonly indexPath: string
  private readonly faissPath: string
  private readonly metaPath: string
  private readonly openai: OpenAI
  private faiss: IndexFlatIP | null = null
  private bm25 = new BM25Index()
  private metadata: LongTermChunk[] = []

  /**
   * @param indexPath - Directory for `faiss.index` and `metadata.json` (created if missing).
   */
  constructor(indexPath: string = './jarvis_rag_index') {
    this.indexPath = path.resolve(indexPath)
    this.faissPath = path.join(this.indexPath, 'faiss.index')
    this.metaPath = path.join(this.indexPath, 'metadata.json')
    try {
      fs.mkdirSync(this.indexPath, { recursive: true })
    } catch (e) {
      console.warn(`${LOG} mkdir failed`, e)
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
    try {
      this.faiss = new IndexFlatIP(LongTermIndex.EMBED_DIM)
    } catch (e) {
      console.warn(`${LOG} FAISS init failed`, e)
      this.faiss = null
    }
    this.load()
  }

  /**
   * Embed many strings via OpenAI (batched). Requires `OPENAI_API_KEY`.
   */
  async embed(texts: string[]): Promise<number[][]> {
    const key = process.env.OPENAI_API_KEY?.trim()
    if (!key) {
      throw new Error(`${LOG} OPENAI_API_KEY is required for embeddings`)
    }
    if (texts.length === 0) return []
    const out: number[][] = []
    const batch = LongTermIndex.BATCH_SIZE
    for (let i = 0; i < texts.length; i += batch) {
      const slice = texts.slice(i, i + batch)
      const res = await this.openai.embeddings.create({
        model: LongTermIndex.EMBED_MODEL,
        input: slice,
      })
      const rows = res.data
      const sorted = [...rows].sort((a, b) => a.index - b.index)
      for (const row of sorted) {
        const emb = row.embedding
        if (!Array.isArray(emb) || emb.length !== LongTermIndex.EMBED_DIM) {
          throw new Error(`${LOG} embedding dimension mismatch (expected ${String(LongTermIndex.EMBED_DIM)})`)
        }
        out.push([...emb])
      }
    }
    return out
  }

  /**
   * L2-normalize each vector for cosine similarity as inner product on the unit sphere.
   */
  private l2Normalize(vectors: number[][]): Float32Array[] {
    return vectors.map((v) => {
      let s = 0
      for (const x of v) s += x * x
      const n = Math.sqrt(s)
      if (n === 0 || !Number.isFinite(n)) {
        return new Float32Array(v.length)
      }
      const out = new Float32Array(v.length)
      for (let i = 0; i < v.length; i++) {
        out[i] = v[i]! / n
      }
      return out
    })
  }

  /**
   * Ingest source code: AST/regex chunks, embed enriched strings, append to FAISS + BM25, persist.
   */
  async ingestCode(sourceCode: string, language: string, sourceName: string): Promise<void> {
    const langHint = language.trim() || detectLanguage(sourceCode)
    const chunks = chunkCode(sourceCode, langHint)
    if (chunks.length === 0) return

    const enriched: string[] = []
    const rows: LongTermChunk[] = []
    const now = new Date().toISOString()

    for (const c of chunks) {
      const lang = c.language.trim() || langHint
      const head = `[${lang}] [${c.chunkType}] ${c.name.trim()}\n`
      const enrichedText = `${head}${c.content}`
      enriched.push(enrichedText)
      rows.push({
        content: c.content,
        source: sourceName,
        type: 'code',
        language: lang,
        chunkType: c.chunkType,
        name: c.name.trim() || undefined,
        startLine: c.startLine,
        endLine: c.endLine,
        addedAt: now,
      })
    }

    const embeddings = await this.embed(enriched)
    const normalized = this.l2Normalize(embeddings)

    try {
      if (this.faiss === null) {
        this.faiss = new IndexFlatIP(LongTermIndex.EMBED_DIM)
      }
      for (const vec of normalized) {
        this.faiss.add(Array.from(vec))
      }
    } catch (e) {
      console.warn(`${LOG} FAISS add failed`, e)
      throw new Error(`${LOG} could not add vectors to FAISS index`)
    }

    this.bm25.add(enriched)
    this.metadata.push(...rows)
    this.save()
  }

  /**
   * Ingest plain text with recursive splitting (paragraphs → sentences → character windows).
   */
  async ingestText(
    text: string,
    sourceName: string,
    docType: 'conversation_summary' | 'documentation' = 'documentation',
  ): Promise<void> {
    const pieces = splitTextRecursive(text.trim(), TEXT_CHUNK_SIZE, TEXT_CHUNK_OVERLAP)
    if (pieces.length === 0) return

    const now = new Date().toISOString()
    const enriched = pieces.map((p) => `[text] ${sourceName}\n${p}`)
    const rows: LongTermChunk[] = pieces.map((p) => ({
      content: p,
      source: sourceName,
      type: docType,
      addedAt: now,
    }))

    const embeddings = await this.embed(enriched)
    const normalized = this.l2Normalize(embeddings)

    try {
      if (this.faiss === null) {
        this.faiss = new IndexFlatIP(LongTermIndex.EMBED_DIM)
      }
      for (const vec of normalized) {
        this.faiss.add(Array.from(vec))
      }
    } catch (e) {
      console.warn(`${LOG} FAISS add failed`, e)
      throw new Error(`${LOG} could not add vectors to FAISS index`)
    }

    this.bm25.add(enriched)
    this.metadata.push(...rows)
    this.save()
  }

  /**
   * Hybrid query: dense FAISS + sparse BM25, fused with RRF; `hit` uses max dense cosine vs threshold.
   * On FAISS failure, returns empty chunks (BM25-only fusion could be added later).
   */
  async query(message: string, topK: number = 5): Promise<LongTermQueryResult> {
    const empty: LongTermQueryResult = { hit: false, chunks: [], metadatas: [], bestScore: 0 }
    if (this.metadata.length === 0) {
      return empty
    }

    let queryEmbedding: number[][]
    try {
      queryEmbedding = await this.embed([message.trim()])
    } catch (e) {
      console.warn(`${LOG} query embed failed`, e)
      throw e instanceof Error ? e : new Error(`${LOG} query embed failed`)
    }

    const qNorm = this.l2Normalize(queryEmbedding)[0]
    if (!qNorm || qNorm.length === 0) {
      return empty
    }
    const qArr = Array.from(qNorm)

    const pool = Math.min(topK * 4, this.metadata.length)
    const { order: denseOrder, bestDense } = denseFaissOrder(this.faiss, qArr, pool, LOG)

    let bm25Order: number[] = []
    try {
      const bm = this.bm25.search(message, pool)
      bm25Order = bm.map((r) => r.index)
    } catch (e) {
      console.warn(`${LOG} BM25 search failed`, e)
    }

    const rrf = reciprocalRankFusion(denseOrder, bm25Order, RRF_K)
    const fused = [...rrf.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK)
    const chunks: string[] = []
    const metadatas: LongTermChunk[] = []
    for (const [docId] of fused) {
      const m = this.metadata[docId]
      if (!m) continue
      chunks.push(m.content)
      metadatas.push(m)
    }

    return {
      hit: bestDense >= LongTermIndex.CONFIDENCE_THRESHOLD,
      chunks,
      metadatas,
      bestScore: bestDense,
    }
  }

  getStats(): { totalChunks: number; sourceCount: number; indexPath: string } {
    const sources = new Set(this.metadata.map((m) => m.source))
    return {
      totalChunks: this.metadata.length,
      sourceCount: sources.size,
      indexPath: this.indexPath,
    }
  }

  private save(): void {
    try {
      if (this.faiss !== null) {
        this.faiss.write(this.faissPath)
      }
      const payload: PersistedMetadataFile = {
        metadata: this.metadata,
        bm25: this.bm25.serialize() as object,
        totalDocs: this.metadata.length,
      }
      fs.writeFileSync(this.metaPath, JSON.stringify(payload), 'utf8')
      console.info(`${LOG} Saved ${String(this.metadata.length)} chunks to disk`)
    } catch (e) {
      console.warn(`${LOG} save failed`, e)
    }
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.metaPath) || !fs.existsSync(this.faissPath)) {
        return
      }
      const raw = fs.readFileSync(this.metaPath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!isPersistedMetadataFile(parsed)) {
        console.warn(`${LOG} metadata.json invalid; keeping empty index`)
        return
      }
      let index: IndexFlatIP
      try {
        index = IndexFlatIP.read(this.faissPath)
      } catch (e) {
        console.warn(`${LOG} FAISS read failed`, e)
        return
      }
      this.faiss = index
      this.metadata = parsed.metadata
      this.bm25 = BM25Index.deserialize(parsed.bm25)
      if (parsed.totalDocs !== this.metadata.length) {
        console.warn(`${LOG} totalDocs mismatch with metadata length`)
      }
      console.info(`${LOG} Loaded ${String(this.metadata.length)} existing chunks`)
    } catch (e) {
      console.warn(`${LOG} load failed`, e)
    }
  }
}

export default LongTermIndex

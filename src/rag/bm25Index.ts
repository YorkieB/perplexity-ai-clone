/**
 * Okapi BM25 lexical index for hybrid RAG (keyword / lexical leg).
 * Tokenization is tuned for source code: camelCase, PascalCase, and snake_case identifiers.
 */

const DEFAULT_K1 = 1.5
const DEFAULT_B = 0.75

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'it',
  'in',
  'of',
  'to',
  'and',
  'or',
  'for',
])

/** One ranked document from {@link BM25Index.search}. */
interface BM25Result {
  index: number
  score: number
}

/** JSON shape produced by {@link BM25Index.serialize}. */
interface BM25SerializedPayload {
  readonly k1: number
  readonly b: number
  readonly documents: string[]
  readonly docTokens: string[][]
  readonly docFreqs: Record<string, number>
  readonly avgLen: number
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((e) => typeof e === 'string')
}

function isStringArrayArray(x: unknown): x is string[][] {
  return Array.isArray(x) && x.every((row) => isStringArray(row))
}

function isBM25SerializedPayload(data: unknown): data is BM25SerializedPayload {
  if (data === null || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (typeof d.k1 !== 'number' || typeof d.b !== 'number') return false
  if (typeof d.avgLen !== 'number') return false
  if (!Array.isArray(d.documents) || !d.documents.every((x) => typeof x === 'string')) return false
  if (!isStringArrayArray(d.docTokens)) return false
  if (d.docFreqs === null || typeof d.docFreqs !== 'object' || Array.isArray(d.docFreqs)) return false
  return true
}

/**
 * In-memory BM25 index with code-aware tokenization and JSON persistence.
 */
class BM25Index {
  private readonly k1: number

  private readonly b: number

  private documents: string[] = []

  private docTokens: string[][] = []

  private docFreqs = new Map<string, number>()

  private avgLen = 0

  /**
   * @param k1 - Term frequency saturation (default Okapi 1.5).
   * @param b - Document length normalization strength (default 0.75).
   */
  constructor(k1: number = DEFAULT_K1, b: number = DEFAULT_B) {
    this.k1 = k1
    this.b = b
  }

  /**
   * Append tokenized documents and refresh global statistics (df, average length).
   *
   * @param documents - Raw document strings to index.
   */
  add(documents: string[]): void {
    for (const doc of documents) {
      const tokens = this.tokenize(doc)
      this.documents.push(doc)
      this.docTokens.push(tokens)
      const seenInDoc = new Set<string>()
      for (const t of tokens) {
        if (seenInDoc.has(t)) continue
        seenInDoc.add(t)
        this.docFreqs.set(t, (this.docFreqs.get(t) ?? 0) + 1)
      }
    }
    this.recalculateAvgLen()
  }

  /**
   * Rank documents by BM25 score for a free-text query.
   *
   * @param query - Query string (same tokenization rules as documents).
   * @param topK - Maximum number of hits (default 10).
   * @returns Document indices with scores, sorted by score descending. Omits zero scores.
   */
  search(query: string, topK: number = 10): BM25Result[] {
    const qTokens = this.tokenize(query)
    const n = this.documents.length
    if (n === 0 || qTokens.length === 0) {
      return []
    }

    const avgLenSafe = this.avgLen > 0 ? this.avgLen : 1
    const results: BM25Result[] = []

    for (let di = 0; di < n; di++) {
      const tokens = this.docTokens[di] ?? []
      const dl = tokens.length
      const tf = new Map<string, number>()
      for (const t of tokens) {
        tf.set(t, (tf.get(t) ?? 0) + 1)
      }

      const lengthNorm = 1 - this.b + (this.b * dl) / avgLenSafe
      let score = 0

      for (const qt of qTokens) {
        const f = tf.get(qt) ?? 0
        if (f === 0) continue
        const df = this.docFreqs.get(qt) ?? 0
        const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1)
        const tfComp = (f * (this.k1 + 1)) / (f + this.k1 * lengthNorm)
        score += idf * tfComp
      }

      if (score > 0) {
        results.push({ index: di, score })
      }
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, Math.max(0, topK))
  }

  /**
   * Snapshot of all index state for persistence (e.g. JSON file).
   */
  serialize(): object {
    return {
      k1: this.k1,
      b: this.b,
      documents: [...this.documents],
      docTokens: this.docTokens.map((row) => [...row]),
      docFreqs: Object.fromEntries(this.docFreqs),
      avgLen: this.avgLen,
    }
  }

  /**
   * Restore an index previously produced by {@link BM25Index.serialize}.
   *
   * @param data - Parsed JSON or equivalent plain object.
   */
  static deserialize(data: object): BM25Index {
    if (!isBM25SerializedPayload(data)) {
      throw new Error('[BM25Index] deserialize: invalid payload')
    }
    const idx = new BM25Index(data.k1, data.b)
    idx.documents = [...data.documents]
    idx.docTokens = data.docTokens.map((row) => [...row])
    idx.docFreqs = new Map(
      Object.entries(data.docFreqs).map(([k, v]) => [k, typeof v === 'number' ? v : 0]),
    )
    idx.avgLen = data.avgLen
    return idx
  }

  /**
   * Split camelCase / PascalCase (insert gaps before capitals), snake_case, then
   * alphanumeric tokens ≥2 chars, lowercase, stop-word removal.
   */
  private tokenize(text: string): string[] {
    const withSnakeAsSpace = text.replace(/_/g, ' ')
    const camelSplit = withSnakeAsSpace
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    const lower = camelSplit.toLowerCase()
    const raw: string[] = lower.match(/[a-z0-9]+/g) ?? []
    return raw.filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
  }

  private recalculateAvgLen(): void {
    if (this.docTokens.length === 0) {
      this.avgLen = 0
      return
    }
    let sum = 0
    for (const row of this.docTokens) {
      sum += row.length
    }
    this.avgLen = sum / this.docTokens.length
  }
}

export { BM25Index, type BM25Result }

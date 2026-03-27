/**
 * Okapi BM25 lexical scoring over a small in-memory corpus (same family as Elasticsearch / Lucene BM25).
 */

const K1 = 1.5
const B = 0.75

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

export class Bm25Index {
  private readonly docTokens: string[][] = []
  private readonly docFreq = new Map<string, number>()
  private numDocs = 0
  private totalDocLen = 0

  /** Add one document; returns internal doc id. */
  addDocument(tokens: string[]): number {
    const id = this.docTokens.length
    const seen = new Set<string>()
    for (const t of tokens) {
      if (!seen.has(t)) {
        seen.add(t)
        this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1)
      }
    }
    this.docTokens.push(tokens)
    this.numDocs += 1
    this.totalDocLen += tokens.length
    return id
  }

  clear(): void {
    this.docTokens.length = 0
    this.docFreq.clear()
    this.numDocs = 0
    this.totalDocLen = 0
  }

  get length(): number {
    return this.numDocs
  }

  private idf(term: string): number {
    const df = this.docFreq.get(term) ?? 0
    const n = this.numDocs
    return Math.log(1 + (n - df + 0.5) / (df + 0.5))
  }

  /** BM25 score for each document id (sparse; only docs containing query terms scored). */
  scoreQuery(queryTokens: string[]): Map<number, number> {
    const scores = new Map<number, number>()
    if (this.numDocs === 0 || queryTokens.length === 0) return scores

    const avgdl = this.totalDocLen / this.numDocs

    for (let d = 0; d < this.docTokens.length; d++) {
      const tokens = this.docTokens[d]
      const dl = tokens.length
      let s = 0
      const tf = new Map<string, number>()
      for (const t of tokens) {
        tf.set(t, (tf.get(t) ?? 0) + 1)
      }
      for (const q of queryTokens) {
        const f = tf.get(q) ?? 0
        if (f === 0) continue
        const idf = this.idf(q)
        const denom = f + K1 * (1 - B + (B * dl) / avgdl)
        s += idf * ((f * (K1 + 1)) / denom)
      }
      if (s > 0) scores.set(d, s)
    }
    return scores
  }
}

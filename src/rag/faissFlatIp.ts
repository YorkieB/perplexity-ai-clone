/**
 * FAISS-equivalent **IndexFlatIP** on L2-normalized vectors: inner product equals cosine similarity.
 * Mirrors `faiss.IndexFlatIP` + `normalize_L2` behaviour without linking libfaiss (pure TS, all runtimes).
 */

function l2NormalizeInPlace(v: Float32Array): void {
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i] * v[i]
  const n = Math.sqrt(s)
  if (n === 0 || !Number.isFinite(n)) return
  for (let i = 0; i < v.length; i++) v[i] /= n
}

export class FaissFlatIpIndex {
  private readonly dim: number
  private readonly rows: Float32Array[] = []

  constructor(dim: number) {
    this.dim = dim
  }

  get ntotal(): number {
    return this.rows.length
  }

  get d(): number {
    return this.dim
  }

  /** Add one L2-normalized copy of `vector` (mutates input if you pass shared buffer — pass a copy if needed). */
  add(vector: number[] | Float32Array): void {
    const v = new Float32Array(vector)
    if (v.length !== this.dim) {
      throw new Error(`FaissFlatIpIndex: expected dim ${String(this.dim)}, got ${String(v.length)}`)
    }
    l2NormalizeInPlace(v)
    this.rows.push(v)
  }

  clear(): void {
    this.rows.length = 0
  }

  /** Inner product search (higher = closer for normalized vectors = cosine sim). */
  search(query: number[] | Float32Array, k: number): { labels: number[]; distances: number[] } {
    const q = new Float32Array(query)
    if (q.length !== this.dim) {
      throw new Error(`FaissFlatIpIndex.search: expected dim ${String(this.dim)}, got ${String(q.length)}`)
    }
    l2NormalizeInPlace(q)

    const n = this.rows.length
    if (n === 0) return { labels: [], distances: [] }

    const kk = Math.min(Math.max(1, k), n)
    const scored: Array<{ i: number; ip: number }> = []
    for (let i = 0; i < n; i++) {
      const row = this.rows[i]
      let ip = 0
      for (let j = 0; j < this.dim; j++) ip += q[j] * row[j]
      scored.push({ i, ip })
    }
    scored.sort((a, b) => b.ip - a.ip)
    const labels: number[] = []
    const distances: number[] = []
    for (let t = 0; t < kk; t++) {
      labels.push(scored[t].i)
      distances.push(scored[t].ip)
    }
    return { labels, distances }
  }
}

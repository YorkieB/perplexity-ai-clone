/**
 * Dense retrieval using **faiss-node** `IndexFlatIP` (inner product on L2-normalized vectors = cosine).
 * Falls back to pure TS {@link FaissFlatIpIndex} when the native addon is unavailable (e.g. browser bundle).
 */

import { FaissFlatIpIndex } from '@/rag/faissFlatIp'

const LOG = '[LongTermFaiss]'

function l2Normalize(v: number[]): number[] {
  let s = 0
  for (const x of v) s += x * x
  const n = Math.sqrt(s)
  if (n === 0 || !Number.isFinite(n)) return v
  return v.map((x) => x / n)
}

export interface LabeledVector {
  readonly rowId: number
  readonly vector: number[]
}

export interface FlatIpHit {
  readonly rowId: number
  readonly similarity: number
}

/**
 * Search top-`k` by inner product (cosine after normalization).
 */
export async function searchIndexFlatIp(
  dim: number,
  corpus: LabeledVector[],
  query: number[],
  k: number,
  logWarn: (msg: string, err?: unknown) => void,
): Promise<FlatIpHit[]> {
  const q = l2Normalize(query)
  if (q.length !== dim || corpus.length === 0) return []

  const kk = Math.min(Math.max(1, k), corpus.length)

  try {
    const { IndexFlatIP } = await import(/* @vite-ignore */ 'faiss-node')
    const index = new IndexFlatIP(dim)
    const idMap: number[] = []
    for (const row of corpus) {
      const v = l2Normalize(row.vector)
      if (v.length !== dim) continue
      index.add(v)
      idMap.push(row.rowId)
    }
    const n = index.ntotal()
    if (n === 0) return []
    const res = index.search(q, Math.min(kk, n))
    const out: FlatIpHit[] = []
    for (let i = 0; i < res.labels.length; i++) {
      const label = res.labels[i]!
      if (label < 0) continue
      const rowId = idMap[label]
      if (rowId === undefined) continue
      out.push({ rowId, similarity: res.distances[i]! })
    }
    return out
  } catch (e) {
    logWarn(`${LOG} faiss-node unavailable; using TS flat IP fallback`, e)
  }

  const faiss = new FaissFlatIpIndex(dim)
  const idMap: number[] = []
  for (const row of corpus) {
    const v = l2Normalize(row.vector)
    if (v.length !== dim) continue
    faiss.add(v)
    idMap.push(row.rowId)
  }
  if (faiss.ntotal === 0) return []
  const { labels, distances } = faiss.search(q, Math.min(kk, faiss.ntotal))
  return labels.map((j, i) => ({
    rowId: idMap[j]!,
    similarity: distances[i]!,
  }))
}

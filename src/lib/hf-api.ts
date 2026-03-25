/**
 * Hugging Face API client for dataset search and preview.
 * All calls go through the proxy to avoid CORS and keep tokens server-side.
 */

export interface HfDatasetResult {
  id: string
  author: string
  description: string
  downloads: number
  tags: string[]
}

export interface HfDatasetSample {
  features: Array<{ name: string; type: string }>
  rows: Array<{ row_idx: number; row: Record<string, unknown> }>
}

export interface HfModelResult {
  id: string
  author: string
  pipeline_tag: string
  downloads: number
  tags: string[]
}

export async function searchHuggingFace(
  query: string,
  type: 'datasets' | 'models' = 'datasets',
  limit = 10,
): Promise<string> {
  const res = await fetch(`/api/huggingface/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`)
  if (!res.ok) throw new Error(`HF search failed: ${res.status}`)
  const data = await res.json() as { results: Array<{ id: string; description?: string; downloads?: number; pipeline_tag?: string }> }
  if (!data.results?.length) return `No ${type} found for "${query}".`

  return data.results.map((r, i) =>
    `${i + 1}. **${r.id}** — ${r.description?.slice(0, 120) || r.pipeline_tag || 'No description'}${r.downloads ? ` (${r.downloads.toLocaleString()} downloads)` : ''}`
  ).join('\n')
}

export async function fetchDatasetSample(
  datasetId: string,
  split = 'train',
  config = 'default',
): Promise<string> {
  const res = await fetch(
    `/api/huggingface/dataset-sample?dataset=${encodeURIComponent(datasetId)}&split=${encodeURIComponent(split)}&config=${encodeURIComponent(config)}`
  )
  if (!res.ok) throw new Error(`HF dataset sample failed: ${res.status}`)
  const data = await res.json() as HfDatasetSample
  const cols = data.features?.map(f => f.name) || []
  const sampleRows = (data.rows || []).slice(0, 5)

  let out = `Dataset: ${datasetId} (split: ${split})\n`
  out += `Columns: ${cols.join(', ')}\n\n`
  out += `Sample rows (first ${sampleRows.length}):\n`
  for (const r of sampleRows) {
    out += JSON.stringify(r.row, null, 2) + '\n---\n'
  }
  return out
}

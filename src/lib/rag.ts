/**
 * Client-side RAG API wrappers.
 * All calls go to the same-origin proxy (Electron main.cjs or Vite dev middleware).
 */

export interface RagChunk {
  chunk_id: string
  content: string
  chunk_index: number
  token_count: number
  document_id: string
  document_title: string
  filename: string | null
  source: string
  similarity: number
}

export interface RagDocument {
  id: string
  title: string
  filename: string | null
  spaces_key: string | null
  mime_type: string | null
  source: string
  size_bytes: number
  chunk_count: number
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

export interface RagIngestResult {
  documentId: string
  chunkCount: number
  createdAt: string
}

export async function ragSearch(
  query: string,
  limit = 5,
  threshold = 0.3,
): Promise<RagChunk[]> {
  const res = await fetch('/api/rag/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit, threshold }),
  })
  if (!res.ok) return []
  const data = (await res.json()) as { results?: RagChunk[] }
  return data.results ?? []
}

export async function ragIngest(file: File, title?: string): Promise<RagIngestResult> {
  const form = new FormData()
  form.append('file', file)
  if (title) form.append('title', title)
  const res = await fetch('/api/rag/ingest', { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Ingest failed' } }))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? 'Ingest failed')
  }
  return (await res.json()) as RagIngestResult
}

export interface BulkIngestResult {
  results: (RagIngestResult & { filename: string })[]
  errors: { filename: string; error: string }[]
}

export async function ragIngestBulk(files: File[]): Promise<BulkIngestResult> {
  const form = new FormData()
  for (const f of files) form.append('file', f)
  const res = await fetch('/api/rag/ingest', { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Bulk ingest failed' } }))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? 'Bulk ingest failed')
  }
  return (await res.json()) as BulkIngestResult
}

export async function ragIngestText(
  text: string,
  title: string,
  source = 'manual',
): Promise<RagIngestResult> {
  const res = await fetch('/api/rag/ingest-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, title, source }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Ingest failed' } }))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? 'Ingest failed')
  }
  return (await res.json()) as RagIngestResult
}

export async function ragListDocuments(): Promise<RagDocument[]> {
  const res = await fetch('/api/rag/documents')
  if (!res.ok) return []
  const data = (await res.json()) as { documents?: RagDocument[] }
  return data.documents ?? []
}

export async function ragGetDocument(
  id: string,
): Promise<{ document: RagDocument; chunks: Array<{ id: string; chunk_index: number; content: string; token_count: number }> } | null> {
  const res = await fetch(`/api/rag/documents/${encodeURIComponent(id)}`)
  if (!res.ok) return null
  return (await res.json()) as { document: RagDocument; chunks: Array<{ id: string; chunk_index: number; content: string; token_count: number }> }
}

export async function ragDeleteDocument(id: string): Promise<boolean> {
  const res = await fetch(`/api/rag/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return res.ok
}

export async function ragDownloadDocument(id: string): Promise<Blob | null> {
  const res = await fetch(`/api/rag/documents/${encodeURIComponent(id)}/download`)
  if (!res.ok) return null
  return res.blob()
}

export async function ragCreateDocument(
  title: string,
  content: string,
  format: 'md' | 'docx' | 'pdf' = 'md',
): Promise<RagIngestResult & { format: string; spacesKey: string | null }> {
  const res = await fetch('/api/rag/create-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, format }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Create failed' } }))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? 'Create document failed')
  }
  return (await res.json()) as RagIngestResult & { format: string; spacesKey: string | null }
}

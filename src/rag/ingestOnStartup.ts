/**
 * Optional startup ingestion: populate {@link LongTermIndex} from configured project and doc paths.
 * Intended for Node / Electron main; uses `process.env` and filesystem reads.
 *
 * Environment:
 * - `JARVIS_PROJECT_PATHS` — comma-separated roots (default `./src`).
 * - `JARVIS_DOC_PATHS` — comma-separated doc roots; if unset, `./docs` is used only when that path exists on disk.
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  DEFAULT_EXCLUDE_DIRS,
  ingestDirectory,
  ingestProjectCodebase,
  type IngestOptions,
} from './ingestPipeline'
import LongTermIndex from './longTermIndex'

const LOG = '[Startup]'
const MS_PER_DAY = 24 * 60 * 60 * 1000

const startupIngestOptions: IngestOptions = {
  excludeDirs: DEFAULT_EXCLUDE_DIRS,
  maxFileSizeKb: 200,
  onProgress: (file, chunks) => {
    console.log(`[Startup] Indexed: ${file} (${chunks} chunks)`)
  },
}

function parseCommaSeparatedPaths(env: string | undefined): string[] | null {
  if (env === undefined || !env.trim()) return null
  const parts = env.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  return parts.length > 0 ? parts : null
}

function resolveProjectPaths(): string[] {
  return parseCommaSeparatedPaths(process.env.JARVIS_PROJECT_PATHS) ?? ['./src']
}

function resolveDocPaths(): string[] {
  const fromEnv = parseCommaSeparatedPaths(process.env.JARVIS_DOC_PATHS)
  if (fromEnv !== null) {
    return fromEnv
  }
  const fallback = path.resolve('./docs')
  return fs.existsSync(fallback) ? ['./docs'] : []
}

/**
 * Ingest configured codebase and documentation paths into the long-term index (embeddings + BM25).
 *
 * @param index - Loaded {@link LongTermIndex} instance (same path as on-disk metadata / FAISS).
 */
export async function runStartupIngestion(index: LongTermIndex): Promise<void> {
  const JARVIS_PROJECTS = resolveProjectPaths()
  const JARVIS_DOCS = resolveDocPaths()

  try {
    console.info(`${LOG} Beginning codebase ingestion...`)

    await ingestProjectCodebase(JARVIS_PROJECTS, index, startupIngestOptions)

    for (const docPath of JARVIS_DOCS) {
      const resolved = path.resolve(docPath)
      if (!fs.existsSync(resolved)) {
        console.warn(`${LOG} Doc path not found, skipping: ${resolved}`)
        continue
      }
      await ingestDirectory(resolved, index, startupIngestOptions)
    }

    const stats = index.getStats()
    console.info(
      `${LOG} Index stats: ${String(stats.totalChunks)} chunks, ${String(stats.sourceCount)} sources, path=${stats.indexPath}`,
    )
    console.info(`${LOG} Ingestion complete.`)
  } catch (err: unknown) {
    let message = 'Unknown startup ingestion error'
    if (err instanceof Error) {
      message = err.message
    } else if (typeof err === 'string') {
      message = err
    } else {
      try {
        message = JSON.stringify(err)
      } catch {
        message = Object.prototype.toString.call(err)
      }
    }
    console.error(`[StartupIngestion] Failed: ${message}`)
    console.warn(
      '[StartupIngestion] Skipping ingestion due to error — Jarvis will still work without long-term index',
    )
  }
}

/**
 * Whether startup should run a full re-ingest: empty index, missing metadata, or last chunk older than 24h.
 */
export function shouldReIngest(index: LongTermIndex): boolean {
  const { totalChunks, indexPath } = index.getStats()
  if (totalChunks === 0) {
    return true
  }

  const metaPath = path.join(indexPath, 'metadata.json')
  if (!fs.existsSync(metaPath)) {
    return true
  }

  try {
    const raw = fs.readFileSync(metaPath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') {
      return true
    }
    const rows = (parsed as { metadata?: unknown }).metadata
    if (!Array.isArray(rows)) {
      return true
    }
    let latestMs = 0
    for (const row of rows) {
      if (row === null || typeof row !== 'object') continue
      const addedAt = (row as { addedAt?: unknown }).addedAt
      if (typeof addedAt !== 'string') continue
      const t = Date.parse(addedAt)
      if (Number.isFinite(t) && t > latestMs) {
        latestMs = t
      }
    }
    if (latestMs === 0) {
      return true
    }
    return Date.now() - latestMs > MS_PER_DAY
  } catch {
    return true
  }
}

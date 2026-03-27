/**
 * Batch ingestion of source files and documents into {@link LongTermIndex} (hybrid RAG index).
 * Node.js / Electron main only — uses filesystem walks and UTF-8 reads.
 */

import fs from 'node:fs'
import path from 'node:path'
import { readdir, readFile, stat } from 'node:fs/promises'

import LongTermIndex from './longTermIndex'
import { chunkCode, detectLanguage } from './codeChunker'

const LOG = '[IngestPipeline]'

const DEFAULT_MAX_FILE_KB = 500

/** Map file extensions to language ids for {@link LongTermIndex.ingestCode}. */
export const LANGUAGE_MAP: Record<string, string> = {
  '.py': 'python',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.txt': 'text',
  '.csv': 'csv',
}

/** Directory name segments that cause a subtree to be skipped during walks. */
export const DEFAULT_EXCLUDE_DIRS: string[] = [
  'node_modules',
  '.git',
  '__pycache__',
  'dist',
  'build',
  '.next',
  'coverage',
  '.cache',
  'tmp',
  'temp',
  '.env',
]

const TEXT_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.csv', '.json', '.yaml', '.yml'])

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

/** Options for directory / project ingestion. */
export interface IngestOptions {
  /** Extra directory names to skip (merged with {@link DEFAULT_EXCLUDE_DIRS}). */
  excludeDirs?: string[]
  /** Skip files larger than this many KiB (default 500). */
  maxFileSizeKb?: number
  /** If set, only files whose extension is in this list (e.g. `['.ts', '.tsx']`) are ingested. */
  includeExtensions?: string[]
  /** Called after each successfully ingested file with chunk delta. */
  onProgress?: (file: string, chunksAdded: number) => void
  /** Log only; do not call ingest methods. */
  dryRun?: boolean
}

function normalizeExt(filePath: string): string {
  return path.extname(filePath).toLowerCase()
}

function normalizeIncludeList(list: string[] | undefined): Set<string> | null {
  if (!list || list.length === 0) return null
  return new Set(list.map((e) => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`)))
}

function pathHasExcludedSegment(resolvedPath: string, exclude: Set<string>): boolean {
  const parts = resolvedPath.split(path.sep)
  return parts.some((p) => exclude.has(p))
}

function mergedExcludeDirs(extra?: string[]): Set<string> {
  return new Set([...DEFAULT_EXCLUDE_DIRS, ...(extra ?? [])])
}

function estimateDryRunChunks(content: string, ext: string, language: string): number {
  if (TEXT_EXTENSIONS.has(ext)) {
    const t = content.trim()
    if (t.length === 0) return 0
    return Math.max(1, Math.ceil(t.length / 500))
  }
  return chunkCode(content, language.trim() || detectLanguage(content)).length
}

async function walkFiles(rootDir: string, excludeDirNames: Set<string>, out: string[]): Promise<void> {
  const root = path.resolve(rootDir)
  const entries = await readdir(root, { withFileTypes: true })
  for (const ent of entries) {
    const full = path.join(root, ent.name)
    if (ent.isDirectory()) {
      if (excludeDirNames.has(ent.name)) continue
      await walkFiles(full, excludeDirNames, out)
    } else if (ent.isFile()) {
      out.push(full)
    }
  }
}

function isUnderExcludedPath(filePath: string, excludeDirNames: Set<string>): boolean {
  return pathHasExcludedSegment(path.resolve(filePath), excludeDirNames)
}

async function ingestOneFileContent(
  absPath: string,
  index: LongTermIndex,
  options: {
    dryRun?: boolean
    maxBytes: number
    includeSet: Set<string> | null
  },
): Promise<{ chunksAdded: number; skipped: boolean }> {
  const ext = normalizeExt(absPath)
  if (!LANGUAGE_MAP[ext]) {
    return { chunksAdded: 0, skipped: true }
  }
  if (options.includeSet !== null && !options.includeSet.has(ext)) {
    return { chunksAdded: 0, skipped: true }
  }

  let st: Awaited<ReturnType<typeof stat>>
  try {
    st = await stat(absPath)
  } catch (e) {
    logWarn(`stat failed: ${absPath}`, e)
    throw new Error(`stat failed: ${absPath}`)
  }
  if (!st.isFile()) {
    return { chunksAdded: 0, skipped: true }
  }
  if (st.size > options.maxBytes) {
    logWarn(`skipping (too large): ${absPath} (${String(st.size)} bytes)`)
    return { chunksAdded: 0, skipped: true }
  }

  let content: string
  try {
    content = await readFile(absPath, 'utf8')
  } catch (e) {
    logWarn(`read failed: ${absPath}`, e)
    throw new Error(`read failed: ${absPath}`)
  }

  const before = index.getStats().totalChunks
  const language = LANGUAGE_MAP[ext] ?? 'text'

  if (options.dryRun) {
    const est = estimateDryRunChunks(content, ext, language)
    logInfo(`[DRY RUN] Would ingest: ${absPath} (~${String(est)} chunks)`)
    return { chunksAdded: 0, skipped: false }
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    await index.ingestText(content, absPath, 'documentation')
  } else {
    await index.ingestCode(content, language, absPath)
  }

  const after = index.getStats().totalChunks
  return { chunksAdded: Math.max(0, after - before), skipped: false }
}

/**
 * Recursively ingest all supported files under `directory` into `index`.
 */
export async function ingestDirectory(
  directory: string,
  index: LongTermIndex,
  options?: IngestOptions,
): Promise<{ filesProcessed: number; chunksAdded: number; errors: string[] }> {
  const excludeNames = mergedExcludeDirs(options?.excludeDirs)
  const maxKb = options?.maxFileSizeKb ?? DEFAULT_MAX_FILE_KB
  const maxBytes = maxKb * 1024
  const includeSet = normalizeIncludeList(options?.includeExtensions)
  const errors: string[] = []
  let filesProcessed = 0
  let chunksAdded = 0

  const root = path.resolve(directory)
  if (!fs.existsSync(root)) {
    const msg = `directory not found: ${root}`
    logWarn(msg)
    return { filesProcessed: 0, chunksAdded: 0, errors: [msg] }
  }
  let stRoot: Awaited<ReturnType<typeof stat>>
  try {
    stRoot = await stat(root)
  } catch (e) {
    const msg = `directory not accessible: ${root}`
    logWarn(msg, e)
    return { filesProcessed: 0, chunksAdded: 0, errors: [msg] }
  }
  if (!stRoot.isDirectory()) {
    const msg = `not a directory: ${root}`
    logWarn(msg)
    return { filesProcessed: 0, chunksAdded: 0, errors: [msg] }
  }

  const allFiles: string[] = []
  try {
    await walkFiles(root, excludeNames, allFiles)
  } catch (e) {
    const msg = `walk failed: ${root}`
    logWarn(msg, e)
    errors.push(msg)
    return { filesProcessed: 0, chunksAdded: 0, errors }
  }

  const files = allFiles.filter((f) => !isUnderExcludedPath(f, excludeNames))

  for (const filePath of files) {
    try {
      const { chunksAdded: d, skipped } = await ingestOneFileContent(filePath, index, {
        dryRun: options?.dryRun,
        maxBytes,
        includeSet,
      })
      if (!skipped) {
        filesProcessed += 1
        chunksAdded += d
        options?.onProgress?.(filePath, d)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${filePath}: ${msg}`)
      logWarn(`ingest failed: ${filePath}`, e)
    }
  }

  return { filesProcessed, chunksAdded, errors }
}

/**
 * Ingest a single file using the same extension / size rules as {@link ingestDirectory}.
 */
export async function ingestFile(filepath: string, index: LongTermIndex): Promise<void> {
  const abs = path.resolve(filepath)
  const ext = normalizeExt(abs)
  if (!LANGUAGE_MAP[ext]) {
    throw new Error(`${LOG} unsupported extension for ingestion: ${ext} (${abs})`)
  }
  const maxBytes = DEFAULT_MAX_FILE_KB * 1024
  try {
    const { skipped } = await ingestOneFileContent(abs, index, {
      dryRun: false,
      maxBytes,
      includeSet: null,
    })
    if (skipped) {
      throw new Error(`${LOG} could not ingest (not a file, too large, or empty): ${abs}`)
    }
  } catch (e) {
    logWarn(`ingestFile failed: ${abs}`, e)
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/**
 * Persist a session summary into the long-term index for later retrieval.
 */
export async function ingestConversationSummary(
  summary: string,
  sessionId: string,
  index: LongTermIndex,
): Promise<void> {
  const source = `session:${sessionId}`
  await index.ingestText(summary, source, 'conversation_summary')
}

/**
 * Ingest several project roots sequentially; logs per-path progress and a final summary.
 */
export async function ingestProjectCodebase(
  projectPaths: string[],
  index: LongTermIndex,
  options?: IngestOptions,
): Promise<void> {
  let totalFiles = 0
  let totalChunks = 0
  for (const p of projectPaths) {
    const resolved = path.resolve(p)
    logInfo(`Ingesting ${resolved}...`)
    const r = await ingestDirectory(resolved, index, options)
    totalFiles += r.filesProcessed
    totalChunks += r.chunksAdded
    if (r.errors.length > 0) {
      r.errors.forEach((err) => logWarn(err))
    }
  }
  logInfo(`Completed. ${String(totalFiles)} files, ${String(totalChunks)} chunks.`)
}

/**
 * Language-aware structural fallbacks when Tree-sitter is unavailable or fails.
 * Splits at likely function / class / method boundaries using brace depth and keywords.
 */

const LOG = '[JarvisStructuralChunk]'

const MIN_CHUNK_CHARS = 32

/** Clamp / window oversized text fragments (shared by Tree-sitter and structural paths). */
export function clampTextChunks(pieces: string[], maxChars: number, overlap: number): string[] {
  const out: string[] = []
  for (const raw of pieces) {
    const t = raw.trim()
    if (t.length <= maxChars) {
      if (t.length >= MIN_CHUNK_CHARS) out.push(t)
      continue
    }
    for (let start = 0; start < t.length; ) {
      const end = Math.min(start + maxChars, t.length)
      const slice = t.slice(start, end).trim()
      if (slice.length >= MIN_CHUNK_CHARS) out.push(slice)
      if (end >= t.length) break
      start = Math.max(end - overlap, start + 1)
    }
  }
  return out.length > 0 ? out : rawTrimmedChunks(pieces)
}

function rawTrimmedChunks(pieces: string[]): string[] {
  return pieces.map((p) => p.trim()).filter((p) => p.length >= MIN_CHUNK_CHARS)
}

/** C-like: track braces; split when a top-level declaration closes. */
function splitCLike(source: string): string[] {
  const lines = source.split(/\r?\n/)
  const chunks: string[] = []
  let depth = 0
  let buf: string[] = []
  let startedDecl = false

  const flush = () => {
    const s = buf.join('\n').trim()
    if (s.length >= MIN_CHUNK_CHARS) chunks.push(s)
    buf = []
    startedDecl = false
  }

  const declStart = (line: string): boolean => {
    const s = line.trimStart()
    if (/^export\s+default\s+function\b/.test(s)) return true
    if (/^export\s+/.test(s) && /\bfunction\b/.test(s)) return true
    if (/^(async\s+)?function\b/.test(s)) return true
    if (/^class\b/.test(s)) return true
    if (/^(struct|enum|trait|mod|namespace|interface)\b/.test(s)) return true
    if (/^impl\b/.test(s)) return true
    if (/^type\s+\w+\s*=/.test(s)) return true
    return false
  }

  for (const line of lines) {
    const open = (line.match(/\{/g) ?? []).length
    const close = (line.match(/\}/g) ?? []).length

    if (depth === 0 && declStart(line)) {
      if (buf.length > 0) flush()
      startedDecl = true
    }

    buf.push(line)
    depth += open - close

    if (startedDecl && depth === 0 && buf.length > 0) {
      flush()
    }
  }

  if (buf.length > 0) flush()
  return chunks
}

function isPythonDefOrClass(t: string): boolean {
  return /^(async\s+)?def\s+\w+\s*\(/.test(t) || /^class\s+\w+/.test(t)
}

function pythonDecoratedBlockStart(lines: string[], i: number): number {
  let blockStart = i
  let j = i - 1
  while (j >= 0) {
    const pt = (lines[j] ?? '').trimStart()
    const pi = (lines[j] ?? '').length - pt.length
    if (pi > 0) break
    if (!/^@/.test(pt)) break
    blockStart = j
    j -= 1
  }
  return blockStart
}

function pythonTopLevelDefIndices(lines: string[]): number[] {
  const indices: number[] = [0]
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const t = line.trimStart()
    if (line.length !== t.length) continue
    if (!isPythonDefOrClass(t)) continue
    const blockStart = pythonDecoratedBlockStart(lines, i)
    if (!indices.includes(blockStart)) indices.push(blockStart)
  }
  return indices
}

function splitPythonLike(source: string): string[] {
  const lines = source.split(/\r?\n/)
  const uniq = [...new Set(pythonTopLevelDefIndices(lines))].sort((a, b) => a - b)
  const out: string[] = []
  for (let k = 0; k < uniq.length; k++) {
    const a = uniq[k]!
    const b = k + 1 < uniq.length ? uniq[k + 1]! : lines.length
    const s = lines.slice(a, b).join('\n').trim()
    if (s.length >= MIN_CHUNK_CHARS) out.push(s)
  }
  return out.length > 0 ? out : [source.trim()]
}

export function normalizeLanguageId(language: string): string {
  return language.trim().toLowerCase()
}

/**
 * Heuristic chunks for `language` when Tree-sitter cannot run.
 */
export function chunkSourceStructural(source: string, language: string, maxChars: number, overlap: number): string[] {
  const body = source.trim()
  if (!body) return []

  const lang = normalizeLanguageId(language)

  try {
    if (lang === 'python' || lang === 'py') {
      return clampTextChunks(splitPythonLike(body), maxChars, overlap)
    }

    if (
      /^(javascript|js|typescript|ts|tsx|jsx|c|cpp|cxx|cc|java|go|rust|rs|csharp|cs)$/.test(lang) ||
      lang.includes('script') ||
      lang === 'kotlin' ||
      lang === 'swift'
    ) {
      const c = splitCLike(body)
      if (c.length > 0) return clampTextChunks(c, maxChars, overlap)
    }
  } catch (e) {
    console.warn(`${LOG} structural split failed`, e)
  }

  return clampTextChunks([body], maxChars, overlap)
}

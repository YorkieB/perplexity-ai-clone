/**
 * @file codeChunker.ts
 * @description Native Node.js tree-sitter AST chunker for server-side RAG ingestion.
 *
 * ⚠️  NODE.JS ONLY — do NOT import this in browser or isomorphic code.
 * For browser/shared environments, use jarvisTreeSitterCodeChunk.ts (WASM-based).
 *
 * This file uses native tree-sitter bindings (optionalDependencies).
 * Falls back to regex chunking if native bindings are unavailable (e.g. Windows).
 */

import { createRequire } from 'node:module'

/** Maximum non-whitespace characters per chunk before splitting or merging. */
export const MAX_CHUNK_CHARS = 1500

const MIN_REGEX_MERGE_CHARS = 30

const LOG = '[codeChunker]'

const HIGH_LEVEL_TYPES = new Set([
  'function_declaration',
  'function_definition',
  'class_declaration',
  'class_definition',
  'method_definition',
  'arrow_function',
  'export_statement',
  'import_statement',
])

/** One logical slice of source for embedding / retrieval. */
export interface CodeChunk {
  content: string
  language: string
  chunkType: 'function' | 'class' | 'method' | 'import_block' | 'merged' | 'regex_fallback' | 'other'
  startLine: number
  endLine: number
  /** Function / class name when extractable; otherwise empty. */
  name: string
}

/** Minimal tree-sitter syntax node surface (node bindings). */
interface TsNode {
  readonly type: string
  readonly startIndex: number
  readonly endIndex: number
  readonly startPosition: { row: number; column: number }
  readonly endPosition: { row: number; column: number }
  readonly namedChildCount: number
  namedChild(index: number): TsNode | null
}

interface TsTree {
  readonly rootNode: TsNode
}

interface TsParser {
  setLanguage(language: unknown): void
  parse(input: string): TsTree
}

type NodeRequireFn = (id: string) => unknown

function logWarn(message: string, cause?: unknown): void {
  if (cause !== undefined) {
    console.warn(`${LOG} ${message}`, cause)
  } else {
    console.warn(`${LOG} ${message}`)
  }
}

function nonWhitespaceLen(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c !== undefined && !/\s/.test(c)) n += 1
  }
  return n
}

function line1FromRow(row0: number): number {
  return row0 + 1
}

function sliceNode(source: string, node: TsNode): string {
  return source.slice(node.startIndex, node.endIndex)
}

function mapNodeTypeToChunkType(nodeType: string): CodeChunk['chunkType'] {
  switch (nodeType) {
    case 'function_declaration':
    case 'function_definition':
    case 'generator_function':
    case 'generator_function_declaration':
    case 'arrow_function':
      return 'function'
    case 'class_declaration':
    case 'class_definition':
      return 'class'
    case 'method_definition':
      return 'method'
    case 'import_statement':
      return 'import_block'
    case 'export_statement':
      return 'other'
    default:
      return 'other'
  }
}

function extractIdentifierName(node: TsNode, source: string): string {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i)
    if (c?.type === 'identifier') {
      return source.slice(c.startIndex, c.endIndex)
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i)
    if (c) {
      const nested = extractIdentifierName(c, source)
      if (nested) return nested
    }
  }
  return ''
}

function makeChunkFromNode(node: TsNode, source: string, language: string): CodeChunk {
  const content = sliceNode(source, node)
  return {
    content,
    language,
    chunkType: mapNodeTypeToChunkType(node.type),
    startLine: line1FromRow(node.startPosition.row),
    endLine: line1FromRow(node.endPosition.row),
    name: extractIdentifierName(node, source),
  }
}

function mergeChunkGroup(parts: CodeChunk[], language: string): CodeChunk {
  const content = parts.map((p) => p.content).join('\n')
  const startLine = Math.min(...parts.map((p) => p.startLine))
  const endLine = Math.max(...parts.map((p) => p.endLine))
  const name = parts.find((p) => p.name.trim().length > 0)?.name ?? ''
  return {
    content,
    language,
    chunkType: 'merged',
    startLine,
    endLine,
    name,
  }
}

function greedyMergeChunks(chunks: CodeChunk[], language: string, maxNonWs: number): CodeChunk[] {
  if (chunks.length === 0) return []
  const out: CodeChunk[] = []
  let buf: CodeChunk[] = []
  let bufNws = 0

  const flush = () => {
    if (buf.length === 0) return
    out.push(buf.length === 1 ? buf[0]! : mergeChunkGroup(buf, language))
    buf = []
    bufNws = 0
  }

  for (const ch of chunks) {
    const n = nonWhitespaceLen(ch.content)
    if (buf.length === 0) {
      buf.push(ch)
      bufNws = n
      continue
    }
    if (bufNws + n <= maxNonWs) {
      buf.push(ch)
      bufNws += n
    } else {
      flush()
      buf.push(ch)
      bufNws = n
    }
  }
  flush()
  return out
}

function collectChildChunks(node: TsNode, source: string, language: string): CodeChunk[] {
  const acc: CodeChunk[] = []
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i)
    if (c) acc.push(...chunkNodeRecursive(c, source, language))
  }
  return acc
}

function chunkNodeRecursive(node: TsNode, source: string, language: string): CodeChunk[] {
  const text = sliceNode(source, node)
  const nws = nonWhitespaceLen(text)

  if (HIGH_LEVEL_TYPES.has(node.type)) {
    if (nws <= MAX_CHUNK_CHARS) {
      return [makeChunkFromNode(node, source, language)]
    }
    const childChunks = collectChildChunks(node, source, language)
    if (childChunks.length === 0) {
      return [makeChunkFromNode(node, source, language)]
    }
    return greedyMergeChunks(childChunks, language, MAX_CHUNK_CHARS)
  }

  if (node.namedChildCount === 0) {
    return []
  }
  const nested = collectChildChunks(node, source, language)
  return greedyMergeChunks(nested, language, MAX_CHUNK_CHARS)
}

function pickLanguageExport(mod: Record<string, unknown>, primary: string, factory: string): unknown {
  const p = mod[primary]
  if (p !== undefined && p !== null && typeof p !== 'function') {
    return p
  }
  if (typeof p === 'function') {
    try {
      return (p as () => unknown)()
    } catch {
      return p
    }
  }
  const f = mod[factory]
  if (typeof f === 'function') {
    return (f as () => unknown)()
  }
  return undefined
}

/** Loads a tree-sitter grammar via `require` (throws if the optional package is missing). */
function resolveLanguage(req: NodeRequireFn, language: string): unknown {
  const lang = language.trim().toLowerCase()
  if (lang === 'typescript') {
    const m = req('tree-sitter-typescript') as Record<string, unknown>
    return pickLanguageExport(m, 'typescript', 'language_typescript')
  }
  if (lang === 'tsx') {
    const m = req('tree-sitter-typescript') as Record<string, unknown>
    return pickLanguageExport(m, 'tsx', 'language_tsx')
  }
  if (lang === 'javascript' || lang === 'jsx') {
    return req('tree-sitter-javascript')
  }
  if (lang === 'python') {
    return req('tree-sitter-python')
  }
  return undefined
}

const NATIVE_TREE_SITTER_UNAVAILABLE = 'native tree-sitter unavailable'

function requireTreeSitterParserClass(req: NodeRequireFn): new () => TsParser {
  try {
    const mod: unknown = req('tree-sitter')
    if (typeof mod === 'function') {
      return mod as new () => TsParser
    }
    if (mod !== null && typeof mod === 'object' && 'default' in mod) {
      const d = (mod as { default: unknown }).default
      if (typeof d === 'function') {
        return d as new () => TsParser
      }
    }
  } catch {
    throw new Error(NATIVE_TREE_SITTER_UNAVAILABLE)
  }
  throw new Error(NATIVE_TREE_SITTER_UNAVAILABLE)
}

function getNodeRequire(): NodeRequireFn | null {
  if (typeof window !== 'undefined') {
    return null
  }
  try {
    return createRequire(import.meta.url) as NodeRequireFn
  } catch (e) {
    logWarn('getNodeRequire failed', e)
    return null
  }
}

function isTreeSitterLanguageId(lang: string): boolean {
  const n = lang.trim().toLowerCase()
  return n === 'typescript' || n === 'tsx' || n === 'javascript' || n === 'jsx' || n === 'python'
}

/**
 * Parses `source` with tree-sitter and emits {@link CodeChunk}s.
 * Throws `Error` with message `'native tree-sitter unavailable'` when native `require` of
 * tree-sitter or grammars fails so {@link chunkCode} can fall back to regex. Returns an empty
 * array for unsupported language ids. Parse / walk errors are logged and yield an empty array.
 */
function _chunkWithTreeSitter(source: string, language: string): CodeChunk[] {
  const langNorm = language.trim().toLowerCase()
  if (!isTreeSitterLanguageId(langNorm)) {
    return []
  }

  const grammarLang = langNorm === 'jsx' || langNorm === 'javascript' ? 'javascript' : langNorm

  const req = getNodeRequire()
  if (!req) {
    throw new Error(NATIVE_TREE_SITTER_UNAVAILABLE)
  }

  const ParserClass = requireTreeSitterParserClass(req)

  let langObj: unknown
  try {
    langObj = resolveLanguage(req, grammarLang)
  } catch {
    throw new Error(NATIVE_TREE_SITTER_UNAVAILABLE)
  }
  if (langObj === undefined) {
    throw new Error(NATIVE_TREE_SITTER_UNAVAILABLE)
  }

  try {
    const parser = new ParserClass()
    parser.setLanguage(langObj)
    const tree = parser.parse(source)
    const chunks = chunkNodeRecursive(tree.rootNode, source, langNorm)
    return chunks.filter((c) => c.content.trim().length > 0)
  } catch (e) {
    logWarn('tree-sitter parse / walk failed', e)
    return []
  }
}

const PYTHON_DECL = /^(def |class )/
const TS_LIKE_DECL = /^(export |function |class |const \w+ = |const \w+ = async)/

function splitSourceByLinePredicate(source: string, isBoundary: (line: string, lineIndex: number) => boolean): string[] {
  const lines = source.split(/\r?\n/)
  const blocks: string[][] = []
  let cur: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (i > 0 && isBoundary(line, i) && cur.length > 0) {
      blocks.push(cur)
      cur = [line]
    } else {
      cur.push(line)
    }
  }
  if (cur.length > 0) blocks.push(cur)
  return blocks.map((b) => b.join('\n'))
}

function mergeTinyParts(parts: string[]): string[] {
  const out: string[] = []
  let i = 0
  while (i < parts.length) {
    let cur = parts[i] ?? ''
    i += 1
    while (cur.length < MIN_REGEX_MERGE_CHARS && i < parts.length) {
      cur = `${cur}\n${parts[i] ?? ''}`
      i += 1
    }
    out.push(cur)
  }
  return out
}

function lineNumberAtOffset(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line += 1
  }
  return line
}

function partsToRegexChunks(parts: string[], source: string, language: string): CodeChunk[] {
  let searchFrom = 0
  const chunks: CodeChunk[] = []
  for (const part of parts) {
    if (!part.trim()) {
      continue
    }
    const idx = source.indexOf(part, searchFrom)
    const start = idx >= 0 ? idx : searchFrom
    const startLine = lineNumberAtOffset(source, start)
    const endLine = lineNumberAtOffset(source, start + Math.max(0, part.length - 1))
    chunks.push({
      content: part,
      language,
      chunkType: 'regex_fallback',
      startLine,
      endLine,
      name: '',
    })
    searchFrom = start + part.length
  }
  return chunks
}

/**
 * Line-based regex splitting for environments without tree-sitter (or as fallback).
 */
function _chunkWithRegex(source: string, language: string): CodeChunk[] {
  const lang = language.trim().toLowerCase()
  let parts: string[]

  if (lang === 'python') {
    parts = splitSourceByLinePredicate(source, (line) => PYTHON_DECL.test(line))
  } else if (lang === 'typescript' || lang === 'tsx' || lang === 'javascript' || lang === 'jsx') {
    parts = splitSourceByLinePredicate(source, (line) => TS_LIKE_DECL.test(line))
  } else {
    parts = [source]
  }

  const merged = mergeTinyParts(parts)
  return partsToRegexChunks(merged, source, lang || 'text')
}

/**
 * Split source into RAG-ready chunks: native tree-sitter when available, otherwise regex.
 * Tries {@link _chunkWithTreeSitter} first, then {@link _chunkWithRegex}.
 *
 * @param sourceCode - Full source text.
 * @param language - One of `typescript`, `tsx`, `javascript`, `jsx`, `python`, or other (regex may still run for unknown ids).
 * @returns Ordered chunks with line ranges and optional symbol names.
 */
export function chunkCode(sourceCode: string, language: string): CodeChunk[] {
  const src = sourceCode
  const lang = language.trim().toLowerCase()

  if (!src.trim()) {
    return []
  }

  if (isTreeSitterLanguageId(lang)) {
    try {
      const ast = _chunkWithTreeSitter(src, lang)
      if (ast.length > 0) {
        return ast
      }
    } catch (e) {
      logWarn('chunkCode: tree-sitter path failed, using regex', e)
    }
  }

  try {
    return _chunkWithRegex(src, lang || 'text')
  } catch (e) {
    logWarn('chunkCode: regex fallback failed', e)
    return [
      {
        content: src,
        language: lang || 'text',
        chunkType: 'regex_fallback',
        startLine: 1,
        endLine: Math.max(1, src.split(/\r?\n/).length),
        name: '',
      },
    ]
  }
}

/**
 * Best-effort language id from raw source (for routing before an explicit language is known).
 *
 * @param code - Source text to inspect.
 * @returns `tsx`, `jsx`, `python`, `typescript`, or `text` when no heuristic matches.
 */
export function detectLanguage(code: string): string {
  const head = code.split(/\r?\n/).slice(0, 5).join('\n')
  if (/\buseState\b/.test(code) || /\buseEffect\b/.test(code)) {
    return 'tsx'
  }
  if (/import\s+React\b/.test(head) || /\bjsx\b/i.test(head)) {
    return 'jsx'
  }
  if (/\bdef\s+/.test(code)) {
    const lines = code.split(/\r?\n/)
    const defWithColonTail = lines.some((l) => {
      const t = l.trimEnd()
      return /^\s*def\s+/.test(l) && t.endsWith(':')
    })
    if (defWithColonTail) {
      return 'python'
    }
  }
  if (/\bconst\s+/.test(code) || /\blet\s+/.test(code) || /=>/.test(code)) {
    return 'typescript'
  }
  return 'text'
}

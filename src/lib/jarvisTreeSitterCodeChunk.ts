/**
 * Code-aware chunking via Tree-sitter (VS Code WASM grammars + web-tree-sitter runtime).
 * Falls back to {@link chunkSourceStructural} when init, parse, or ABI load fails.
 */

import { Parser, Language, type Node, type Tree } from 'web-tree-sitter'

import { chunkSourceStructural, clampTextChunks, normalizeLanguageId } from '@/lib/jarvisStructuralCodeChunk'

const LOG = '[JarvisTreeSitterChunk]'

const DECL_JS = new Set([
  'function_declaration',
  'generator_function',
  'class_declaration',
  'method_definition',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'abstract_class_declaration',
  'namespace_declaration',
  'function_signature',
])

const DECL_PY = new Set(['function_definition', 'class_definition'])

const DECL_RUST = new Set([
  'function_item',
  'impl_item',
  'struct_item',
  'enum_item',
  'trait_item',
  'mod_item',
])

const DECL_GO = new Set(['function_declaration', 'method_declaration', 'type_declaration'])

const DECL_JAVA = new Set(['method_declaration', 'class_declaration', 'interface_declaration', 'enum_declaration'])

const DECL_CPP = new Set([
  'function_definition',
  'class_specifier',
  'struct_specifier',
  'union_specifier',
  'namespace_definition',
])

type WasmFamily = 'js' | 'ts' | 'tsx' | 'py' | 'rust' | 'go' | 'java' | 'cpp'

function declTypesForFamily(family: WasmFamily): Set<string> {
  switch (family) {
    case 'js':
    case 'ts':
    case 'tsx':
      return DECL_JS
    case 'py':
      return DECL_PY
    case 'rust':
      return DECL_RUST
    case 'go':
      return DECL_GO
    case 'java':
      return DECL_JAVA
    case 'cpp':
      return DECL_CPP
    default:
      return DECL_JS
  }
}

function mapLanguageToFamily(lang: string): { family: WasmFamily; norm: string } | null {
  const n = normalizeLanguageId(lang)
  if (/^(javascript|js|mjs|cjs)$/.test(n)) return { family: 'js', norm: n }
  if (/^(typescript|ts)$/.test(n)) return { family: 'ts', norm: n }
  if (/^(tsx|jsx)$/.test(n)) return { family: 'tsx', norm: n }
  if (/^(python|py)$/.test(n)) return { family: 'py', norm: n }
  if (/^(rust|rs)$/.test(n)) return { family: 'rust', norm: n }
  if (n === 'go') return { family: 'go', norm: n }
  if (n === 'java') return { family: 'java', norm: n }
  if (/^(cpp|c\+\+|cxx|cc|c)$/.test(n)) return { family: 'cpp', norm: n }
  return null
}

async function grammarWasmUrl(family: WasmFamily): Promise<string> {
  switch (family) {
    case 'js':
      return (await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-javascript.wasm?url')).default
    case 'ts':
      return (await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm?url')).default
    case 'tsx':
      return (await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-tsx.wasm?url')).default
    case 'py':
      return (await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm?url')).default
    case 'rust':
      return (await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-rust.wasm?url')).default
    case 'go':
      return (await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-go.wasm?url')).default
    case 'java':
      return (await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-java.wasm?url')).default
    case 'cpp':
      return (await import('@vscode/tree-sitter-wasm/wasm/tree-sitter-cpp.wasm?url')).default
  }
}

let parserInit: Promise<void> | null = null

async function ensureParserInit(logWarn: (msg: string, err?: unknown) => void): Promise<boolean> {
  if (parserInit) {
    try {
      await parserInit
      return true
    } catch {
      parserInit = null
    }
  }
  parserInit = (async () => {
    const coreWasm = (await import('web-tree-sitter/web-tree-sitter.wasm?url')).default
    await Parser.init({
      locateFile: (file: string) => (file.endsWith('.wasm') ? coreWasm : file),
    })
  })()
  try {
    await parserInit
    return true
  } catch (e) {
    logWarn(`${LOG} Parser.init failed`, e)
    parserInit = null
    return false
  }
}

const languageByUrl = new Map<string, Language>()

async function loadLanguageForUrl(url: string, logWarn: (msg: string, err?: unknown) => void): Promise<Language | null> {
  const hit = languageByUrl.get(url)
  if (hit) return hit
  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`HTTP ${String(res.status)} loading grammar wasm`)
    }
    const buf = new Uint8Array(await res.arrayBuffer())
    const lang = await Language.load(buf)
    languageByUrl.set(url, lang)
    return lang
  } catch (e) {
    logWarn(`${LOG} Language.load failed`, e)
    return null
  }
}

function strictlyContains(outer: { start: number; end: number }, inner: { start: number; end: number }): boolean {
  return outer.start <= inner.start && outer.end >= inner.end && (outer.start < inner.start || outer.end > inner.end)
}

function dropContainedSpans(spans: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const bySize = [...spans].sort((a, b) => b.end - b.start - (a.end - a.start))
  const kept: Array<{ start: number; end: number }> = []
  for (const s of bySize) {
    if (kept.some((k) => strictlyContains(k, s))) continue
    kept.push(s)
  }
  return kept.sort((a, b) => a.start - b.start)
}

function collectDeclarationSpans(root: Node, types: Set<string>): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = []
  const visit = (node: Node): void => {
    if (types.has(node.type)) {
      spans.push({ start: node.startIndex, end: node.endIndex })
    }
    const n = node.namedChildCount
    for (let i = 0; i < n; i++) {
      const c = node.namedChild(i)
      if (c) visit(c)
    }
  }
  visit(root)
  return spans
}

/**
 * Split source at Tree-sitter function / class / type declarations when possible.
 */
export async function chunkSourceCodeAware(
  source: string,
  language: string,
  maxChars: number,
  overlap: number,
  logWarn: (msg: string, err?: unknown) => void,
): Promise<string[]> {
  const body = source.trim()
  if (!body) return []

  const mapped = mapLanguageToFamily(language)
  if (!mapped) {
    return chunkSourceStructural(body, language, maxChars, overlap)
  }

  const ok = await ensureParserInit(logWarn)
  if (!ok) {
    return chunkSourceStructural(body, language, maxChars, overlap)
  }

  let wasmUrl: string
  try {
    wasmUrl = await grammarWasmUrl(mapped.family)
  } catch (e) {
    logWarn(`${LOG} grammar wasm import failed`, e)
    return chunkSourceStructural(body, language, maxChars, overlap)
  }

  const lang = await loadLanguageForUrl(wasmUrl, logWarn)
  if (!lang) {
    return chunkSourceStructural(body, language, maxChars, overlap)
  }

  const parser = new Parser()
  try {
    parser.setLanguage(lang)
  } catch (e) {
    logWarn(`${LOG} setLanguage failed (ABI mismatch?)`, e)
    parser.delete()
    return chunkSourceStructural(body, language, maxChars, overlap)
  }

  let tree: Tree | null = null
  try {
    tree = parser.parse(body)
  } catch (e) {
    logWarn(`${LOG} parse failed`, e)
    parser.delete()
    return chunkSourceStructural(body, language, maxChars, overlap)
  }

  if (!tree) {
    parser.delete()
    return chunkSourceStructural(body, language, maxChars, overlap)
  }

  const root = tree.rootNode
  if (root.hasError) {
    logWarn(`${LOG} parse tree has errors; using structural fallback`, undefined)
    tree.delete()
    parser.delete()
    return chunkSourceStructural(body, language, maxChars, overlap)
  }

  const declTypes = declTypesForFamily(mapped.family)
  const rawSpans = collectDeclarationSpans(root, declTypes)
  tree.delete()
  parser.delete()

  if (rawSpans.length === 0) {
    return chunkSourceStructural(body, language, maxChars, overlap)
  }

  const spans = dropContainedSpans(rawSpans)
  const pieces = spans
    .map(({ start, end }) => body.slice(start, end).trim())
    .filter((s) => s.length > 0)

  if (pieces.length === 0) {
    return chunkSourceStructural(body, language, maxChars, overlap)
  }

  return clampTextChunks(pieces, maxChars, overlap)
}

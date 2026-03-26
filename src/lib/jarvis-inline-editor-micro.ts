/**
 * JARVIS — Inline editor micro-functions (full list)
 * Smallest operations Jarvis performs inside the editor: invocation detection, context extraction,
 * AST ops, edit generation, refactoring, fixing, documentation, testing, and validation.
 */

export type JarvisInlineEditorMicroCategory =
  | 'invocation'
  | 'context-extraction'
  | 'ast'
  | 'edit-generation'
  | 'refactoring'
  | 'fixing'
  | 'documentation'
  | 'testing'
  | 'validation'

export type JarvisInlineEditorMicroId =
  /* inline invocation */
  | 'invoke-detect-edit-command'
  | 'invoke-detect-selection'
  | 'invoke-detect-code-block'
  | 'invoke-detect-nl-request'
  | 'invoke-detect-refactor-request'
  | 'invoke-detect-fix-request'
  | 'invoke-detect-explain-request'
  | 'invoke-detect-test-gen-request'
  | 'invoke-detect-doc-request'
  /* inline context extraction */
  | 'ctx-extract-selected-text'
  | 'ctx-extract-surrounding-lines'
  | 'ctx-extract-entire-function'
  | 'ctx-extract-entire-class'
  | 'ctx-extract-entire-file'
  | 'ctx-extract-related-imports'
  | 'ctx-extract-related-exports'
  | 'ctx-extract-symbol-references'
  | 'ctx-extract-inline-comments'
  | 'ctx-extract-inline-annotations'
  | 'ctx-extract-inline-todos'
  /* inline AST operations */
  | 'ast-parse-selected-region'
  | 'ast-parse-parent-node'
  | 'ast-parse-sibling-nodes'
  | 'ast-identify-node-type'
  | 'ast-identify-node-boundaries'
  | 'ast-identify-node-children'
  | 'ast-identify-node-parents'
  | 'ast-identify-node-siblings'
  | 'ast-identify-node-scope'
  | 'ast-identify-node-dependencies'
  /* inline edit generation */
  | 'edit-gen-replacement'
  | 'edit-gen-inserted'
  | 'edit-gen-removed'
  | 'edit-gen-rewritten-function'
  | 'edit-gen-rewritten-class'
  | 'edit-gen-rewritten-block'
  | 'edit-gen-rewritten-expression'
  | 'edit-gen-rewritten-jsx'
  | 'edit-gen-rewritten-css'
  | 'edit-gen-rewritten-sql'
  | 'edit-gen-rewritten-api-call'
  /* inline refactoring */
  | 'ref-rename-symbol'
  | 'ref-rename-variable'
  | 'ref-rename-function'
  | 'ref-rename-class'
  | 'ref-rename-file-reference'
  | 'ref-extract-variable'
  | 'ref-extract-function'
  | 'ref-extract-class'
  | 'ref-inline-variable'
  | 'ref-inline-function'
  | 'ref-inline-constant'
  | 'ref-convert-var-let-const'
  | 'ref-convert-function-to-arrow'
  | 'ref-convert-arrow-to-named-function'
  | 'ref-convert-callback-to-async-await'
  | 'ref-convert-promise-chain-to-async-await'
  | 'ref-convert-require-to-import'
  | 'ref-convert-import-to-require'
  /* inline fixing */
  | 'fix-syntax-errors'
  | 'fix-type-errors'
  | 'fix-missing-imports'
  | 'fix-unused-imports'
  | 'fix-missing-return'
  | 'fix-unreachable-code'
  | 'fix-missing-await'
  | 'fix-missing-error-handling'
  | 'fix-missing-parameters'
  | 'fix-mismatched-types'
  | 'fix-broken-jsx'
  | 'fix-broken-css'
  | 'fix-broken-sql'
  | 'fix-broken-api-calls'
  /* inline documentation */
  | 'doc-jsdoc'
  | 'doc-typedoc'
  | 'doc-docstring'
  | 'doc-inline-comments'
  | 'doc-function-summary'
  | 'doc-class-summary'
  | 'doc-parameter-descriptions'
  | 'doc-return-descriptions'
  /* inline testing */
  | 'test-unit-function'
  | 'test-unit-class'
  | 'test-integration'
  | 'test-mock-objects'
  | 'test-assertions'
  | 'test-cleanup'
  | 'test-snapshot'
  /* inline validation */
  | 'val-syntax'
  | 'val-types'
  | 'val-imports'
  | 'val-formatting'
  | 'val-rules'
  | 'val-architecture'
  | 'val-test-coverage'

export interface JarvisInlineEditorMicroDef {
  readonly id: JarvisInlineEditorMicroId
  readonly label: string
  readonly category: JarvisInlineEditorMicroCategory
}

/** Canonical registry — one entry per micro-function (96 total). */
export const JARVIS_INLINE_EDITOR_MICRO_REGISTRY: readonly JarvisInlineEditorMicroDef[] = [
  { id: 'invoke-detect-edit-command', label: 'Detect inline edit command', category: 'invocation' },
  { id: 'invoke-detect-selection', label: 'Detect inline selection', category: 'invocation' },
  { id: 'invoke-detect-code-block', label: 'Detect inline code block', category: 'invocation' },
  { id: 'invoke-detect-nl-request', label: 'Detect inline natural language request', category: 'invocation' },
  { id: 'invoke-detect-refactor-request', label: 'Detect inline refactor request', category: 'invocation' },
  { id: 'invoke-detect-fix-request', label: 'Detect inline fix request', category: 'invocation' },
  { id: 'invoke-detect-explain-request', label: 'Detect inline explain request', category: 'invocation' },
  { id: 'invoke-detect-test-gen-request', label: 'Detect inline test generation request', category: 'invocation' },
  { id: 'invoke-detect-doc-request', label: 'Detect inline documentation request', category: 'invocation' },

  { id: 'ctx-extract-selected-text', label: 'Extract selected text', category: 'context-extraction' },
  { id: 'ctx-extract-surrounding-lines', label: 'Extract surrounding lines', category: 'context-extraction' },
  { id: 'ctx-extract-entire-function', label: 'Extract entire function', category: 'context-extraction' },
  { id: 'ctx-extract-entire-class', label: 'Extract entire class', category: 'context-extraction' },
  { id: 'ctx-extract-entire-file', label: 'Extract entire file', category: 'context-extraction' },
  { id: 'ctx-extract-related-imports', label: 'Extract related imports', category: 'context-extraction' },
  { id: 'ctx-extract-related-exports', label: 'Extract related exports', category: 'context-extraction' },
  { id: 'ctx-extract-symbol-references', label: 'Extract symbol references', category: 'context-extraction' },
  { id: 'ctx-extract-inline-comments', label: 'Extract inline comments', category: 'context-extraction' },
  { id: 'ctx-extract-inline-annotations', label: 'Extract inline annotations', category: 'context-extraction' },
  { id: 'ctx-extract-inline-todos', label: 'Extract inline TODOs', category: 'context-extraction' },

  { id: 'ast-parse-selected-region', label: 'Parse AST for selected region', category: 'ast' },
  { id: 'ast-parse-parent-node', label: 'Parse AST for parent node', category: 'ast' },
  { id: 'ast-parse-sibling-nodes', label: 'Parse AST for sibling nodes', category: 'ast' },
  { id: 'ast-identify-node-type', label: 'Identify node type', category: 'ast' },
  { id: 'ast-identify-node-boundaries', label: 'Identify node boundaries', category: 'ast' },
  { id: 'ast-identify-node-children', label: 'Identify node children', category: 'ast' },
  { id: 'ast-identify-node-parents', label: 'Identify node parents', category: 'ast' },
  { id: 'ast-identify-node-siblings', label: 'Identify node siblings', category: 'ast' },
  { id: 'ast-identify-node-scope', label: 'Identify node scope', category: 'ast' },
  { id: 'ast-identify-node-dependencies', label: 'Identify node dependencies', category: 'ast' },

  { id: 'edit-gen-replacement', label: 'Generate replacement code', category: 'edit-generation' },
  { id: 'edit-gen-inserted', label: 'Generate inserted code', category: 'edit-generation' },
  { id: 'edit-gen-removed', label: 'Generate removed code', category: 'edit-generation' },
  { id: 'edit-gen-rewritten-function', label: 'Generate rewritten function', category: 'edit-generation' },
  { id: 'edit-gen-rewritten-class', label: 'Generate rewritten class', category: 'edit-generation' },
  { id: 'edit-gen-rewritten-block', label: 'Generate rewritten block', category: 'edit-generation' },
  { id: 'edit-gen-rewritten-expression', label: 'Generate rewritten expression', category: 'edit-generation' },
  { id: 'edit-gen-rewritten-jsx', label: 'Generate rewritten JSX', category: 'edit-generation' },
  { id: 'edit-gen-rewritten-css', label: 'Generate rewritten CSS', category: 'edit-generation' },
  { id: 'edit-gen-rewritten-sql', label: 'Generate rewritten SQL', category: 'edit-generation' },
  { id: 'edit-gen-rewritten-api-call', label: 'Generate rewritten API call', category: 'edit-generation' },

  { id: 'ref-rename-symbol', label: 'Rename symbol', category: 'refactoring' },
  { id: 'ref-rename-variable', label: 'Rename variable', category: 'refactoring' },
  { id: 'ref-rename-function', label: 'Rename function', category: 'refactoring' },
  { id: 'ref-rename-class', label: 'Rename class', category: 'refactoring' },
  { id: 'ref-rename-file-reference', label: 'Rename file reference', category: 'refactoring' },
  { id: 'ref-extract-variable', label: 'Extract variable', category: 'refactoring' },
  { id: 'ref-extract-function', label: 'Extract function', category: 'refactoring' },
  { id: 'ref-extract-class', label: 'Extract class', category: 'refactoring' },
  { id: 'ref-inline-variable', label: 'Inline variable', category: 'refactoring' },
  { id: 'ref-inline-function', label: 'Inline function', category: 'refactoring' },
  { id: 'ref-inline-constant', label: 'Inline constant', category: 'refactoring' },
  { id: 'ref-convert-var-let-const', label: 'Convert var → let/const', category: 'refactoring' },
  { id: 'ref-convert-function-to-arrow', label: 'Convert function → arrow function', category: 'refactoring' },
  { id: 'ref-convert-arrow-to-named-function', label: 'Convert arrow function → named function', category: 'refactoring' },
  { id: 'ref-convert-callback-to-async-await', label: 'Convert callback → async/await', category: 'refactoring' },
  { id: 'ref-convert-promise-chain-to-async-await', label: 'Convert promise chain → async/await', category: 'refactoring' },
  { id: 'ref-convert-require-to-import', label: 'Convert require → import', category: 'refactoring' },
  { id: 'ref-convert-import-to-require', label: 'Convert import → require', category: 'refactoring' },

  { id: 'fix-syntax-errors', label: 'Fix syntax errors', category: 'fixing' },
  { id: 'fix-type-errors', label: 'Fix type errors', category: 'fixing' },
  { id: 'fix-missing-imports', label: 'Fix missing imports', category: 'fixing' },
  { id: 'fix-unused-imports', label: 'Fix unused imports', category: 'fixing' },
  { id: 'fix-missing-return', label: 'Fix missing return', category: 'fixing' },
  { id: 'fix-unreachable-code', label: 'Fix unreachable code', category: 'fixing' },
  { id: 'fix-missing-await', label: 'Fix missing await', category: 'fixing' },
  { id: 'fix-missing-error-handling', label: 'Fix missing error handling', category: 'fixing' },
  { id: 'fix-missing-parameters', label: 'Fix missing parameters', category: 'fixing' },
  { id: 'fix-mismatched-types', label: 'Fix mismatched types', category: 'fixing' },
  { id: 'fix-broken-jsx', label: 'Fix broken JSX', category: 'fixing' },
  { id: 'fix-broken-css', label: 'Fix broken CSS', category: 'fixing' },
  { id: 'fix-broken-sql', label: 'Fix broken SQL', category: 'fixing' },
  { id: 'fix-broken-api-calls', label: 'Fix broken API calls', category: 'fixing' },

  { id: 'doc-jsdoc', label: 'Generate JSDoc', category: 'documentation' },
  { id: 'doc-typedoc', label: 'Generate TypeDoc', category: 'documentation' },
  { id: 'doc-docstring', label: 'Generate docstring', category: 'documentation' },
  { id: 'doc-inline-comments', label: 'Generate inline comments', category: 'documentation' },
  { id: 'doc-function-summary', label: 'Generate function summary', category: 'documentation' },
  { id: 'doc-class-summary', label: 'Generate class summary', category: 'documentation' },
  { id: 'doc-parameter-descriptions', label: 'Generate parameter descriptions', category: 'documentation' },
  { id: 'doc-return-descriptions', label: 'Generate return descriptions', category: 'documentation' },

  { id: 'test-unit-function', label: 'Generate unit test for function', category: 'testing' },
  { id: 'test-unit-class', label: 'Generate unit test for class', category: 'testing' },
  { id: 'test-integration', label: 'Generate integration test', category: 'testing' },
  { id: 'test-mock-objects', label: 'Generate mock objects', category: 'testing' },
  { id: 'test-assertions', label: 'Generate test assertions', category: 'testing' },
  { id: 'test-cleanup', label: 'Generate test cleanup', category: 'testing' },
  { id: 'test-snapshot', label: 'Generate snapshot tests', category: 'testing' },

  { id: 'val-syntax', label: 'Validate syntax', category: 'validation' },
  { id: 'val-types', label: 'Validate types', category: 'validation' },
  { id: 'val-imports', label: 'Validate imports', category: 'validation' },
  { id: 'val-formatting', label: 'Validate formatting', category: 'validation' },
  { id: 'val-rules', label: 'Validate rules', category: 'validation' },
  { id: 'val-architecture', label: 'Validate architecture', category: 'validation' },
  { id: 'val-test-coverage', label: 'Validate test coverage', category: 'validation' },
]

const BY_ID: ReadonlyMap<JarvisInlineEditorMicroId, JarvisInlineEditorMicroDef> = new Map(
  JARVIS_INLINE_EDITOR_MICRO_REGISTRY.map((d) => [d.id, d])
)

export function getJarvisInlineEditorMicroDef(id: JarvisInlineEditorMicroId): JarvisInlineEditorMicroDef | undefined {
  return BY_ID.get(id)
}

export function isJarvisInlineEditorMicroId(s: string): s is JarvisInlineEditorMicroId {
  return BY_ID.has(s as JarvisInlineEditorMicroId)
}

export function jarvisInlineEditorMicrosByCategory(
  cat: JarvisInlineEditorMicroCategory
): readonly JarvisInlineEditorMicroDef[] {
  return JARVIS_INLINE_EDITOR_MICRO_REGISTRY.filter((d) => d.category === cat)
}

function categoryTitleEditorMicro(c: JarvisInlineEditorMicroCategory): string {
  const map: Record<JarvisInlineEditorMicroCategory, string> = {
    invocation: 'Inline invocation',
    'context-extraction': 'Inline context extraction',
    ast: 'Inline AST operations',
    'edit-generation': 'Inline edit generation',
    refactoring: 'Inline refactoring',
    fixing: 'Inline fixing',
    documentation: 'Inline documentation',
    testing: 'Inline testing',
    validation: 'Inline validation',
  }
  return map[c]
}

export function formatJarvisInlineEditorMicroCatalog(): string {
  const cats: JarvisInlineEditorMicroCategory[] = [
    'invocation',
    'context-extraction',
    'ast',
    'edit-generation',
    'refactoring',
    'fixing',
    'documentation',
    'testing',
    'validation',
  ]
  const lines = cats.map((c) => {
    const items = jarvisInlineEditorMicrosByCategory(c).map((d) => d.label)
    return `${categoryTitleEditorMicro(c)}: ${items.join('; ')}.`
  })
  return [
    'JARVIS inline editor micro-functions (canonical ids in `jarvis-inline-editor-micro` registry):',
    ...lines,
  ].join('\n')
}

export function getJarvisInlineEditorMicroPromptSection(): string {
  return (
    'JARVIS inline editor micro-functions: invocation detection, context extraction (selection, symbols, imports/exports, comments/TODOs), ' +
    'AST parse/identify for nodes and scope, edit generation (replace/insert/remove/rewrite by construct), refactoring (rename, extract/inline, style and module conversions), ' +
    'inline fixes (syntax, types, imports, control flow, JSX/CSS/SQL/API), documentation (JSDoc/TypeDoc/docstrings/summaries), testing (unit/integration/mocks/assertions/snapshots), ' +
    'and validation (syntax, types, imports, format, rules, architecture, coverage). ' +
    'Canonical ids: `src/lib/jarvis-inline-editor-micro.ts` (JARVIS_INLINE_EDITOR_MICRO_REGISTRY).'
  )
}

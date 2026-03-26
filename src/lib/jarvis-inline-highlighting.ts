/**
 * JARVIS — Inline highlighting micro-functions
 * Atomic visual operations Jarvis uses to highlight code, structure, errors, and AI-related actions in the editor.
 * Consumed by Monaco/theming layers, tool prompts, and future `ide_*` highlight APIs.
 */

export type JarvisInlineHighlightCategory =
  | 'syntax'
  | 'semantic'
  | 'error-warning'
  | 'ai-driven'
  | 'diff'
  | 'selection'
  | 'search'
  | 'navigation'

export type JarvisInlineHighlightId =
  /* syntax */
  | 'syntax-keywords'
  | 'syntax-variables'
  | 'syntax-constants'
  | 'syntax-functions'
  | 'syntax-classes'
  | 'syntax-interfaces'
  | 'syntax-types'
  | 'syntax-enums'
  | 'syntax-decorators'
  | 'syntax-jsx-tags'
  | 'syntax-css-selectors'
  | 'syntax-sql-keywords'
  | 'syntax-comments'
  | 'syntax-docstrings'
  | 'syntax-strings'
  | 'syntax-numbers'
  | 'syntax-operators'
  | 'syntax-punctuation'
  /* semantic */
  | 'semantic-symbol-definitions'
  | 'semantic-symbol-references'
  | 'semantic-unused-variables'
  | 'semantic-unused-imports'
  | 'semantic-deprecated-apis'
  | 'semantic-shadowed-variables'
  | 'semantic-mutated-variables'
  | 'semantic-type-mismatches'
  | 'semantic-inferred-types'
  | 'semantic-overridden-methods'
  | 'semantic-abstract-methods'
  | 'semantic-unimplemented-interfaces'
  /* error & warning */
  | 'diag-syntax-errors'
  | 'diag-type-errors'
  | 'diag-lint-errors'
  | 'diag-missing-imports'
  | 'diag-unreachable-code'
  | 'diag-missing-return'
  | 'diag-missing-await'
  | 'diag-missing-error-handling'
  | 'diag-missing-parameters'
  | 'diag-mismatched-types'
  | 'diag-missing-dependencies'
  | 'diag-missing-jsx-props'
  | 'diag-missing-css-classes'
  | 'diag-missing-env-vars'
  /* AI-driven */
  | 'ai-generated-code'
  | 'ai-modified-code'
  | 'ai-suggested-edits'
  | 'ai-pending-changes'
  | 'ai-rejected-changes'
  | 'ai-risk-warnings'
  | 'ai-missing-logic'
  | 'ai-breakage-risks'
  /* diff */
  | 'diff-added-lines'
  | 'diff-removed-lines'
  | 'diff-modified-lines'
  | 'diff-moved-lines'
  | 'diff-whitespace-changes'
  | 'diff-inline-hunks'
  | 'diff-conflict-markers'
  | 'diff-merge-regions'
  /* selection */
  | 'sel-selected-text'
  | 'sel-multi-cursor'
  | 'sel-matching-brackets'
  | 'sel-matching-tags'
  | 'sel-matching-symbols'
  | 'sel-occurrences-of-word'
  /* search */
  | 'search-matches'
  | 'search-results-in-file'
  | 'search-results-in-project'
  | 'search-regex-matches'
  | 'search-fuzzy-matches'
  /* navigation */
  | 'nav-current-line'
  | 'nav-current-scope'
  | 'nav-current-block'
  | 'nav-current-function'
  | 'nav-current-class'
  | 'nav-current-symbol-definition'

export interface JarvisInlineHighlightDef {
  readonly id: JarvisInlineHighlightId
  readonly label: string
  readonly category: JarvisInlineHighlightCategory
}

/** Canonical registry — one entry per micro-function. */
export const JARVIS_INLINE_HIGHLIGHT_REGISTRY: readonly JarvisInlineHighlightDef[] = [
  { id: 'syntax-keywords', label: 'Keywords', category: 'syntax' },
  { id: 'syntax-variables', label: 'Variables', category: 'syntax' },
  { id: 'syntax-constants', label: 'Constants', category: 'syntax' },
  { id: 'syntax-functions', label: 'Functions', category: 'syntax' },
  { id: 'syntax-classes', label: 'Classes', category: 'syntax' },
  { id: 'syntax-interfaces', label: 'Interfaces', category: 'syntax' },
  { id: 'syntax-types', label: 'Types', category: 'syntax' },
  { id: 'syntax-enums', label: 'Enums', category: 'syntax' },
  { id: 'syntax-decorators', label: 'Decorators', category: 'syntax' },
  { id: 'syntax-jsx-tags', label: 'JSX tags', category: 'syntax' },
  { id: 'syntax-css-selectors', label: 'CSS selectors', category: 'syntax' },
  { id: 'syntax-sql-keywords', label: 'SQL keywords', category: 'syntax' },
  { id: 'syntax-comments', label: 'Comments', category: 'syntax' },
  { id: 'syntax-docstrings', label: 'Docstrings', category: 'syntax' },
  { id: 'syntax-strings', label: 'Strings', category: 'syntax' },
  { id: 'syntax-numbers', label: 'Numbers', category: 'syntax' },
  { id: 'syntax-operators', label: 'Operators', category: 'syntax' },
  { id: 'syntax-punctuation', label: 'Punctuation', category: 'syntax' },

  { id: 'semantic-symbol-definitions', label: 'Symbol definitions', category: 'semantic' },
  { id: 'semantic-symbol-references', label: 'Symbol references', category: 'semantic' },
  { id: 'semantic-unused-variables', label: 'Unused variables', category: 'semantic' },
  { id: 'semantic-unused-imports', label: 'Unused imports', category: 'semantic' },
  { id: 'semantic-deprecated-apis', label: 'Deprecated APIs', category: 'semantic' },
  { id: 'semantic-shadowed-variables', label: 'Shadowed variables', category: 'semantic' },
  { id: 'semantic-mutated-variables', label: 'Mutated variables', category: 'semantic' },
  { id: 'semantic-type-mismatches', label: 'Type mismatches', category: 'semantic' },
  { id: 'semantic-inferred-types', label: 'Inferred types', category: 'semantic' },
  { id: 'semantic-overridden-methods', label: 'Overridden methods', category: 'semantic' },
  { id: 'semantic-abstract-methods', label: 'Abstract methods', category: 'semantic' },
  { id: 'semantic-unimplemented-interfaces', label: 'Unimplemented interfaces', category: 'semantic' },

  { id: 'diag-syntax-errors', label: 'Syntax errors', category: 'error-warning' },
  { id: 'diag-type-errors', label: 'Type errors', category: 'error-warning' },
  { id: 'diag-lint-errors', label: 'Lint errors', category: 'error-warning' },
  { id: 'diag-missing-imports', label: 'Missing imports', category: 'error-warning' },
  { id: 'diag-unreachable-code', label: 'Unreachable code', category: 'error-warning' },
  { id: 'diag-missing-return', label: 'Missing return', category: 'error-warning' },
  { id: 'diag-missing-await', label: 'Missing await', category: 'error-warning' },
  { id: 'diag-missing-error-handling', label: 'Missing error handling', category: 'error-warning' },
  { id: 'diag-missing-parameters', label: 'Missing parameters', category: 'error-warning' },
  { id: 'diag-mismatched-types', label: 'Mismatched types', category: 'error-warning' },
  { id: 'diag-missing-dependencies', label: 'Missing dependencies', category: 'error-warning' },
  { id: 'diag-missing-jsx-props', label: 'Missing JSX props', category: 'error-warning' },
  { id: 'diag-missing-css-classes', label: 'Missing CSS classes', category: 'error-warning' },
  { id: 'diag-missing-env-vars', label: 'Missing environment variables', category: 'error-warning' },

  { id: 'ai-generated-code', label: 'AI-generated code', category: 'ai-driven' },
  { id: 'ai-modified-code', label: 'AI-modified code', category: 'ai-driven' },
  { id: 'ai-suggested-edits', label: 'AI-suggested edits', category: 'ai-driven' },
  { id: 'ai-pending-changes', label: 'AI-pending changes', category: 'ai-driven' },
  { id: 'ai-rejected-changes', label: 'AI-rejected changes', category: 'ai-driven' },
  { id: 'ai-risk-warnings', label: 'AI risk warnings', category: 'ai-driven' },
  { id: 'ai-missing-logic', label: 'AI-detected missing logic', category: 'ai-driven' },
  { id: 'ai-breakage-risks', label: 'AI-detected breakage risks', category: 'ai-driven' },

  { id: 'diff-added-lines', label: 'Added lines', category: 'diff' },
  { id: 'diff-removed-lines', label: 'Removed lines', category: 'diff' },
  { id: 'diff-modified-lines', label: 'Modified lines', category: 'diff' },
  { id: 'diff-moved-lines', label: 'Moved lines', category: 'diff' },
  { id: 'diff-whitespace-changes', label: 'Whitespace changes', category: 'diff' },
  { id: 'diff-inline-hunks', label: 'Inline diff hunks', category: 'diff' },
  { id: 'diff-conflict-markers', label: 'Conflict markers', category: 'diff' },
  { id: 'diff-merge-regions', label: 'Merge conflict regions', category: 'diff' },

  { id: 'sel-selected-text', label: 'Selected text', category: 'selection' },
  { id: 'sel-multi-cursor', label: 'Multi-cursor selections', category: 'selection' },
  { id: 'sel-matching-brackets', label: 'Matching brackets', category: 'selection' },
  { id: 'sel-matching-tags', label: 'Matching tags', category: 'selection' },
  { id: 'sel-matching-symbols', label: 'Matching symbols', category: 'selection' },
  { id: 'sel-occurrences-of-word', label: 'Occurrences of selected word', category: 'selection' },

  { id: 'search-matches', label: 'Search matches', category: 'search' },
  { id: 'search-results-in-file', label: 'Search results in file', category: 'search' },
  { id: 'search-results-in-project', label: 'Search results in project', category: 'search' },
  { id: 'search-regex-matches', label: 'Regex matches', category: 'search' },
  { id: 'search-fuzzy-matches', label: 'Fuzzy matches', category: 'search' },

  { id: 'nav-current-line', label: 'Current line', category: 'navigation' },
  { id: 'nav-current-scope', label: 'Current scope', category: 'navigation' },
  { id: 'nav-current-block', label: 'Current block', category: 'navigation' },
  { id: 'nav-current-function', label: 'Current function', category: 'navigation' },
  { id: 'nav-current-class', label: 'Current class', category: 'navigation' },
  { id: 'nav-current-symbol-definition', label: 'Current symbol definition', category: 'navigation' },
]

const BY_ID: ReadonlyMap<JarvisInlineHighlightId, JarvisInlineHighlightDef> = new Map(
  JARVIS_INLINE_HIGHLIGHT_REGISTRY.map((d) => [d.id, d])
)

export function getJarvisInlineHighlightDef(id: JarvisInlineHighlightId): JarvisInlineHighlightDef | undefined {
  return BY_ID.get(id)
}

export function isJarvisInlineHighlightId(s: string): s is JarvisInlineHighlightId {
  return BY_ID.has(s as JarvisInlineHighlightId)
}

export function jarvisInlineHighlightsByCategory(
  cat: JarvisInlineHighlightCategory
): readonly JarvisInlineHighlightDef[] {
  return JARVIS_INLINE_HIGHLIGHT_REGISTRY.filter((d) => d.category === cat)
}

/**
 * Full human-readable catalog (e.g. docs, debugging). For system prompts use
 * `getJarvisInlineHighlightingPromptSection` instead.
 */
export function formatJarvisInlineHighlightingCatalog(): string {
  const cats: JarvisInlineHighlightCategory[] = [
    'syntax',
    'semantic',
    'error-warning',
    'ai-driven',
    'diff',
    'selection',
    'search',
    'navigation',
  ]
  function categoryTitle(c: JarvisInlineHighlightCategory): string {
    if (c === 'error-warning') return 'Error & warning highlighting'
    if (c === 'ai-driven') return 'AI-driven highlighting'
    return `${c.charAt(0).toUpperCase() + c.slice(1)} highlighting`
  }
  const lines = cats.map((c) => {
    const items = jarvisInlineHighlightsByCategory(c).map((d) => d.label)
    return `${categoryTitle(c)}: ${items.join('; ')}.`
  })
  return [
    'JARVIS inline highlighting micro-functions (canonical ids in `jarvis-inline-highlighting` registry):',
    ...lines,
  ].join('\n')
}

/** Short paragraph for tool/system prompts. */
export function getJarvisInlineHighlightingPromptSection(): string {
  return (
    'JARVIS inline highlighting: the editor distinguishes syntax token classes, semantic LSP highlights (definitions, references, unused symbols, etc.), ' +
    'diagnostics and missing-resource warnings, AI-authored change overlays, diff and merge conflict visuals, ' +
    'selection/bracket/tag matching, project search, and caret/scope navigation. ' +
    'Canonical micro-function ids are defined in `src/lib/jarvis-inline-highlighting.ts` (JARVIS_INLINE_HIGHLIGHT_REGISTRY).'
  )
}

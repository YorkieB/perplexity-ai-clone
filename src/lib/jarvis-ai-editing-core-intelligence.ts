/**
 * JARVIS — AI Editing & Core Intelligence
 * Detection, reads, parse/extract, inference, generation, diff validation, file/terminal loop.
 * Agent System micro-capabilities remain canonical in `jarvis-agent-system-capabilities.ts`.
 */

export type JarvisAiEditingCoreIntelligenceCategory =
  | 'detection'
  | 'read'
  | 'parse-extract'
  | 'infer'
  | 'generate'
  | 'diff'
  | 'file-terminal'

/** Canonical registry — 132 capabilities (Agent System is separate; see `jarvis-agent-system-capabilities.ts`). */
const JARVIS_AI_EDITING_CORE_INTELLIGENCE_REGISTRY_RAW = [
  /* detection — 18 */
  { id: 'aic-detect-text-selection', label: 'Detect text selection', category: 'detection' },
  { id: 'aic-detect-cursor-position', label: 'Detect cursor position', category: 'detection' },
  { id: 'aic-detect-active-file-language', label: 'Detect active file language', category: 'detection' },
  { id: 'aic-detect-multi-cursor-state', label: 'Detect multi-cursor state', category: 'detection' },
  { id: 'aic-detect-editor-focus', label: 'Detect editor focus', category: 'detection' },
  { id: 'aic-detect-chat-panel-focus', label: 'Detect chat panel focus', category: 'detection' },
  { id: 'aic-detect-command-palette-invocation', label: 'Detect command palette invocation', category: 'detection' },
  { id: 'aic-detect-slash-command-invocation', label: 'Detect slash command invocation', category: 'detection' },
  { id: 'aic-detect-keyboard-shortcut-invocation', label: 'Detect keyboard shortcut invocation', category: 'detection' },
  { id: 'aic-detect-file-mention', label: 'Detect file mention', category: 'detection' },
  { id: 'aic-detect-folder-mention', label: 'Detect folder mention', category: 'detection' },
  { id: 'aic-detect-symbol-mention', label: 'Detect symbol mention', category: 'detection' },
  { id: 'aic-detect-code-block-in-chat', label: 'Detect code block in chat', category: 'detection' },
  { id: 'aic-detect-natural-language-intent', label: 'Detect natural language intent', category: 'detection' },
  { id: 'aic-detect-request-type', label: 'Detect request type', category: 'detection' },
  { id: 'aic-detect-scope', label: 'Detect scope', category: 'detection' },
  { id: 'aic-detect-ambiguity', label: 'Detect ambiguity', category: 'detection' },
  { id: 'aic-request-clarification', label: 'Request clarification', category: 'detection' },

  /* read — 20 */
  { id: 'aic-read-current-file', label: 'Read current file', category: 'read' },
  { id: 'aic-read-selected-text', label: 'Read selected text', category: 'read' },
  { id: 'aic-read-surrounding-lines', label: 'Read surrounding lines', category: 'read' },
  { id: 'aic-read-entire-file', label: 'Read entire file', category: 'read' },
  { id: 'aic-read-related-files-imports', label: 'Read related files via imports', category: 'read' },
  { id: 'aic-read-related-files-exports', label: 'Read related files via exports', category: 'read' },
  { id: 'aic-read-symbol-references', label: 'Read symbol references', category: 'read' },
  { id: 'aic-read-test-files', label: 'Read test files', category: 'read' },
  { id: 'aic-read-config-files', label: 'Read config files', category: 'read' },
  { id: 'aic-read-environment-files', label: 'Read environment files', category: 'read' },
  { id: 'aic-read-package-json', label: 'Read package.json', category: 'read' },
  { id: 'aic-read-tsconfig-jsconfig', label: 'Read tsconfig/jsconfig', category: 'read' },
  { id: 'aic-read-build-scripts', label: 'Read build scripts', category: 'read' },
  { id: 'aic-read-readme', label: 'Read README', category: 'read' },
  { id: 'aic-read-rules', label: 'Read rules', category: 'read' },
  { id: 'aic-read-skills', label: 'Read skills', category: 'read' },
  { id: 'aic-read-git-diff', label: 'Read git diff', category: 'read' },
  { id: 'aic-read-git-history', label: 'Read git history', category: 'read' },
  { id: 'aic-read-terminal-logs', label: 'Read terminal logs', category: 'read' },
  { id: 'aic-read-browser-dom', label: 'Read browser DOM', category: 'read' },

  /* parse & extract — 27 */
  { id: 'aic-parse-ast', label: 'Parse AST', category: 'parse-extract' },
  { id: 'aic-extract-function-signatures', label: 'Extract function signatures', category: 'parse-extract' },
  { id: 'aic-extract-class-definitions', label: 'Extract class definitions', category: 'parse-extract' },
  { id: 'aic-extract-variables', label: 'Extract variables', category: 'parse-extract' },
  { id: 'aic-extract-types', label: 'Extract types', category: 'parse-extract' },
  { id: 'aic-extract-interfaces', label: 'Extract interfaces', category: 'parse-extract' },
  { id: 'aic-extract-enums', label: 'Extract enums', category: 'parse-extract' },
  { id: 'aic-extract-imports', label: 'Extract imports', category: 'parse-extract' },
  { id: 'aic-extract-exports', label: 'Extract exports', category: 'parse-extract' },
  { id: 'aic-extract-comments', label: 'Extract comments', category: 'parse-extract' },
  { id: 'aic-extract-docstrings', label: 'Extract docstrings', category: 'parse-extract' },
  { id: 'aic-extract-todos', label: 'Extract TODOs', category: 'parse-extract' },
  { id: 'aic-extract-annotations', label: 'Extract annotations', category: 'parse-extract' },
  { id: 'aic-extract-jsx', label: 'Extract JSX', category: 'parse-extract' },
  { id: 'aic-extract-css-selectors', label: 'Extract CSS selectors', category: 'parse-extract' },
  { id: 'aic-extract-sql-queries', label: 'Extract SQL queries', category: 'parse-extract' },
  { id: 'aic-extract-api-endpoints', label: 'Extract API endpoints', category: 'parse-extract' },
  { id: 'aic-extract-error-messages', label: 'Extract error messages', category: 'parse-extract' },
  { id: 'aic-extract-stack-traces', label: 'Extract stack traces', category: 'parse-extract' },
  { id: 'aic-extract-dependency-graph', label: 'Extract dependency graph', category: 'parse-extract' },
  { id: 'aic-extract-call-graph', label: 'Extract call graph', category: 'parse-extract' },
  { id: 'aic-extract-data-flow', label: 'Extract data flow', category: 'parse-extract' },
  { id: 'aic-extract-side-effects', label: 'Extract side effects', category: 'parse-extract' },
  { id: 'aic-extract-architecture-patterns', label: 'Extract architecture patterns', category: 'parse-extract' },
  { id: 'aic-extract-naming-conventions', label: 'Extract naming conventions', category: 'parse-extract' },
  { id: 'aic-extract-style-patterns', label: 'Extract style patterns', category: 'parse-extract' },
  { id: 'aic-extract-test-patterns', label: 'Extract test patterns', category: 'parse-extract' },

  /* infer — 22 */
  { id: 'aic-infer-user-intent', label: 'Infer user intent', category: 'infer' },
  { id: 'aic-infer-required-scope', label: 'Infer required scope', category: 'infer' },
  { id: 'aic-infer-required-files', label: 'Infer required files', category: 'infer' },
  { id: 'aic-infer-required-changes', label: 'Infer required changes', category: 'infer' },
  { id: 'aic-infer-missing-context', label: 'Infer missing context', category: 'infer' },
  { id: 'aic-infer-architecture-constraints', label: 'Infer architecture constraints', category: 'infer' },
  { id: 'aic-infer-coding-style', label: 'Infer coding style', category: 'infer' },
  { id: 'aic-infer-naming-conventions', label: 'Infer naming conventions', category: 'infer' },
  { id: 'aic-infer-side-effects', label: 'Infer side effects', category: 'infer' },
  { id: 'aic-infer-risk-level', label: 'Infer risk level', category: 'infer' },
  { id: 'aic-infer-required-tests', label: 'Infer required tests', category: 'infer' },
  { id: 'aic-infer-required-documentation', label: 'Infer required documentation', category: 'infer' },
  { id: 'aic-infer-required-refactors', label: 'Infer required refactors', category: 'infer' },
  { id: 'aic-infer-required-imports', label: 'Infer required imports', category: 'infer' },
  { id: 'aic-infer-required-exports', label: 'Infer required exports', category: 'infer' },
  { id: 'aic-infer-required-type-changes', label: 'Infer required type changes', category: 'infer' },
  { id: 'aic-infer-required-dependency-updates', label: 'Infer required dependency updates', category: 'infer' },
  { id: 'aic-infer-required-environment-changes', label: 'Infer required environment changes', category: 'infer' },
  { id: 'aic-infer-required-build-changes', label: 'Infer required build changes', category: 'infer' },
  { id: 'aic-infer-required-terminal-commands', label: 'Infer required terminal commands', category: 'infer' },
  { id: 'aic-infer-required-browser-actions', label: 'Infer required browser actions', category: 'infer' },

  /* generate — 19 */
  { id: 'aic-gen-replacement-text', label: 'Generate replacement text', category: 'generate' },
  { id: 'aic-gen-inserted-text', label: 'Generate inserted text', category: 'generate' },
  { id: 'aic-gen-deleted-text', label: 'Generate deleted text', category: 'generate' },
  { id: 'aic-gen-multiline-edits', label: 'Generate multi-line edits', category: 'generate' },
  { id: 'aic-gen-multifile-edits', label: 'Generate multi-file edits', category: 'generate' },
  { id: 'aic-gen-new-files', label: 'Generate new files', category: 'generate' },
  { id: 'aic-gen-new-folders', label: 'Generate new folders', category: 'generate' },
  { id: 'aic-gen-new-components', label: 'Generate new components', category: 'generate' },
  { id: 'aic-gen-new-functions', label: 'Generate new functions', category: 'generate' },
  { id: 'aic-gen-new-classes', label: 'Generate new classes', category: 'generate' },
  { id: 'aic-gen-new-tests', label: 'Generate new tests', category: 'generate' },
  { id: 'aic-gen-new-documentation', label: 'Generate new documentation', category: 'generate' },
  { id: 'aic-gen-new-config-files', label: 'Generate new config files', category: 'generate' },
  { id: 'aic-gen-new-scripts', label: 'Generate new scripts', category: 'generate' },
  { id: 'aic-gen-new-migrations', label: 'Generate new migrations', category: 'generate' },
  { id: 'aic-gen-new-api-routes', label: 'Generate new API routes', category: 'generate' },
  { id: 'aic-gen-new-schemas', label: 'Generate new schemas', category: 'generate' },
  { id: 'aic-gen-new-types', label: 'Generate new types', category: 'generate' },
  { id: 'aic-gen-new-interfaces', label: 'Generate new interfaces', category: 'generate' },

  /* diff — 10 */
  { id: 'aic-diff-compute', label: 'Compute diff', category: 'diff' },
  { id: 'aic-diff-highlight-additions', label: 'Highlight additions', category: 'diff' },
  { id: 'aic-diff-highlight-deletions', label: 'Highlight deletions', category: 'diff' },
  { id: 'aic-diff-highlight-modifications', label: 'Highlight modifications', category: 'diff' },
  { id: 'aic-diff-validate-syntax', label: 'Validate diff syntax', category: 'diff' },
  { id: 'aic-diff-validate-semantics', label: 'Validate diff semantics', category: 'diff' },
  { id: 'aic-diff-validate-rules', label: 'Validate diff against rules', category: 'diff' },
  { id: 'aic-diff-validate-architecture', label: 'Validate diff against architecture', category: 'diff' },
  { id: 'aic-diff-validate-tests', label: 'Validate diff against tests', category: 'diff' },
  { id: 'aic-diff-validate-type-system', label: 'Validate diff against type system', category: 'diff' },

  /* file & terminal — 16 */
  { id: 'aic-fs-write-file-changes', label: 'Write file changes', category: 'file-terminal' },
  { id: 'aic-fs-create-files', label: 'Create files', category: 'file-terminal' },
  { id: 'aic-fs-delete-files', label: 'Delete files', category: 'file-terminal' },
  { id: 'aic-fs-move-files', label: 'Move files', category: 'file-terminal' },
  { id: 'aic-fs-rename-files', label: 'Rename files', category: 'file-terminal' },
  { id: 'aic-term-run-commands', label: 'Run terminal commands', category: 'file-terminal' },
  { id: 'aic-term-parse-output', label: 'Parse terminal output', category: 'file-terminal' },
  { id: 'aic-term-detect-success', label: 'Detect command success', category: 'file-terminal' },
  { id: 'aic-term-detect-failure', label: 'Detect command failure', category: 'file-terminal' },
  { id: 'aic-term-detect-build-errors', label: 'Detect build errors', category: 'file-terminal' },
  { id: 'aic-term-detect-test-failures', label: 'Detect test failures', category: 'file-terminal' },
  { id: 'aic-term-detect-lint-errors', label: 'Detect lint errors', category: 'file-terminal' },
  { id: 'aic-term-detect-type-errors', label: 'Detect type errors', category: 'file-terminal' },
  { id: 'aic-term-detect-runtime-errors', label: 'Detect runtime errors', category: 'file-terminal' },
  { id: 'aic-term-retry-commands', label: 'Retry commands', category: 'file-terminal' },
  { id: 'aic-term-apply-iterative-patches', label: 'Apply iterative patches', category: 'file-terminal' },
] as const

export type JarvisAiEditingCoreIntelligenceId = (typeof JARVIS_AI_EDITING_CORE_INTELLIGENCE_REGISTRY_RAW)[number]['id']

export interface JarvisAiEditingCoreIntelligenceDef {
  readonly id: JarvisAiEditingCoreIntelligenceId
  readonly label: string
  readonly category: JarvisAiEditingCoreIntelligenceCategory
}

export const JARVIS_AI_EDITING_CORE_INTELLIGENCE_REGISTRY: readonly JarvisAiEditingCoreIntelligenceDef[] =
  JARVIS_AI_EDITING_CORE_INTELLIGENCE_REGISTRY_RAW

const BY_ID: ReadonlyMap<JarvisAiEditingCoreIntelligenceId, JarvisAiEditingCoreIntelligenceDef> = new Map(
  JARVIS_AI_EDITING_CORE_INTELLIGENCE_REGISTRY.map((d) => [d.id, d])
)

export function getJarvisAiEditingCoreIntelligenceDef(
  id: JarvisAiEditingCoreIntelligenceId
): JarvisAiEditingCoreIntelligenceDef | undefined {
  return BY_ID.get(id)
}

export function isJarvisAiEditingCoreIntelligenceId(s: string): s is JarvisAiEditingCoreIntelligenceId {
  return BY_ID.has(s as JarvisAiEditingCoreIntelligenceId)
}

export function jarvisAiEditingCoreIntelligenceByCategory(
  cat: JarvisAiEditingCoreIntelligenceCategory
): readonly JarvisAiEditingCoreIntelligenceDef[] {
  return JARVIS_AI_EDITING_CORE_INTELLIGENCE_REGISTRY.filter((d) => d.category === cat)
}

function categoryTitleAic(cat: JarvisAiEditingCoreIntelligenceCategory): string {
  const map: Record<JarvisAiEditingCoreIntelligenceCategory, string> = {
    detection: 'Detection',
    read: 'Read',
    'parse-extract': 'Parse & extract',
    infer: 'Infer',
    generate: 'Generate',
    diff: 'Diff',
    'file-terminal': 'File & terminal',
  }
  return map[cat]
}

export function formatJarvisAiEditingCoreIntelligenceCatalog(): string {
  const cats: JarvisAiEditingCoreIntelligenceCategory[] = [
    'detection',
    'read',
    'parse-extract',
    'infer',
    'generate',
    'diff',
    'file-terminal',
  ]
  const lines = cats.map((c) => {
    const items = jarvisAiEditingCoreIntelligenceByCategory(c).map((d) => d.label)
    return `${categoryTitleAic(c)}: ${items.join('; ')}.`
  })
  return [
    'JARVIS AI Editing & Core Intelligence (canonical ids in `jarvis-ai-editing-core-intelligence` registry):',
    ...lines,
    '',
    'Agent System capabilities are defined in `jarvis-agent-system-capabilities.ts` (JARVIS_AGENT_SYSTEM_CAPABILITY_REGISTRY).',
  ].join('\n')
}

export function getJarvisAiEditingCoreIntelligencePromptSection(): string {
  return (
    'JARVIS AI Editing & Core Intelligence: detect editor/chat/context (selection, cursor, language, focus, mentions, intent, scope, ambiguity); ' +
    'read workspace sources (files, symbols, configs, git, terminal, DOM); parse AST and extract structure/patterns/graphs; infer intent, scope, risk, and required changes; ' +
    'generate text and artifacts; compute/validate diffs; write files and run terminal with success/failure handling, retries, and iterative patches. ' +
    'Canonical ids: `src/lib/jarvis-ai-editing-core-intelligence.ts` (JARVIS_AI_EDITING_CORE_INTELLIGENCE_REGISTRY). ' +
    'Agent loop (tasks, steps, recovery, approval, tooling, state, logs) remains in `jarvis-agent-system-capabilities.ts`.'
  )
}

/**
 * JARVIS — Composer (full microscopic breakdown)
 * Smallest Composer operations: capture, intent, scope, planning, prediction, validation, UI, diffs, apply, rebuild, re-run, diagnostics.
 */

export type JarvisComposerCapabilityCategory =
  | 'capture'
  | 'intent'
  | 'scope'
  | 'step-planning'
  | 'file-targets'
  | 'prediction'
  | 'impact-analysis'
  | 'generation'
  | 'validation'
  | 'plan-ui'
  | 'diff-ui'
  | 'hunk'
  | 'change-visibility'
  | 'apply'
  | 'plan-iterate'
  | 'index-rebuild'
  | 'rerun'
  | 'error-detect'
  | 'fix'

export type JarvisComposerCapabilityId =
  | 'comp-capture-nl-request'
  | 'comp-capture-selected-code'
  | 'comp-capture-referenced-files'
  | 'comp-capture-chat-context'
  | 'comp-capture-rules'
  | 'comp-capture-skills'
  | 'comp-capture-repo-structure'
  | 'comp-detect-feature-request'
  | 'comp-detect-refactor-request'
  | 'comp-detect-bugfix-request'
  | 'comp-detect-architecture-change'
  | 'comp-detect-multifile-change'
  | 'comp-detect-new-file-creation'
  | 'comp-detect-deletion-request'
  | 'comp-detect-rename-request'
  | 'comp-detect-migration-request'
  | 'comp-scope-file'
  | 'comp-scope-folder'
  | 'comp-scope-repo'
  | 'comp-scope-language'
  | 'comp-scope-dependency'
  | 'comp-steps-break-request'
  | 'comp-steps-order'
  | 'comp-steps-detect-dependencies'
  | 'comp-steps-detect-parallel'
  | 'comp-steps-detect-risky'
  | 'comp-steps-detect-irreversible'
  | 'comp-files-identify-modify'
  | 'comp-files-identify-create'
  | 'comp-files-identify-delete'
  | 'comp-files-identify-rename'
  | 'comp-files-identify-move'
  | 'comp-predict-code-changes'
  | 'comp-predict-type-changes'
  | 'comp-predict-import-changes'
  | 'comp-predict-test-changes'
  | 'comp-predict-config-changes'
  | 'comp-predict-doc-changes'
  | 'comp-detect-breaking-changes'
  | 'comp-detect-api-changes'
  | 'comp-detect-architecture-violations'
  | 'comp-detect-rule-violations'
  | 'comp-detect-missing-tests'
  | 'comp-gen-human-plan'
  | 'comp-gen-step-breakdown'
  | 'comp-gen-file-summaries'
  | 'comp-gen-risk-warnings'
  | 'comp-gen-required-confirmations'
  | 'comp-gen-diff-per-file'
  | 'comp-gen-diff-per-step'
  | 'comp-gen-unified-diff'
  | 'comp-gen-summary-diff'
  | 'comp-validate-syntax'
  | 'comp-validate-imports'
  | 'comp-validate-types'
  | 'comp-validate-formatting'
  | 'comp-validate-rules'
  | 'comp-validate-architecture'
  | 'comp-ui-show-plan'
  | 'comp-ui-collapse-steps'
  | 'comp-ui-expand-steps'
  | 'comp-ui-edit-steps'
  | 'comp-ui-reorder-steps'
  | 'comp-ui-delete-steps'
  | 'comp-ui-add-custom-steps'
  | 'comp-diff-show-file-list'
  | 'comp-diff-show-per-file'
  | 'comp-diff-show-per-step'
  | 'comp-diff-toggle-whitespace'
  | 'comp-diff-toggle-inline-sidebyside'
  | 'comp-hunk-accept'
  | 'comp-hunk-reject'
  | 'comp-show-affected-files'
  | 'comp-show-file-creation'
  | 'comp-show-file-deletion'
  | 'comp-show-file-renames'
  | 'comp-show-file-moves'
  | 'comp-apply-all'
  | 'comp-apply-selected'
  | 'comp-reject-all'
  | 'comp-plan-regenerate'
  | 'comp-plan-refine'
  | 'comp-plan-explain'
  | 'comp-plan-export'
  | 'comp-index-rebuild-semantic'
  | 'comp-index-rebuild-dependency-graph'
  | 'comp-index-rebuild-symbol-table'
  | 'comp-index-rebuild-embeddings'
  | 'comp-rerun-typechecker'
  | 'comp-rerun-linter'
  | 'comp-rerun-tests'
  | 'comp-rerun-build'
  | 'comp-rerun-rule-engine'
  | 'comp-detect-syntax-errors'
  | 'comp-detect-type-errors'
  | 'comp-detect-lint-errors'
  | 'comp-detect-test-failures'
  | 'comp-detect-build-failures'
  | 'comp-gen-fixes'
  | 'comp-apply-fixes'
  | 'comp-revalidate'

export interface JarvisComposerCapabilityDef {
  readonly id: JarvisComposerCapabilityId
  readonly label: string
  readonly category: JarvisComposerCapabilityCategory
}

/** Canonical registry — 101 Composer micro-capabilities. */
export const JARVIS_COMPOSER_CAPABILITY_REGISTRY: readonly JarvisComposerCapabilityDef[] = [
  { id: 'comp-capture-nl-request', label: 'Capture natural language request', category: 'capture' },
  { id: 'comp-capture-selected-code', label: 'Capture selected code', category: 'capture' },
  { id: 'comp-capture-referenced-files', label: 'Capture referenced files', category: 'capture' },
  { id: 'comp-capture-chat-context', label: 'Capture chat context', category: 'capture' },
  { id: 'comp-capture-rules', label: 'Capture rules', category: 'capture' },
  { id: 'comp-capture-skills', label: 'Capture skills', category: 'capture' },
  { id: 'comp-capture-repo-structure', label: 'Capture repo structure', category: 'capture' },

  { id: 'comp-detect-feature-request', label: 'Detect feature request', category: 'intent' },
  { id: 'comp-detect-refactor-request', label: 'Detect refactor request', category: 'intent' },
  { id: 'comp-detect-bugfix-request', label: 'Detect bug fix request', category: 'intent' },
  { id: 'comp-detect-architecture-change', label: 'Detect architecture change', category: 'intent' },
  { id: 'comp-detect-multifile-change', label: 'Detect multi-file change', category: 'intent' },
  { id: 'comp-detect-new-file-creation', label: 'Detect new file creation', category: 'intent' },
  { id: 'comp-detect-deletion-request', label: 'Detect deletion request', category: 'intent' },
  { id: 'comp-detect-rename-request', label: 'Detect rename request', category: 'intent' },
  { id: 'comp-detect-migration-request', label: 'Detect migration request', category: 'intent' },

  { id: 'comp-scope-file', label: 'Determine file scope', category: 'scope' },
  { id: 'comp-scope-folder', label: 'Determine folder scope', category: 'scope' },
  { id: 'comp-scope-repo', label: 'Determine repo scope', category: 'scope' },
  { id: 'comp-scope-language', label: 'Determine language scope', category: 'scope' },
  { id: 'comp-scope-dependency', label: 'Determine dependency scope', category: 'scope' },

  { id: 'comp-steps-break-request', label: 'Break request into steps', category: 'step-planning' },
  { id: 'comp-steps-order', label: 'Order steps', category: 'step-planning' },
  { id: 'comp-steps-detect-dependencies', label: 'Detect step dependencies', category: 'step-planning' },
  { id: 'comp-steps-detect-parallel', label: 'Detect parallel steps', category: 'step-planning' },
  { id: 'comp-steps-detect-risky', label: 'Detect risky steps', category: 'step-planning' },
  { id: 'comp-steps-detect-irreversible', label: 'Detect irreversible steps', category: 'step-planning' },

  { id: 'comp-files-identify-modify', label: 'Identify files to modify', category: 'file-targets' },
  { id: 'comp-files-identify-create', label: 'Identify files to create', category: 'file-targets' },
  { id: 'comp-files-identify-delete', label: 'Identify files to delete', category: 'file-targets' },
  { id: 'comp-files-identify-rename', label: 'Identify files to rename', category: 'file-targets' },
  { id: 'comp-files-identify-move', label: 'Identify files to move', category: 'file-targets' },

  { id: 'comp-predict-code-changes', label: 'Predict code changes', category: 'prediction' },
  { id: 'comp-predict-type-changes', label: 'Predict type changes', category: 'prediction' },
  { id: 'comp-predict-import-changes', label: 'Predict import changes', category: 'prediction' },
  { id: 'comp-predict-test-changes', label: 'Predict test changes', category: 'prediction' },
  { id: 'comp-predict-config-changes', label: 'Predict config changes', category: 'prediction' },
  { id: 'comp-predict-doc-changes', label: 'Predict documentation changes', category: 'prediction' },

  { id: 'comp-detect-breaking-changes', label: 'Detect breaking changes', category: 'impact-analysis' },
  { id: 'comp-detect-api-changes', label: 'Detect API changes', category: 'impact-analysis' },
  { id: 'comp-detect-architecture-violations', label: 'Detect architecture violations', category: 'impact-analysis' },
  { id: 'comp-detect-rule-violations', label: 'Detect rule violations', category: 'impact-analysis' },
  { id: 'comp-detect-missing-tests', label: 'Detect missing tests', category: 'impact-analysis' },

  { id: 'comp-gen-human-plan', label: 'Generate human-readable plan', category: 'generation' },
  { id: 'comp-gen-step-breakdown', label: 'Generate step breakdown', category: 'generation' },
  { id: 'comp-gen-file-summaries', label: 'Generate file summaries', category: 'generation' },
  { id: 'comp-gen-risk-warnings', label: 'Generate risk warnings', category: 'generation' },
  { id: 'comp-gen-required-confirmations', label: 'Generate required confirmations', category: 'generation' },
  { id: 'comp-gen-diff-per-file', label: 'Generate per-file diffs', category: 'generation' },
  { id: 'comp-gen-diff-per-step', label: 'Generate per-step diffs', category: 'generation' },
  { id: 'comp-gen-unified-diff', label: 'Generate unified diff', category: 'generation' },
  { id: 'comp-gen-summary-diff', label: 'Generate summary diff', category: 'generation' },

  { id: 'comp-validate-syntax', label: 'Validate syntax', category: 'validation' },
  { id: 'comp-validate-imports', label: 'Validate imports', category: 'validation' },
  { id: 'comp-validate-types', label: 'Validate types', category: 'validation' },
  { id: 'comp-validate-formatting', label: 'Validate formatting', category: 'validation' },
  { id: 'comp-validate-rules', label: 'Validate rules', category: 'validation' },
  { id: 'comp-validate-architecture', label: 'Validate architecture', category: 'validation' },

  { id: 'comp-ui-show-plan', label: 'Show plan', category: 'plan-ui' },
  { id: 'comp-ui-collapse-steps', label: 'Collapse steps', category: 'plan-ui' },
  { id: 'comp-ui-expand-steps', label: 'Expand steps', category: 'plan-ui' },
  { id: 'comp-ui-edit-steps', label: 'Edit steps', category: 'plan-ui' },
  { id: 'comp-ui-reorder-steps', label: 'Reorder steps', category: 'plan-ui' },
  { id: 'comp-ui-delete-steps', label: 'Delete steps', category: 'plan-ui' },
  { id: 'comp-ui-add-custom-steps', label: 'Add custom steps', category: 'plan-ui' },

  { id: 'comp-diff-show-file-list', label: 'Show file list', category: 'diff-ui' },
  { id: 'comp-diff-show-per-file', label: 'Show diff per file', category: 'diff-ui' },
  { id: 'comp-diff-show-per-step', label: 'Show diff per step', category: 'diff-ui' },
  { id: 'comp-diff-toggle-whitespace', label: 'Toggle whitespace', category: 'diff-ui' },
  { id: 'comp-diff-toggle-inline-sidebyside', label: 'Toggle inline/side-by-side', category: 'diff-ui' },

  { id: 'comp-hunk-accept', label: 'Accept hunk', category: 'hunk' },
  { id: 'comp-hunk-reject', label: 'Reject hunk', category: 'hunk' },

  { id: 'comp-show-affected-files', label: 'Show affected files', category: 'change-visibility' },
  { id: 'comp-show-file-creation', label: 'Show file creation', category: 'change-visibility' },
  { id: 'comp-show-file-deletion', label: 'Show file deletion', category: 'change-visibility' },
  { id: 'comp-show-file-renames', label: 'Show file renames', category: 'change-visibility' },
  { id: 'comp-show-file-moves', label: 'Show file moves', category: 'change-visibility' },

  { id: 'comp-apply-all', label: 'Apply all changes', category: 'apply' },
  { id: 'comp-apply-selected', label: 'Apply selected changes', category: 'apply' },
  { id: 'comp-reject-all', label: 'Reject all changes', category: 'apply' },

  { id: 'comp-plan-regenerate', label: 'Regenerate plan', category: 'plan-iterate' },
  { id: 'comp-plan-refine', label: 'Refine plan', category: 'plan-iterate' },
  { id: 'comp-plan-explain', label: 'Explain plan', category: 'plan-iterate' },
  { id: 'comp-plan-export', label: 'Export plan', category: 'plan-iterate' },

  { id: 'comp-index-rebuild-semantic', label: 'Rebuild semantic index', category: 'index-rebuild' },
  { id: 'comp-index-rebuild-dependency-graph', label: 'Rebuild dependency graph', category: 'index-rebuild' },
  { id: 'comp-index-rebuild-symbol-table', label: 'Rebuild symbol table', category: 'index-rebuild' },
  { id: 'comp-index-rebuild-embeddings', label: 'Rebuild embeddings', category: 'index-rebuild' },

  { id: 'comp-rerun-typechecker', label: 'Re-run type checker', category: 'rerun' },
  { id: 'comp-rerun-linter', label: 'Re-run linter', category: 'rerun' },
  { id: 'comp-rerun-tests', label: 'Re-run tests', category: 'rerun' },
  { id: 'comp-rerun-build', label: 'Re-run build', category: 'rerun' },
  { id: 'comp-rerun-rule-engine', label: 'Re-run rule engine', category: 'rerun' },

  { id: 'comp-detect-syntax-errors', label: 'Detect syntax errors', category: 'error-detect' },
  { id: 'comp-detect-type-errors', label: 'Detect type errors', category: 'error-detect' },
  { id: 'comp-detect-lint-errors', label: 'Detect lint errors', category: 'error-detect' },
  { id: 'comp-detect-test-failures', label: 'Detect test failures', category: 'error-detect' },
  { id: 'comp-detect-build-failures', label: 'Detect build failures', category: 'error-detect' },

  { id: 'comp-gen-fixes', label: 'Generate fixes', category: 'fix' },
  { id: 'comp-apply-fixes', label: 'Apply fixes', category: 'fix' },
  { id: 'comp-revalidate', label: 'Re-validate', category: 'fix' },
]

const BY_ID: ReadonlyMap<JarvisComposerCapabilityId, JarvisComposerCapabilityDef> = new Map(
  JARVIS_COMPOSER_CAPABILITY_REGISTRY.map((d) => [d.id, d])
)

export function getJarvisComposerCapabilityDef(id: JarvisComposerCapabilityId): JarvisComposerCapabilityDef | undefined {
  return BY_ID.get(id)
}

export function isJarvisComposerCapabilityId(s: string): s is JarvisComposerCapabilityId {
  return BY_ID.has(s as JarvisComposerCapabilityId)
}

export function jarvisComposerCapabilitiesByCategory(
  cat: JarvisComposerCapabilityCategory
): readonly JarvisComposerCapabilityDef[] {
  return JARVIS_COMPOSER_CAPABILITY_REGISTRY.filter((d) => d.category === cat)
}

function categoryTitleComposer(cat: JarvisComposerCapabilityCategory): string {
  const map: Record<JarvisComposerCapabilityCategory, string> = {
    capture: 'Capture',
    intent: 'Intent detection',
    scope: 'Scope',
    'step-planning': 'Step planning',
    'file-targets': 'File targets',
    prediction: 'Prediction',
    'impact-analysis': 'Impact analysis',
    generation: 'Generation',
    validation: 'Validation',
    'plan-ui': 'Plan UI',
    'diff-ui': 'Diff UI',
    hunk: 'Hunk actions',
    'change-visibility': 'Change visibility',
    apply: 'Apply / reject',
    'plan-iterate': 'Plan iteration',
    'index-rebuild': 'Index rebuild',
    rerun: 'Re-run checks',
    'error-detect': 'Error detection',
    fix: 'Fix loop',
  }
  return map[cat]
}

export function formatJarvisComposerCapabilityCatalog(): string {
  const cats: JarvisComposerCapabilityCategory[] = [
    'capture',
    'intent',
    'scope',
    'step-planning',
    'file-targets',
    'prediction',
    'impact-analysis',
    'generation',
    'validation',
    'plan-ui',
    'diff-ui',
    'hunk',
    'change-visibility',
    'apply',
    'plan-iterate',
    'index-rebuild',
    'rerun',
    'error-detect',
    'fix',
  ]
  const lines = cats.map((c) => {
    const items = jarvisComposerCapabilitiesByCategory(c).map((d) => d.label)
    return `${categoryTitleComposer(c)}: ${items.join('; ')}.`
  })
  return ['JARVIS Composer capabilities (canonical ids in `jarvis-composer-capabilities` registry):', ...lines].join('\n')
}

export function getJarvisComposerCapabilitiesPromptSection(): string {
  return (
    'JARVIS Composer: capture context (NL, selection, files, chat, rules, skills, repo); classify intent; scope (file/folder/repo/language/deps); ' +
    'plan steps (order, deps, parallel, risk, irreversible); target files (modify/create/delete/rename/move); predict deltas; analyze impact; ' +
    'generate plans/diffs/confirmations; validate; plan & diff UI; hunks; visibility of changes; apply/reject; iterate/export plan; rebuild indexes; ' +
    're-run tooling; detect failures; generate/apply fixes and re-validate. ' +
    'Canonical ids: `src/lib/jarvis-composer-capabilities.ts` (JARVIS_COMPOSER_CAPABILITY_REGISTRY).'
  )
}

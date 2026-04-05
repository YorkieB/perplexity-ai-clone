/**
 * JARVIS Explorer Badges — registry + computation for file tree indicators
 * (git, diagnostics, AI/composer metadata, file kind, tests, missing-logic flags).
 */

import type { MissingLogicDetectionId } from '@/lib/jarvis-missing-logic-detector'
import { MISSING_LOGIC_BADGE_DEFS, missingLogicDetectionBadgeId } from '@/lib/jarvis-missing-logic-detector'

export type MissingLogicExplorerBadgeId = `ml-${MissingLogicDetectionId}`

export type JarvisExplorerBadgeId =
  | 'file-status-modified'
  | 'file-status-added'
  | 'file-status-deleted'
  | 'file-status-renamed'
  | 'file-status-moved'
  | 'file-status-untracked'
  | 'file-status-ignored'
  | 'file-status-staged'
  | 'file-status-conflicted'
  | 'ai-generated'
  | 'ai-modified'
  | 'ai-pending-review'
  | 'ai-risk'
  | 'ai-missing-logic'
  | 'ai-architecture-violation'
  | 'ai-rule-violation'
  | 'diag-error-count'
  | 'diag-warning-count'
  | 'diag-info-count'
  | 'diag-hint-count'
  | 'diag-test-failure'
  | 'diag-lint-failure'
  | 'diag-type-error'
  | 'git-ahead-remote'
  | 'git-behind-remote'
  | 'git-diverged'
  | 'git-uncommitted-changes'
  | 'git-unpushed-commits'
  | 'git-unpulled-commits'
  | 'lang-typescript'
  | 'lang-javascript'
  | 'lang-json'
  | 'lang-yaml'
  | 'lang-markdown'
  | 'lang-html'
  | 'lang-css'
  | 'lang-scss'
  | 'lang-sql'
  | 'lang-python'
  | 'lang-go'
  | 'lang-rust'
  | 'lang-java'
  | 'lang-cpp'
  | 'lang-binary'
  | 'lang-image'
  | 'lang-audio'
  | 'lang-video'
  | 'test-file'
  | 'test-passed'
  | 'test-failed'
  | 'test-skipped'
  | 'coverage-percent'
  | 'uncovered-file'
  | 'tree-folder-open'
  | 'tree-folder-closed'
  | 'tree-symlink'
  | 'tree-virtual-folder'
  | 'tree-workspace-folder'
  | 'tree-hidden-file'
  | 'tree-readonly-file'
  | 'composer-affected'
  | 'composer-created'
  | 'composer-deleted'
  | 'composer-renamed'
  | 'composer-moved'
  | 'composer-pending-diff'
  | 'composer-conflicts'
  | 'missing-return'
  | 'missing-error-handling'
  | 'missing-validation'
  | 'missing-dependency'
  | 'missing-test'
  | 'missing-api-contract'
  | 'missing-env-var'
  | MissingLogicExplorerBadgeId

export interface JarvisExplorerBadgeDef {
  readonly id: JarvisExplorerBadgeId
  readonly label: string
  readonly glyph: string
  readonly group: string
}

/** Canonical list (every capability from the JARVIS explorer badges spec). */
export const JARVIS_EXPLORER_BADGE_REGISTRY: readonly JarvisExplorerBadgeDef[] = [
  { id: 'file-status-modified', label: 'Modified', glyph: 'M', group: 'file-status' },
  { id: 'file-status-added', label: 'Added', glyph: 'A', group: 'file-status' },
  { id: 'file-status-deleted', label: 'Deleted', glyph: 'D', group: 'file-status' },
  { id: 'file-status-renamed', label: 'Renamed', glyph: 'R', group: 'file-status' },
  { id: 'file-status-moved', label: 'Moved', glyph: '↔', group: 'file-status' },
  { id: 'file-status-untracked', label: 'Untracked', glyph: 'U', group: 'file-status' },
  { id: 'file-status-ignored', label: 'Ignored', glyph: 'I', group: 'file-status' },
  { id: 'file-status-staged', label: 'Staged', glyph: 'S', group: 'file-status' },
  { id: 'file-status-conflicted', label: 'Conflicted', glyph: '⚡', group: 'file-status' },
  { id: 'ai-generated', label: 'AI generated', glyph: '✦', group: 'ai' },
  { id: 'ai-modified', label: 'AI modified', glyph: '◇', group: 'ai' },
  { id: 'ai-pending-review', label: 'AI review', glyph: '◐', group: 'ai' },
  { id: 'ai-risk', label: 'AI risk', glyph: '⚠', group: 'ai' },
  { id: 'ai-missing-logic', label: 'AI: missing logic', glyph: '∅', group: 'ai' },
  { id: 'ai-architecture-violation', label: 'AI: architecture', glyph: '⌂', group: 'ai' },
  { id: 'ai-rule-violation', label: 'AI: rules', glyph: '‣', group: 'ai' },
  { id: 'diag-error-count', label: 'Errors', glyph: 'E', group: 'diagnostics' },
  { id: 'diag-warning-count', label: 'Warnings', glyph: 'W', group: 'diagnostics' },
  { id: 'diag-info-count', label: 'Info', glyph: 'i', group: 'diagnostics' },
  { id: 'diag-hint-count', label: 'Hints', glyph: 'h', group: 'diagnostics' },
  { id: 'diag-test-failure', label: 'Test failed', glyph: '✗', group: 'diagnostics' },
  { id: 'diag-lint-failure', label: 'Lint', glyph: 'L', group: 'diagnostics' },
  { id: 'diag-type-error', label: 'Types', glyph: 'T', group: 'diagnostics' },
  { id: 'git-ahead-remote', label: 'Ahead of remote', glyph: '↑', group: 'git-remote' },
  { id: 'git-behind-remote', label: 'Behind remote', glyph: '↓', group: 'git-remote' },
  { id: 'git-diverged', label: 'Diverged', glyph: '⇵', group: 'git-remote' },
  { id: 'git-uncommitted-changes', label: 'Uncommitted', glyph: '●', group: 'git-remote' },
  { id: 'git-unpushed-commits', label: 'Unpushed', glyph: '⬆', group: 'git-remote' },
  { id: 'git-unpulled-commits', label: 'Unpulled', glyph: '⬇', group: 'git-remote' },
  { id: 'lang-typescript', label: 'TypeScript', glyph: 'TS', group: 'lang' },
  { id: 'lang-javascript', label: 'JavaScript', glyph: 'JS', group: 'lang' },
  { id: 'lang-json', label: 'JSON', glyph: '{}', group: 'lang' },
  { id: 'lang-yaml', label: 'YAML', glyph: 'Y', group: 'lang' },
  { id: 'lang-markdown', label: 'Markdown', glyph: 'MD', group: 'lang' },
  { id: 'lang-html', label: 'HTML', glyph: '⟨⟩', group: 'lang' },
  { id: 'lang-css', label: 'CSS', glyph: '#', group: 'lang' },
  { id: 'lang-scss', label: 'SCSS', glyph: 'SC', group: 'lang' },
  { id: 'lang-sql', label: 'SQL', glyph: 'Ω', group: 'lang' },
  { id: 'lang-python', label: 'Python', glyph: 'Py', group: 'lang' },
  { id: 'lang-go', label: 'Go', glyph: 'Go', group: 'lang' },
  { id: 'lang-rust', label: 'Rust', glyph: 'Rs', group: 'lang' },
  { id: 'lang-java', label: 'Java', glyph: 'Jv', group: 'lang' },
  { id: 'lang-cpp', label: 'C/C++', glyph: 'C', group: 'lang' },
  { id: 'lang-binary', label: 'Binary', glyph: 'BIN', group: 'lang' },
  { id: 'lang-image', label: 'Image', glyph: '🖼', group: 'lang' },
  { id: 'lang-audio', label: 'Audio', glyph: '♪', group: 'lang' },
  { id: 'lang-video', label: 'Video', glyph: '▶', group: 'lang' },
  { id: 'test-file', label: 'Test file', glyph: 'ƒ', group: 'test' },
  { id: 'test-passed', label: 'Tests passed', glyph: '✓', group: 'test' },
  { id: 'test-failed', label: 'Tests failed', glyph: '✗', group: 'test' },
  { id: 'test-skipped', label: 'Skipped', glyph: '⊘', group: 'test' },
  { id: 'coverage-percent', label: 'Coverage', glyph: '%', group: 'test' },
  { id: 'uncovered-file', label: 'Uncovered', glyph: '○', group: 'test' },
  { id: 'tree-folder-open', label: 'Folder (open)', glyph: '▼', group: 'tree' },
  { id: 'tree-folder-closed', label: 'Folder (closed)', glyph: '▶', group: 'tree' },
  { id: 'tree-symlink', label: 'Symlink', glyph: '↗', group: 'tree' },
  { id: 'tree-virtual-folder', label: 'Virtual folder', glyph: '◇', group: 'tree' },
  { id: 'tree-workspace-folder', label: 'Workspace root', glyph: '⌂', group: 'tree' },
  { id: 'tree-hidden-file', label: 'Hidden', glyph: '·', group: 'tree' },
  { id: 'tree-readonly-file', label: 'Read-only', glyph: '🔒', group: 'tree' },
  { id: 'composer-affected', label: 'Composer touched', glyph: '⌗', group: 'composer' },
  { id: 'composer-created', label: 'Composer created', glyph: '+', group: 'composer' },
  { id: 'composer-deleted', label: 'Composer deleted', glyph: '−', group: 'composer' },
  { id: 'composer-renamed', label: 'Composer renamed', glyph: 'R', group: 'composer' },
  { id: 'composer-moved', label: 'Composer moved', glyph: '⇄', group: 'composer' },
  { id: 'composer-pending-diff', label: 'Pending diff', glyph: '∂', group: 'composer' },
  { id: 'composer-conflicts', label: 'Composer conflicts', glyph: '⚡', group: 'composer' },
  { id: 'missing-return', label: 'Missing return', glyph: 'r', group: 'missing' },
  { id: 'missing-error-handling', label: 'Missing error handling', glyph: 'e', group: 'missing' },
  { id: 'missing-validation', label: 'Missing validation', glyph: 'v', group: 'missing' },
  { id: 'missing-dependency', label: 'Missing dependency', glyph: 'd', group: 'missing' },
  { id: 'missing-test', label: 'Missing test', glyph: 't', group: 'missing' },
  { id: 'missing-api-contract', label: 'Missing API contract', glyph: 'a', group: 'missing' },
  { id: 'missing-env-var', label: 'Missing env', glyph: 'ε', group: 'missing' },
]

const CORE_BADGE_REGISTRY: readonly JarvisExplorerBadgeDef[] = JARVIS_EXPLORER_BADGE_REGISTRY

const ML_BADGE_REGISTRY: readonly JarvisExplorerBadgeDef[] = MISSING_LOGIC_BADGE_DEFS.map((d) => ({
  id: d.id as JarvisExplorerBadgeId,
  label: d.label,
  glyph: d.glyph,
  group: 'missing-logic',
}))

export const JARVIS_EXPLORER_ALL_BADGES: readonly JarvisExplorerBadgeDef[] = [...CORE_BADGE_REGISTRY, ...ML_BADGE_REGISTRY]

const BADGE_BY_ID: ReadonlyMap<JarvisExplorerBadgeId, JarvisExplorerBadgeDef> = new Map(
  JARVIS_EXPLORER_ALL_BADGES.map((d) => [d.id, d])
)

export function getJarvisExplorerBadgeDef(id: JarvisExplorerBadgeId): JarvisExplorerBadgeDef | undefined {
  return BADGE_BY_ID.get(id)
}

export interface GitPorcelainEntry {
  readonly index: string
  readonly work: string
  readonly paths: readonly string[]
}

/** Parse `git status --porcelain` (v1). */
// eslint-disable-next-line sonarjs/cognitive-complexity -- porcelain v1 parser handles renamed/copied file path pairs and quote-escaped paths
export function parseGitStatusPorcelain(stdout: string): Map<string, GitPorcelainEntry> {
  const map = new Map<string, GitPorcelainEntry>()
  const lines = stdout.split(/\r?\n/).filter(Boolean)
  for (const line of lines) {
    if (line.length < 3) continue
    const xy = line.slice(0, 2)
    let rest = line.slice(3)
    if (rest.startsWith('"')) {
      const end = rest.lastIndexOf('"')
      if (end > 0) rest = rest.slice(1, end)
    }
    const paths: string[] = []
    if (rest.includes(' -> ')) {
      const [a, b] = rest.split(' -> ').map((s) => s.trim())
      if (a) paths.push(normalizeGitPath(a))
      if (b) paths.push(normalizeGitPath(b))
    } else {
      paths.push(normalizeGitPath(rest.trim()))
    }
    const index = xy.startsWith(' ') ? ' ' : xy[0]
    const work = xy[1] === ' ' ? ' ' : (xy[1] ?? ' ')
    const entry: GitPorcelainEntry = { index, work, paths }
    for (const p of paths) {
      map.set(p, entry)
    }
  }
  return map
}

function normalizeGitPath(p: string): string {
  return p.replaceAll('\\', '/')
}

export interface GitRemoteCounts {
  readonly ahead: number
  readonly behind: number
}

/** Parse `git rev-list --left-right --count @{u}...HEAD` -> behind / ahead. */
export function parseGitLeftRightCount(stdout: string): GitRemoteCounts | null {
  const t = stdout.trim()
  if (!t) return null
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return null
  const behind = Number.parseInt(parts[0] ?? '', 10)
  const ahead = Number.parseInt(parts[1] ?? '', 10)
  if (Number.isNaN(behind) || Number.isNaN(ahead)) return null
  return { behind, ahead }
}

export interface JarvisExplorerFileMeta {
  readonly ai?: {
    readonly generated?: boolean
    readonly modified?: boolean
    readonly pendingReview?: boolean
    readonly risk?: boolean
    readonly missingLogic?: boolean
    readonly architectureViolation?: boolean
    readonly ruleViolation?: boolean
  }
  readonly composer?: {
    readonly affected?: boolean
    readonly created?: boolean
    readonly deleted?: boolean
    readonly renamed?: boolean
    readonly moved?: boolean
    readonly pendingDiff?: boolean
    readonly conflicts?: boolean
  }
  readonly test?: {
    readonly passed?: boolean
    readonly failed?: boolean
    readonly skipped?: boolean
    readonly coveragePct?: number | null
    readonly uncovered?: boolean
  }
  readonly missing?: {
    readonly return?: boolean
    readonly errorHandling?: boolean
    readonly validation?: boolean
    readonly dependency?: boolean
    readonly test?: boolean
    readonly apiContract?: boolean
    readonly envVar?: boolean
  }
  readonly tree?: {
    readonly symlink?: boolean
    readonly virtualFolder?: boolean
    readonly workspaceFolder?: boolean
    readonly hidden?: boolean
    readonly readOnly?: boolean
  }
}

export interface ProblemLike {
  readonly line: number
  readonly column: number
  readonly severity: string
  readonly message: string
  readonly source: string
}

export function relativePathToWorkspaceRoot(diskPath: string | undefined, workspaceRoot: string | null): string | null {
  if (!diskPath || !workspaceRoot) return null
  const d = diskPath.replaceAll('\\', '/')
  const r = workspaceRoot.replaceAll('\\', '/')
  const dl = d.toLowerCase()
  const rl = r.toLowerCase()
  if (!dl.startsWith(rl)) return null
  const rest = diskPath.slice(workspaceRoot.length).replace(/^[\\/]+/, '')
  return normalizeGitPath(rest)
}

function isTestFilePath(name: string): boolean {
  const n = name.toLowerCase()
  return (
    /\.(test|spec)\.(tsx?|jsx?|mjs|cjs)$/.test(n) ||
    /__tests__\//.test(n) ||
    /^test[-_].*\.py$/.test(n) ||
    n.endsWith('.test.py')
  )
}

function isHiddenName(name: string): boolean {
  const base = name.split(/[/\\]/).pop() || name
  return base.startsWith('.') && base !== '.' && base !== '..'
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'])
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi'])
const BINARY_EXT = new Set(['exe', 'dll', 'so', 'dylib', 'bin', 'wasm', 'zip', '7z', 'rar', 'pdf', 'woff', 'woff2'])

// eslint-disable-next-line sonarjs/cognitive-complexity -- maps extension/language combos to badge sets; each branch is a distinct file-kind rule
export function fileKindBadgeIds(filename: string | undefined, language: string): JarvisExplorerBadgeId[] {
  const ext = (filename?.split('.').pop() || '').toLowerCase()
  const lang = language.toLowerCase()
  const out: JarvisExplorerBadgeId[] = []

  const pushLang = (id: JarvisExplorerBadgeId) => {
    if (!out.includes(id)) out.push(id)
  }

  if (IMAGE_EXT.has(ext)) {
    pushLang('lang-image')
    return out
  }
  if (AUDIO_EXT.has(ext)) {
    pushLang('lang-audio')
    return out
  }
  if (VIDEO_EXT.has(ext)) {
    pushLang('lang-video')
    return out
  }
  if (BINARY_EXT.has(ext) || ext === 'o' || ext === 'obj') {
    pushLang('lang-binary')
    return out
  }

  if (lang === 'typescript' || ext === 'ts' || ext === 'tsx') pushLang('lang-typescript')
  if (lang === 'javascript' || ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') pushLang('lang-javascript')
  if (lang === 'json' || ext === 'json' || ext === 'jsonc') pushLang('lang-json')
  if (lang === 'yaml' || ext === 'yml' || ext === 'yaml') pushLang('lang-yaml')
  if (lang === 'markdown' || ext === 'md' || ext === 'mdx') pushLang('lang-markdown')
  if (lang === 'html' || ext === 'html' || ext === 'htm') pushLang('lang-html')
  if (lang === 'css' || ext === 'css') pushLang('lang-css')
  if (lang === 'scss' || lang === 'less' || ext === 'scss' || ext === 'sass' || ext === 'less') pushLang('lang-scss')
  if (lang === 'sql' || ext === 'sql') pushLang('lang-sql')
  if (lang === 'python' || ext === 'py' || ext === 'pyw') pushLang('lang-python')
  if (lang === 'go' || ext === 'go') pushLang('lang-go')
  if (lang === 'rust' || ext === 'rs') pushLang('lang-rust')
  if (lang === 'java' || ext === 'java') pushLang('lang-java')
  if (lang === 'cpp' || lang === 'c' || ext === 'cpp' || ext === 'cc' || ext === 'cxx' || ext === 'c' || ext === 'h' || ext === 'hpp') {
    pushLang('lang-cpp')
  }

  if (out.length === 0) pushLang('lang-binary')
  return out
}

function gitBadgesForPath(rel: string | null, entry: GitPorcelainEntry | undefined): JarvisExplorerBadgeId[] {
  if (!rel || !entry) return []
  const { index, work } = entry
  const xy = index + work
  const out: JarvisExplorerBadgeId[] = []

  if (xy === '??') {
    out.push('file-status-untracked')
    return out
  }
  if (xy === '!!' || (index === '!' && work === '!')) {
    out.push('file-status-ignored')
    return out
  }
  if (index === 'U' || work === 'U' || xy === 'AA' || xy === 'DD' || xy === 'UU' || xy === 'AU' || xy === 'UA') {
    out.push('file-status-conflicted')
  }
  if (index === 'A' || work === 'A') out.push('file-status-added')
  if (index === 'D' || work === 'D') out.push('file-status-deleted')
  if (index === 'R' || work === 'R' || index === 'C' || work === 'C') {
    out.push('file-status-renamed')
    if (entry.paths.length > 1) out.push('file-status-moved')
  }
  if (index === 'M' || work === 'M') {
    out.push('file-status-modified')
  }
  const staged = index !== ' ' && index !== '?' && index !== '!'
  if (staged && xy !== '??' && xy !== '!!') out.push('file-status-staged')

  return out
}

export function countProblemsForFile(problems: readonly ProblemLike[], filename = ''): {
  errors: number
  warnings: number
  infos: number
  hints: number
  typeHints: number
  lint: number
} {
  let errors = 0
  let warnings = 0
  let infos = 0
  let hints = 0
  let typeHints = 0
  let lint = 0
  for (const p of problems) {
    if (p.source !== filename) continue
    const sev = String(p.severity).toLowerCase()
    const msg = p.message.toLowerCase()
    if (sev === 'error' || sev === 'fatal') errors += 1
    else if (sev === 'warning') warnings += 1
    else if (sev === 'info') infos += 1
    else if (sev === 'hint') hints += 1
    if (/type|typescript|tsc/.test(msg) || /type error/.test(msg)) typeHints += 1
    if (/lint|eslint|style/.test(msg)) lint += 1
  }
  return { errors, warnings, infos, hints, typeHints, lint }
}

export interface ComputeExplorerBadgesInput {
  readonly filename: string | undefined
  readonly language: string
  readonly diskPath: string | undefined
  readonly workspaceRoot: string | null
  readonly gitPorcelain: ReadonlyMap<string, GitPorcelainEntry>
  readonly problems: readonly ProblemLike[]
  readonly isDirtyBuffer: boolean
  readonly isActive: boolean
  readonly meta?: JarvisExplorerFileMeta
  /** Missing-logic / breakage detector hits for this buffer. */
  readonly missingLogicDetections?: readonly MissingLogicDetectionId[]
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- aggregates git, lint, language, dirty, and missing-logic badge signals in one deterministic pass
export function computeExplorerBadgesForFile(input: ComputeExplorerBadgesInput): JarvisExplorerBadgeId[] {
  const { filename, language, diskPath, workspaceRoot, gitPorcelain, problems, isDirtyBuffer, isActive, meta, missingLogicDetections } = input
  const rel = relativePathToWorkspaceRoot(diskPath, workspaceRoot)
  const entry = rel ? gitPorcelain.get(rel) : undefined

  const ordered = new Set<JarvisExplorerBadgeId>()

  for (const id of fileKindBadgeIds(filename, language)) ordered.add(id)

  if (filename && isTestFilePath(filename)) ordered.add('test-file')

  if (filename && isHiddenName(filename)) ordered.add('tree-hidden-file')

  for (const id of gitBadgesForPath(rel, entry)) ordered.add(id)

  if (isActive && isDirtyBuffer) ordered.add('file-status-modified')

  const counts = countProblemsForFile(problems, filename)
  if (counts.errors > 0) ordered.add('diag-error-count')
  if (counts.warnings > 0) ordered.add('diag-warning-count')
  if (counts.infos > 0) ordered.add('diag-info-count')
  if (counts.hints > 0) ordered.add('diag-hint-count')
  if (counts.typeHints > 0) ordered.add('diag-type-error')
  if (counts.lint > 0) ordered.add('diag-lint-failure')

  const m = meta
  if (m?.ai?.generated) ordered.add('ai-generated')
  if (m?.ai?.modified) ordered.add('ai-modified')
  if (m?.ai?.pendingReview) ordered.add('ai-pending-review')
  if (m?.ai?.risk) ordered.add('ai-risk')
  if (m?.ai?.missingLogic) ordered.add('ai-missing-logic')
  if (m?.ai?.architectureViolation) ordered.add('ai-architecture-violation')
  if (m?.ai?.ruleViolation) ordered.add('ai-rule-violation')

  if (m?.composer?.affected) ordered.add('composer-affected')
  if (m?.composer?.created) ordered.add('composer-created')
  if (m?.composer?.deleted) ordered.add('composer-deleted')
  if (m?.composer?.renamed) ordered.add('composer-renamed')
  if (m?.composer?.moved) ordered.add('composer-moved')
  if (m?.composer?.pendingDiff) ordered.add('composer-pending-diff')
  if (m?.composer?.conflicts) ordered.add('composer-conflicts')

  if (m?.test?.passed) ordered.add('test-passed')
  if (m?.test?.failed) {
    ordered.add('test-failed')
    ordered.add('diag-test-failure')
  }
  if (m?.test?.skipped) ordered.add('test-skipped')
  if (m?.test?.coveragePct != null && m.test.coveragePct >= 0) ordered.add('coverage-percent')
  if (m?.test?.uncovered) ordered.add('uncovered-file')

  if (m?.tree?.symlink) ordered.add('tree-symlink')
  if (m?.tree?.virtualFolder) ordered.add('tree-virtual-folder')
  if (m?.tree?.workspaceFolder) ordered.add('tree-workspace-folder')
  if (m?.tree?.readOnly) ordered.add('tree-readonly-file')

  if (m?.missing?.return) ordered.add('missing-return')
  if (m?.missing?.errorHandling) ordered.add('missing-error-handling')
  if (m?.missing?.validation) ordered.add('missing-validation')
  if (m?.missing?.dependency) ordered.add('missing-dependency')
  if (m?.missing?.test) ordered.add('missing-test')
  if (m?.missing?.apiContract) ordered.add('missing-api-contract')
  if (m?.missing?.envVar) ordered.add('missing-env-var')

  for (const mid of missingLogicDetections ?? []) {
    ordered.add(missingLogicDetectionBadgeId(mid))
  }

  return Array.from(ordered)
}

export function computeRepoLevelGitBadges(
  gitPorcelain: ReadonlyMap<string, GitPorcelainEntry>,
  remote: GitRemoteCounts | null
): JarvisExplorerBadgeId[] {
  const out: JarvisExplorerBadgeId[] = []
  if (gitPorcelain.size > 0) {
    out.push('git-uncommitted-changes')
  }
  if (remote) {
    if (remote.ahead > 0) out.push('git-ahead-remote', 'git-unpushed-commits')
    if (remote.behind > 0) out.push('git-behind-remote', 'git-unpulled-commits')
    if (remote.ahead > 0 && remote.behind > 0) out.push('git-diverged')
  }
  return Array.from(new Set(out))
}

const EXT2LANG_GUESS: Record<string, string> = {
  py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
  html: 'html', htm: 'html', css: 'css', json: 'json', md: 'markdown',
  rs: 'rust', cpp: 'cpp', cc: 'cpp', c: 'c', h: 'c', java: 'java',
  sql: 'sql', go: 'go', yml: 'yaml', yaml: 'yaml', scss: 'scss',
}

function guessLanguageFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return EXT2LANG_GUESS[ext] || 'javascript'
}

/** Badges for a workspace-relative path (no open tab / CodeItem). */
export function computeExplorerBadgesForWorkspaceRelPath(
  relPath: string,
  gitPorcelain: ReadonlyMap<string, GitPorcelainEntry>
): JarvisExplorerBadgeId[] {
  const name = relPath.split(/[/\\]/).pop() || relPath
  const lang = guessLanguageFromFilename(name)
  const ordered = new Set<JarvisExplorerBadgeId>()
  for (const id of fileKindBadgeIds(name, lang)) ordered.add(id)
  if (isTestFilePath(relPath)) ordered.add('test-file')
  if (isHiddenName(name)) ordered.add('tree-hidden-file')
  const norm = normalizeGitPath(relPath)
  for (const id of gitBadgesForPath(norm, gitPorcelain.get(norm))) ordered.add(id)
  return Array.from(ordered)
}

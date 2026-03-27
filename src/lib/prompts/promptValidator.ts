/**
 * Structural validation for Jarvis system prompts (main orchestrator XML sections and Worker prompts).
 */

/** Declarative rules for a single XML-ish section. */
export interface PromptSection {
  /** XML tag name, e.g. `identity`. */
  tag: string
  required: boolean
  /** Minimum character count for inner content (trimmed). */
  minLength: number
  /** Optional maximum length for inner content. */
  maxLength?: number
  /** Substrings that must appear in this section (case-sensitive unless noted). */
  mustContain?: string[]
  /** Substrings that should not appear; reported as warnings. */
  mustNotContain?: string[]
}

/** Canonical main system prompt sections (contextInjector-style). */
export const REQUIRED_SECTIONS: PromptSection[] = [
  {
    tag: 'identity',
    required: true,
    minLength: 20,
    mustContain: ['Jarvis'],
  },
  {
    tag: 'critical_rules',
    required: true,
    minLength: 100,
    mustContain: ['check the current conversation', 'action verb', 'NOT a search query'],
  },
  {
    tag: 'tool_use_policy',
    required: true,
    minLength: 100,
    mustContain: ['Web search is NOT for', 'already in this conversation', 'Can I answer this'],
  },
  {
    tag: 'retrieved_context',
    required: true,
    minLength: 10,
    mustContain: ['retrieved'],
  },
  {
    tag: 'available_tools',
    required: true,
    minLength: 10,
    mustContain: ['tools'],
  },
]

/** Expected first-appearance order of required main sections (attention / parsing hygiene). */
const MAIN_SECTION_ORDER = [
  'identity',
  'critical_rules',
  'tool_use_policy',
  'retrieved_context',
  'available_tools',
] as const

/** Worker system prompt sections (lighter contract). */
const WORKER_REQUIRED_TAGS = ['worker_identity', 'execution_rules', 'task_focus'] as const

const WORKER_EXECUTION_MUST_CONTAIN = ['complete', 'never partial', 'do not explain'] as const

/** Outcome of {@link validatePrompt} / {@link validateWorkerPrompt}. */
export interface ValidationResult {
  valid: boolean
  /** Blocking issues. */
  errors: string[]
  /** Non-blocking issues. */
  warnings: string[]
  /** Tag names detected anywhere in the prompt. */
  sectionsFound: string[]
  /** Required sections that were absent. */
  sectionsMissing: string[]
  /** Completeness in \([0, 1]\). */
  score: number
}

interface ExtractedSections {
  /** First occurrence content per tag (later duplicates do not overwrite). */
  contentByTag: Map<string, string>
  /** Start index of first `<tag>` opening. */
  firstOpenIndex: Map<string, number>
  tagsInDocumentOrder: string[]
  duplicateTags: string[]
  allTagsSeen: Set<string>
}

/**
 * Parse paired XML-like tags. Uses backreference so open/close names match.
 * Prompts are bounded in practice; avoid unbounded backtracking on hostile input by keeping callers to assembled prompts only.
 */
function extractXmlSections(prompt: string): ExtractedSections {
  const contentByTag = new Map<string, string>()
  const firstOpenIndex = new Map<string, number>()
  const tagsInDocumentOrder: string[] = []
  const occurrenceCount = new Map<string, number>()
  const allTagsSeen = new Set<string>()

  const re = /<(\w+)>([\s\S]*?)<\/\1>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(prompt)) !== null) {
    const tag = m[1]!
    const raw = m[2] ?? ''
    const openIdx = m.index
    allTagsSeen.add(tag)
    tagsInDocumentOrder.push(tag)
    occurrenceCount.set(tag, (occurrenceCount.get(tag) ?? 0) + 1)
    if (!contentByTag.has(tag)) {
      contentByTag.set(tag, raw)
      firstOpenIndex.set(tag, openIdx)
    }
  }

  const duplicateTags = [...occurrenceCount.entries()]
    .filter(([, n]) => n > 1)
    .map(([t]) => t)

  return { contentByTag, firstOpenIndex, tagsInDocumentOrder, duplicateTags, allTagsSeen }
}

function countMustContainChecks(sections: readonly PromptSection[]): number {
  let n = 0
  for (const s of sections) {
    if (s.mustContain !== undefined) {
      n += s.mustContain.length
    }
  }
  return n
}

function checkSectionOrder(
  firstOpenIndex: Map<string, number>,
  expected: readonly string[],
  presentTags: Set<string>,
): boolean {
  const indices: number[] = []
  for (const tag of expected) {
    if (!presentTags.has(tag)) {
      return true
    }
    const idx = firstOpenIndex.get(tag)
    if (idx === undefined) {
      return false
    }
    indices.push(idx)
  }
  for (let i = 1; i < indices.length; i++) {
    if (indices[i]! < indices[i - 1]!) {
      return false
    }
  }
  return true
}

function pushDuplicateErrors(duplicateTags: string[], errors: string[]): void {
  for (const dup of duplicateTags) {
    errors.push(`Duplicate section: <${dup}>`)
  }
}

/** Validates one {@link PromptSection} when content exists; updates errors, warnings, and must-contain tallies. */
function validateSectionContent(
  spec: PromptSection,
  trimmed: string,
  errors: string[],
  warnings: string[],
): { mustPassed: number } {
  let mustPassed = 0
  const len = trimmed.length
  if (len < spec.minLength) {
    errors.push(`Section <${spec.tag}> too short (${String(len)} < ${String(spec.minLength)} chars)`)
  }
  if (spec.maxLength !== undefined && len > spec.maxLength) {
    errors.push(`Section <${spec.tag}> too long (${String(len)} > ${String(spec.maxLength)} chars)`)
  }

  if (spec.mustContain !== undefined) {
    for (const needle of spec.mustContain) {
      if (trimmed.includes(needle)) {
        mustPassed++
      } else {
        errors.push(`Section <${spec.tag}> missing required text: "${needle}"`)
      }
    }
  }

  pushMustNotContainWarnings(spec.tag, spec.mustNotContain, trimmed, warnings)

  return { mustPassed }
}

function pushMustNotContainWarnings(
  tag: string,
  forbidden: string[] | undefined,
  trimmed: string,
  warnings: string[],
): void {
  if (forbidden === undefined) {
    return
  }
  for (const bad of forbidden) {
    if (trimmed.includes(bad)) {
      warnings.push(`Section <${tag}> contains forbidden text: "${bad}"`)
    }
  }
}

/**
 * Validates a fully assembled main Jarvis system prompt against {@link REQUIRED_SECTIONS}.
 */
export function validatePrompt(prompt: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const extracted = extractXmlSections(prompt)

  const sectionsFound = [...extracted.allTagsSeen].sort()
  const sectionsMissing: string[] = []

  pushDuplicateErrors(extracted.duplicateTags, errors)

  let requiredPresent = 0
  const requiredTotal = REQUIRED_SECTIONS.filter((s) => s.required).length
  let mustContainPassed = 0
  const mustContainTotal = countMustContainChecks(REQUIRED_SECTIONS)

  for (const spec of REQUIRED_SECTIONS) {
    if (!spec.required) {
      continue
    }
    const content = extracted.contentByTag.get(spec.tag)
    if (content === undefined) {
      errors.push(`Missing required section: <${spec.tag}>`)
      sectionsMissing.push(spec.tag)
      continue
    }
    requiredPresent++

    const { mustPassed } = validateSectionContent(spec, content.trim(), errors, warnings)
    mustContainPassed += mustPassed
  }

  const presentRequired = new Set(
    REQUIRED_SECTIONS.filter((s) => s.required && extracted.contentByTag.has(s.tag)).map((s) => s.tag),
  )
  if (
    !checkSectionOrder(extracted.firstOpenIndex, MAIN_SECTION_ORDER, presentRequired) &&
    sectionsMissing.length === 0
  ) {
    warnings.push('Section order is non-standard — may affect attention parsing')
  }

  const scoreFactorPresent = requiredTotal > 0 ? requiredPresent / requiredTotal : 1
  const scoreFactorMust =
    mustContainTotal > 0 ? mustContainPassed / mustContainTotal : 1
  const score = Math.max(0, Math.min(1, scoreFactorPresent * scoreFactorMust))

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sectionsFound,
    sectionsMissing,
    score,
  }
}

const LOG = '[PromptValidator]'

/**
 * Throws if {@link validatePrompt} reports errors; logs warnings to the console.
 */
export function assertValidPrompt(prompt: string): void {
  const result = validatePrompt(prompt)
  if (!result.valid) {
    throw new Error(`${LOG} Invalid prompt:\n${result.errors.join('\n')}`)
  }
  if (result.warnings.length > 0) {
    console.warn(`${LOG} Prompt warnings:\n${result.warnings.join('\n')}`)
  }
}

function validateWorkerExecutionRules(trimmed: string, errors: string[]): number {
  let mustPassed = 0
  const lower = trimmed.toLowerCase()
  for (const needle of WORKER_EXECUTION_MUST_CONTAIN) {
    if (lower.includes(needle.toLowerCase())) {
      mustPassed++
    } else {
      errors.push(`Section <execution_rules> missing required text: "${needle}"`)
    }
  }
  return mustPassed
}

/**
 * Validates Worker system prompts (`WorkerAgent`): `worker_identity`, `execution_rules`, `task_focus`.
 */
export function validateWorkerPrompt(prompt: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const extracted = extractXmlSections(prompt)

  const sectionsFound = [...extracted.allTagsSeen].sort()
  const sectionsMissing: string[] = []

  pushDuplicateErrors(extracted.duplicateTags, errors)

  const requiredTags = [...WORKER_REQUIRED_TAGS]
  let presentCount = 0
  let mustPassed = 0
  const mustTotal = WORKER_EXECUTION_MUST_CONTAIN.length

  for (const tag of requiredTags) {
    const content = extracted.contentByTag.get(tag)
    if (content === undefined) {
      errors.push(`Missing required section: <${tag}>`)
      sectionsMissing.push(tag)
      continue
    }
    const trimmed = content.trim()
    if (trimmed.length === 0) {
      errors.push(`Section <${tag}> is empty`)
      sectionsMissing.push(tag)
      continue
    }
    presentCount++

    if (tag === 'execution_rules') {
      mustPassed += validateWorkerExecutionRules(trimmed, errors)
    }
  }

  const presentSet = new Set(
    requiredTags.filter((t) => {
      const c = extracted.contentByTag.get(t)
      return c !== undefined && c.trim().length > 0
    }),
  )
  if (
    !checkSectionOrder(extracted.firstOpenIndex, requiredTags, presentSet) &&
    sectionsMissing.length === 0
  ) {
    warnings.push('Worker section order is non-standard (expected worker_identity → execution_rules → task_focus)')
  }

  const requiredTotal = requiredTags.length
  const scorePresent = requiredTotal > 0 ? presentCount / requiredTotal : 1
  const scoreMust = mustTotal > 0 ? mustPassed / mustTotal : 1
  const score = Math.max(0, Math.min(1, scorePresent * scoreMust))

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sectionsFound,
    sectionsMissing: [...new Set(sectionsMissing)],
    score,
  }
}

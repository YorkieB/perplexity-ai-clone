/**
 * Versioned on-disk registry for Jarvis system prompts.
 *
 * Uses `node:fs` — import only from Node / Electron main or server code, not from a Vite browser bundle.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import { v4 as uuidv4 } from 'uuid'

import { assertValidPrompt, validatePrompt } from '@/lib/prompts/promptValidator'

const LOG = '[PromptRegistry]'

const SAVE_DEBOUNCE_MS = 500

/** Who produced a registry entry. */
export type PromptAuthor = 'system' | 'user' | 'auto-generated'

/** Runtime telemetry for a prompt version (filled by {@link PromptRegistry.recordCall}). */
export interface PromptMetrics {
  totalCalls: number
  toolMisrouteCount: number
  contextIgnoreCount: number
  /** Percentage of turns that needed clarification (0–100). */
  clarificationRate: number
  /** Running average verification score (0–1) from the Verifier agent. */
  avgVerificationScore: number
  lastUpdated: string
}

/** Persisted extension for running averages (stored in `versions.json`). */
type MetricsInternal = PromptMetrics & {
  _clarificationCount: number
  _verificationScoreCount: number
}

/** Single immutable snapshot of a registered system prompt. */
export interface PromptVersion {
  id: string
  name: string
  version: string
  prompt: string
  validationScore: number
  createdAt: string
  author: PromptAuthor
  changelog: string
  isActive: boolean
  metrics?: PromptMetrics
}

interface ActiveStateFile {
  activeVersionId: string | null
  activationLog: string[]
}

function ensureMetrics(): MetricsInternal {
  const now = new Date().toISOString()
  return {
    totalCalls: 0,
    toolMisrouteCount: 0,
    contextIgnoreCount: 0,
    clarificationRate: 0,
    avgVerificationScore: 0,
    lastUpdated: now,
    _clarificationCount: 0,
    _verificationScoreCount: 0,
  }
}

function normalizeMetricsInternal(m: PromptMetrics | undefined): MetricsInternal {
  if (m === undefined) {
    return ensureMetrics()
  }
  const x = m as MetricsInternal
  return {
    ...m,
    _clarificationCount: x._clarificationCount ?? 0,
    _verificationScoreCount: x._verificationScoreCount ?? 0,
  }
}

/** First-occurrence XML-ish sections for diff / semver heuristics. */
function extractSectionMap(prompt: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(prompt)) !== null) {
    const tag = m[1]!
    if (!map.has(tag)) {
      map.set(tag, m[2] ?? '')
    }
  }
  return map
}

function formatSectionCompareLine(tag: string, a: string | undefined, b: string | undefined): string {
  if (a === undefined && b !== undefined) {
    return `${tag}: added in B (${String(b.length)} chars)`
  }
  if (a !== undefined && b === undefined) {
    return `${tag}: removed in B (was ${String(a.length)} chars)`
  }
  if (a !== undefined && b !== undefined) {
    const delta = b.length - a.length
    if (delta === 0 && a === b) {
      return `${tag}: unchanged`
    }
    const sign = delta >= 0 ? '+' : ''
    return `${tag}: changed (length ${sign}${String(delta)} chars)`
  }
  return `${tag}: unchanged`
}

function bumpSemver(current: string, kind: 'major' | 'minor' | 'patch'): string {
  const parts = current.split('.').map((p) => Number.parseInt(p, 10))
  let major = parts[0] ?? 0
  let minor = parts[1] ?? 0
  let patch = parts[2] ?? 0
  if (Number.isNaN(major)) major = 0
  if (Number.isNaN(minor)) minor = 0
  if (Number.isNaN(patch)) patch = 0

  if (kind === 'major') {
    return `${String(major + 1)}.0.0`
  }
  if (kind === 'minor') {
    return `${String(major)}.${String(minor + 1)}.0`
  }
  return `${String(major)}.${String(minor)}.${String(patch + 1)}`
}

function computeNextSemver(previous: PromptVersion | undefined, newPrompt: string): string {
  if (previous === undefined) {
    return '1.0.0'
  }
  const oldMap = extractSectionMap(previous.prompt)
  const newMap = extractSectionMap(newPrompt)
  const oldKeys = new Set(oldMap.keys())
  const newKeys = new Set(newMap.keys())
  const sameKeySet =
    oldKeys.size === newKeys.size && [...oldKeys].every((k) => newKeys.has(k))
  if (!sameKeySet) {
    return bumpSemver(previous.version, 'major')
  }

  let maxRel = 0
  for (const k of oldKeys) {
    const o = (oldMap.get(k) ?? '').length
    const n = (newMap.get(k) ?? '').length
    const denom = Math.max(o, 1)
    maxRel = Math.max(maxRel, Math.abs(n - o) / denom)
  }
  if (maxRel > 0.25) {
    return bumpSemver(previous.version, 'minor')
  }
  return bumpSemver(previous.version, 'patch')
}

function findLatestForName(versions: PromptVersion[], name: string): PromptVersion | undefined {
  const same = versions.filter((v) => v.name === name)
  if (same.length === 0) {
    return undefined
  }
  return same.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
}

/**
 * Persists prompt versions, active pointer, and activation history under a directory.
 */
export default class PromptRegistry {
  private readonly registryPath: string
  private readonly versionsPath: string
  private readonly activePath: string

  private versions: PromptVersion[] = []
  private activeVersionId: string | null = null
  /** Ordered activation events (most recent last). */
  private activationLog: string[] = []
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * @param registryPath - Directory for `versions.json` and `active.json` (created if missing).
   */
  constructor(registryPath: string = './jarvis_prompt_registry') {
    this.registryPath = path.isAbsolute(registryPath)
      ? registryPath
      : path.resolve(process.cwd(), registryPath)
    this.versionsPath = path.join(this.registryPath, 'versions.json')
    this.activePath = path.join(this.registryPath, 'active.json')

    try {
      fs.mkdirSync(this.registryPath, { recursive: true })
    } catch (err) {
      console.warn(`${LOG} Could not create registry directory`, err)
    }

    this.load()
  }

  /**
   * Validates with {@link assertValidPrompt}, assigns semver vs prior same-name entry, appends (inactive), saves.
   */
  register(name: string, prompt: string, changelog: string, author: PromptAuthor = 'user'): PromptVersion {
    assertValidPrompt(prompt)
    const validationScore = validatePrompt(prompt).score

    const previous = findLatestForName(this.versions, name)
    const version = computeNextSemver(previous, prompt)

    const entry: PromptVersion = {
      id: uuidv4(),
      name: name.trim(),
      version,
      prompt,
      validationScore,
      createdAt: new Date().toISOString(),
      author,
      changelog: changelog.trim(),
      isActive: false,
    }

    this.versions.push(entry)
    this.save()
    console.info(`${LOG} Registered prompt: ${entry.name} v${entry.version} (score: ${String(validationScore)})`)
    return entry
  }

  /**
   * Marks one version active and appends to activation history.
   */
  activate(versionId: string): void {
    const target = this.versions.find((v) => v.id === versionId)
    if (target === undefined) {
      throw new Error(`${LOG} Unknown version id: ${versionId}`)
    }
    for (const v of this.versions) {
      v.isActive = false
    }
    target.isActive = true
    this.activeVersionId = versionId
    this.activationLog.push(versionId)
    this.save()
    console.info(`${LOG} Activated: ${target.name} v${target.version}`)
  }

  /**
   * Pops {@link steps} entries from the activation log and activates the last remaining id.
   */
  rollback(steps: number = 1): PromptVersion {
    if (steps < 1) {
      throw new Error(`${LOG} rollback steps must be >= 1`)
    }
    if (this.activationLog.length <= steps) {
      throw new Error(`${LOG} Not enough activation history to rollback`)
    }
    for (let i = 0; i < steps; i++) {
      this.activationLog.pop()
    }
    const targetId = this.activationLog[this.activationLog.length - 1]
    if (targetId === undefined) {
      throw new Error(`${LOG} Rollback produced empty activation log`)
    }
    const target = this.versions.find((v) => v.id === targetId)
    if (target === undefined) {
      throw new Error(`${LOG} Rolled-back version id missing from registry: ${targetId}`)
    }
    for (const v of this.versions) {
      v.isActive = false
    }
    target.isActive = true
    this.activeVersionId = targetId
    this.save()
    console.info(`${LOG} Rolled back to: ${target.name} v${target.version}`)
    return target
  }

  /** Currently active version, if any. */
  getActive(): PromptVersion | null {
    return this.versions.find((v) => v.isActive) ?? null
  }

  /** Prompt text for the active version. */
  getActivePrompt(): string | null {
    return this.getActive()?.prompt ?? null
  }

  /**
   * Updates metrics for a version; persists to disk after a short debounce.
   */
  recordCall(
    versionId: string,
    outcome: {
      toolMisrouted?: boolean
      contextIgnored?: boolean
      neededClarification?: boolean
      verificationScore?: number
    },
  ): void {
    const v = this.versions.find((x) => x.id === versionId)
    if (v === undefined) {
      console.warn(`${LOG} recordCall: unknown version ${versionId}`)
      return
    }

    const m: MetricsInternal = normalizeMetricsInternal(v.metrics)
    v.metrics = m

    m.totalCalls++
    if (outcome.toolMisrouted === true) {
      m.toolMisrouteCount++
    }
    if (outcome.contextIgnored === true) {
      m.contextIgnoreCount++
    }
    if (outcome.neededClarification === true) {
      m._clarificationCount++
    }
    m.clarificationRate = m.totalCalls > 0 ? (m._clarificationCount / m.totalCalls) * 100 : 0

    if (outcome.verificationScore !== undefined && !Number.isNaN(outcome.verificationScore)) {
      m._verificationScoreCount++
      const n = m._verificationScoreCount
      m.avgVerificationScore = (m.avgVerificationScore * (n - 1) + outcome.verificationScore) / n
    }

    m.lastUpdated = new Date().toISOString()
    this.scheduleSave()
  }

  /** All versions, newest {@link PromptVersion.createdAt} first. */
  getVersionHistory(): PromptVersion[] {
    return [...this.versions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }

  /**
   * Summarises which XML sections differ in length between two registered versions.
   */
  compareVersions(idA: string, idB: string): string {
    const va = this.versions.find((v) => v.id === idA)
    const vb = this.versions.find((v) => v.id === idB)
    if (va === undefined || vb === undefined) {
      throw new Error(`${LOG} compareVersions: one or both ids not found`)
    }
    const ma = extractSectionMap(va.prompt)
    const mb = extractSectionMap(vb.prompt)
    const tags = new Set([...ma.keys(), ...mb.keys()])
    const lines = [...tags].sort().map((tag) => formatSectionCompareLine(tag, ma.get(tag), mb.get(tag)))
    return lines.join('\n')
  }

  private scheduleSave(): void {
    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer)
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.save()
      this.saveDebounceTimer = null
    }, SAVE_DEBOUNCE_MS)
  }

  /** Writes `versions.json` and `active.json`. */
  private save(): void {
    try {
      fs.mkdirSync(this.registryPath, { recursive: true })
    } catch {
      /* ignore */
    }

    fs.writeFileSync(this.versionsPath, `${JSON.stringify(this.versions, null, 2)}\n`, 'utf8')

    const activePayload: ActiveStateFile = {
      activeVersionId: this.activeVersionId,
      activationLog: [...this.activationLog],
    }
    fs.writeFileSync(this.activePath, `${JSON.stringify(activePayload, null, 2)}\n`, 'utf8')
  }

  private load(): void {
    try {
      if (fs.existsSync(this.versionsPath)) {
        const raw = fs.readFileSync(this.versionsPath, 'utf8')
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          this.versions = parsed as PromptVersion[]
        }
      }
    } catch (err) {
      console.warn(`${LOG} Failed to load versions.json`, err)
      this.versions = []
    }

    try {
      if (fs.existsSync(this.activePath)) {
        const raw = fs.readFileSync(this.activePath, 'utf8')
        const data = JSON.parse(raw) as ActiveStateFile
        this.activeVersionId = data.activeVersionId ?? null
        this.activationLog = Array.isArray(data.activationLog) ? [...data.activationLog] : []
        if (this.activationLog.length === 0 && this.activeVersionId !== null) {
          this.activationLog = [this.activeVersionId]
        }
      }
    } catch (err) {
      console.warn(`${LOG} Failed to load active.json`, err)
      this.activeVersionId = null
      this.activationLog = []
    }

    this.syncActiveFlags()
  }

  /** Aligns {@link PromptVersion.isActive} with {@link activeVersionId} after load. */
  private syncActiveFlags(): void {
    for (const v of this.versions) {
      v.isActive = this.activeVersionId !== null && v.id === this.activeVersionId
    }
  }
}

/** Process-wide default registry (directory `./jarvis_prompt_registry` under cwd). */
export const promptRegistry = new PromptRegistry()

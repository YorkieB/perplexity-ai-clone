import { SAME_EVENT_COOLDOWN_MS } from './config'
import type { ScreenState, SignificanceResult } from './types'

const CRITICAL_SUBSTRINGS = [
  'terminal',
  'powershell',
  'cmd',
  'deployment',
  'vercel',
  'railway',
  'digitalocean',
] as const

function wordCount(text: string): number {
  const t = text.trim()
  if (t.length === 0) {
    return 0
  }
  return t.split(/\s+/).length
}

function isCriticalApp(activeApp: string | null): boolean {
  if (activeApp === null) {
    return false
  }
  const n = activeApp.toLowerCase()
  return CRITICAL_SUBSTRINGS.some((k) => n.includes(k))
}

function titleImpliesFailure(windowTitle: string | null): boolean {
  if (windowTitle === null) {
    return false
  }
  const t = windowTitle.toLowerCase()
  return t.includes('failed') || t.includes('error') || t.includes('crashed')
}

/**
 * Scores screen-frame deltas to decide whether Jarvis should speak in ADVISE mode.
 */
export class SignificanceDetector {
  private readonly cooldowns = new Map<string, number>()
  private readonly COOLDOWN_MS = SAME_EVENT_COOLDOWN_MS

  // eslint-disable-next-line sonarjs/cognitive-complexity -- evaluates multiple candidate signals for screen significance scoring; branches map 1:1 to distinct screen events
  detect(curr: ScreenState, prev: ScreenState | null): SignificanceResult {
    if (curr.errorDetected && prev?.errorDetected) {
      return this.applyCooldown({ score: 0.3, reason: 'error_ongoing', shouldSpeak: false })
    }

    const candidates: SignificanceResult[] = []

    if (curr.errorDetected && !prev?.errorDetected) {
      candidates.push({ score: 0.9, reason: 'error_appeared', shouldSpeak: true })
    }

    if (titleImpliesFailure(curr.windowTitle)) {
      candidates.push({ score: 0.85, reason: 'failure_in_title', shouldSpeak: true })
    }

    if (prev !== null && curr.activeApp !== prev.activeApp && isCriticalApp(curr.activeApp)) {
      candidates.push({ score: 0.75, reason: 'critical_app_opened', shouldSpeak: true })
    }
    if (prev === null && isCriticalApp(curr.activeApp)) {
      candidates.push({ score: 0.75, reason: 'critical_app_opened', shouldSpeak: true })
    }

    const prevWords = prev === null ? 0 : wordCount(prev.fullText)
    const currWords = wordCount(curr.fullText)
    if (currWords - prevWords >= 500) {
      candidates.push({ score: 0.7, reason: 'major_content_change', shouldSpeak: true })
    }

    if (prev !== null && curr.activeApp !== prev.activeApp) {
      if (!isCriticalApp(curr.activeApp)) {
        candidates.push({ score: 0.4, reason: 'app_switch', shouldSpeak: false })
      }
    }

    if (
      prev !== null &&
      curr.activeApp === prev.activeApp &&
      curr.windowTitle !== prev.windowTitle
    ) {
      candidates.push({ score: 0.35, reason: 'window_change', shouldSpeak: false })
    }

    if (candidates.length === 0) {
      return this.applyCooldown({ score: 0.1, reason: 'no_change', shouldSpeak: false })
    }

    const best = candidates.reduce((a, b) => (a.score >= b.score ? a : b), candidates[0])
    return this.applyCooldown(best)
  }

  isOnCooldown(reason: string): boolean {
    const last = this.cooldowns.get(reason)
    if (last === undefined) {
      return false
    }
    return Date.now() - last < this.COOLDOWN_MS
  }

  resetCooldown(reason: string): void {
    this.cooldowns.set(reason, Date.now())
  }

  private applyCooldown(result: SignificanceResult): SignificanceResult {
    const { score, reason } = result
    let { shouldSpeak } = result
    if (shouldSpeak && this.isOnCooldown(reason)) {
      shouldSpeak = false
    }
    if (shouldSpeak) {
      this.resetCooldown(reason)
    }
    return { score, reason, shouldSpeak }
  }
}

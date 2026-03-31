import type { DailyAnalysis } from './behaviour-analyser'
import { BehaviourAnalyser } from './behaviour-analyser'
import { SpacesClient } from './spaces-client'
import { type BehaviourEvent, BehaviourEventType } from './types'

export interface PredictContext {
  recentIntents: string[]
  activeApp?: string | null
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night'
  dayOfWeek: number
}

export interface PredictResult {
  predictedIntent: string | null
  confidence: number
  reasons: string[]
}

export interface IntentPredictorConfig {
  maxRecentIntents: number
  weightSingleTransition: number
  weightPairTransition: number
  weightTimePrior: number
  weightAppPrior: number
  minConfidence: number
  maxConfidence: number
  daysToLoad: number
}

/** Map hour 0–23 to coarse bucket (local time of event timestamps). */
export function hourToTimeOfDay(hour: number): PredictContext['timeOfDay'] {
  if (hour >= 5 && hour < 12) {
    return 'morning'
  }
  if (hour >= 12 && hour < 18) {
    return 'afternoon'
  }
  if (hour >= 18 && hour < 22) {
    return 'evening'
  }
  return 'night'
}

function addCount(m: Map<string, number>, k: string, n = 1): void {
  m.set(k, (m.get(k) ?? 0) + n)
}

function normalizeSubMap(m: Map<string, number>, key: string): number {
  let t = 0
  for (const v of m.values()) {
    t += v
  }
  if (t === 0) {
    return 0
  }
  return (m.get(key) ?? 0) / t
}

function datesLastNDays(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i += 1) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    out.push(`${y}-${m}-${day}`)
  }
  return out
}

export class IntentPredictor {
  private readonly spaces: SpacesClient
  private readonly config: IntentPredictorConfig

  private dailyAnalyses: DailyAnalysis[] = []
  private singleTransitions: Map<string, Map<string, number>> = new Map()
  private pairTransitions: Map<string, Map<string, number>> = new Map()
  /** timeOfDay bucket -> intent -> count */
  private timeBucketIntentCounts: Map<PredictContext['timeOfDay'], Map<string, number>> = new Map()
  /** app label -> intent -> count (intent seen while app was last active from screen:change) */
  private appIntentCounts: Map<string, Map<string, number>> = new Map()

  constructor(spaces: SpacesClient, config: IntentPredictorConfig) {
    this.spaces = spaces
    this.config = config
  }

  async refresh(): Promise<void> {
    if (!this.spaces.isEnabled()) {
      return
    }

    this.dailyAnalyses = []
    this.singleTransitions = new Map()
    this.pairTransitions = new Map()
    this.timeBucketIntentCounts = new Map()
    this.appIntentCounts = new Map()

    const dates = datesLastNDays(this.config.daysToLoad)
    const analyser = new BehaviourAnalyser(this.spaces)

    for (const date of dates) {
      try {
        const body = await this.spaces.getObjectString(`analysis/daily/${date}.json`)
        if (body) {
          const da = JSON.parse(body) as DailyAnalysis
          this.dailyAnalyses.push(da)
        }
      } catch (err) {
        console.warn('[IntentPredictor] failed to parse daily analysis', date, err)
      }

      let events: BehaviourEvent[] = []
      try {
        events = await analyser.loadEventsForDate(date)
      } catch (err) {
        console.warn('[IntentPredictor] loadEventsForDate failed', date, err)
        continue
      }

      this.ingestEventsForModels(events)
    }
  }

  /** Build transition maps and priors from chronological session streams. */
  private ingestEventsForModels(events: BehaviourEvent[]): void {
    const bySession = new Map<string, BehaviourEvent[]>()
    for (const e of events) {
      const sid = e.sessionId
      if (!bySession.has(sid)) {
        bySession.set(sid, [])
      }
      bySession.get(sid)!.push(e)
    }

    for (const list of bySession.values()) {
      list.sort((a, b) => a.timestamp - b.timestamp)

      const intents: string[] = []
      let lastApp: string | null = null

      for (const e of list) {
        if (e.eventType === BehaviourEventType.SCREEN_CHANGE && e.app) {
          lastApp = e.app
        }
        if (e.eventType === BehaviourEventType.INTENT_RESOLVED && e.intent) {
          const intent = e.intent
          const hour = new Date(e.timestamp).getHours()
          const bucket = hourToTimeOfDay(hour)
          if (!this.timeBucketIntentCounts.has(bucket)) {
            this.timeBucketIntentCounts.set(bucket, new Map())
          }
          addCount(this.timeBucketIntentCounts.get(bucket)!, intent)

          if (lastApp) {
            if (!this.appIntentCounts.has(lastApp)) {
              this.appIntentCounts.set(lastApp, new Map())
            }
            addCount(this.appIntentCounts.get(lastApp)!, intent)
          }

          intents.push(intent)
        }
      }

      for (let i = 0; i < intents.length - 1; i += 1) {
        const a = intents[i]!
        const b = intents[i + 1]!
        if (!this.singleTransitions.has(a)) {
          this.singleTransitions.set(a, new Map())
        }
        addCount(this.singleTransitions.get(a)!, b)
      }

      for (let i = 0; i < intents.length - 2; i += 1) {
        const a = intents[i]!
        const b = intents[i + 1]!
        const c = intents[i + 2]!
        const pairKey = `${a}|${b}`
        if (!this.pairTransitions.has(pairKey)) {
          this.pairTransitions.set(pairKey, new Map())
        }
        addCount(this.pairTransitions.get(pairKey)!, c)
      }
    }
  }

  predict(context: PredictContext): PredictResult {
    if (!this.spaces.isEnabled()) {
      return {
        predictedIntent: null,
        confidence: 0,
        reasons: ['Spaces disabled'],
      }
    }

    const all = context.recentIntents ?? []
    const recent = all.slice(-this.config.maxRecentIntents)

    const hasAnyPrior =
      this.singleTransitions.size > 0 ||
      this.pairTransitions.size > 0 ||
      this.timeBucketIntentCounts.size > 0 ||
      this.appIntentCounts.size > 0 ||
      this.dailyAnalyses.length > 0

    if (recent.length === 0 || !hasAnyPrior) {
      return {
        predictedIntent: null,
        confidence: 0,
        reasons: ['Not enough history'],
      }
    }

    const last = recent[recent.length - 1]!
    const prev = recent.length >= 2 ? recent[recent.length - 2]! : null
    const pairKey = prev !== null ? `${prev}|${last}` : null
    const activeApp = context.activeApp

    const candidates = new Set<string>()
    const singleMap = this.singleTransitions.get(last)
    if (singleMap) {
      for (const k of singleMap.keys()) {
        candidates.add(k)
      }
    }
    if (pairKey) {
      const pairMap = this.pairTransitions.get(pairKey)
      if (pairMap) {
        for (const k of pairMap.keys()) {
          candidates.add(k)
        }
      }
    }
    for (const da of this.dailyAnalyses) {
      for (const k of Object.keys(da.intentsByCount)) {
        candidates.add(k)
      }
    }

    const tbCandidates = this.timeBucketIntentCounts.get(context.timeOfDay)
    if (tbCandidates) {
      for (const k of tbCandidates.keys()) {
        candidates.add(k)
      }
    }
    if (activeApp) {
      const appMap = this.appIntentCounts.get(activeApp)
      if (appMap) {
        for (const k of appMap.keys()) {
          candidates.add(k)
        }
      }
    }

    if (candidates.size === 0) {
      return {
        predictedIntent: null,
        confidence: 0,
        reasons: ['No signal'],
      }
    }

    const w1 = this.config.weightSingleTransition
    const w2 = this.config.weightPairTransition
    const w3 = this.config.weightTimePrior
    const w4 = this.config.weightAppPrior

    const scored: { intent: string; score: number; trans1: number; trans2: number; timeP: number; appP: number }[] = []

    for (const candidate of candidates) {
      const trans1 = singleMap ? normalizeSubMap(singleMap, candidate) : 0

      let trans2 = 0
      if (pairKey) {
        const pm = this.pairTransitions.get(pairKey)
        if (pm) {
          trans2 = normalizeSubMap(pm, candidate)
        }
      }

      const tb = this.timeBucketIntentCounts.get(context.timeOfDay)
      const timePrior = tb ? normalizeSubMap(tb, candidate) : 0

      let appPrior = 0
      if (activeApp) {
        const am = this.appIntentCounts.get(activeApp)
        if (am) {
          appPrior = normalizeSubMap(am, candidate)
        }
      }

      const score = w1 * trans1 + w2 * trans2 + w3 * timePrior + w4 * appPrior
      scored.push({ intent: candidate, score, trans1, trans2, timeP: timePrior, appP: appPrior })
    }

    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]!
    if (best.score <= 0 || !Number.isFinite(best.score)) {
      return {
        predictedIntent: null,
        confidence: 0,
        reasons: ['No signal'],
      }
    }

    const sumOtherScores = scored.slice(1).reduce((s, x) => s + x.score, 0)
    const denom = best.score + sumOtherScores
    const confidenceRaw = denom > 0 ? best.score / denom : 0

    const c = Math.max(
      this.config.minConfidence,
      Math.min(this.config.maxConfidence, confidenceRaw),
    )

    const reasons: string[] = []
    const t = (n: number) => n > 0.001
    if (t(best.trans1)) {
      reasons.push(`Often follows last intent (${last})`)
    }
    if (t(best.trans2) && pairKey) {
      reasons.push('Often follows the last two intents')
    }
    if (t(best.timeP)) {
      reasons.push('Common at this time of day')
    }
    if (t(best.appP) && activeApp) {
      reasons.push(`Common when ${activeApp} is active`)
    }
    if (reasons.length === 0) {
      reasons.push('Weak aggregate signal')
    }

    return {
      predictedIntent: best.intent,
      confidence: c,
      reasons,
    }
  }
}

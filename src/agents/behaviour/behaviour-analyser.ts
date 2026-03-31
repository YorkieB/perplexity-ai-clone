import { SpacesClient } from './spaces-client'
import {
  type BehaviourEvent,
  BehaviourEventType,
  type SessionSummary,
} from './types'

export interface DailyAnalysis {
  date: string
  totalSessions: number
  totalEvents: number
  intentsByCount: Record<string, number>
  modesByCount: Record<string, number>
  appsByCount: Record<string, number>
  /** Hours (0–23) with the maximum event count; sorted ascending. */
  peakHours: number[]
}

export class BehaviourAnalyser {
  private readonly spaces: SpacesClient

  constructor(spaces: SpacesClient) {
    this.spaces = spaces
  }

  /**
   * Fetch and parse all BehaviourEvent JSONL files for a given date.
   * @param date "YYYY-MM-DD"
   */
  async loadEventsForDate(date: string): Promise<BehaviourEvent[]> {
    if (!this.spaces.isEnabled()) {
      return []
    }

    const prefix = `behaviour/${date}/`
    let keys: string[] = []
    try {
      keys = await this.spaces.listObjectKeys(prefix)
    } catch (err) {
      console.warn('[BehaviourAnalyser] listObjectKeys failed', err)
      return []
    }

    const jsonlKeys = keys.filter((k) => k.endsWith('.jsonl'))
    const all: BehaviourEvent[] = []

    for (const key of jsonlKeys) {
      let body: string | null = null
      try {
        body = await this.spaces.getObjectString(key)
      } catch (err) {
        console.warn('[BehaviourAnalyser] getObjectString failed', key, err)
        continue
      }
      if (body === null || body === '') {
        continue
      }
      const lines = body.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }
        try {
          const ev = JSON.parse(trimmed) as BehaviourEvent
          all.push(ev)
        } catch (err) {
          console.warn('[BehaviourAnalyser] JSON parse error', key, err)
        }
      }
    }

    return all
  }

  /**
   * Compute a DailyAnalysis object from a list of BehaviourEvent.
   */
  computeDailyAnalysis(date: string, events: BehaviourEvent[]): DailyAnalysis {
    const sessionIds = new Set<string>()
    for (const e of events) {
      if (e.sessionId) {
        sessionIds.add(e.sessionId)
      }
    }

    const intentsByCount: Record<string, number> = {}
    for (const e of events) {
      if (e.eventType === BehaviourEventType.INTENT_RESOLVED && e.intent) {
        const k = e.intent
        intentsByCount[k] = (intentsByCount[k] ?? 0) + 1
      }
    }

    const modesByCount: Record<string, number> = {}
    for (const e of events) {
      if (e.agentMode) {
        const k = e.agentMode
        modesByCount[k] = (modesByCount[k] ?? 0) + 1
      }
    }

    const appsByCount: Record<string, number> = {}
    for (const e of events) {
      if (e.app) {
        const k = e.app
        appsByCount[k] = (appsByCount[k] ?? 0) + 1
      }
    }

    const hourCounts = new Array<number>(24).fill(0)
    for (const e of events) {
      const h = new Date(e.timestamp).getHours()
      if (h >= 0 && h <= 23) {
        hourCounts[h] += 1
      }
    }

    let peakHours: number[] = []
    if (events.length > 0) {
      const max = Math.max(...hourCounts)
      for (let h = 0; h < 24; h += 1) {
        if (hourCounts[h] === max) {
          peakHours.push(h)
        }
      }
    }

    return {
      date,
      totalSessions: sessionIds.size,
      totalEvents: events.length,
      intentsByCount,
      modesByCount,
      appsByCount,
      peakHours,
    }
  }

  /**
   * Recompute a SessionSummary from events (same rules as BehaviourLogger.endSession).
   */
  computeSessionSummary(
    _sessionId: string,
    startTime: number,
    endTime: number,
    events: BehaviourEvent[],
  ): SessionSummary {
    const intentsResolved = Array.from(
      new Set(
        events
          .filter((e) => e.eventType === BehaviourEventType.INTENT_RESOLVED && e.intent)
          .map((e) => e.intent as string),
      ),
    )
    const modesUsed = Array.from(
      new Set(events.filter((e) => e.agentMode).map((e) => e.agentMode as string)),
    )
    const goalsCompleted = events.filter((e) => e.eventType === BehaviourEventType.GOAL_COMPLETED)
      .length
    const goalsFailed = events.filter((e) => e.eventType === BehaviourEventType.GOAL_FAILED).length

    let mostActiveApp: string | null = null
    if (events.length) {
      const counts = new Map<string, number>()
      for (const e of events) {
        if (!e.app) {
          continue
        }
        counts.set(e.app, (counts.get(e.app) ?? 0) + 1)
      }
      let topApp: string | null = null
      let topCount = 0
      for (const [app, count] of counts.entries()) {
        if (count > topCount) {
          topCount = count
          topApp = app
        }
      }
      mostActiveApp = topApp
    }

    return {
      totalEvents: events.length,
      intentsResolved,
      modesUsed,
      goalsCompleted,
      goalsFailed,
      mostActiveApp,
      durationMinutes: (endTime - startTime) / 60_000,
    }
  }

  /**
   * Save the daily analysis to Spaces.
   * Key: `analysis/daily/{date}.json`
   */
  async saveDailyAnalysis(analysis: DailyAnalysis): Promise<void> {
    if (!this.spaces.isEnabled()) {
      return
    }
    const key = `analysis/daily/${analysis.date}.json`
    await this.spaces.upload(key, JSON.stringify(analysis, null, 2))
  }

  /**
   * Load events for the date, compute daily analysis, save, return.
   */
  async analyseDate(date: string): Promise<DailyAnalysis> {
    const events = await this.loadEventsForDate(date)
    const analysis = this.computeDailyAnalysis(date, events)
    await this.saveDailyAnalysis(analysis)
    return analysis
  }
}

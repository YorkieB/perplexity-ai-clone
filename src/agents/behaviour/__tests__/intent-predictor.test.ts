/**
 * @jest-environment node
 */
process.env.TZ = 'UTC'

import { BehaviourAnalyser } from '../behaviour-analyser'
import { IntentPredictor, type PredictContext } from '../intent-predictor'
import { BehaviourEventType, type BehaviourEvent } from '../types'
import type { SpacesClient } from '../spaces-client'

const baseConfig = {
  maxRecentIntents: 7,
  weightSingleTransition: 1,
  weightPairTransition: 1,
  weightTimePrior: 1,
  weightAppPrior: 1,
  minConfidence: 0.2,
  maxConfidence: 0.95,
  daysToLoad: 3,
} as const

function ev(
  sessionId: string,
  ts: number,
  type: BehaviourEvent['eventType'],
  extra: Partial<BehaviourEvent> = {},
): BehaviourEvent {
  return {
    sessionId,
    timestamp: ts,
    timeOfDay: '12:00',
    dayOfWeek: 1,
    app: null,
    eventType: type,
    intent: null,
    rawText: null,
    agentMode: null,
    durationMs: 0,
    outcome: null,
    metadata: {},
    ...extra,
  }
}

class MockSpacesClient {
  enabled = true
  isEnabled(): boolean {
    return this.enabled
  }
  listObjectKeys = jest.fn(async (_prefix: string) => [] as string[])
  getObjectString = jest.fn(async (key: string) => {
    if (key.startsWith('analysis/daily/')) {
      const date = key.replace('analysis/daily/', '').replace(/\.json$/, '')
      return JSON.stringify({
        date,
        totalSessions: 0,
        totalEvents: 0,
        intentsByCount: {},
        modesByCount: {},
        appsByCount: {},
        peakHours: [],
      })
    }
    return null
  })
}

describe('IntentPredictor', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-06-15T12:00:00Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('predict returns null when Spaces disabled', async () => {
    const spaces = new MockSpacesClient()
    spaces.enabled = false
    const p = new IntentPredictor(spaces as unknown as SpacesClient, { ...baseConfig })
    await p.refresh()
    const r = p.predict({
      recentIntents: ['jarvis.screen.watch'],
      timeOfDay: 'morning',
      dayOfWeek: 1,
    })
    expect(r.predictedIntent).toBeNull()
    expect(r.confidence).toBe(0)
    expect(r.reasons).toContain('Spaces disabled')
  })

  it('uses single transitions when lastIntent matches', async () => {
    const spaces = new MockSpacesClient()
    const events: BehaviourEvent[] = []
    let t = 1_000_000
    for (let i = 0; i < 20; i += 1) {
      events.push(ev('s1', t++, BehaviourEventType.INTENT_RESOLVED, { intent: 'A' }))
      events.push(ev('s1', t++, BehaviourEventType.INTENT_RESOLVED, { intent: 'B' }))
    }
    jest.spyOn(BehaviourAnalyser.prototype, 'loadEventsForDate').mockResolvedValue(events)

    const p = new IntentPredictor(spaces as unknown as SpacesClient, { ...baseConfig })
    await p.refresh()
    const r = p.predict({
      recentIntents: ['A'],
      timeOfDay: 'morning',
      dayOfWeek: 1,
    })
    expect(r.predictedIntent).toBe('B')
    expect(r.confidence).toBeGreaterThan(0.2)
    expect(r.reasons.some((x) => /follows last intent/i.test(x))).toBe(true)
  })

  it('uses pair transitions when lastPair is informative', async () => {
    const spaces = new MockSpacesClient()
    const events: BehaviourEvent[] = []
    let t = 2_000_000
    for (let i = 0; i < 15; i += 1) {
      events.push(ev('s2', t++, BehaviourEventType.INTENT_RESOLVED, { intent: 'A' }))
      events.push(ev('s2', t++, BehaviourEventType.INTENT_RESOLVED, { intent: 'B' }))
      events.push(ev('s2', t++, BehaviourEventType.INTENT_RESOLVED, { intent: 'C' }))
    }
    for (let i = 0; i < 5; i += 1) {
      events.push(ev('s3', t++, BehaviourEventType.INTENT_RESOLVED, { intent: 'A' }))
      events.push(ev('s3', t++, BehaviourEventType.INTENT_RESOLVED, { intent: 'D' }))
    }
    jest.spyOn(BehaviourAnalyser.prototype, 'loadEventsForDate').mockResolvedValue(events)

    const p = new IntentPredictor(spaces as unknown as SpacesClient, { ...baseConfig })
    await p.refresh()
    const r = p.predict({
      recentIntents: ['A', 'B'],
      timeOfDay: 'afternoon',
      dayOfWeek: 2,
    })
    expect(r.predictedIntent).toBe('C')
    expect(r.reasons.some((x) => /last two intents/i.test(x))).toBe(true)
  })

  it('folds in time-of-day priors', async () => {
    const spaces = new MockSpacesClient()
    const eveningHour = new Date('2024-06-10T20:00:00Z').getTime()
    const events: BehaviourEvent[] = []
    for (let i = 0; i < 50; i += 1) {
      events.push(
        ev('te', eveningHour + i * 1000, BehaviourEventType.INTENT_RESOLVED, {
          intent: 'evening.intent',
        }),
      )
    }
    jest.spyOn(BehaviourAnalyser.prototype, 'loadEventsForDate').mockResolvedValue(events)

    const p = new IntentPredictor(spaces as unknown as SpacesClient, {
      ...baseConfig,
      weightSingleTransition: 0.01,
      weightPairTransition: 0.01,
      weightTimePrior: 5,
      weightAppPrior: 0.01,
    })
    await p.refresh()
    const r = p.predict({
      recentIntents: ['__no_transition_match__'],
      timeOfDay: 'evening',
      dayOfWeek: 3,
    })
    expect(r.predictedIntent).toBe('evening.intent')
    expect(r.reasons.some((x) => /time of day/i.test(x))).toBe(true)
  })

  it('folds in app priors', async () => {
    const spaces = new MockSpacesClient()
    let t = 3_000_000
    const events: BehaviourEvent[] = []
    for (let i = 0; i < 30; i += 1) {
      events.push(ev('ap', t++, BehaviourEventType.SCREEN_CHANGE, { app: 'code' }))
      events.push(
        ev('ap', t++, BehaviourEventType.INTENT_RESOLVED, { intent: 'jarvis.screen.watch' }),
      )
    }
    for (let i = 0; i < 10; i += 1) {
      events.push(ev('ap', t++, BehaviourEventType.SCREEN_CHANGE, { app: 'code' }))
      events.push(ev('ap', t++, BehaviourEventType.INTENT_RESOLVED, { intent: 'jarvis.screen.act' }))
    }
    jest.spyOn(BehaviourAnalyser.prototype, 'loadEventsForDate').mockResolvedValue(events)

    const p = new IntentPredictor(spaces as unknown as SpacesClient, {
      ...baseConfig,
      weightSingleTransition: 0.02,
      weightPairTransition: 0.02,
      weightTimePrior: 0.02,
      weightAppPrior: 8,
    })
    await p.refresh()
    const r = p.predict({
      recentIntents: ['__no_last_transition__'],
      activeApp: 'code',
      timeOfDay: 'morning',
      dayOfWeek: 1,
    } as PredictContext)
    expect(r.predictedIntent).toBe('jarvis.screen.watch')
    expect(r.reasons.some((x) => /active/i.test(x))).toBe(true)
  })

  it('clamps confidence between min and max', async () => {
    const spaces = new MockSpacesClient()
    const events: BehaviourEvent[] = []
    let t = 4_000_000
    for (let i = 0; i < 100; i += 1) {
      events.push(ev('z', t++, BehaviourEventType.INTENT_RESOLVED, { intent: 'A' }))
      events.push(ev('z', t++, BehaviourEventType.INTENT_RESOLVED, { intent: 'B' }))
    }
    jest.spyOn(BehaviourAnalyser.prototype, 'loadEventsForDate').mockResolvedValue(events)

    const p = new IntentPredictor(spaces as unknown as SpacesClient, {
      ...baseConfig,
      minConfidence: 0.2,
      maxConfidence: 0.95,
    })
    await p.refresh()
    const r = p.predict({
      recentIntents: ['A'],
      timeOfDay: 'night',
      dayOfWeek: 0,
    })
    expect(r.predictedIntent).toBe('B')
    expect(r.confidence).toBeLessThanOrEqual(0.95)
    expect(r.confidence).toBeGreaterThanOrEqual(0.2)
  })
})

/**
 * @jest-environment node
 */
process.env.TZ = 'UTC'

import { BehaviourAnalyser, type DailyAnalysis } from '../behaviour-analyser'
import { BehaviourEventType, type BehaviourEvent } from '../types'
import type { SpacesClient } from '../spaces-client'

class MockSpacesClient {
  enabled = true
  upload = jest.fn(async (_key: string, _data: string) => {})
  listObjectKeys = jest.fn(async () => [] as string[])
  getObjectString = jest.fn(async () => null as string | null)
  isEnabled(): boolean {
    return this.enabled
  }
}

function baseEvent(overrides: Partial<BehaviourEvent>): BehaviourEvent {
  return {
    sessionId: 's1',
    timestamp: Date.now(),
    timeOfDay: '12:00',
    dayOfWeek: 1,
    app: null,
    eventType: BehaviourEventType.SESSION_START,
    intent: null,
    rawText: null,
    agentMode: null,
    durationMs: 0,
    outcome: null,
    metadata: {},
    ...overrides,
  }
}

describe('BehaviourAnalyser', () => {
  describe('computeDailyAnalysis', () => {
    it('counts intents, modes, apps correctly', () => {
      const analyser = new BehaviourAnalyser({} as SpacesClient)
      const events: BehaviourEvent[] = [
        baseEvent({
          sessionId: 'a',
          eventType: BehaviourEventType.INTENT_RESOLVED,
          intent: 'jarvis.screen.watch',
        }),
        baseEvent({
          sessionId: 'a',
          eventType: BehaviourEventType.INTENT_RESOLVED,
          intent: 'jarvis.screen.watch',
        }),
        baseEvent({
          sessionId: 'b',
          eventType: BehaviourEventType.INTENT_RESOLVED,
          intent: 'jarvis.screen.act',
        }),
        baseEvent({
          sessionId: 'b',
          eventType: BehaviourEventType.MODE_CHANGED,
          agentMode: 'ACT',
        }),
        baseEvent({
          sessionId: 'b',
          eventType: BehaviourEventType.MODE_CHANGED,
          agentMode: 'WATCH',
        }),
        baseEvent({
          sessionId: 'a',
          eventType: BehaviourEventType.SCREEN_CHANGE,
          app: 'Code',
        }),
        baseEvent({
          sessionId: 'b',
          eventType: BehaviourEventType.SCREEN_CHANGE,
          app: 'Code',
        }),
        baseEvent({
          sessionId: 'b',
          eventType: BehaviourEventType.SCREEN_CHANGE,
          app: 'Terminal',
        }),
      ]

      const d = analyser.computeDailyAnalysis('2024-03-15', events)
      expect(d.totalEvents).toBe(8)
      expect(d.totalSessions).toBe(2)
      expect(d.intentsByCount).toEqual({
        'jarvis.screen.watch': 2,
        'jarvis.screen.act': 1,
      })
      expect(d.modesByCount).toEqual({ ACT: 1, WATCH: 1 })
      expect(d.appsByCount).toEqual({ Code: 2, Terminal: 1 })
    })

    it('computes peakHours from timestamps (single max)', () => {
      const analyser = new BehaviourAnalyser({} as SpacesClient)
      const t10 = new Date(Date.UTC(2024, 0, 1, 10, 15, 0)).getTime()
      const t10b = new Date(Date.UTC(2024, 0, 1, 10, 45, 0)).getTime()
      const t11 = new Date(Date.UTC(2024, 0, 1, 11, 0, 0)).getTime()
      const events: BehaviourEvent[] = [
        baseEvent({ timestamp: t10, eventType: BehaviourEventType.ADVICE_GIVEN }),
        baseEvent({ timestamp: t10b, eventType: BehaviourEventType.ADVICE_GIVEN }),
        baseEvent({ timestamp: t11, eventType: BehaviourEventType.ADVICE_GIVEN }),
      ]
      const d = analyser.computeDailyAnalysis('2024-01-01', events)
      expect(d.peakHours).toEqual([10])
    })

    it('computes peakHours tie — returns all max hours sorted', () => {
      const analyser = new BehaviourAnalyser({} as SpacesClient)
      const e5a = new Date(Date.UTC(2024, 0, 1, 5, 0, 0)).getTime()
      const e5b = new Date(Date.UTC(2024, 0, 1, 5, 30, 0)).getTime()
      const e7a = new Date(Date.UTC(2024, 0, 1, 7, 0, 0)).getTime()
      const e7b = new Date(Date.UTC(2024, 0, 1, 7, 1, 0)).getTime()
      const events: BehaviourEvent[] = [
        baseEvent({ timestamp: e5a, eventType: BehaviourEventType.ADVICE_GIVEN }),
        baseEvent({ timestamp: e5b, eventType: BehaviourEventType.ADVICE_GIVEN }),
        baseEvent({ timestamp: e7a, eventType: BehaviourEventType.ADVICE_GIVEN }),
        baseEvent({ timestamp: e7b, eventType: BehaviourEventType.ADVICE_GIVEN }),
      ]
      const d = analyser.computeDailyAnalysis('2024-01-01', events)
      expect(d.peakHours).toEqual([5, 7])
    })
  })

  describe('computeSessionSummary', () => {
    it('matches expected totals', () => {
      const analyser = new BehaviourAnalyser({} as SpacesClient)
      const start = 1_000_000
      const end = start + 120_000
      const events: BehaviourEvent[] = [
        baseEvent({
          eventType: BehaviourEventType.INTENT_RESOLVED,
          intent: 'a',
        }),
        baseEvent({
          eventType: BehaviourEventType.INTENT_RESOLVED,
          intent: 'b',
        }),
        baseEvent({
          eventType: BehaviourEventType.MODE_CHANGED,
          agentMode: 'X',
        }),
        baseEvent({
          eventType: BehaviourEventType.MODE_CHANGED,
          agentMode: 'Y',
        }),
        baseEvent({
          eventType: BehaviourEventType.GOAL_COMPLETED,
        }),
        baseEvent({
          eventType: BehaviourEventType.GOAL_FAILED,
        }),
        baseEvent({
          eventType: BehaviourEventType.SCREEN_CHANGE,
          app: 'AppA',
        }),
        baseEvent({
          eventType: BehaviourEventType.SCREEN_CHANGE,
          app: 'AppA',
        }),
        baseEvent({
          eventType: BehaviourEventType.SCREEN_CHANGE,
          app: 'AppB',
        }),
      ]
      const s = analyser.computeSessionSummary('sid', start, end, events)
      expect(s.totalEvents).toBe(9)
      expect(s.intentsResolved.sort()).toEqual(['a', 'b'])
      expect(s.modesUsed.sort()).toEqual(['X', 'Y'])
      expect(s.goalsCompleted).toBe(1)
      expect(s.goalsFailed).toBe(1)
      expect(s.mostActiveApp).toBe('AppA')
      expect(s.durationMinutes).toBe(2)
    })
  })

  describe('saveDailyAnalysis', () => {
    it('calls SpacesClient.upload with analysis/daily key', async () => {
      const spaces = new MockSpacesClient()
      const analyser = new BehaviourAnalyser(spaces as unknown as SpacesClient)
      const analysis: DailyAnalysis = {
        date: '2025-06-01',
        totalSessions: 0,
        totalEvents: 0,
        intentsByCount: {},
        modesByCount: {},
        appsByCount: {},
        peakHours: [],
      }
      await analyser.saveDailyAnalysis(analysis)
      expect(spaces.upload).toHaveBeenCalledTimes(1)
      const [key] = spaces.upload.mock.calls[0]!
      expect(key).toBe('analysis/daily/2025-06-01.json')
    })
  })

  describe('analyseDate', () => {
    it('returns analysis when Spaces disabled without throwing', async () => {
      const spaces = new MockSpacesClient()
      spaces.enabled = false
      const analyser = new BehaviourAnalyser(spaces as unknown as SpacesClient)
      const stubEvents: BehaviourEvent[] = [
        baseEvent({
          eventType: BehaviourEventType.INTENT_RESOLVED,
          intent: 'jarvis.screen.watch',
        }),
      ]
      jest.spyOn(analyser, 'loadEventsForDate').mockResolvedValue(stubEvents)

      await expect(analyser.analyseDate('2024-12-25')).resolves.toMatchObject({
        date: '2024-12-25',
        totalEvents: 1,
        totalSessions: 1,
        intentsByCount: { 'jarvis.screen.watch': 1 },
      })
      expect(spaces.upload).not.toHaveBeenCalled()
    })
  })
})

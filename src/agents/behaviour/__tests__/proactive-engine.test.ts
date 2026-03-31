/**
 * @jest-environment node
 */

import { EventEmitter } from 'events'

import {
  EVT_BEHAVIOUR_SUGGESTION,
  EVT_INTENT_RESOLVED,
  EVT_SCREEN_CHANGE,
  ProactiveEngine,
} from '../proactive-engine'
import type { IntentPredictor } from '../intent-predictor'

function createMockPredictor(): { mock: jest.Mock; predictor: IntentPredictor } {
  const mock = jest.fn()
  const predictor = { predict: mock } as unknown as IntentPredictor
  return { mock, predictor }
}

describe('ProactiveEngine', () => {
  const baseConfig = {
    maxRecentIntents: 5,
    confidenceThreshold: 0.6,
    intervalMs: 30_000,
    debounceMs: 2000,
    cooldownMs: 60_000,
  }

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('start registers listeners and timer, stop cleans them up', () => {
    jest.useFakeTimers()
    const { predictor } = createMockPredictor()
    const emitter = new EventEmitter()
    const engine = new ProactiveEngine(predictor, emitter, { ...baseConfig, intervalMs: 5000 }, 'sess-1')

    engine.start()
    expect(emitter.listenerCount(EVT_INTENT_RESOLVED)).toBeGreaterThan(0)
    expect(emitter.listenerCount(EVT_SCREEN_CHANGE)).toBeGreaterThan(0)

    engine.stop()
    expect(emitter.listenerCount(EVT_INTENT_RESOLVED)).toBe(0)
    expect(emitter.listenerCount(EVT_SCREEN_CHANGE)).toBe(0)
  })

  it('after INTENT_RESOLVED, recentIntents buffer is maintained', () => {
    jest.useFakeTimers()
    const { mock, predictor } = createMockPredictor()
    mock.mockReturnValue({
      predictedIntent: null,
      confidence: 0,
      reasons: ['No signal'],
    })
    const emitter = new EventEmitter()
    const engine = new ProactiveEngine(
      predictor,
      emitter,
      { ...baseConfig, maxRecentIntents: 5, debounceMs: 100 },
      'sess-2',
    )
    engine.start()

    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    for (const x of letters) {
      emitter.emit(EVT_INTENT_RESOLVED, { intent: `jarvis.${x}` })
    }

    jest.advanceTimersByTime(150)

    const recent = (engine as unknown as { recentIntents: string[] }).recentIntents
    expect(recent.length).toBeLessThanOrEqual(5)
    expect(recent).toEqual(['jarvis.D', 'jarvis.E', 'jarvis.F', 'jarvis.G', 'jarvis.H'])

    engine.stop()
  })

  it('intent debounce triggers predict and emits jarvis:behaviour:suggestion', () => {
    jest.useFakeTimers()
    const { mock, predictor } = createMockPredictor()
    mock.mockReturnValue({
      predictedIntent: 'jarvis.screen.watch',
      confidence: 0.9,
      reasons: ['Often follows last intent (x)'],
    })
    const emitter = new EventEmitter()
    const onSug = jest.fn()
    emitter.on(EVT_BEHAVIOUR_SUGGESTION, onSug)

    const engine = new ProactiveEngine(
      predictor,
      emitter,
      { ...baseConfig, debounceMs: 500, cooldownMs: 0, intervalMs: 60_000 },
      'sess-3',
    )
    engine.start()

    emitter.emit(EVT_INTENT_RESOLVED, { intent: 'jarvis.screen.act' })
    jest.advanceTimersByTime(500)

    expect(mock).toHaveBeenCalled()
    expect(onSug).toHaveBeenCalledTimes(1)
    const payload = onSug.mock.calls[0]![0] as { suggestedIntent: string; type: string }
    expect(payload.type).toBe('behaviour:suggestion')
    expect(payload.suggestedIntent).toBe('jarvis.screen.watch')

    engine.stop()
  })

  it('cooldown prevents suggestion spam', () => {
    jest.useFakeTimers()
    const { mock, predictor } = createMockPredictor()
    mock.mockReturnValue({
      predictedIntent: 'jarvis.screen.watch',
      confidence: 0.99,
      reasons: [],
    })
    const emitter = new EventEmitter()
    const onSug = jest.fn()
    emitter.on(EVT_BEHAVIOUR_SUGGESTION, onSug)

    const engine = new ProactiveEngine(
      predictor,
      emitter,
      {
        ...baseConfig,
        confidenceThreshold: 0.1,
        debounceMs: 100,
        cooldownMs: 60_000,
        intervalMs: 60_000,
      },
      'sess-4',
    )
    engine.start()

    emitter.emit(EVT_INTENT_RESOLVED, { intent: 'a' })
    jest.advanceTimersByTime(100)
    expect(onSug).toHaveBeenCalledTimes(1)

    emitter.emit(EVT_INTENT_RESOLVED, { intent: 'b' })
    jest.advanceTimersByTime(100)
    expect(onSug).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(60_000)
    emitter.emit(EVT_INTENT_RESOLVED, { intent: 'c' })
    jest.advanceTimersByTime(100)
    expect(onSug).toHaveBeenCalledTimes(2)

    engine.stop()
  })

  it('below confidenceThreshold does not emit suggestion', () => {
    jest.useFakeTimers()
    const { mock, predictor } = createMockPredictor()
    mock.mockReturnValue({
      predictedIntent: 'jarvis.screen.watch',
      confidence: 0.5,
      reasons: [],
    })
    const emitter = new EventEmitter()
    const onSug = jest.fn()
    emitter.on(EVT_BEHAVIOUR_SUGGESTION, onSug)

    const engine = new ProactiveEngine(
      predictor,
      emitter,
      { ...baseConfig, confidenceThreshold: 0.6, debounceMs: 100, cooldownMs: 0 },
      'sess-5',
    )
    engine.start()

    emitter.emit(EVT_INTENT_RESOLVED, { intent: 'x' })
    jest.advanceTimersByTime(200)

    expect(onSug).not.toHaveBeenCalled()

    engine.stop()
  })

  it('timer-based prediction works with non-empty recentIntents', () => {
    jest.useFakeTimers()
    const { mock, predictor } = createMockPredictor()
    mock.mockReturnValue({
      predictedIntent: 'jarvis.screen.query',
      confidence: 0.95,
      reasons: ['Common at this time of day'],
    })
    const emitter = new EventEmitter()
    const onSug = jest.fn()
    emitter.on(EVT_BEHAVIOUR_SUGGESTION, onSug)

    const engine = new ProactiveEngine(
      predictor,
      emitter,
      { ...baseConfig, intervalMs: 10_000, debounceMs: 500, cooldownMs: 0 },
      'sess-6',
    )
    engine.start()

    emitter.emit(EVT_INTENT_RESOLVED, { intent: 'jarvis.screen.watch' })
    jest.advanceTimersByTime(500)

    mock.mockClear()
    onSug.mockClear()

    jest.advanceTimersByTime(10_000)

    expect(mock).toHaveBeenCalled()
    expect(onSug).toHaveBeenCalledTimes(1)

    engine.stop()
  })
})

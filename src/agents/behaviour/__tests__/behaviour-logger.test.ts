import { EventEmitter } from 'events'

import { BehaviourLogger } from '../behaviour-logger'
import { BehaviourEventType } from '../types'
import type { SpacesClient } from '../spaces-client'

class MockSpacesClient {
  append = jest.fn(async (_key: string, _line: string) => {})
  upload = jest.fn(async (_key: string, _data: string) => {})
  isEnabled(): boolean {
    return true
  }
}

describe('BehaviourLogger', () => {
  it('records SESSION_START on init', async () => {
    const emitter = new EventEmitter()
    const spaces = new MockSpacesClient()
    const logger = new BehaviourLogger(emitter, spaces as unknown as SpacesClient)
    logger.init()
    await logger.flush()
    expect(spaces.append).toHaveBeenCalledTimes(1)
    const body = spaces.append.mock.calls[0]?.[1] as string
    expect(body).toContain(BehaviourEventType.SESSION_START)
    await logger.endSession()
  })

  it('records INTENT_RESOLVED when intent:resolved fires', async () => {
    const emitter = new EventEmitter()
    const spaces = new MockSpacesClient()
    const logger = new BehaviourLogger(emitter, spaces as unknown as SpacesClient)
    logger.init()
    emitter.emit('intent:resolved', {
      intent: 'jarvis.screen.watch',
      rawText: 'watch this',
      entities: { a: 1 },
    })
    await logger.flush()
    const body = spaces.append.mock.calls[0]?.[1] as string
    expect(body).toContain(BehaviourEventType.INTENT_RESOLVED)
    expect(body).toContain('jarvis.screen.watch')
    expect(body).toContain('watch this')
    await logger.endSession()
  })

  it('records ADVICE_GIVEN when jarvis:speak fires', async () => {
    const emitter = new EventEmitter()
    const spaces = new MockSpacesClient()
    const logger = new BehaviourLogger(emitter, spaces as unknown as SpacesClient)
    logger.init()
    emitter.emit('jarvis:speak', { text: 'Hello', priority: 'high' })
    await logger.flush()
    const body = spaces.append.mock.calls[0]?.[1] as string
    expect(body).toContain(BehaviourEventType.ADVICE_GIVEN)
    expect(body).toContain('Hello')
    await logger.endSession()
  })

  it('records SCREEN_CHANGE when screen:change fires', async () => {
    const emitter = new EventEmitter()
    const spaces = new MockSpacesClient()
    const logger = new BehaviourLogger(emitter, spaces as unknown as SpacesClient)
    logger.init()
    emitter.emit('screen:change', {
      windowTitle: 'My Editor',
      significance: 0.5,
    })
    await logger.flush()
    const body = spaces.append.mock.calls[0]?.[1] as string
    expect(body).toContain(BehaviourEventType.SCREEN_CHANGE)
    expect(body).toContain('My Editor')
    await logger.endSession()
  })

  it('durationMs increases between events', async () => {
    jest.useFakeTimers()
    const emitter = new EventEmitter()
    const spaces = new MockSpacesClient()
    const logger = new BehaviourLogger(emitter, spaces as unknown as SpacesClient)
    logger.init()
    jest.advanceTimersByTime(2000)
    emitter.emit('jarvis:speak', { text: 'a', priority: 'low' })
    await logger.flush()
    const body = spaces.append.mock.calls[0]?.[1] as string
    const line = body.split('\n').find((l) => l.includes('advice_given'))
    expect(line).toBeDefined()
    const ev = JSON.parse(line!) as { durationMs: number }
    expect(ev.durationMs).toBeGreaterThanOrEqual(2000)
    await logger.endSession()
    jest.useRealTimers()
  })

  it('timeOfDay is HH:MM format', async () => {
    const emitter = new EventEmitter()
    const spaces = new MockSpacesClient()
    const logger = new BehaviourLogger(emitter, spaces as unknown as SpacesClient)
    logger.init()
    await logger.flush()
    const body = spaces.append.mock.calls[0]?.[1] as string
    const line = body.split('\n').find((l) => l.includes('session_start'))
    expect(line).toBeDefined()
    const ev = JSON.parse(line!) as { timeOfDay: string }
    expect(ev.timeOfDay).toMatch(/^\d{2}:\d{2}$/)
    await logger.endSession()
  })

  it('endSession uploads summary JSON', async () => {
    const emitter = new EventEmitter()
    const spaces = new MockSpacesClient()
    const logger = new BehaviourLogger(emitter, spaces as unknown as SpacesClient)
    logger.init()
    await logger.endSession()
    expect(spaces.upload).toHaveBeenCalledTimes(1)
    const json = spaces.upload.mock.calls[0]?.[1] as string
    const parsed = JSON.parse(json) as { summary: { totalEvents: number } }
    expect(parsed.summary.totalEvents).toBeGreaterThanOrEqual(1)
  })

  it('endSession calls flush and clears timer', async () => {
    jest.useFakeTimers()
    const emitter = new EventEmitter()
    const spaces = new MockSpacesClient()
    const logger = new BehaviourLogger(emitter, spaces as unknown as SpacesClient)
    const flushSpy = jest.spyOn(logger, 'flush')
    logger.init()
    await logger.endSession()
    expect(flushSpy).toHaveBeenCalled()
    const callsAfterEnd = flushSpy.mock.calls.length
    jest.advanceTimersByTime(120_000)
    expect(flushSpy.mock.calls.length).toBe(callsAfterEnd)
    flushSpy.mockRestore()
    jest.useRealTimers()
  })

  it('second init() does not register duplicate listeners', async () => {
    const emitter = new EventEmitter()
    const spaces = new MockSpacesClient()
    const logger = new BehaviourLogger(emitter, spaces as unknown as SpacesClient)
    logger.init()
    logger.init()
    emitter.emit('intent:resolved', {
      intent: 'jarvis.screen.watch',
      rawText: 'once',
      entities: {},
    })
    await logger.endSession()
    const session = JSON.parse(spaces.upload.mock.calls[0]![1] as string) as {
      events: { eventType: string }[]
    }
    expect(session.events.filter((e) => e.eventType === 'intent_resolved').length).toBe(1)
  })

  it('endSession detaches listeners so later emits are not recorded', async () => {
    const emitter = new EventEmitter()
    const spaces = new MockSpacesClient()
    const logger = new BehaviourLogger(emitter, spaces as unknown as SpacesClient)
    logger.init()
    await logger.endSession()
    emitter.emit('intent:resolved', { intent: 'x', rawText: 'late', entities: {} })
    const session = JSON.parse(spaces.upload.mock.calls[0]![1] as string) as {
      events: { eventType: string }[]
    }
    expect(session.events.filter((e) => e.eventType === 'intent_resolved').length).toBe(0)
  })
})

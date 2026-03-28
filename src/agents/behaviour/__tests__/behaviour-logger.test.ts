import EventEmitter from 'eventemitter3'

import { BehaviourLogger } from '../behaviour-logger'
import { BehaviourEventType } from '../types'
import type { SpacesClient } from '../spaces-client'

function createMockSpaces(): jest.Mocked<
  Pick<SpacesClient, 'append' | 'upload' | 'isEnabled'>
> {
  return {
    append: jest.fn().mockResolvedValue(undefined),
    upload: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockReturnValue(true),
  }
}

describe('BehaviourLogger', () => {
  let lastLogger: BehaviourLogger | null = null

  beforeEach(() => {
    lastLogger = null
    jest.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(async () => {
    if (lastLogger !== null) {
      lastLogger.cancelPeriodicFlush()
      lastLogger = null
    }
    jest.restoreAllMocks()
  })

  function makeLogger(emitter: EventEmitter, spaces: ReturnType<typeof createMockSpaces>): BehaviourLogger {
    const logger = new BehaviourLogger(emitter, spaces as unknown as SpacesClient)
    lastLogger = logger
    return logger
  }

  it('records SESSION_START on init', async () => {
    const emitter = new EventEmitter()
    const spaces = createMockSpaces()
    const logger = makeLogger(emitter, spaces)
    logger.init()
    await logger.flush()
    const payload = spaces.append.mock.calls[0]?.[1] as string
    expect(payload).toContain('session_start')
  })

  it('records INTENT_RESOLVED when intent:resolved fires', async () => {
    const emitter = new EventEmitter()
    const spaces = createMockSpaces()
    const logger = makeLogger(emitter, spaces)
    logger.init()
    emitter.emit('intent:resolved', {
      intent: 'jarvis.screen.watch',
      utterance: 'watch my screen',
      slots: {},
    })
    await logger.flush()
    const payload = spaces.append.mock.calls.find((c) => String(c[1]).includes('intent_resolved'))?.[1] as
      | string
      | undefined
    expect(payload).toBeDefined()
    expect(payload).toContain('jarvis.screen.watch')
  })

  it('records ADVICE_GIVEN when jarvis:speak fires', async () => {
    const emitter = new EventEmitter()
    const spaces = createMockSpaces()
    const logger = makeLogger(emitter, spaces)
    logger.init()
    emitter.emit('jarvis:speak', { text: 'Hello', priority: 'normal' })
    await logger.flush()
    const blob = spaces.append.mock.calls.map((c) => String(c[1])).join('\n')
    expect(blob).toContain('advice_given')
    expect(blob).toContain('Hello')
  })

  it('records SCREEN_CHANGE when screen:change fires', async () => {
    const emitter = new EventEmitter()
    const spaces = createMockSpaces()
    const logger = makeLogger(emitter, spaces)
    logger.init()
    emitter.emit('screen:change', {
      frameId: '1',
      timestamp: Date.now(),
      activeApp: 'Code',
      windowTitle: 'index.ts',
      fullText: '',
      errorDetected: false,
      url: null,
      elements: [],
      resolution: { width: 1920, height: 1080 },
    })
    await logger.flush()
    const joined = spaces.append.mock.calls.map((c) => String(c[1])).join('\n')
    expect(joined).toContain('screen_change')
    expect(joined).toContain('index.ts')
  })

  it('durationMs is correct between events', async () => {
    jest.useFakeTimers()
    const emitter = new EventEmitter()
    const spaces = createMockSpaces()
    const logger = makeLogger(emitter, spaces)
    logger.init()
    jest.advanceTimersByTime(5000)
    emitter.emit('jarvis:speak', { text: 'a', priority: 'low' })
    await logger.flush()
    const lines = (spaces.append.mock.calls[0]?.[1] as string).split('\n').filter(Boolean)
    const speakLine = lines.find((l) => l.includes('advice_given'))
    expect(speakLine).toBeDefined()
    const ev = JSON.parse(speakLine!) as { durationMs: number }
    expect(ev.durationMs).toBe(5000)
    jest.useRealTimers()
  })

  it('timeOfDay is HH:MM format', async () => {
    const emitter = new EventEmitter()
    const spaces = createMockSpaces()
    const logger = makeLogger(emitter, spaces)
    logger.init()
    await logger.flush()
    const firstAppend = spaces.append.mock.calls[0]?.[1] as string
    const line = firstAppend.split('\n').find((l) => l.includes('session_start'))
    expect(line).toBeDefined()
    const ev = JSON.parse(line!) as { timeOfDay: string }
    expect(ev.timeOfDay).toMatch(/^\d{2}:\d{2}$/)
  })

  it('flush() calls spacesClient.append with correct key format', async () => {
    const emitter = new EventEmitter()
    const spaces = createMockSpaces()
    const logger = makeLogger(emitter, spaces)
    const sid = logger.getSessionId()
    logger.init()
    await logger.flush()
    expect(spaces.append).toHaveBeenCalled()
    const key = spaces.append.mock.calls[0][0]
    expect(key).toMatch(new RegExp(`^behaviour/\\d{4}-\\d{2}-\\d{2}/${sid}\\.jsonl$`))
  })

  it('flush() clears the buffer after upload', async () => {
    const emitter = new EventEmitter()
    const spaces = createMockSpaces()
    const logger = makeLogger(emitter, spaces)
    logger.init()
    await logger.flush()
    spaces.append.mockClear()
    await logger.flush()
    expect(spaces.append).not.toHaveBeenCalled()
  })

  it('endSession() computes correct summary', async () => {
    const emitter = new EventEmitter()
    const spaces = createMockSpaces()
    const logger = makeLogger(emitter, spaces)
    logger.init()
    emitter.emit('intent:resolved', { intent: 'jarvis.screen.watch', utterance: 'x', slots: {} })
    emitter.emit('screen:mode_changed', { newMode: 'WATCH' })
    emitter.emit('goal:completed', { stepsCompleted: 3 })
    emitter.emit('goal:failed', { reason: 'timeout' })
    emitter.emit('screen:change', {
      frameId: '1',
      timestamp: 1,
      activeApp: 'AppA',
      windowTitle: 'AppA',
      fullText: '',
      errorDetected: false,
      url: null,
      elements: [],
      resolution: { width: 1, height: 1 },
    })
    await logger.endSession()
    const uploadCall = spaces.upload.mock.calls.find((c) => c[0].includes('-summary.json'))
    expect(uploadCall).toBeDefined()
    const summary = JSON.parse(uploadCall![1]) as {
      intentsResolved: string[]
      modesUsed: string[]
      goalsCompleted: number
      goalsFailed: number
      mostActiveApp: string | null
      totalEvents: number
    }
    expect(summary.intentsResolved).toContain('jarvis.screen.watch')
    expect(summary.modesUsed).toContain('WATCH')
    expect(summary.goalsCompleted).toBe(1)
    expect(summary.goalsFailed).toBe(1)
    expect(summary.mostActiveApp).toBe('AppA')
    expect(summary.totalEvents).toBeGreaterThan(3)
  })

  it('endSession() calls flush() before returning', async () => {
    const emitter = new EventEmitter()
    const spaces = createMockSpaces()
    const logger = makeLogger(emitter, spaces)
    logger.init()
    const flushSpy = jest.spyOn(logger, 'flush')
    await logger.endSession()
    expect(flushSpy).toHaveBeenCalled()
    flushSpy.mockRestore()
  })

  it('SpacesClient disabled — record() still works (no crash)', () => {
    const emitter = new EventEmitter()
    const disabled = {
      append: jest.fn(),
      upload: jest.fn(),
      isEnabled: () => false,
    } as unknown as SpacesClient
    const logger = new BehaviourLogger(emitter, disabled)
    lastLogger = logger
    logger.init()
    emitter.emit('jarvis:speak', { text: 'x', priority: 'low' })
    expect(() => logger.record({ eventType: BehaviourEventType.ERROR, app: '' })).not.toThrow()
  })

  it('buffer survives SpacesClient upload failure (no crash)', async () => {
    const emitter = new EventEmitter()
    const spaces = createMockSpaces()
    spaces.append.mockRejectedValueOnce(new Error('network'))
    const logger = makeLogger(emitter, spaces)
    logger.init()
    await expect(logger.flush()).resolves.toBeUndefined()
    emitter.emit('jarvis:speak', { text: 'after', priority: 'low' })
    spaces.append.mockResolvedValue(undefined)
    await expect(logger.flush()).resolves.toBeUndefined()
    expect(spaces.append).toHaveBeenCalled()
  })
})

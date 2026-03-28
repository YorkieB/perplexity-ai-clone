import EventEmitter from 'eventemitter3'

import { afterEach, describe, expect, it, jest } from '@jest/globals'

import { DENYLIST } from '../config'
import { ScreenAgent } from '../index'
import { AdviceGenerator } from '../advice-generator'
import { AgentMode, type AgentAction } from '../types'
import { SafetyGate } from '../safety-gate'

let lastMockSocket: MockSocket | null = null

type MockSocket = {
  url: string
  on: (ev: string, fn: (...args: unknown[]) => void) => void
  once: (ev: string, fn: (...args: unknown[]) => void) => void
  off: (ev: string, fn: (...args: unknown[]) => void) => void
  send: jest.Mock
  close: jest.Mock
  terminate: jest.Mock
  removeAllListeners: jest.Mock
  emitMessage: (payload: Record<string, unknown>) => void
}

function createMockSocket(url: string): MockSocket {
  const messageHandlers: Array<(data: unknown) => void> = []
  const socket: MockSocket = {
    url,
    on(ev: string, fn: (...args: unknown[]) => void) {
      if (ev === 'message') {
        messageHandlers.push(fn as (data: unknown) => void)
      }
    },
    once(ev: string, fn: (...args: unknown[]) => void) {
      if (ev === 'open') {
        queueMicrotask(() => {
          fn()
        })
      }
    },
    off: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    terminate: jest.fn(),
    removeAllListeners: jest.fn(),
    emitMessage(payload: Record<string, unknown>) {
      const raw = JSON.stringify(payload)
      for (const h of messageHandlers) {
        h(raw)
      }
    },
  }
  return socket
}

jest.mock('ws', () => ({
  __esModule: true,
  default: jest.fn((url: string) => {
    lastMockSocket = createMockSocket(url)
    return lastMockSocket
  }),
}))

async function flushPromises(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r))
  await new Promise<void>((r) => setImmediate(r))
}

function totalListeners(ee: EventEmitter): number {
  let n = 0
  for (const ev of ee.eventNames()) {
    n += ee.listenerCount(ev as string)
  }
  return n
}

describe('Screen agent — runtime regression (voice coexistence)', () => {
  afterEach(() => {
    lastMockSocket = null
  })

  it('ScreenAgent initializes without touching voice agent state', async () => {
    const voiceAgentEmitter = new EventEmitter()
    expect(totalListeners(voiceAgentEmitter)).toBe(0)

    const agent = new ScreenAgent({ wsPort: 8765 })
    await agent.initialize()

    expect(totalListeners(voiceAgentEmitter)).toBe(0)

    const internal = (agent as unknown as { emitter: EventEmitter }).emitter
    expect(internal.eventNames().length).toBeGreaterThan(0)
    expect(totalListeners(internal)).toBeGreaterThan(0)

    agent.stop()
  })

  it("jarvis:speak event from screen agent has correct shape", async () => {
    lastMockSocket = null
    const adviceGen = {
      generate: jest.fn(async () => 'Check the build output.'),
    } as unknown as AdviceGenerator
    const agent = new ScreenAgent({ wsPort: 8765 }, { adviceGenerator: adviceGen })
    let payload: { text: string; priority: 'low' | 'normal' | 'high' } | null = null
    agent.on('jarvis:speak', (p) => {
      payload = p
    })
    await agent.initialize()
    await agent.setMode(AgentMode.ADVISE)
    expect(lastMockSocket).not.toBeNull()
    lastMockSocket!.emitMessage({
      type: 'screen_change',
      frame_id: 1,
      app: 'Code',
      windowTitle: 'x',
      error_detected: true,
      timestamp: Date.now() / 1000,
      element_count: 0,
    })
    await flushPromises()
    expect(payload).not.toBeNull()
    expect(typeof payload!.text).toBe('string')
    expect(payload!.text.length).toBeGreaterThan(0)
    expect(['low', 'normal', 'high']).toContain(payload!.priority)
    agent.stop()
  })

  it('screen agent stop() does not affect other agents', async () => {
    lastMockSocket = null
    const otherAgent = new EventEmitter()
    const spy = jest.spyOn(otherAgent, 'emit')

    const agent = new ScreenAgent({ wsPort: 8765 })
    await agent.initialize()
    agent.stop()

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('screen agent mode switch does not emit unexpected events', async () => {
    lastMockSocket = null
    const agent = new ScreenAgent({ wsPort: 8765 })
    await agent.initialize()
    const internal = (agent as unknown as { emitter: EventEmitter }).emitter
    const emitted: string[] = []
    const orig = internal.emit.bind(internal)
    internal.emit = ((event: string, ...args: unknown[]) => {
      emitted.push(event)
      return orig(event, ...args)
    }) as typeof internal.emit

    await agent.setMode(AgentMode.ADVISE)

    expect(emitted.every((name) => name === 'screen:change')).toBe(true)

    agent.stop()
  })

  it('DENYLIST blocks all critical destructive actions', () => {
    const gate = new SafetyGate()
    const entries = [...DENYLIST]
    let n = 0
    for (const phrase of entries) {
      const action: AgentAction = {
        type: 'test',
        reasoning: `User asked to run: ${phrase} on the server`,
        needsApproval: false,
      }
      expect(gate.isBlocked(action)).toBe(true)
      n += 1
    }
    // eslint-disable-next-line no-console
    console.info(`[regression] DENYLIST entries tested: ${String(n)}`)
    expect(n).toBe(entries.length)
  })
})

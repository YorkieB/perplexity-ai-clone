import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, jest } from '@jest/globals'

import type { ScreenState } from '../types'
import { ScreenAgent } from '../index'
import { PythonBridge } from '../python-bridge'
import { StateManager } from '../state-manager'

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
  const closeHandlers: Array<() => void> = []
  const socket: MockSocket = {
    url,
    on(ev: string, fn: (...args: unknown[]) => void) {
      if (ev === 'message') {
        messageHandlers.push(fn as (data: unknown) => void)
      }
      if (ev === 'close') {
        closeHandlers.push(fn as () => void)
      }
    },
    once(ev: string, fn: (...args: unknown[]) => void) {
      if (ev === 'open') {
        queueMicrotask(() => {
          fn()
        })
      }
      if (ev === 'error') {
        /* reserved for failure paths */
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

import WebSocket from 'ws'

describe('screen-agent WATCH mode', () => {
  afterEach(() => {
    jest.useRealTimers()
    lastMockSocket = null
  })

  it('connects to Python bridge on initialize()', async () => {
    const agent = new ScreenAgent({ wsPort: 8765 })
    await agent.initialize()
    expect(WebSocket).toHaveBeenCalled()
    expect(WebSocket).toHaveBeenCalledWith('ws://localhost:8765')
    agent.stop()
  })

  it('stores screen state to StateManager on screen_change event', async () => {
    const storeSpy = jest.spyOn(StateManager.prototype, 'store').mockResolvedValue(undefined)
    const agent = new ScreenAgent({ wsPort: 8765 })
    await agent.initialize()
    expect(lastMockSocket).not.toBeNull()
    lastMockSocket!.emitMessage({
      type: 'screen_change',
      frame_id: 42,
      app: 'TestApp',
      window: 'Win',
      error_detected: false,
      timestamp: 1_700_000_000,
      element_count: 0,
    })
    await flushPromises()
    expect(storeSpy).toHaveBeenCalled()
    const arg = storeSpy.mock.calls[0]?.[0] as ScreenState
    expect(arg.frameId).toBe('42')
    expect(arg.activeApp).toBe('TestApp')
    expect(arg.windowTitle).toBe('Win')
    expect(arg.errorDetected).toBe(false)
    expect(arg.elements).toEqual([])
    storeSpy.mockRestore()
    agent.stop()
  })

  it("emits screen:change event for every frame", async () => {
    let count = 0
    const agent = new ScreenAgent({ wsPort: 8765 })
    agent.on('screen:change', () => {
      count += 1
    })
    await agent.initialize()
    for (let i = 0; i < 3; i += 1) {
      lastMockSocket!.emitMessage({
        type: 'screen_change',
        frame_id: i,
        app: 'A',
        window: 'W',
        error_detected: false,
        timestamp: 1_700_000_000 + i * 1000,
        element_count: 0,
      })
    }
    await flushPromises()
    expect(count).toBe(3)
    agent.stop()
  })

  it("emits screen:error when error_detected is true", async () => {
    let got = false
    const agent = new ScreenAgent({ wsPort: 8765 })
    agent.on('screen:error', () => {
      got = true
    })
    await agent.initialize()
    lastMockSocket!.emitMessage({
      type: 'screen_change',
      frame_id: 1,
      app: 'ErrApp',
      window: 'W',
      error_detected: true,
      timestamp: 1_700_000_000,
      element_count: 0,
    })
    await flushPromises()
    expect(got).toBe(true)
    agent.stop()
  })

  it('does NOT emit screen:error when error_detected is false', async () => {
    let got = false
    const agent = new ScreenAgent({ wsPort: 8765 })
    agent.on('screen:error', () => {
      got = true
    })
    await agent.initialize()
    lastMockSocket!.emitMessage({
      type: 'screen_change',
      frame_id: 1,
      app: 'Ok',
      window: 'W',
      error_detected: false,
      timestamp: 1_700_000_000,
      element_count: 0,
    })
    await flushPromises()
    expect(got).toBe(false)
    agent.stop()
  })

  it('getMemoryAt returns closest state within 30 seconds', async () => {
    const sm = new StateManager(null)
    const now = Date.now()
    const base: ScreenState = {
      frameId: '1',
      timestamp: now,
      activeApp: 'X',
      windowTitle: null,
      fullText: '',
      errorDetected: false,
      url: null,
      elements: [],
      resolution: { width: 0, height: 0 },
    }
    await sm.store({ ...base, frameId: '1', timestamp: now - 40_000 })
    await sm.store({ ...base, frameId: '2', timestamp: now - 20_000 })
    await sm.store({ ...base, frameId: '3', timestamp: now })
    const at = await sm.getStateAt(now - 19_000)
    expect(at?.frameId).toBe('2')
  })

  it('queryScreen times out after 10 seconds if no response', async () => {
    jest.useFakeTimers()
    const bridge = new PythonBridge(8765)
    const exposed = bridge as unknown as {
      status: string
      ws: { send: (...args: unknown[]) => void } | null
    }
    exposed.status = 'connected'
    exposed.ws = { send: jest.fn() }
    const agent = new ScreenAgent({}, { bridge })
    const p = agent.queryScreen('why')
    jest.advanceTimersByTime(10_000)
    await expect(p).rejects.toThrow(/timeout/)
  })

  it('boundary guard: production files exclude speech-pipeline tokens', () => {
    const dir = join(__dirname, '..')
    const files = listTsFilesRecursive(dir)
    const elevenLabsToken = `${['e', 'l', 'e', 'v', 'e', 'n'].join('')}${['l', 'a', 'b', 's'].join('')}`
    const speechSynthToken = `${'t'}${'t'}${'s'}`
    const speechRecToken = `${'s'}${'t'}${'t'}`
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      const lower = text.toLowerCase()
      expect(lower.includes(elevenLabsToken)).toBe(false)
      expect(lower.includes(speechSynthToken)).toBe(false)
      expect(lower.includes(speechRecToken)).toBe(false)
      const voSeg = 'vo'
      const iceSeg = 'ice'
      expect(text).not.toMatch(new RegExp(`from\\s+['"][^'"]*/${voSeg}${iceSeg}/[^'"]*['"]`))
    }
  })
})

async function flushPromises(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r))
  await new Promise<void>((r) => setImmediate(r))
}

function listTsFilesRecursive(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory() && name.name === '__tests__') {
      continue
    }
    const p = join(dir, name.name)
    if (name.isDirectory()) {
      out.push(...listTsFilesRecursive(p))
    } else if (name.name.endsWith('.ts')) {
      out.push(p)
    }
  }
  return out
}

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, jest } from '@jest/globals'

import { AdviceGenerator, type JarvisAdviceLlm } from '../advice-generator'
import { AgentMode, type ScreenState } from '../types'
import { ScreenAgent } from '../index'
import { SignificanceDetector } from '../significance-detector'

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

function baseState(over: Partial<ScreenState> = {}): ScreenState {
  return {
    frameId: '1',
    timestamp: Date.now(),
    activeApp: 'Editor',
    windowTitle: 'doc.ts',
    fullText: '',
    errorDetected: false,
    url: null,
    elements: [],
    resolution: { width: 0, height: 0 },
    ...over,
  }
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((r) => setImmediate(r))
  await new Promise<void>((r) => setImmediate(r))
}

describe('ADVISE mode — significance', () => {
  it('SignificanceDetector scores error_appeared as 0.9', () => {
    const d = new SignificanceDetector()
    const curr = baseState({ errorDetected: true })
    const prev = baseState({ errorDetected: false })
    const r = d.detect(curr, prev)
    expect(r.score).toBe(0.9)
    expect(r.reason).toBe('error_appeared')
    expect(r.shouldSpeak).toBe(true)
  })

  it('SignificanceDetector does NOT trigger for ongoing error', () => {
    const d = new SignificanceDetector()
    const curr = baseState({ errorDetected: true })
    const prev = baseState({ errorDetected: true })
    const r = d.detect(curr, prev)
    expect(r.shouldSpeak).toBe(false)
    expect(r.score).toBe(0.3)
    expect(r.reason).toBe('error_ongoing')
  })

  it('SignificanceDetector respects cooldown', () => {
    const d = new SignificanceDetector()
    const curr = baseState({ errorDetected: true })
    const prev = baseState({ errorDetected: false })
    const a = d.detect(curr, prev)
    expect(a.shouldSpeak).toBe(true)
    const b = d.detect(curr, prev)
    expect(b.reason).toBe('error_appeared')
    expect(b.shouldSpeak).toBe(false)
  })

  it('SignificanceDetector scores failure in window title', () => {
    const d = new SignificanceDetector()
    const curr = baseState({
      windowTitle: 'Build failed — app',
      errorDetected: false,
    })
    const prev = baseState({ windowTitle: 'OK' })
    const r = d.detect(curr, prev)
    expect(r.score).toBe(0.85)
    expect(r.reason).toBe('failure_in_title')
    expect(r.shouldSpeak).toBe(true)
  })
})

describe('ADVISE mode — advice generator', () => {
  it('AdviceGenerator returns null for SILENT response', async () => {
    const llm = jest.fn(async () => '  SILENT  ') as JarvisAdviceLlm
    const g = new AdviceGenerator(llm)
    const state = baseState({ errorDetected: true })
    const out = await g.generate(state, 'error_appeared')
    expect(out).toBeNull()
  })

  it('AdviceGenerator returns null for duplicate advice', async () => {
    const llm = jest.fn(async () => 'Same tip') as JarvisAdviceLlm
    const g = new AdviceGenerator(llm)
    const state = baseState({ errorDetected: true })
    const first = await g.generate(state, 'error_appeared')
    const second = await g.generate({ ...state, frameId: '2' }, 'error_appeared')
    expect(first).toBe('Same tip')
    expect(second).toBeNull()
  })
})

describe('ADVISE mode — ScreenAgent integration', () => {
  it("ADVISE mode emits jarvis:speak on significant event", async () => {
    lastMockSocket = null
    const adviceGen = {
      generate: jest.fn(async () => 'Check line 47'),
    } as unknown as AdviceGenerator
    const agent = new ScreenAgent({ wsPort: 8765 }, { adviceGenerator: adviceGen })
    const jarvisSpeakLog: Array<{ text: string; priority: 'low' | 'normal' | 'high' }> = []
    agent.on('jarvis:speak', (p) => {
      jarvisSpeakLog.push(p as { text: string; priority: 'low' | 'normal' | 'high' })
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
    expect(adviceGen.generate).toHaveBeenCalled()
    expect(jarvisSpeakLog[0]?.text).toBe('Check line 47')
    expect(
      jarvisSpeakLog[0]?.priority === 'normal' || jarvisSpeakLog[0]?.priority === 'high',
    ).toBe(true)
    agent.stop()
  })

  it("ADVISE mode does NOT emit jarvis:speak in WATCH mode", async () => {
    lastMockSocket = null
    const adviceGen = {
      generate: jest.fn(async () => 'Check line 47'),
    } as unknown as AdviceGenerator
    const agent = new ScreenAgent({ wsPort: 8765 }, { adviceGenerator: adviceGen })
    let speakCount = 0
    agent.on('jarvis:speak', () => {
      speakCount += 1
    })
    await agent.initialize()
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
    expect(speakCount).toBe(0)
    expect(adviceGen.generate).not.toHaveBeenCalled()
    agent.stop()
  })

  it("ADVISE mode does NOT emit jarvis:speak when advice is null", async () => {
    lastMockSocket = null
    const adviceGen = {
      generate: jest.fn(async () => null),
    } as unknown as AdviceGenerator
    const agent = new ScreenAgent({ wsPort: 8765 }, { adviceGenerator: adviceGen })
    let speakCount = 0
    agent.on('jarvis:speak', () => {
      speakCount += 1
    })
    await agent.initialize()
    await agent.setMode(AgentMode.ADVISE)
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
    expect(speakCount).toBe(0)
    agent.stop()
  })
})

describe('screen-agent boundary guard', () => {
  it('boundary guard: production files exclude speech-pipeline tokens', () => {
    const dir = join(__dirname, '..')
    const files = listTsFilesRecursive(dir)
    const elevenLabsToken = `${['e', 'l', 'e', 'v', 'e', 'n'].join('')}${['l', 'a', 'b', 's'].join('')}`
    const speechSynthToken = `${'t'}${'t'}${'s'}`
    const speechRecToken = `${'s'}${'t'}${'t'}`
    const voSeg = 'vo'
    const iceSeg = 'ice'
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      const lower = text.toLowerCase()
      expect(lower.includes(elevenLabsToken)).toBe(false)
      expect(lower.includes(speechSynthToken)).toBe(false)
      expect(lower.includes(speechRecToken)).toBe(false)
      expect(text).not.toMatch(new RegExp(`from\\s+['"][^'"]*/${voSeg}${iceSeg}/[^'"]*['"]`))
    }
  })
})

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

import EventEmitter from 'eventemitter3'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { ScreenAgent } from '@/agents/screen-agent'
import type { PythonBridge } from '@/agents/screen-agent/python-bridge'
import type { PythonBridgeEvents } from '@/agents/screen-agent/python-bridge'
import { AgentMode } from '@/agents/screen-agent/types'

import {
  type IntentResolvedPayload,
  ScreenAgentHandler,
} from '../screen-agent-handler'

/**
 * Minimal bridge stub matching {@link PythonBridge} surface used by
 * {@link ScreenAgent} + {@link GoalExecutor} (send, on, off, emit, getStatus).
 */
class FakeBridge extends EventEmitter<PythonBridgeEvents> {
  readonly send = jest.fn()

  getStatus(): 'connected' {
    return 'connected'
  }

  disconnect(): void {
    /* no socket */
  }
}

function asPythonBridge(fake: FakeBridge): PythonBridge {
  return fake as unknown as PythonBridge
}

function firstSendArg(call: readonly unknown[]): Record<string, unknown> | null {
  const x = call[0]
  if (x !== null && typeof x === 'object' && !Array.isArray(x)) {
    return x as Record<string, unknown>
  }
  return null
}

async function flushUntil(
  predicate: () => boolean,
  options: { maxTicks?: number } = {},
): Promise<void> {
  const maxTicks = options.maxTicks ?? 500
  for (let i = 0; i < maxTicks; i += 1) {
    if (predicate()) {
      return
    }
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
  }
  throw new Error('flushUntil: predicate not satisfied within tick budget')
}

describe('ScreenAgentHandler → ScreenAgent ACT pipeline (fake bridge)', () => {
  let globalEmitter: EventEmitter
  let bridge: FakeBridge
  let screenAgent: ScreenAgent
  let handler: ScreenAgentHandler

  beforeEach(() => {
    globalEmitter = new EventEmitter()
    bridge = new FakeBridge()

    bridge.send.mockImplementation((msg: Record<string, unknown>) => {
      if (msg.command === 'set_mode' && msg.mode === 'ACT') {
        queueMicrotask(() => {
          bridge.emit('goal_complete', { stepsCompleted: 1 })
        })
      }
    })

    screenAgent = new ScreenAgent({ wsPort: 8765 }, { bridge: asPythonBridge(bridge) })
    handler = new ScreenAgentHandler(screenAgent, globalEmitter, {})
  })

  afterEach(() => {
    handler.destroy()
    screenAgent.stop()
    jest.clearAllMocks()
  })

  it('intent:resolved ACT → bridge ACT command, then WATCH after goal_complete', async () => {
    handler.init()

    const payload: IntentResolvedPayload = {
      intent: 'jarvis.screen.act',
      slots: { goal: 'open my dev dashboard' },
    }

    globalEmitter.emit('intent:resolved', payload)

    await flushUntil(() =>
      bridge.send.mock.calls.some((call) => {
        const m = firstSendArg(call)
        return (
          m !== null &&
          m.command === 'set_mode' &&
          m.mode === 'ACT' &&
          m.goal === 'open my dev dashboard'
        )
      }),
    )

    expect(bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'set_mode',
        mode: 'ACT',
        goal: 'open my dev dashboard',
      }),
    )

    await flushUntil(() =>
      bridge.send.mock.calls.some((call) => {
        const m = firstSendArg(call)
        return m !== null && m.command === 'set_mode' && m.mode === 'WATCH'
      }),
    )

    expect(bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'set_mode',
        mode: 'WATCH',
      }),
    )

    expect(screenAgent.getMode()).toBe(AgentMode.WATCH)
  })
})

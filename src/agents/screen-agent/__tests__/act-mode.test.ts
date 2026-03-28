import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import EventEmitter from 'eventemitter3'
import { describe, expect, it, jest } from '@jest/globals'

import { GoalExecutor } from '../goal-executor'
import type { PythonBridge } from '../python-bridge'
import type { PythonBridgeEvents } from '../python-bridge'
import { SafetyGate } from '../safety-gate'
import { AgentMode, type AgentAction, type ScreenAgentEvents } from '../types'
import { ScreenAgent } from '../index'

class FakeBridge extends EventEmitter<PythonBridgeEvents> {
  readonly send = jest.fn()
  getStatus(): 'connected' {
    return 'connected'
  }
}

describe('ACT mode — SafetyGate', () => {
  it('isBlocked is true when a DENYLIST token appears in the action payload', () => {
    const g = new SafetyGate()
    const action: AgentAction = {
      type: 'shell',
      reasoning: 'run rm -rf build',
      needsApproval: true,
    }
    expect(g.isBlocked(action)).toBe(true)
  })

  it('isBlocked is false for benign actions', () => {
    const g = new SafetyGate()
    const action: AgentAction = {
      type: 'click',
      reasoning: 'open settings',
      needsApproval: false,
    }
    expect(g.isBlocked(action)).toBe(false)
  })

  it('requiresApproval is true when needsApproval is set', () => {
    const g = new SafetyGate()
    const action: AgentAction = { type: 'x', reasoning: 'ok', needsApproval: true }
    expect(g.requiresApproval(action)).toBe(true)
  })

  it('requiresApproval is true when APPROVAL_REQUIRED_PATTERNS matches', () => {
    const g = new SafetyGate()
    const action: AgentAction = { type: 'x', reasoning: 'please delete the file', needsApproval: false }
    expect(g.requiresApproval(action)).toBe(true)
  })

  it('requiresApproval is false when no pattern and needsApproval false', () => {
    const g = new SafetyGate()
    const action: AgentAction = { type: 'x', reasoning: 'read only', needsApproval: false }
    expect(g.requiresApproval(action)).toBe(false)
  })

  it('getActionLog returns a shallow copy', () => {
    const g = new SafetyGate()
    const a: AgentAction = { type: 't', reasoning: '', needsApproval: false }
    g.logAction(a, true, true)
    const log = g.getActionLog()
    log.length = 0
    expect(g.getActionLog().length).toBe(1)
  })

  it('logAction retains at most 500 entries', () => {
    const g = new SafetyGate()
    const a: AgentAction = { type: 't', reasoning: '', needsApproval: false }
    for (let i = 0; i < 502; i += 1) {
      g.logAction(a, true, true)
    }
    expect(g.getActionLog().length).toBe(500)
  })
})

describe('ACT mode — GoalExecutor', () => {
  it('execute returns failure when another goal is already running', async () => {
    const bridge = new FakeBridge()
    const emitter = new EventEmitter<ScreenAgentEvents>()
    const safety = new SafetyGate()
    const ge = new GoalExecutor(bridge as unknown as PythonBridge, emitter, safety)
    const first = ge.execute('long')
    const second = await ge.execute('other')
    expect(second.success).toBe(false)
    expect(second.failureReason).toContain('Another goal')
    bridge.emit('goal_complete', { stepsCompleted: 1 })
    await first
  })

  it('execute emits jarvis:speak at goal start', async () => {
    const bridge = new FakeBridge()
    const emitter = new EventEmitter<ScreenAgentEvents>()
    const spy = jest.spyOn(emitter, 'emit')
    const safety = new SafetyGate()
    const ge = new GoalExecutor(bridge as unknown as PythonBridge, emitter, safety)
    const p = ge.execute('my goal')
    queueMicrotask(() => bridge.emit('goal_complete', { stepsCompleted: 0 }))
    await p
    expect(spy).toHaveBeenCalledWith(
      'jarvis:speak',
      expect.objectContaining({ text: expect.stringContaining('On it') }),
    )
    spy.mockRestore()
  })

  it('resolves success when bridge emits goal_complete', async () => {
    const bridge = new FakeBridge()
    const emitter = new EventEmitter<ScreenAgentEvents>()
    const safety = new SafetyGate()
    const ge = new GoalExecutor(bridge as unknown as PythonBridge, emitter, safety)
    const p = ge.execute('g')
    queueMicrotask(() => bridge.emit('goal_complete', { stepsCompleted: 7 }))
    const r = await p
    expect(r.success).toBe(true)
    expect(r.stepsCompleted).toBe(7)
  })

  it('resolves failure when bridge emits goal_failed', async () => {
    const bridge = new FakeBridge()
    const emitter = new EventEmitter<ScreenAgentEvents>()
    const safety = new SafetyGate()
    const ge = new GoalExecutor(bridge as unknown as PythonBridge, emitter, safety)
    const p = ge.execute('g')
    queueMicrotask(() =>
      bridge.emit('goal_failed', {
        stepsCompleted: 2,
        failureReason: 'blocked',
      }),
    )
    const r = await p
    expect(r.success).toBe(false)
    expect(r.failureReason).toBe('blocked')
  })

  it('auto-approves when approval_required is not blocked and does not require approval', async () => {
    const bridge = new FakeBridge()
    const emitter = new EventEmitter<ScreenAgentEvents>()
    const safety = new SafetyGate()
    const ge = new GoalExecutor(bridge as unknown as PythonBridge, emitter, safety)
    const p = ge.execute('g')
    queueMicrotask(() =>
      bridge.emit('approval_required', {
        action: { type: 'noop', reasoning: 'safe tap', needsApproval: false },
      }),
    )
    queueMicrotask(() => bridge.emit('goal_complete', { stepsCompleted: 1 }))
    await p
    const approvalSends = bridge.send.mock.calls.filter(
      (c) => (c[0] as { type?: string }).type === 'approval_response',
    )
    expect(approvalSends.some((c) => (c[0] as { approved?: boolean }).approved === true)).toBe(true)
  })
})

describe('ACT mode — ScreenAgent', () => {
  it('setMode(ACT) without a goal logs a warning and does not run', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const bridge = new FakeBridge()
    const agent = new ScreenAgent({ wsPort: 8765 }, { bridge: bridge as unknown as PythonBridge })
    await agent.setMode(AgentMode.ACT, '   ')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('screen-agent boundary guard (ACT phase)', () => {
  it('production .ts files exclude speech-pipeline substrings', () => {
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

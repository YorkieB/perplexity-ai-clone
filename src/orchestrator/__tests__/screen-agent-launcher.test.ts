import { EventEmitter } from 'events'
import { join } from 'path'

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockSpawn = jest.fn()
jest.mock('child_process', () => ({
  spawn: mockSpawn,
}))

const MockWebSocket = jest.fn()
jest.mock('ws', () => ({
  __esModule: true,
  default: MockWebSocket,
}))

import { ScreenAgentLauncher } from '../screen-agent-launcher'

function fakeChildProc(): import('child_process').ChildProcess {
  const stderr = Object.assign(new EventEmitter(), {
    pipe: jest.fn(),
  })
  return Object.assign(new EventEmitter(), {
    stderr,
    killed: false,
    kill: jest.fn(),
    exitCode: null as number | null,
  }) as unknown as import('child_process').ChildProcess
}

describe('ScreenAgentLauncher', () => {
  beforeEach(() => {
    mockSpawn.mockReset()
    MockWebSocket.mockReset()
    jest.useRealTimers()
  })

  it('start() spawns python with correct env vars', async () => {
    mockSpawn.mockImplementation(() => fakeChildProc())

    MockWebSocket.mockImplementation(() => ({
      once(ev: string, fn: () => void) {
        if (ev === 'open') {
          queueMicrotask(() => fn())
        }
      },
      close: jest.fn(),
      removeAllListeners: jest.fn(),
    }))

    const launcher = new ScreenAgentLauncher(8765)
    await launcher.start(join(process.cwd(), 'python', 'screen_agent.py'))

    expect(mockSpawn).toHaveBeenCalledWith(
      'python',
      [expect.stringMatching(/screen_agent\.py$/)],
      expect.objectContaining({
        env: expect.objectContaining({
          SCREEN_AGENT_TRANSPORT: 'websocket',
          SCREEN_AGENT_WS_PORT: '8765',
          SCREEN_AGENT_PORT: '8765',
        }) as Record<string, unknown>,
        stdio: ['ignore', 'ignore', 'pipe'],
      }),
    )
  })

  it('start() resolves when WS port accepts connection', async () => {
    mockSpawn.mockImplementation(() => fakeChildProc())
    MockWebSocket.mockImplementation(() => ({
      once(ev: string, fn: () => void) {
        if (ev === 'open') {
          queueMicrotask(() => fn())
        }
      },
      close: jest.fn(),
      removeAllListeners: jest.fn(),
    }))

    const launcher = new ScreenAgentLauncher(9001)
    await expect(launcher.start('/abs/path/screen_agent.py')).resolves.toBeUndefined()
  })

  it(
    'start() throws if sidecar never becomes ready',
    async () => {
      mockSpawn.mockImplementation(() => fakeChildProc())
      MockWebSocket.mockImplementation(() => ({
        once(ev: string, fn: (e?: Error) => void) {
          if (ev === 'error') {
            queueMicrotask(() => fn(new Error('econnrefused')))
          }
        },
        close: jest.fn(),
        removeAllListeners: jest.fn(),
      }))

      const launcher = new ScreenAgentLauncher(9002)
      await expect(launcher.start('/x/screen_agent.py')).rejects.toThrow(
        'Screen agent sidecar failed to start',
      )
    },
    15_000,
  )

  it('stop() kills the process', async () => {
    const kill = jest.fn()
    mockSpawn.mockImplementation(() =>
      Object.assign(fakeChildProc(), {
        kill,
      }),
    )

    MockWebSocket.mockImplementation(() => ({
      once(ev: string, fn: () => void) {
        if (ev === 'open') {
          queueMicrotask(() => fn())
        }
      },
      close: jest.fn(),
      removeAllListeners: jest.fn(),
    }))

    const launcher = new ScreenAgentLauncher(9003)
    await launcher.start('/x/screen_agent.py')
    launcher.stop()
    expect(kill).toHaveBeenCalledWith('SIGTERM')
    expect(launcher.isRunning()).toBe(false)
  })

  it('isRunning() returns false before start', () => {
    const launcher = new ScreenAgentLauncher(9004)
    expect(launcher.isRunning()).toBe(false)
  })
})

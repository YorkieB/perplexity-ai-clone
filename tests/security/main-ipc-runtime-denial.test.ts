import { createRequire } from 'node:module'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type RegisteredHandler = (event: {
  senderFrame?: { url?: string }
  sender?: { getURL?: () => string }
}, opts?: unknown) => Promise<unknown> | object | string | boolean | null | undefined

const require = createRequire(import.meta.url)
type NodeModuleWithLoad = typeof import('node:module') & {
  _load: (...args: unknown[]) => unknown
}
const nodeModuleWithLoad: NodeModuleWithLoad = require('node:module')
const mainModulePath = require.resolve('../../electron/main.cjs')

function loadMainWithMocks() {
  const registeredHandlers = new Map<string, RegisteredHandler>()
  const execFileMock = vi.fn()
  const spawnMock = vi.fn()
  const appQuitMock = vi.fn()
  const shellOpenPathMock = vi.fn()
  const shellOpenExternalMock = vi.fn(async () => undefined)
  const originalLoad = nodeModuleWithLoad._load

  nodeModuleWithLoad._load = ((request: string, ...rest: unknown[]) => {
    if (request === 'electron') {
      return {
        app: {
          whenReady: () => Promise.resolve(),
          on: () => undefined,
          quit: appQuitMock,
        },
        BrowserWindow: {
          getAllWindows: () => [],
        },
        dialog: {
          showOpenDialog: vi.fn(),
          showSaveDialog: vi.fn(),
        },
        ipcMain: {
          handle: (channel: string, handler: RegisteredHandler) => {
            registeredHandlers.set(channel, handler)
          },
        },
        session: {
          defaultSession: {
            webRequest: {
              onHeadersReceived: vi.fn(),
            },
          },
        },
        shell: {
          openPath: shellOpenPathMock,
          openExternal: shellOpenExternalMock,
        },
        webContents: {
          getAllWebContents: () => [],
        },
      }
    }

    if (request === 'node:child_process') {
      return {
        execFile: execFileMock,
        spawn: spawnMock,
      }
    }

    return originalLoad(request, ...rest)
  }) as typeof nodeModuleWithLoad._load

  process.env.JARVIS_SKIP_ELECTRON_BOOTSTRAP = '1'
  delete require.cache[mainModulePath]
  const mod = require(mainModulePath) as {
    registerJarvisIdeIpc: () => void
    registerTerminalIpc: () => void
  }

  return {
    mod,
    registeredHandlers,
    execFileMock,
    spawnMock,
    appQuitMock,
    shellOpenPathMock,
    shellOpenExternalMock,
    restore: () => {
      delete require.cache[mainModulePath]
      delete process.env.JARVIS_SKIP_ELECTRON_BOOTSTRAP
      nodeModuleWithLoad._load = originalLoad
    },
  }
}

describe('main process IPC runtime denial paths', () => {
  let harness: ReturnType<typeof loadMainWithMocks>

  beforeEach(() => {
    harness = loadMainWithMocks()
    harness.mod.registerJarvisIdeIpc()
    harness.mod.registerTerminalIpc()
  })

  afterEach(() => {
    harness.restore()
  })

  it('denies untrusted jarvis-ide-open-files requests before dialog calls', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-open-files')

    const result = await handler?.({ senderFrame: { url: 'https://evil.example' } })

    expect(result).toEqual([])
  })

  it('denies untrusted jarvis-ide-fs-read requests before file system reads', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-fs-read')

    const result = await handler?.({ senderFrame: { url: 'https://evil.example' } }, 'C:/test.txt')

    expect(result).toEqual({ ok: false, error: 'SECURITY: File read restricted' })
  })

  it('denies untrusted jarvis-ide-fs-write requests before file system writes', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-fs-write')

    const result = await handler?.(
      { senderFrame: { url: 'https://evil.example' } },
      { filePath: 'C:/test.txt', content: 'hello' },
    )

    expect(result).toEqual({ ok: false, error: 'SECURITY: File write restricted' })
  })

  it('denies untrusted jarvis-ide-fs-delete requests before file deletion', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-fs-delete')

    const result = await handler?.({ senderFrame: { url: 'https://evil.example' } }, 'C:/test.txt')

    expect(result).toEqual({ ok: false, error: 'SECURITY: File delete restricted' })
  })

  it('denies untrusted jarvis-ide-fs-mkdir requests before directory creation', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-fs-mkdir')

    const result = await handler?.({ senderFrame: { url: 'https://evil.example' } }, 'C:/tmp/secure')

    expect(result).toEqual({ ok: false, error: 'SECURITY: Directory create restricted' })
  })

  it('denies untrusted jarvis-ide-shell-open-path requests before shell invocation', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-shell-open-path')

    const result = await handler?.({ senderFrame: { url: 'https://evil.example' } }, 'C:/test.txt')

    expect(result).toBe('SECURITY: Shell open-path restricted')
    expect(harness.shellOpenPathMock).not.toHaveBeenCalled()
  })

  it('denies untrusted jarvis-ide-open-external requests before shell invocation', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-open-external')

    const result = await handler?.({ senderFrame: { url: 'https://evil.example' } }, 'https://example.com')

    expect(result).toBe(false)
    expect(harness.shellOpenExternalMock).not.toHaveBeenCalled()
  })

  it('rejects trusted jarvis-ide-open-external requests with unsafe scheme before shell invocation', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-open-external')

    const result = await handler?.({ senderFrame: { url: 'http://localhost:5173' } }, 'javascript:alert(1)')

    expect(result).toBe(false)
    expect(harness.shellOpenExternalMock).not.toHaveBeenCalled()
  })

  it('rejects trusted jarvis-ide-open-external requests with URL credentials before shell invocation', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-open-external')

    const result = await handler?.({ senderFrame: { url: 'http://localhost:5173' } }, 'https://user:pass@example.com')

    expect(result).toBe(false)
    expect(harness.shellOpenExternalMock).not.toHaveBeenCalled()
  })

  it('denies untrusted jarvis-ide-quit requests before app quit side effect', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-quit')

    const result = await handler?.({ senderFrame: { url: 'https://evil.example' } })

    expect(result).toBe(false)
    expect(harness.appQuitMock).not.toHaveBeenCalled()
  })

  it('denies untrusted jarvis-ide-run-command requests before process execution', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-run-command')

    const result = await handler?.(
      { senderFrame: { url: 'https://evil.example' } },
      { cwd: process.cwd(), command: 'git status' },
    )

    expect(result).toEqual({
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      error: 'SECURITY: Command execution restricted',
    })
    expect(harness.execFileMock).not.toHaveBeenCalled()
  })

  it('denies untrusted jarvis-ide-git requests before process execution', async () => {
    const handler = harness.registeredHandlers.get('jarvis-ide-git')

    const result = await handler?.(
      { senderFrame: { url: 'https://evil.example' } },
      { cwd: process.cwd(), args: ['status'] },
    )

    expect(result).toEqual({
      ok: false,
      stdout: '',
      stderr: '',
      error: 'SECURITY: Git access restricted',
    })
    expect(harness.execFileMock).not.toHaveBeenCalled()
  })

  it('denies untrusted terminal-create requests before session spawn', async () => {
    const handler = harness.registeredHandlers.get('terminal-create')

    const result = await handler?.(
      { senderFrame: { url: 'https://evil.example' } },
      { cwd: process.cwd() },
    )

    expect(result).toEqual({ ok: false, error: 'SECURITY: Terminal access restricted' })
    expect(harness.spawnMock).not.toHaveBeenCalled()
  })

  it('denies untrusted terminal-write requests before session mutation', async () => {
    const handler = harness.registeredHandlers.get('terminal-write')

    const result = await handler?.(
      { senderFrame: { url: 'https://evil.example' } },
      { id: 1, data: 'echo hi\n' },
    )

    expect(result).toEqual({ ok: false, error: 'SECURITY: Terminal access restricted' })
  })

  it('denies untrusted terminal-kill requests before session mutation', async () => {
    const handler = harness.registeredHandlers.get('terminal-kill')

    const result = await handler?.({ senderFrame: { url: 'https://evil.example' } }, { id: 1 })

    expect(result).toEqual({ ok: false, error: 'SECURITY: Terminal access restricted' })
  })

  it('denies untrusted terminal-list requests with empty response', async () => {
    const handler = harness.registeredHandlers.get('terminal-list')

    const result = await handler?.({ senderFrame: { url: 'https://evil.example' } })

    expect(result).toEqual([])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetJarvisNative = vi.fn()

vi.mock('../../src/lib/jarvis-native-bridge', () => ({
  getJarvisNative: () => mockGetJarvisNative(),
}))

describe('desktop automation tool runner deny-before-side-effect', () => {
  const originalWindow = (globalThis as { window?: unknown }).window

  const terminalCreate = vi.fn()
  const terminalWrite = vi.fn()
  const powershellExec = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    mockGetJarvisNative.mockReturnValue({
      screenSize: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
      powershellExec,
    })

    ;(globalThis as { window?: unknown }).window = {
      jarvisIde: {
        terminalCreate,
        terminalWrite,
      },
    }
  })

  afterEach(() => {
    ;(globalThis as { window?: unknown }).window = originalWindow
  })

  it('rejects invalid cwd before powershell session create side effects', async () => {
    const { runDesktopAutomationTool } = await import('../../src/lib/desktop-automation-tool-runner')

    const result = await runDesktopAutomationTool('powershell_session_create', { cwd: '' })

    expect(result).toBe('Empty cwd')
    expect(terminalCreate).not.toHaveBeenCalled()
  })

  it('rejects invalid session id before powershell session write side effects', async () => {
    const { runDesktopAutomationTool } = await import('../../src/lib/desktop-automation-tool-runner')

    const result = await runDesktopAutomationTool('powershell_session_write', {
      session_id: 0,
      command: 'Get-Date',
    })

    expect(result).toBe('Invalid session_id')
    expect(terminalWrite).not.toHaveBeenCalled()
  })

  it('rejects oversized powershell session write command before terminal write', async () => {
    const { runDesktopAutomationTool } = await import('../../src/lib/desktop-automation-tool-runner')

    const result = await runDesktopAutomationTool('powershell_session_write', {
      session_id: 1,
      command: 'A'.repeat(20001),
    })

    expect(result).toBe('Command too long')
    expect(terminalWrite).not.toHaveBeenCalled()
  })

  it('rejects invalid cwd before powershell execute side effects', async () => {
    const { runDesktopAutomationTool } = await import('../../src/lib/desktop-automation-tool-runner')

    const result = await runDesktopAutomationTool('powershell_execute', {
      command: 'Get-Date',
      cwd: 'C:/tmp\u0000bad',
    })

    expect(result).toBe('cwd contains null bytes')
    expect(powershellExec).not.toHaveBeenCalled()
  })
})

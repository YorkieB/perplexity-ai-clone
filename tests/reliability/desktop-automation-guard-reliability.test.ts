import { describe, expect, it } from 'vitest'
import { validateNativeToolPre } from '../../src/lib/desktop-automation-guard'

describe('desktop automation guard bounds', () => {
  const screenW = 1920
  const screenH = 1080

  it('rejects non-integer or non-positive powershell session_id', () => {
    expect(
      validateNativeToolPre('powershell_session_write', { command: 'Get-Date', session_id: 0 }, screenW, screenH),
    ).toEqual({ ok: false, reason: 'Invalid session_id' })

    expect(
      validateNativeToolPre('powershell_session_write', { command: 'Get-Date', session_id: 1.5 }, screenW, screenH),
    ).toEqual({ ok: false, reason: 'Invalid session_id' })
  })

  it('rejects oversize powershell command payloads', () => {
    const oversized = 'A'.repeat(20001)
    expect(
      validateNativeToolPre('powershell_execute', { command: oversized }, screenW, screenH),
    ).toEqual({ ok: false, reason: 'Command too long' })
  })

  it('rejects invalid cwd for powershell_execute', () => {
    expect(
      validateNativeToolPre('powershell_execute', { command: 'Get-Date', cwd: '' }, screenW, screenH),
    ).toEqual({ ok: false, reason: 'Empty cwd' })

    expect(
      validateNativeToolPre('powershell_execute', { command: 'Get-Date', cwd: 'C:/tmp\u0000bad' }, screenW, screenH),
    ).toEqual({ ok: false, reason: 'cwd contains null bytes' })
  })

  it('accepts bounded powershell_execute and session_create payloads', () => {
    expect(
      validateNativeToolPre('powershell_execute', { command: 'Get-Date', cwd: 'C:/Users' }, screenW, screenH),
    ).toEqual({ ok: true })

    expect(
      validateNativeToolPre('powershell_session_create', { cwd: 'C:/Users' }, screenW, screenH),
    ).toEqual({ ok: true })
  })
})

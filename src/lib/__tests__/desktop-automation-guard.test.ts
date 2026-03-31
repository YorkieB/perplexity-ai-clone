import { describe, expect, it } from '@jest/globals'

import { validateNativeToolPre, validateScreenRegion } from '../desktop-automation-guard'

describe('validateScreenRegion', () => {
  it('accepts undefined region', () => {
    expect(validateScreenRegion(undefined, 1920, 1080).valid).toBe(true)
  })

  it('rejects region outside screen', () => {
    const r = validateScreenRegion({ left: 0, top: 0, width: 5000, height: 100 }, 1920, 1080)
    expect(r.valid).toBe(false)
  })
})

describe('validateNativeToolPre', () => {
  it('blocks coordinates outside screen', () => {
    const r = validateNativeToolPre('native_mouse_click', { x: 99999, y: 1 }, 1920, 1080)
    expect(r.ok).toBe(false)
  })

  it('blocks dangerous hotkey patterns', () => {
    const r = validateNativeToolPre('native_keyboard_hotkey', { combo: 'Alt+F4' }, 1920, 1080)
    expect(r.ok).toBe(false)
  })

  it('allows normal hotkey', () => {
    const r = validateNativeToolPre('native_keyboard_hotkey', { combo: 'ctrl+c' }, 1920, 1080)
    expect(r.ok).toBe(true)
  })
})

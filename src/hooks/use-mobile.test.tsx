import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsMobile } from './use-mobile'

describe('useIsMobile', () => {
  const listeners = new Map<string, (e: MediaQueryListEvent) => void>()
  let innerWidth = 1024

  beforeEach(() => {
    innerWidth = 1024
    listeners.clear()
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
          listeners.set('change', cb)
        },
        removeEventListener: () => {},
      }))
    )
    vi.stubGlobal('innerWidth', innerWidth)
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      get: () => innerWidth,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false on wide viewport', () => {
    innerWidth = 1200
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('returns true on narrow viewport', () => {
    innerWidth = 500
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('updates when matchMedia fires', () => {
    innerWidth = 1200
    const { result, rerender } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    innerWidth = 400
    act(() => {
      listeners.get('change')?.({} as MediaQueryListEvent)
    })
    rerender()
    expect(result.current).toBe(true)
  })

  it('removes listener on unmount', () => {
    const remove = vi.fn()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '',
        addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
          listeners.set('change', cb)
        },
        removeEventListener: remove,
      }))
    )
    const { unmount } = renderHook(() => useIsMobile())
    unmount()
    expect(remove).toHaveBeenCalled()
  })
})

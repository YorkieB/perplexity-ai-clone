import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocalStorage } from './useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('persists updates to localStorage', () => {
    const { result } = renderHook(() =>
      useLocalStorage('test-key', { count: 0 })
    )
    expect(result.current[0]).toEqual({ count: 0 })

    act(() => {
      result.current[1]({ count: 1 })
    })
    expect(result.current[0]).toEqual({ count: 1 })
    expect(localStorage.getItem('test-key')).toBe(JSON.stringify({ count: 1 }))
  })

  it('falls back to initial when stored JSON is corrupt on read', () => {
    localStorage.setItem('bad', 'not-json')
    const { result } = renderHook(() => useLocalStorage('bad', { ok: true }))
    expect(result.current[0]).toEqual({ ok: true })
  })

  it('swallows removeItem failures on deleteStored', () => {
    const rm = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('no remove')
    })
    const { result } = renderHook(() => useLocalStorage('rmf-key', 0))
    act(() => {
      result.current[2]()
    })
    rm.mockRestore()
    expect(result.current[0]).toBe(0)
  })

  it('swallows setItem failures', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('quota')
    }
    const { result } = renderHook(() => useLocalStorage('quota-key', 0))
    act(() => {
      result.current[1](1)
    })
    Storage.prototype.setItem = orig
    spy.mockRestore()
  })

  it('falls back when stringify fails comparing cyclic state', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const { result } = renderHook(() => useLocalStorage('cyc-key', { ok: true }))
    act(() => {
      result.current[1](cyclic as never)
    })
    act(() => {
      localStorage.setItem('cyc-key', JSON.stringify({ ok: true }))
      window.dispatchEvent(
        new CustomEvent('app-local-storage-sync', { detail: { key: 'cyc-key' } })
      )
    })
    expect(result.current[0]).toEqual({ ok: true })
  })

  it('ignores corrupt JSON in cross-tab storage events', () => {
    const { result } = renderHook(() => useLocalStorage('x-key', { v: 1 }))
    act(() => {
      localStorage.setItem('x-key', '{')
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'x-key',
          newValue: '{',
          storageArea: localStorage,
        })
      )
    })
    expect(result.current[0]).toEqual({ v: 1 })
  })

  it('syncs from storage events from other tabs', () => {
    const { result } = renderHook(() =>
      useLocalStorage('sync-key', { v: 0 })
    )
    act(() => {
      localStorage.setItem('sync-key', JSON.stringify({ v: 99 }))
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'sync-key',
          newValue: JSON.stringify({ v: 99 }),
          storageArea: localStorage,
        })
      )
    })
    expect(result.current[0]).toEqual({ v: 99 })
  })

  it('resets to initial when storage key removed externally', () => {
    localStorage.setItem('rm-key', JSON.stringify({ a: 1 }))
    const { result } = renderHook(() => useLocalStorage('rm-key', { a: 0 }))
    act(() => {
      localStorage.removeItem('rm-key')
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'rm-key',
          newValue: null,
          storageArea: localStorage,
        })
      )
    })
    expect(result.current[0]).toEqual({ a: 0 })
  })

  it('removes listeners on unmount', () => {
    const { unmount } = renderHook(() => useLocalStorage('um-key', 1))
    unmount()
  })

  it('deleteStored resets to initial and re-persists default', () => {
    localStorage.setItem('del-key', JSON.stringify({ x: 1 }))
    const { result } = renderHook(() => useLocalStorage('del-key', { x: 0 }))

    act(() => {
      result.current[2]()
    })
    expect(result.current[0]).toEqual({ x: 0 })
    expect(localStorage.getItem('del-key')).toBe(JSON.stringify({ x: 0 }))
  })
})

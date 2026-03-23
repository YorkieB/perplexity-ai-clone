import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

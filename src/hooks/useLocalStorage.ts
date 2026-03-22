import { useCallback, useEffect, useState } from 'react'

const STORAGE_SYNC = 'app-local-storage-sync'

function readStorage<T>(key: string, initial: T): T {
  if (typeof window === 'undefined') return initial
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return initial
    return JSON.parse(raw) as T
  } catch {
    return initial
  }
}

function notifyStorageKey(key: string) {
  window.dispatchEvent(new CustomEvent(STORAGE_SYNC, { detail: { key } }))
}

/**
 * Persisted React state backed by `localStorage` (replaces Spark `useKV`).
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): readonly [T, (update: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => readStorage(key, initialValue))

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      notifyStorageKey(key)
    } catch (e) {
      console.error('Failed to persist to localStorage', e)
    }
  }, [key, value])

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.storageArea !== localStorage || e.key !== key) return
      if (e.newValue === null) {
        setValue(initialValue)
        return
      }
      try {
        setValue(JSON.parse(e.newValue) as T)
      } catch {
        /* ignore corrupt payloads */
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [key, initialValue])

  /** Same-tab sync: multiple hooks may share one localStorage key (e.g. threads, user-settings). */
  useEffect(() => {
    const onSync = (e: Event) => {
      const k = (e as CustomEvent<{ key: string }>).detail?.key
      if (k !== key) return
      setValue((prev) => {
        const next = readStorage(key, initialValue)
        try {
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
        } catch {
          return next
        }
      })
    }
    window.addEventListener(STORAGE_SYNC, onSync)
    return () => window.removeEventListener(STORAGE_SYNC, onSync)
  }, [key, initialValue])

  const setStored = useCallback((update: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof update === 'function' ? (update as (p: T) => T)(prev) : update))
  }, [])

  const deleteStored = useCallback(() => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    setValue(initialValue)
  }, [key, initialValue])

  return [value, setStored, deleteStored] as const
}

import { create } from 'zustand'
import { randomIdSegment } from '@/lib/secure-random'

export type ToastVariant = 'success' | 'warning' | 'info' | 'error'

export type ToastScope = 'browser' | 'ide' | 'terminal' | 'global'

export type Toast = {
  id: string
  message: string
  variant: ToastVariant
  scope?: ToastScope
  timeoutMs?: number
}

type ToastState = {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => string
  removeToast: (id: string) => void
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function clearToastTimer(id: string): void {
  const t = toastTimeouts.get(id)
  if (t) {
    clearTimeout(t)
    toastTimeouts.delete(id)
  }
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (partial) => {
    const id = `jv_${Date.now()}_${randomIdSegment()}`
    const timeoutMs = partial.timeoutMs ?? 3500
    const toast: Toast = { id, ...partial, timeoutMs }
    set((s) => ({ toasts: [...s.toasts, toast] }))

    if (timeoutMs > 0) {
      clearToastTimer(id)
      const tid = setTimeout(() => {
        toastTimeouts.delete(id)
        get().removeToast(id)
      }, timeoutMs)
      toastTimeouts.set(id, tid)
    }
    return id
  },

  removeToast: (id) => {
    clearToastTimer(id)
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
  },
}))

import { useMemo } from 'react'
import { useShallow } from 'zustand/shallow'
import { X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { Toast, ToastScope } from '@/ui/toast/toast-store'
import { useToastStore } from '@/ui/toast/toast-store'

export type ToastHostProps = {
  scope?: ToastScope
}

function toastVisibleInHost(toast: Toast, hostScope: ToastScope | undefined): boolean {
  if (hostScope === undefined) return true
  const s = toast.scope
  if (s === undefined || s === 'global') return true
  return s === hostScope
}

function variantClasses(variant: Toast['variant']): string {
  switch (variant) {
    case 'success':
      return 'border-l-green-600 bg-green-500/15 text-foreground dark:bg-green-950/40'
    case 'warning':
      return 'border-l-amber-500 bg-amber-500/15 text-foreground dark:bg-amber-950/35'
    case 'error':
      return 'border-l-red-600 bg-red-500/15 text-foreground dark:bg-red-950/40'
    default:
      return 'border-l-muted-foreground/40 bg-muted/95 text-foreground'
  }
}

export function ToastHost({ scope }: ToastHostProps) {
  const toasts = useToastStore(useShallow((s) => s.toasts))
  const removeToast = useToastStore((s) => s.removeToast)

  const visible = useMemo(
    () => toasts.filter((t) => toastVisibleInHost(t, scope)),
    [toasts, scope]
  )

  if (visible.length === 0) return null

  return (
    <div
      className="jarvis-toast-host pointer-events-none"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
        zIndex: 9999,
        maxWidth: 'min(100vw - 32px, 380px)',
      }}
    >
      {visible.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-md border border-border/60 border-l-4 px-3 py-2 text-sm shadow-md backdrop-blur-sm',
            variantClasses(t.variant)
          )}
        >
          <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5 opacity-80 hover:opacity-100"
            aria-label="Dismiss"
            onClick={() => removeToast(t.id)}
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      ))}
    </div>
  )
}

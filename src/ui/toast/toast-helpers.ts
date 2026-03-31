import { useToastStore } from '@/ui/toast/toast-store'
import type { ToastScope, ToastVariant } from '@/ui/toast/toast-store'

export function showScopedToast(
  scope: ToastScope,
  message: string,
  variant: ToastVariant = 'info',
  timeoutMs?: number
): string {
  const { addToast } = useToastStore.getState()
  return addToast({ message, variant, scope, timeoutMs })
}

export function showBrowserToast(
  message: string,
  variant: ToastVariant = 'info',
  timeoutMs?: number
): string {
  return showScopedToast('browser', message, variant, timeoutMs)
}

export function showIdeToast(
  message: string,
  variant: ToastVariant = 'info',
  timeoutMs?: number
): string {
  return showScopedToast('ide', message, variant, timeoutMs)
}

export function showTerminalToast(
  message: string,
  variant: ToastVariant = 'info',
  timeoutMs?: number
): string {
  return showScopedToast('terminal', message, variant, timeoutMs)
}

export function showGlobalToast(
  message: string,
  variant: ToastVariant = 'info',
  timeoutMs?: number
): string {
  return showScopedToast('global', message, variant, timeoutMs)
}

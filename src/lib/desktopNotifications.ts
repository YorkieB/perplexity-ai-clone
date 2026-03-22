/**
 * Browser Notification API helpers (client-only). No server push.
 * Requires a secure context (HTTPS or localhost).
 */

export function isNotificationApiSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** Notifications require a secure context except on localhost. */
export function isSecureContextForNotifications(): boolean {
  if (typeof window === 'undefined') return false
  return window.isSecureContext || window.location.hostname === 'localhost'
}

export function canUseDesktopNotifications(): boolean {
  return isNotificationApiSupported() && isSecureContextForNotifications()
}

/**
 * Ask for permission when the user enables notifications in Settings.
 * Returns whether notifications may be shown (granted).
 */
export async function requestEnableNotifications(): Promise<boolean> {
  if (!canUseDesktopNotifications()) return false
  try {
    const p = await Notification.requestPermission()
    return p === 'granted'
  } catch {
    return false
  }
}

/**
 * Show a system notification only when enabled, permission granted, and API works.
 * Call when the tab is in the background to avoid spam (caller should check visibility).
 */
/** First meaningful line for notification body; strips common markdown markers. */
export function notificationBodyFromResponse(text: string): string {
  const flat = text.replace(/\r\n/g, '\n')
  const first = flat.split('\n').find((l) => l.trim().length > 0) ?? flat
  const cleaned = first
    .replace(/^#+\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim()
  if (!cleaned) return 'Response ready'
  if (cleaned.length <= 200) return cleaned
  return `${cleaned.slice(0, 197)}…`
}

export function notifyIfAllowed(
  notificationsEnabled: boolean,
  title: string,
  body: string,
  options?: NotificationOptions
): void {
  if (!notificationsEnabled) return
  if (!canUseDesktopNotifications()) return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, { body, ...options })
    void n
  } catch (e) {
    console.error('Notification failed', e)
  }
}

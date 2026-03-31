/** Typed access to `window.jarvisNative` (Electron preload). */

export function getJarvisNative(): NonNullable<Window['jarvisNative']> | null {
  if (typeof window === 'undefined') return null
  return window.jarvisNative ?? null
}

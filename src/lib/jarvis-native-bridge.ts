/** Typed access to `window.jarvisNative` (Electron preload). */

export const JARVIS_NATIVE_VOICE_BRIDGE_TOKEN = 'jarvis-native-voice-v1' as const

export function getJarvisNative(): NonNullable<Window['jarvisNative']> | null {
  if (typeof window === 'undefined') return null
  return window.jarvisNative ?? null
}

/**
 * Branded check: real Jarvis preload exposes `bridgeToken` + `bridgeVersion` alongside OS automation APIs.
 * Do not treat a truthy `jarvisNative` alone as the voice bridge (see `electron/preload.cjs`).
 */
export function hasJarvisNativeBridgeForVoice(): boolean {
  try {
    const j = (globalThis as Record<string, unknown>).jarvisNative
    if (j == null || typeof j !== 'object' || Array.isArray(j)) return false
    const o = j as Record<string, unknown>
    if (o.bridgeToken !== JARVIS_NATIVE_VOICE_BRIDGE_TOKEN) return false
    if (o.bridgeVersion !== 1) return false
    return true
  } catch {
    return false
  }
}

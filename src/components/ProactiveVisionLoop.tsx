import { useEffect, useRef } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import type { UserSettings } from '@/lib/types'
import { DEFAULT_USER_SETTINGS } from '@/lib/defaults'
import { getJarvisNative } from '@/lib/jarvis-native-bridge'
import { parseProactiveSuggestion, runProactiveVisionObservation } from '@/lib/proactive-vision'
import { toast } from 'sonner'
import { playTts } from '@/lib/tts'
import { isRendererVoiceModeOpen } from '@/lib/voice-mode-ui'

const TICK_MS = 45_000
const MIN_GAP_MS = 30_000

/**
 * Background loop: when proactive vision is enabled and the desktop exposes native capture,
 * periodically analyzes the screen and may show a toast + short TTS suggestion.
 */
export function ProactiveVisionLoop() {
  const [settings] = useLocalStorage<UserSettings>('user-settings', DEFAULT_USER_SETTINGS)
  const lastEndRef = useRef(0)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!settings?.proactiveVision) return

    const id = window.setInterval(() => {
      if (inFlightRef.current) return
      if (!getJarvisNative()) return
      const now = Date.now()
      if (now - lastEndRef.current < MIN_GAP_MS) return

      inFlightRef.current = true

      void (async () => {
        try {
          const raw = await runProactiveVisionObservation()
          lastEndRef.current = Date.now()
          if (!raw) return
          const tip = parseProactiveSuggestion(raw)
          if (!tip) return
          toast.info('Jarvis', { description: tip, duration: 12_000 })
          if (!isRendererVoiceModeOpen()) {
            // eslint-disable-next-line sonarjs/no-nested-functions -- .catch arrow is unavoidable in fire-and-forget async IIFE inside setInterval
            playTts(`Suggestion: ${tip}`).done.catch(() => {})
          }
        } catch {
          /* optional */
        } finally {
          inFlightRef.current = false
        }
      })()
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [settings?.proactiveVision])

  return null
}

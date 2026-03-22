import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import type { UserSettings } from '@/lib/types'
import { DEFAULT_USER_SETTINGS } from '@/lib/types'

/**
 * Applies `UserSettings.themePreference` to next-themes when storage updates.
 * Changing the theme in Settings updates both; this keeps other tabs/devices consistent via useLocalStorage sync.
 */
export function ThemePreferenceSync() {
  const [settings] = useLocalStorage<UserSettings>('user-settings', DEFAULT_USER_SETTINGS)
  const { setTheme } = useTheme()

  useEffect(() => {
    const pref = settings?.themePreference ?? 'system'
    setTheme(pref)
  }, [settings?.themePreference, setTheme])

  return null
}

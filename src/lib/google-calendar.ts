/**
 * Google Calendar API (primary calendar, today) using the same OAuth token as Google Drive.
 * Requires scope `https://www.googleapis.com/auth/calendar.readonly` — reconnect Google in Settings if you connected before this scope was added.
 */

import type { UserSettings } from '@/lib/types'
import { isTokenExpired, refreshAccessToken } from '@/lib/oauth'

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

export interface CalendarEventItem {
  id: string
  summary: string
  start: Date
  htmlLink?: string
  allDay: boolean
}

interface GcalEventRaw {
  id?: string
  summary?: string
  htmlLink?: string
  start?: { dateTime?: string; date?: string }
}

function parseEventStart(raw: GcalEventRaw['start']): Date | null {
  if (!raw) return null
  if (raw.dateTime) return new Date(raw.dateTime)
  if (raw.date) return new Date(`${raw.date}T12:00:00`)
  return null
}

/**
 * Returns a valid Google access token for Drive/Calendar, refreshing if needed and persisting via setSettings.
 */
export async function ensureGoogleAccessToken(
  settings: UserSettings,
  setSettings: (fn: (prev: UserSettings) => UserSettings) => void
): Promise<string | null> {
  let token = settings.oauthTokens?.googledrive
  if (!token?.accessToken) return null

  const clientId = settings.oauthClientIds?.googledrive?.trim()
  const clientSecret = settings.oauthClientSecrets?.googledrive?.trim()

  if (isTokenExpired(token) && token.refreshToken && clientId && clientSecret) {
    const refreshed = await refreshAccessToken('googleDrive', token.refreshToken, clientId, clientSecret)
    if (refreshed) {
      setSettings((prev) => ({
        ...prev,
        oauthTokens: {
          ...prev.oauthTokens,
          googledrive: refreshed,
        },
      }))
      token = refreshed
    } else {
      return null
    }
  }

  if (isTokenExpired(token)) return null
  return token.accessToken
}

/**
 * Lists timed + all-day events for the user's local "today" in the primary calendar.
 */
export async function fetchPrimaryCalendarToday(accessToken: string): Promise<CalendarEventItem[]> {
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const dayEndExclusive = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)

  const u = new URL(EVENTS_URL)
  u.searchParams.set('singleEvents', 'true')
  u.searchParams.set('orderBy', 'startTime')
  u.searchParams.set('maxResults', '20')
  u.searchParams.set('timeMin', dayStart.toISOString())
  u.searchParams.set('timeMax', dayEndExclusive.toISOString())

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (res.status === 403) {
    const err = new Error(
      'Calendar access denied. Reconnect Google in Settings → OAuth (Calendar scope), and ensure the Calendar API is enabled for your Google Cloud project.'
    )
    throw err
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Calendar API ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as { items?: GcalEventRaw[] }
  const items = data.items ?? []
  const out: CalendarEventItem[] = []

  for (const item of items) {
    if (!item.id) continue
    const start = parseEventStart(item.start)
    if (!start) continue
    const allDay = Boolean(item.start?.date && !item.start?.dateTime)
    out.push({
      id: item.id,
      summary: item.summary?.trim() || '(No title)',
      start,
      htmlLink: item.htmlLink,
      allDay,
    })
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime())
  return out
}

export function formatEventTime(ev: CalendarEventItem): string {
  if (ev.allDay) return 'All day'
  return ev.start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

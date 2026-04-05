/**
 * Google Calendar API — full CRUD using the same OAuth token as Google Drive.
 * Requires scope `https://www.googleapis.com/auth/calendar`.
 * Reconnect Google in Settings if you connected before this scope was added.
 */

import type { UserSettings } from '@/lib/types'
import { isTokenExpired, refreshAccessToken } from '@/lib/oauth'

const CAL_BASE = 'https://www.googleapis.com/calendar/v3'
const EVENTS_URL = `${CAL_BASE}/calendars/primary/events`

export interface CalendarEventItem {
  id: string
  summary: string
  start: Date
  end?: Date
  htmlLink?: string
  allDay: boolean
  description?: string
  location?: string
  attendees?: string[]
}

export interface CalendarInfo {
  id: string
  summary: string
  primary: boolean
  accessRole: string
}

interface GcalEventRaw {
  id?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: Array<{ email?: string; displayName?: string }>
}

function parseEventTime(raw: GcalEventRaw['start']): Date | null {
  if (!raw) return null
  if (raw.dateTime) return new Date(raw.dateTime)
  if (raw.date) return new Date(`${raw.date}T12:00:00`)
  return null
}

function parseEventStart(raw: GcalEventRaw['start']): Date | null {
  return parseEventTime(raw)
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

function rawToItem(item: GcalEventRaw): CalendarEventItem | null {
  if (!item.id) return null
  const start = parseEventTime(item.start)
  if (!start) return null
  const end = parseEventTime(item.end)
  const allDay = Boolean(item.start?.date && !item.start?.dateTime)
  return {
    id: item.id,
    summary: item.summary?.trim() || '(No title)',
    start,
    end: end ?? undefined,
    htmlLink: item.htmlLink,
    allDay,
    description: item.description,
    location: item.location,
    attendees: item.attendees?.map(a => a.email || a.displayName || '').filter(Boolean),
  }
}

export async function listCalendarEvents(
  accessToken: string,
  options?: { timeMin?: string; timeMax?: string; calendarId?: string; maxResults?: number; query?: string },
): Promise<CalendarEventItem[]> {
  const calId = encodeURIComponent(options?.calendarId || 'primary')
  const u = new URL(`${CAL_BASE}/calendars/${calId}/events`)
  u.searchParams.set('singleEvents', 'true')
  u.searchParams.set('orderBy', 'startTime')
  u.searchParams.set('maxResults', String(options?.maxResults || 25))

  const now = new Date()
  u.searchParams.set('timeMin', options?.timeMin || now.toISOString())
  if (options?.timeMax) u.searchParams.set('timeMax', options.timeMax)
  if (options?.query) u.searchParams.set('q', options.query)

  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Calendar API ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)

  const data = (await res.json()) as { items?: GcalEventRaw[] }
  return (data.items ?? []).map(rawToItem).filter((e): e is CalendarEventItem => e !== null)
}

export interface NewCalendarEvent {
  summary: string
  description?: string
  location?: string
  startDateTime: string
  endDateTime: string
  allDay?: boolean
  attendees?: string[]
  calendarId?: string
}

export async function createCalendarEvent(
  accessToken: string,
  event: NewCalendarEvent,
): Promise<CalendarEventItem> {
  const calId = encodeURIComponent(event.calendarId || 'primary')
  const body: Record<string, unknown> = {
    summary: event.summary,
    description: event.description,
    location: event.location,
  }

  if (event.allDay) {
    body.start = { date: event.startDateTime.slice(0, 10) }
    body.end = { date: event.endDateTime.slice(0, 10) }
  } else {
    body.start = { dateTime: event.startDateTime }
    body.end = { dateTime: event.endDateTime }
  }

  if (event.attendees?.length) {
    body.attendees = event.attendees.map(email => ({ email }))
  }

  const res = await fetch(`${CAL_BASE}/calendars/${calId}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Calendar create ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)

  const raw = (await res.json()) as GcalEventRaw
  const item = rawToItem(raw)
  if (!item) throw new Error('Failed to parse created event')
  return item
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  updates: Partial<NewCalendarEvent>,
): Promise<CalendarEventItem> {
  const calId = encodeURIComponent(updates.calendarId || 'primary')
  const body: Record<string, unknown> = {}

  if (updates.summary !== undefined) body.summary = updates.summary
  if (updates.description !== undefined) body.description = updates.description
  if (updates.location !== undefined) body.location = updates.location

  if (updates.startDateTime) {
    body.start = updates.allDay
      ? { date: updates.startDateTime.slice(0, 10) }
      : { dateTime: updates.startDateTime }
  }
  if (updates.endDateTime) {
    body.end = updates.allDay
      ? { date: updates.endDateTime.slice(0, 10) }
      : { dateTime: updates.endDateTime }
  }
  if (updates.attendees) {
    body.attendees = updates.attendees.map(email => ({ email }))
  }

  const res = await fetch(`${CAL_BASE}/calendars/${calId}/events/${eventId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Calendar update ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)

  const raw = (await res.json()) as GcalEventRaw
  const item = rawToItem(raw)
  if (!item) throw new Error('Failed to parse updated event')
  return item
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
  calendarId?: string,
): Promise<void> {
  const calId = encodeURIComponent(calendarId || 'primary')
  const res = await fetch(`${CAL_BASE}/calendars/${calId}/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok && res.status !== 410) {
    throw new Error(`Calendar delete ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)
  }
}

export async function listCalendars(accessToken: string): Promise<CalendarInfo[]> {
  const res = await fetch(`${CAL_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Calendar list ${String(res.status)}: ${(await res.text()).slice(0, 200)}`)

  const data = (await res.json()) as { items?: Array<{ id?: string; summary?: string; primary?: boolean; accessRole?: string }> }
  return (data.items ?? [])
    .filter((c): c is { id: string; summary?: string; primary?: boolean; accessRole?: string } => Boolean(c.id))
    .map(c => ({
      id: c.id,
      summary: c.summary || c.id,
      primary: c.primary ?? false,
      accessRole: c.accessRole || 'reader',
    }))
}

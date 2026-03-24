import { useCallback, useEffect, useRef, useState } from 'react'
import { Calendar, CalendarX2, ExternalLink, Loader2 } from 'lucide-react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import type { UserSettings } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { GenericDummyModuleCard } from '@/components/modules/GenericDummyModuleCard'
import {
  ensureGoogleAccessToken,
  fetchPrimaryCalendarToday,
  formatEventTime,
  type CalendarEventItem,
} from '@/lib/google-calendar'

const defaultSettings: UserSettings = {
  apiKeys: {},
  oauthTokens: {},
  oauthClientIds: {},
  oauthClientSecrets: {},
  connectedServices: {
    googledrive: false,
    onedrive: false,
    github: false,
    dropbox: false,
    spotify: false,
  },
}

type CalState =
  | { status: 'loading' }
  | { status: 'needs_connect' }
  | { status: 'ready'; events: CalendarEventItem[] }
  | { status: 'error'; message: string }

interface CalendarModuleCardProps {
  readonly onOpenSettings?: () => void
}

export function CalendarModuleCard({ onOpenSettings }: CalendarModuleCardProps) {
  const [settings, setSettings] = useLocalStorage<UserSettings>('user-settings', defaultSettings)
  const [state, setState] = useState<CalState>({ status: 'loading' })
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const load = useCallback(async () => {
    const s = settingsRef.current
    if (!s?.connectedServices?.googledrive || !s?.oauthTokens?.googledrive) {
      setState({ status: 'needs_connect' })
      return
    }
    setState({ status: 'loading' })
    try {
      const access = await ensureGoogleAccessToken(s, setSettings)
      if (!access) {
        setState({ status: 'needs_connect' })
        return
      }
      const events = await fetchPrimaryCalendarToday(access)
      setState({ status: 'ready', events })
    } catch (e) {
      setState({
        status: 'error',
        message: e instanceof Error ? e.message : 'Could not load calendar',
      })
    }
  }, [setSettings])

  useEffect(() => {
    void load()
  }, [
    load,
    settings.connectedServices.googledrive,
    settings.oauthTokens?.googledrive?.accessToken,
    settings.oauthTokens?.googledrive?.expiresAt,
  ])

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  if (state.status === 'loading') {
    return (
      <GenericDummyModuleCard
        title="Calendar"
        description={`Today · ${todayLabel}`}
        icon={Calendar}
        iconClassName="text-orange-500"
      >
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 py-6">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-xs text-muted-foreground">Loading events…</p>
        </div>
      </GenericDummyModuleCard>
    )
  }

  if (state.status === 'needs_connect') {
    return (
      <GenericDummyModuleCard
        title="Calendar"
        description="Google Calendar"
        icon={Calendar}
        iconClassName="text-orange-500"
      >
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground leading-snug">
            Connect Google in Settings → OAuth to show today’s events from your primary calendar.
          </p>
          {onOpenSettings && (
            <Button type="button" variant="secondary" size="sm" className="w-full" onClick={onOpenSettings}>
              Open Settings
            </Button>
          )}
        </div>
      </GenericDummyModuleCard>
    )
  }

  if (state.status === 'error') {
    return (
      <GenericDummyModuleCard
        title="Calendar"
        description="Could not sync"
        icon={CalendarX2}
        iconClassName="text-muted-foreground"
      >
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground leading-snug">{state.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={() => void load()}>
              Retry
            </Button>
            {onOpenSettings && (
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onOpenSettings}>
                Settings
              </Button>
            )}
          </div>
        </div>
      </GenericDummyModuleCard>
    )
  }

  const { events } = state

  return (
    <GenericDummyModuleCard
      title="Calendar"
      description={`Today · ${todayLabel}`}
      icon={Calendar}
      iconClassName="text-orange-500"
    >
      <div className="space-y-2">
        {events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
            No events scheduled today.
          </p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {events.map((ev) => (
              <li key={ev.id}>
                {ev.htmlLink ? (
                  <a
                    href={ev.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 transition-colors hover:bg-muted/50"
                  >
                    <span className="min-w-0 truncate font-medium">{ev.summary}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatEventTime(ev)}</span>
                  </a>
                ) : (
                  <div className="flex justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
                    <span className="min-w-0 truncate font-medium">{ev.summary}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatEventTime(ev)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <a
          href="https://calendar.google.com/calendar/u/0/r/day"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background/50 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          Open Google Calendar
          <ExternalLink className="size-3" />
        </a>
      </div>
    </GenericDummyModuleCard>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { CloudOff, CloudSun, Loader2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  fetchOpenMeteoForecast,
  formatCoordsShort,
  type OpenMeteoForecastResult,
} from '@/lib/open-meteo-weather'
import {
  DEFAULT_WEATHER_FALLBACK,
  fetchApproximateLocationFromIp,
  formatIpLocationHint,
} from '@/lib/ip-approx-location'
import { GenericDummyModuleCard } from '@/components/modules/GenericDummyModuleCard'

type LocationSource = 'ip' | 'default'

type LoadState =
  | { status: 'locating' }
  | { status: 'loading'; lat: number; lon: number }
  | { status: 'ready'; data: OpenMeteoForecastResult; source: LocationSource; hint?: string }
  | { status: 'error'; message: string; code?: number }

export function WeatherModuleCard() {
  const [state, setState] = useState<LoadState>({ status: 'locating' })

  const loadFromPosition = useCallback(
    async (lat: number, lon: number, source: LocationSource, hint?: string) => {
      setState({ status: 'loading', lat, lon })
      try {
        const data = await fetchOpenMeteoForecast(lat, lon)
        setState({ status: 'ready', data, source, hint })
      } catch (e) {
        setState({
          status: 'error',
          message: e instanceof Error ? e.message : 'Could not load forecast',
        })
      }
    },
    []
  )

  const tryIpThenDefault = useCallback(async () => {
    setState({ status: 'locating' })
    try {
      const ipLoc = await fetchApproximateLocationFromIp()
      const hint = formatIpLocationHint(ipLoc)
      await loadFromPosition(ipLoc.lat, ipLoc.lon, 'ip', hint)
    } catch {
      await loadFromPosition(
        DEFAULT_WEATHER_FALLBACK.lat,
        DEFAULT_WEATHER_FALLBACK.lon,
        'default',
        `Approximate · ${DEFAULT_WEATHER_FALLBACK.label}`
      )
    }
  }, [loadFromPosition])

  useEffect(() => {
    void tryIpThenDefault()
  }, [tryIpThenDefault])

  if (state.status === 'locating') {
    return (
      <GenericDummyModuleCard
        title="Weather"
        description="Getting location…"
        icon={CloudSun}
        iconClassName="text-sky-500"
      >
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 py-8">
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-center text-xs text-muted-foreground">Finding approximate location…</p>
        </div>
      </GenericDummyModuleCard>
    )
  }

  if (state.status === 'loading') {
    return (
      <GenericDummyModuleCard
        title="Weather"
        description={formatCoordsShort(state.lat, state.lon)}
        icon={CloudSun}
        iconClassName="text-sky-500"
      >
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 py-6">
          <Loader2 className="size-7 animate-spin text-sky-500" aria-hidden />
          <p className="text-xs text-muted-foreground">Loading forecast…</p>
        </div>
      </GenericDummyModuleCard>
    )
  }

  if (state.status === 'error') {
    return (
      <GenericDummyModuleCard
        title="Weather"
        description="Location or forecast unavailable"
        icon={CloudOff}
        iconClassName="text-muted-foreground"
      >
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground leading-snug">{state.message}</p>
          <Button type="button" variant="secondary" size="sm" className="w-full gap-2" onClick={() => void tryIpThenDefault()}>
            <MapPin className="size-3.5" />
            Try again
          </Button>
        </div>
      </GenericDummyModuleCard>
    )
  }

  const { data, source, hint } = state
  const coordsLine = `${formatCoordsShort(data.latitude, data.longitude)} · Open-Meteo`
  const sub = hint ? `${hint} · Open-Meteo` : coordsLine

  return (
    <GenericDummyModuleCard
      title="Weather"
      description={sub}
      icon={CloudSun}
      iconClassName="text-sky-500"
    >
      <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums">{Math.round(data.currentTempC)}°</span>
          <span className="text-right text-xs text-muted-foreground leading-snug">{data.currentLabel}</span>
        </div>
        {data.hourly.length > 0 && (
          <div className="grid grid-cols-2 gap-2 text-center text-[10px] text-muted-foreground sm:grid-cols-4">
            {data.hourly.map((h) => (
              <span key={h.label}>
                <span className="block font-medium text-foreground">{Math.round(h.tempC)}°</span>
                {h.label}
              </span>
            ))}
          </div>
        )}
        {source === 'default' && (
          <p className="text-[10px] text-muted-foreground text-center">
            Location is approximate (IP or fallback). Open-Meteo forecast.
          </p>
        )}
      </div>
    </GenericDummyModuleCard>
  )
}

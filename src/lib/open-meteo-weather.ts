/**
 * Open-Meteo forecast (no API key; https://open-meteo.com ). Used by WeatherModuleCard.
 */

export interface OpenMeteoForecastResult {
  currentTempC: number
  currentWeatherCode: number
  currentLabel: string
  hourly: Array<{ label: string; tempC: number }>
  latitude: number
  longitude: number
}

/** WMO Weather interpretation codes (Open-Meteo). */
export function wmoWeatherLabel(code: number): string {
  if (code < 0) return 'Forecast'
  if (code === 0) return 'Clear sky'
  if (code === 1) return 'Mainly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Rain showers'
  if (code >= 85 && code <= 86) return 'Snow showers'
  if (code >= 95 && code <= 99) return 'Thunderstorm'
  return 'Variable'
}

function pickHourlyTemp(
  times: string[],
  temps: (number | null)[],
  targetMs: number
): number | null {
  let best: { idx: number; diff: number } | null = null
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime()
    if (Number.isNaN(t)) continue
    const v = temps[i]
    if (v === null || v === undefined) continue
    const diff = Math.abs(t - targetMs)
    if (!best || diff < best.diff) best = { idx: i, diff }
  }
  return best !== null ? (temps[best.idx] as number) : null
}

export async function fetchOpenMeteoForecast(
  latitude: number,
  longitude: number
): Promise<OpenMeteoForecastResult> {
  const u = new URL('https://api.open-meteo.com/v1/forecast')
  u.searchParams.set('latitude', String(latitude))
  u.searchParams.set('longitude', String(longitude))
  u.searchParams.set('current', 'temperature_2m,weather_code')
  u.searchParams.set('hourly', 'temperature_2m')
  u.searchParams.set('timezone', 'auto')
  u.searchParams.set('forecast_days', '2')

  const res = await fetch(u.toString())
  if (!res.ok) {
    throw new Error(`Weather request failed: ${res.status}`)
  }
  const data = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number }
    hourly?: { time?: string[]; temperature_2m?: (number | null)[] }
  }

  const currentTemp = data.current?.temperature_2m
  const code = data.current?.weather_code ?? -1
  if (currentTemp === undefined || currentTemp === null) {
    throw new Error('Invalid weather response')
  }

  const times = data.hourly?.time ?? []
  const temps = data.hourly?.temperature_2m ?? []
  const now = Date.now()

  const hourly: Array<{ label: string; tempC: number }> = [{ label: 'Now', tempC: currentTemp }]
  for (const h of [3, 6, 9]) {
    const t = pickHourlyTemp(times, temps, now + h * 3600 * 1000)
    if (t !== null) hourly.push({ label: `+${h}h`, tempC: t })
  }

  return {
    currentTempC: currentTemp,
    currentWeatherCode: code,
    currentLabel: wmoWeatherLabel(code),
    hourly,
    latitude,
    longitude,
  }
}

export function formatCoordsShort(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(2)}°${ns} · ${Math.abs(lon).toFixed(2)}°${ew}`
}

/**
 * Approximate lat/lon from the client IP when browser geolocation is unavailable.
 * Uses ipinfo.io public JSON (no API key; rate-limited). CORS allows browser use.
 */

export interface IpApproxLocation {
  lat: number
  lon: number
  city?: string
  region?: string
  country?: string
}

/** Last-resort coordinates so the widget still shows live Open-Meteo data. */
export const DEFAULT_WEATHER_FALLBACK: Readonly<{ lat: number; lon: number; label: string }> = {
  lat: 51.5074,
  lon: -0.1278,
  label: 'London',
}

/**
 * Tries ipinfo.io, then geojs.io. Throws if both fail.
 */
export async function fetchApproximateLocationFromIp(): Promise<IpApproxLocation> {
  try {
    const res = await fetch('https://ipinfo.io/json', { cache: 'no-store' })
    if (res.ok) {
      const data = (await res.json()) as {
        loc?: string
        city?: string
        region?: string
        country?: string
      }
      const parts = data.loc?.split(',').map((s) => parseFloat(s.trim()))
      if (parts && parts.length >= 2) {
        const [lat, lon] = parts
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return {
            lat,
            lon,
            city: data.city,
            region: data.region,
            country: data.country,
          }
        }
      }
    }
  } catch {
    /* try next */
  }

  const res2 = await fetch('https://get.geojs.io/v1/ip/geo.json', { cache: 'no-store' })
  if (!res2.ok) throw new Error('IP location services unavailable')
  const g = (await res2.json()) as {
    latitude?: string | number
    longitude?: string | number
    city?: string
    country?: string
  }
  const lat = typeof g.latitude === 'string' ? parseFloat(g.latitude) : g.latitude
  const lon = typeof g.longitude === 'string' ? parseFloat(g.longitude) : g.longitude
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Invalid IP geolocation response')
  }
  return {
    lat: lat as number,
    lon: lon as number,
    city: g.city,
    country: g.country,
  }
}

export function formatIpLocationHint(loc: IpApproxLocation): string {
  const place = [loc.city, loc.region, loc.country].filter(Boolean).join(', ')
  return place ? `IP · ${place}` : 'IP · approximate'
}

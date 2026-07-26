// Geocoding for birth places — the one network dependency of the natal chart.
// We resolve a typed place to lat/lng + IANA timezone ONCE (Open-Meteo, free,
// no API key) and cache it on the BirthChart, so the wheel renders fully offline
// afterward. A chart without a resolved place degrades to planets-in-signs.

export interface GeoPlace {
  /** short name, e.g. "Portland" */
  name: string
  /** full display label, e.g. "Portland, Oregon, United States" */
  label: string
  lat: number
  /** east positive */
  lng: number
  /** IANA timezone, e.g. "America/Los_Angeles" */
  timezone: string
}

interface OpenMeteoResult {
  name: string
  admin1?: string
  country?: string
  latitude: number
  longitude: number
  timezone: string
}

/** Human-readable "City, Region, Country" from an Open-Meteo result. */
function labelFor(r: OpenMeteoResult): string {
  return [r.name, r.admin1, r.country].filter(Boolean).join(', ')
}

/**
 * Search place candidates for the birth-place typeahead. Returns [] on any
 * failure (offline, no matches) — callers fall back to storing raw text.
 */
export async function searchPlaces(query: string): Promise<GeoPlace[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const url =
      'https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=' +
      encodeURIComponent(q)
    const res = await fetch(url)
    if (!res.ok) return []
    const data = (await res.json()) as { results?: OpenMeteoResult[] }
    return (data.results ?? [])
      .filter((r) => r.timezone && Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
      .map((r) => ({
        name: r.name,
        label: labelFor(r),
        lat: r.latitude,
        lng: r.longitude,
        timezone: r.timezone,
      }))
  } catch {
    return []
  }
}

/**
 * UTC offset in minutes (east positive) for `instant` in the given IANA zone.
 * Uses the platform's IANA tz database via Intl, so historical DST rules apply
 * — no date library needed. Returns 0 if the zone is unknown.
 */
export function tzOffsetMinutes(timezone: string, instant: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const map: Record<string, number> = {}
    for (const p of dtf.formatToParts(instant)) {
      if (p.type !== 'literal') map[p.type] = Number(p.value)
    }
    const asUTC = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second)
    return Math.round((asUTC - instant.getTime()) / 60000)
  } catch {
    return 0
  }
}

// Natal chart computation — pure and deterministic, no network, no persistence.
// Given a BirthChart (date + optional time + cached geocode), compute where the
// Sun, Moon, and planets sat on the ecliptic, plus the Ascendant/Midheaven and
// whole-sign houses when an exact time and location are known. Positions come
// from astronomy-engine (local, no data files); the wheel renders these.
//
// Houses are whole-sign for v1: house 1 is the whole Ascendant sign. It's robust
// at every latitude (unlike Placidus, which degenerates near the poles) and is a
// common modern default. Placidus is a possible later upgrade.

import * as Astronomy from 'astronomy-engine'
import { tzOffsetMinutes } from './geocode'
import type { BirthChart, NatalChart, Placement } from './types'

/** Bodies we place, in traditional chart order, with their glyphs + a plain note. */
export const BODIES = [
  { point: 'Sun', body: 'Sun', glyph: '☉', meaning: 'the core self' },
  { point: 'Moon', body: 'Moon', glyph: '☾', meaning: 'the inner emotional world' },
  { point: 'Mercury', body: 'Mercury', glyph: '☿', meaning: 'mind and voice' },
  { point: 'Venus', body: 'Venus', glyph: '♀', meaning: 'love and taste' },
  { point: 'Mars', body: 'Mars', glyph: '♂', meaning: 'drive and desire' },
  { point: 'Jupiter', body: 'Jupiter', glyph: '♃', meaning: 'growth and faith' },
  { point: 'Saturn', body: 'Saturn', glyph: '♄', meaning: 'structure and limits' },
  { point: 'Uranus', body: 'Uranus', glyph: '♅', meaning: 'change and awakening' },
  { point: 'Neptune', body: 'Neptune', glyph: '♆', meaning: 'dreams and dissolution' },
  { point: 'Pluto', body: 'Pluto', glyph: '♇', meaning: 'depth and rebirth' },
] as const

/** Sign glyphs, aligned to ZODIAC (0 = Aries … 11 = Pisces). */
export const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓']

/** One-word temperament per sign, for the accessible summary line. */
const SIGN_STYLE = [
  'bold and direct', 'steady and sensory', 'quick and curious', 'tender and guarding',
  'warm and proud', 'precise and useful', 'fair and relational', 'intense and probing',
  'restless and seeking', 'patient and climbing', 'inventive and apart', 'porous and dreaming',
]

/** Glyph for a chart point, falling back to the point name for the axes. */
export function glyphFor(point: string): string {
  return BODIES.find((b) => b.point === point)?.glyph ?? (point === 'ASC' ? 'AC' : point === 'MC' ? 'MC' : point)
}

const DEG = Math.PI / 180
const norm360 = (d: number) => ((d % 360) + 360) % 360
const signOf = (lon: number) => Math.floor(norm360(lon) / 30)
const degInSign = (lon: number) => norm360(lon) % 30

function makePlacement(point: string, longitude: number, ascSign: number | null, retrograde?: boolean): Placement {
  const sign = signOf(longitude)
  return {
    point,
    longitude: norm360(longitude),
    sign,
    degree: degInSign(longitude),
    house: ascSign === null ? null : ((sign - ascSign + 12) % 12) + 1,
    retrograde,
  }
}

/** Geocentric true-of-date ecliptic longitude of a body (Moon has its own path). */
export function bodyLongitude(body: string, date: Date): number {
  if (body === 'Moon') return Astronomy.EclipticGeoMoon(date).lon
  const vec = Astronomy.GeoVector(body as Astronomy.Body, date, true)
  return Astronomy.Ecliptic(vec).elon
}

/**
 * Is a planet in apparent retrograde at `date`? Uses the same 6-hour lookahead
 * as the natal chart. Not meaningful for the luminaries (Sun/Moon never retrograde).
 */
export function isRetrograde(body: string, date: Date): boolean {
  const lon = bodyLongitude(body, date)
  const ahead = bodyLongitude(body, new Date(date.getTime() + 6 * 3600_000))
  return norm360(ahead - lon + 180) - 180 < 0
}

/**
 * Convert a local wall-clock birth time in a given IANA zone to the true UTC
 * instant. Iterates once to settle DST boundaries. `time` is "HH:mm".
 */
function wallTimeToUtc(dateStr: string, time: string, timezone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const asIfUtc = Date.UTC(y, mo - 1, d, h, mi)
  const off1 = tzOffsetMinutes(timezone, new Date(asIfUtc))
  const utc1 = new Date(asIfUtc - off1 * 60000)
  const off2 = tzOffsetMinutes(timezone, utc1)
  return off2 === off1 ? utc1 : new Date(asIfUtc - off2 * 60000)
}

/** Mean obliquity of the ecliptic (degrees) for the given instant. */
function meanObliquity(date: Date): number {
  const T = Astronomy.MakeTime(date).tt / 36525
  return 23.439291 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T
}

/** Ascendant + Midheaven ecliptic longitudes from sidereal time, obliquity, latitude. */
function computeAxes(date: Date, lat: number, lng: number): { asc: number; mc: number } {
  const gast = Astronomy.SiderealTime(date) // Greenwich apparent sidereal time, hours
  const ramc = norm360(gast * 15 + lng) // right ascension of the midheaven, degrees
  const eps = meanObliquity(date)
  const mc = norm360(Math.atan2(Math.sin(ramc * DEG), Math.cos(ramc * DEG) * Math.cos(eps * DEG)) / DEG)
  const asc = norm360(
    Math.atan2(
      Math.cos(ramc * DEG),
      -(Math.sin(ramc * DEG) * Math.cos(eps * DEG) + Math.tan(lat * DEG) * Math.sin(eps * DEG)),
    ) / DEG,
  )
  return { asc, mc }
}

/**
 * Compute a natal chart from stored birth data. Returns null when there isn't
 * even a birth date. Degrades honestly: without an exact time + geocoded place,
 * `hasHouses` is false and bodies carry a sign but no house/Ascendant — the Sun
 * sign stays exact regardless, other bodies are computed at local noon.
 */
export function computeNatalChart(chart: BirthChart | null): NatalChart | null {
  if (!chart || chart.skipped || !chart.birthDate) return null

  const hasExactTime = !chart.timeUnknown && !!chart.birthTime
  const geocoded = typeof chart.lat === 'number' && typeof chart.lng === 'number' && !!chart.timezone
  const hasHouses = hasExactTime && geocoded

  // Instant for body positions. With time+zone, the exact birth moment; otherwise
  // local (or UTC) noon — minimizes the Moon's error while we lack a precise time.
  let instant: Date
  if (hasExactTime && chart.timezone) {
    instant = wallTimeToUtc(chart.birthDate, chart.birthTime!, chart.timezone)
  } else if (geocoded && chart.timezone) {
    instant = wallTimeToUtc(chart.birthDate, '12:00', chart.timezone)
  } else {
    instant = new Date(`${chart.birthDate}T12:00:00Z`)
  }

  const axes = hasHouses ? computeAxes(instant, chart.lat!, chart.lng!) : null
  const ascSign = axes ? signOf(axes.asc) : null

  const placements = BODIES.map((b) => {
    const lon = bodyLongitude(b.body, instant)
    let retrograde: boolean | undefined
    if (b.point !== 'Sun' && b.point !== 'Moon') {
      retrograde = isRetrograde(b.body, instant)
    }
    return makePlacement(b.point, lon, ascSign, retrograde)
  })

  return {
    placements,
    ascendant: axes ? makePlacement('ASC', axes.asc, ascSign) : null,
    midheaven: axes ? makePlacement('MC', axes.mc, ascSign) : null,
    hasHouses,
  }
}

/** Plain-language one-liner for a placement, e.g. "Moon in Scorpio — the inner emotional world, intense and probing". */
export function noteFor(p: Placement): string {
  const meaning = BODIES.find((b) => b.point === p.point)?.meaning
  const style = SIGN_STYLE[p.sign]
  return meaning ? `${meaning}, ${style}` : style
}

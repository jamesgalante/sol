const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** "SUN · JUL 20" */
export function formatNight(ts: number): string {
  const d = new Date(ts)
  return `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** "4:32 am" */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  let h = d.getHours()
  const ampm = h < 12 ? 'am' : 'pm'
  h = h % 12 || 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`
}

/** "1:07" from seconds */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Key that groups dreams into "nights" (a night runs until 11am). */
export function nightKey(ts: number): string {
  const d = new Date(ts)
  if (d.getHours() < 11) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/**
 * The most recent night from "now"'s perspective: before 11am that's the
 * night still ongoing; after 11am it's the night that ended this morning.
 */
export function lastNightKey(now: number = Date.now()): string {
  return new Date(now).getHours() < 11 ? nightKey(now) : nightKey(now - 24 * 3600e3)
}

/**
 * Where the sun/moon sits right now, for the dynamic sky background.
 * A deliberately simple, offline model (no geolocation): the sun is up
 * 06:00–18:00 and the moon the other twelve hours. Each arcs left→right
 * (`x`) and peaks mid-window (`altitude`). `warmth` fades the horizon glow
 * from gold by day to cool by night, ramping across a ~90-min band around
 * sunrise/sunset. The sky itself stays dark indigo at all times.
 */
export type SkyState = {
  body: 'sun' | 'moon'
  x: number // 0 (rising, left) → 1 (setting, right)
  altitude: number // 0 at the horizon → 1 at the peak
  warmth: number // 0 (cool night) → 1 (full gold day)
}

const SUNRISE = 6 // hours
const SUNSET = 18
const TWILIGHT = 1.5 // warmth ramp half-width, in hours

export function skyState(now: number = Date.now()): SkyState {
  const d = new Date(now)
  const h = d.getHours() + d.getMinutes() / 60
  const isDay = h >= SUNRISE && h < SUNSET
  // fraction through the body's own up-window (day = 12h, night = 12h wrapping midnight)
  const x = isDay
    ? (h - SUNRISE) / (SUNSET - SUNRISE)
    : ((h < SUNRISE ? h + 24 : h) - SUNSET) / 12
  // parabola peaking at mid-window
  const altitude = 1 - Math.pow(2 * x - 1, 2)
  // warmth: 1 across the day, easing to 0 through twilight and 0 deep at night
  const warmth = clamp01(
    Math.min((h - (SUNRISE - TWILIGHT)) / (2 * TWILIGHT), (SUNSET + TWILIGHT - h) / (2 * TWILIGHT)),
  )
  return { body: isDay ? 'sun' : 'moon', x, altitude, warmth }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/** Label for a night group: "Last night", "FRI · JUL 18", … */
export function nightLabel(ts: number, now: number = Date.now()): string {
  const key = nightKey(ts)
  if (key === lastNightKey(now)) return 'Last night'
  const d = new Date(ts)
  if (d.getHours() < 11) d.setDate(d.getDate() - 1)
  return formatNight(d.getTime())
}

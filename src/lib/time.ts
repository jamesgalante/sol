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

/** Label for a night group: "Last night", "FRI · JUL 18", … */
export function nightLabel(ts: number, now: number = Date.now()): string {
  const key = nightKey(ts)
  if (key === nightKey(now)) return 'Last night'
  const d = new Date(ts)
  if (d.getHours() < 11) d.setDate(d.getDate() - 1)
  return formatNight(d.getTime())
}

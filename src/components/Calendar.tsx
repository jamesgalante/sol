import { useEffect, useMemo, useState } from 'react'
import type { Dream, Mood } from '../lib/types'
import { dreamMood } from '../lib/categorize'
import { Cloud, MOOD_LABEL } from './Cloud'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface NightSummary {
  count: number
  mood: Mood
}

/** One cloud per night; a single nightmare darkens the whole night. */
function summarize(dreams: Dream[]): Map<string, NightSummary> {
  const map = new Map<string, NightSummary>()
  for (const d of dreams) {
    const dt = new Date(d.createdAt)
    if (dt.getHours() < 11) dt.setDate(dt.getDate() - 1)
    const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`
    const mood = dreamMood(d)
    const cur = map.get(key)
    if (!cur) {
      map.set(key, { count: 1, mood })
    } else {
      cur.count += 1
      if (mood === 'dark') cur.mood = 'dark'
      else if (mood === 'bright' && cur.mood !== 'dark') cur.mood = 'bright'
    }
  }
  return map
}

export function Calendar({
  dreams,
  onPickNight,
  onClose,
}: {
  dreams: Dream[]
  onPickNight: (nightKey: string) => void
  onClose: () => void
}) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const nights = useMemo(() => summarize(dreams), [dreams])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<number | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const isFuture = (day: number) => new Date(year, month, day) > today

  return (
    <div className="cal-backdrop" onClick={onClose}>
      <div
        className="cal-sheet"
        role="dialog"
        aria-label="Dream calendar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cal-head">
          <button className="cal-nav" onClick={() => shift(-1)} aria-label="Previous month">
            ←
          </button>
          <div className="cal-title">
            <span className="cal-month">{MONTHS[month]}</span>{' '}
            <span className="cal-year">{year}</span>
          </div>
          <button className="cal-nav" onClick={() => shift(1)} aria-label="Next month">
            →
          </button>
        </div>

        <div className="cal-grid">
          {WEEKDAYS.map((w, i) => (
            <div key={`w${i}`} className="cal-weekday">
              {w}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`b${i}`} />
            const night = nights.get(`${year}-${month}-${day}`)
            return (
              <button
                key={day}
                className="cal-day"
                data-future={isFuture(day)}
                disabled={!night}
                onClick={() => night && onPickNight(`${year}-${month}-${day}`)}
                aria-label={
                  night
                    ? `${MONTHS[month]} ${day} — ${night.count} ${MOOD_LABEL[night.mood]} dream${night.count === 1 ? '' : 's'}`
                    : `${MONTHS[month]} ${day}`
                }
              >
                {night ? (
                  <span className="cal-cloud">
                    <Cloud mood={night.mood} size={18} />
                    {night.count > 1 && <span className="cal-count">{night.count}</span>}
                  </span>
                ) : (
                  <span className="cal-dot" />
                )}
                <span className="cal-num">{day}</span>
              </button>
            )
          })}
        </div>

        <div className="cal-legend">
          {(['dark', 'neutral', 'bright'] as Mood[]).map((m) => (
            <span key={m} className="cal-legend-item">
              <Cloud mood={m} size={13} /> {MOOD_LABEL[m]}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

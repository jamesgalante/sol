import { useEffect, useState } from 'react'
import { listDreams } from '../lib/db'
import { nightKey, nightLabel } from '../lib/time'
import { DreamCard } from '../components/DreamCard'
import { Calendar } from '../components/Calendar'
import { Cloud } from '../components/Cloud'
import type { Dream, View } from '../lib/types'

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function Journal({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [dreams, setDreams] = useState<Dream[] | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [nightFilter, setNightFilter] = useState<string | null>(null)

  useEffect(() => {
    listDreams().then(setDreams)
  }, [])

  if (dreams === null) return null

  if (dreams.length === 0) {
    return (
      <div className="empty">
        <div className="empty-title">Nothing kept yet.</div>
        <div className="empty-sub">
          Dreams dissolve within minutes of waking. Speak first, read later.
        </div>
      </div>
    )
  }

  const now = new Date()
  const visible = nightFilter ? dreams.filter((d) => nightKey(d.createdAt) === nightFilter) : dreams

  const groups: Array<{ key: string; label: string; dreams: Dream[] }> = []
  for (const d of visible) {
    const key = nightKey(d.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.dreams.push(d)
    else groups.push({ key, label: nightLabel(d.createdAt), dreams: [d] })
  }

  return (
    <div>
      <button className="cal-trigger" onClick={() => setShowCalendar(true)}>
        <Cloud mood="neutral" size={14} /> {MONTHS_SHORT[now.getMonth()]} {now.getFullYear()}
      </button>
      <h1 className="screen-title">Journal</h1>

      {nightFilter && (
        <button className="quiet-btn filter-clear" onClick={() => setNightFilter(null)}>
          ← all nights
        </button>
      )}

      {groups.length === 0 && (
        <p className="empty-sub">No dreams kept that night.</p>
      )}

      {groups.map((g) => (
        <section key={g.key} className="night-group">
          <div className="night-label">{g.label}</div>
          {g.dreams.map((d) => (
            <DreamCard key={d.id} dream={d} onOpen={() => onNavigate({ name: 'dream', id: d.id })} />
          ))}
        </section>
      ))}

      {showCalendar && (
        <Calendar
          dreams={dreams}
          onClose={() => setShowCalendar(false)}
          onPickNight={(key) => {
            setNightFilter(key)
            setShowCalendar(false)
          }}
        />
      )}
    </div>
  )
}

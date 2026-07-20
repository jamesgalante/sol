import { useEffect, useState } from 'react'
import { listDreams } from '../lib/db'
import { nightKey, nightLabel } from '../lib/time'
import { DreamCard } from '../components/DreamCard'
import type { Dream, View } from '../lib/types'

export function Journal({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [dreams, setDreams] = useState<Dream[] | null>(null)

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

  const groups: Array<{ key: string; label: string; dreams: Dream[] }> = []
  for (const d of dreams) {
    const key = nightKey(d.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.dreams.push(d)
    else groups.push({ key, label: nightLabel(d.createdAt), dreams: [d] })
  }

  return (
    <div>
      <h1 className="screen-title">Journal</h1>
      {groups.map((g) => (
        <section key={g.key} className="night-group">
          <div className="night-label">{g.label}</div>
          {g.dreams.map((d) => (
            <DreamCard key={d.id} dream={d} onOpen={() => onNavigate({ name: 'dream', id: d.id })} />
          ))}
        </section>
      ))}
    </div>
  )
}

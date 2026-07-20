import { useEffect, useState } from 'react'
import { listDreams } from '../lib/db'
import { nightKey, formatDuration } from '../lib/time'
import { dreamMood } from '../lib/categorize'
import { Cloud, MOOD_LABEL } from '../components/Cloud'
import type { Dream, Mood } from '../lib/types'

const DAY = 24 * 3600e3

interface Computed {
  total: number
  streak: number
  perNight: number // avg over last 30 nights
  spokenSec: number
  moods: Record<Mood, number>
  topTags: Array<[string, number]>
  recurring: Array<[string, number]>
  hours: Array<{ label: string; count: number }>
  weeks: Array<{ label: string; count: number }>
}

function compute(dreams: Dream[]): Computed {
  const nightSet = new Set(dreams.map((d) => nightKey(d.createdAt)))

  // streak: consecutive nights with a dream, ending with the last completed night
  let t = Date.now()
  if (new Date(t).getHours() >= 11) t -= DAY
  let streak = 0
  while (nightSet.has(nightKey(t - streak * DAY))) streak += 1

  const cutoff = Date.now() - 30 * DAY
  const last30 = dreams.filter((d) => d.createdAt >= cutoff)

  const moods: Record<Mood, number> = { dark: 0, neutral: 0, bright: 0 }
  const tagCounts = new Map<string, number>()
  for (const d of dreams) {
    moods[dreamMood(d)] += 1
    for (const tag of d.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])

  const buckets = [
    { label: '12–3a', from: 0, to: 3 },
    { label: '3–6a', from: 3, to: 6 },
    { label: '6–9a', from: 6, to: 9 },
    { label: '9–12', from: 9, to: 12 },
    { label: 'day', from: 12, to: 18 },
    { label: 'eve', from: 18, to: 24 },
  ]
  const hours = buckets.map((b) => ({
    label: b.label,
    count: dreams.filter((d) => {
      const h = new Date(d.createdAt).getHours()
      return h >= b.from && h < b.to
    }).length,
  }))

  // recall trend: dreams per week, oldest → newest, last 6 weeks
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const end = Date.now() - (5 - i) * 7 * DAY
    const start = end - 7 * DAY
    return {
      label: i === 5 ? 'this wk' : `${5 - i}w ago`,
      count: dreams.filter((d) => d.createdAt > start && d.createdAt <= end).length,
    }
  })

  return {
    total: dreams.length,
    streak,
    weeks,
    perNight: last30.length / 30,
    spokenSec: dreams.reduce((s, d) => s + d.durationSec, 0),
    moods,
    topTags: sortedTags.slice(0, 6),
    recurring: sortedTags.filter(([, n]) => n >= 3),
    hours,
  }
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  return (
    <div className="bar-row" title={`${label}: ${count}`}>
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }} />
      </span>
      <span className="bar-value">{count}</span>
    </div>
  )
}

export function Stats() {
  const [dreams, setDreams] = useState<Dream[] | null>(null)

  useEffect(() => {
    listDreams().then(setDreams)
  }, [])

  if (dreams === null) return null

  if (dreams.length === 0) {
    return (
      <div className="empty">
        <div className="empty-title">Numbers need nights.</div>
        <div className="empty-sub">Record a few dreams and the patterns start to show.</div>
      </div>
    )
  }

  const s = compute(dreams)
  const moodTotal = s.moods.dark + s.moods.neutral + s.moods.bright
  const maxTag = s.topTags[0]?.[1] ?? 0
  const maxHour = Math.max(...s.hours.map((h) => h.count))

  return (
    <div>
      <h1 className="screen-title">Stats</h1>

      <div className="tiles">
        <div className="tile">
          <div className="tile-value">{s.streak}</div>
          <div className="tile-label">night streak</div>
        </div>
        <div className="tile">
          <div className="tile-value">{s.total}</div>
          <div className="tile-label">dreams kept</div>
        </div>
        <div className="tile">
          <div className="tile-value">{s.perNight.toFixed(1)}</div>
          <div className="tile-label">per night · 30d</div>
        </div>
        <div className="tile">
          <div className="tile-value">{formatDuration(s.spokenSec)}</div>
          <div className="tile-label">spoken</div>
        </div>
      </div>

      <section className="stat-section">
        <div className="stat-heading">Recall — dreams per week</div>
        {s.weeks.map((w) => (
          <Bar key={w.label} label={w.label} count={w.count} max={Math.max(...s.weeks.map((x) => x.count))} />
        ))}
        <p className="stat-note">
          Recall grows with practice — most people remember more the longer they
          keep speaking them.
        </p>
      </section>

      <section className="stat-section">
        <div className="stat-heading">How they felt</div>
        <div className="mood-bar" role="img" aria-label={`${s.moods.dark} nightmares, ${s.moods.neutral} plain, ${s.moods.bright} bright`}>
          {(['dark', 'neutral', 'bright'] as Mood[]).map(
            (m) =>
              s.moods[m] > 0 && (
                <span
                  key={m}
                  className={`mood-seg mood-seg-${m}`}
                  style={{ flexGrow: s.moods[m] }}
                />
              ),
          )}
        </div>
        <div className="mood-legend">
          {(['dark', 'neutral', 'bright'] as Mood[]).map((m) => (
            <span key={m} className="mood-legend-item">
              <Cloud mood={m} size={13} /> {MOOD_LABEL[m]}{' '}
              <span className="mood-count">
                {moodTotal > 0 ? Math.round((s.moods[m] / moodTotal) * 100) : 0}%
              </span>
            </span>
          ))}
        </div>
      </section>

      {s.topTags.length > 0 && (
        <section className="stat-section">
          <div className="stat-heading">What they were about</div>
          {s.topTags.map(([tag, n]) => (
            <Bar key={tag} label={tag} count={n} max={maxTag} />
          ))}
        </section>
      )}

      <section className="stat-section">
        <div className="stat-heading">When you spoke them</div>
        {s.hours.map((h) => (
          <Bar key={h.label} label={h.label} count={h.count} max={maxHour} />
        ))}
      </section>

      {s.recurring.length > 0 && (
        <section className="stat-section">
          <div className="stat-heading">Recurring</div>
          <div className="tag-row">
            {s.recurring.map(([tag, n]) => (
              <span key={tag} className="tag">
                {tag} ×{n}
              </span>
            ))}
          </div>
          <p className="stat-note">
            Symbols that keep coming back. Deeper analysis arrives with the Circle update.
          </p>
        </section>
      )}
    </div>
  )
}

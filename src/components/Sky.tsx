import { useEffect, useState, type CSSProperties } from 'react'
import { skyState } from '../lib/time'

// Fixed positions — the codebase forbids Math.random, so the star field is
// hardcoded with staggered twinkle delays. Percentages within the sky band.
const STARS = [
  { top: 8, left: 14, delay: 0 },
  { top: 16, left: 78, delay: 1.1 },
  { top: 22, left: 40, delay: 0.5 },
  { top: 12, left: 60, delay: 1.7 },
  { top: 30, left: 88, delay: 0.9 },
  { top: 34, left: 24, delay: 2.1 },
  { top: 6, left: 46, delay: 1.4 },
  { top: 26, left: 8, delay: 0.3 },
  { top: 40, left: 66, delay: 1.9 },
  { top: 18, left: 32, delay: 0.7 },
  { top: 44, left: 52, delay: 1.2 },
  { top: 10, left: 90, delay: 2.3 },
  { top: 38, left: 84, delay: 0.6 },
  { top: 28, left: 70, delay: 1.6 },
]

/**
 * A dev-only clock override: set VITE_SKY_TIME in .env.local to an hour
 * ("14", "14.5") or "HH:MM" ("14:30") to preview the sky at that time.
 * Returns undefined (→ real clock) in production or when unset/unparseable.
 */
function overrideNow(): number | undefined {
  if (!import.meta.env.DEV) return undefined
  const raw = import.meta.env.VITE_SKY_TIME
  if (!raw) return undefined
  const [hStr, mStr] = String(raw).split(':')
  const h = Number(hStr)
  if (Number.isNaN(h)) return undefined
  const m = mStr !== undefined ? Number(mStr) : (h % 1) * 60
  const d = new Date()
  d.setHours(Math.floor(h), Math.floor(m) || 0, 0, 0)
  return d.getTime()
}

/**
 * Full-viewport time-of-day sky behind every screen. Always the dark indigo
 * night (there is no light mode); time is shown by which body is up, where it
 * sits on its arc, and how warm the horizon glow reads. See DESIGN.md.
 */
export function Sky() {
  const [sky, setSky] = useState(() => skyState(overrideNow()))

  useEffect(() => {
    // drift the body across the sky while the app stays open
    const id = setInterval(() => setSky(skyState(overrideNow())), 60_000)
    return () => clearInterval(id)
  }, [])

  // arc: x → horizontal (12%–88%), altitude → vertical (70% low → 12% peak)
  const left = 12 + sky.x * 76
  const top = 70 - sky.altitude * 58
  const nightness = 1 - sky.warmth

  return (
    <div className="sky" aria-hidden>
      <div className="sky-glow" style={{ '--sky-warmth': sky.warmth } as CSSProperties} />
      {nightness > 0 &&
        STARS.map((s, i) => (
          <span
            key={i}
            className="sky-star"
            style={
              {
                top: `${s.top}%`,
                left: `${s.left}%`,
                '--star-o': nightness * 0.9,
                animationDelay: `${s.delay}s`,
              } as CSSProperties
            }
          />
        ))}
      <div
        className={sky.body === 'sun' ? 'sky-sun' : 'sky-moon'}
        style={{ left: `${left}%`, top: `${top}%` }}
      />
    </div>
  )
}

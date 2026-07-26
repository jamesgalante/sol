// The per-dream Sky Reading panel — the "Sky" tab on DreamDetail. Everything
// here is computed on view from the user's stored birth chart + the dream's
// createdAt; nothing is persisted and nothing hits the network.
import { useEffect, useMemo, useState } from 'react'
import type { BirthChart, Dream } from '../lib/types'
import { ZODIAC } from '../lib/types'
import { computeNatalChart, glyphFor, noteFor } from '../lib/astrology'
import { transitSky, skyReading } from '../lib/skyReading'
import { NatalSummary } from './NatalWheel'
import { BirthChartForm } from './BirthChartForm'

export function SkyPanel({
  dream,
  birthChart,
  onChartSaved,
  ready,
}: {
  dream: Dream
  birthChart: BirthChart | null
  onChartSaved: (chart: BirthChart) => void
  /** false while the (simulated) reading is still being "generated" */
  ready: boolean
}) {
  const natal = useMemo(() => computeNatalChart(birthChart), [birthChart])
  const transit = useMemo(() => transitSky(dream.createdAt), [dream.createdAt])
  const reading = useMemo(
    () => (natal ? skyReading(dream, natal, transit) : null),
    [dream, natal, transit],
  )

  // No chart yet (never set up, or skipped) → prompt setup inline, mirroring Me.tsx.
  // Shown immediately — there's nothing to "analyze" without a chart.
  if (!natal || !reading) {
    return (
      <div className="sky-empty">
        <div className="auth-card">
          <div className="auth-title">Add your birth chart</div>
          <p className="natal-caveat">
            A sky reading needs your birth chart — where the Sun, Moon, and planets sat when you
            were born. Add it once and every dream gets read against it.
          </p>
          <BirthChartForm initial={birthChart} onSaved={onChartSaved} />
        </div>
      </div>
    )
  }

  // The reading is composed locally, but we let it "generate" first — see SkyLoader.
  if (!ready) return <SkyLoader />

  const extras = reading.placements.filter(
    (p) => p.point !== 'Sun' && p.point !== 'Moon' && p.point !== 'ASC',
  )

  return (
    <div className="sky-panel">
      {/* 1 — the sky that night (the moment, not the person) */}
      <div className="stat-heading">The sky that night</div>
      <p className="sky-transit">
        <span className="sky-moon-glyph" aria-hidden>
          ☾
        </span>{' '}
        Moon in {ZODIAC[transit.moonSign]} · {transit.moonPhase}
        {transit.retrogrades.length > 0 && <> · {transit.retrogrades.join(', ')} retrograde</>}
      </p>

      {/* 2 — the connection (the reading) */}
      <p className="sky-quote">{reading.narrative[0]}</p>
      {reading.narrative.slice(1).map((para, i) => (
        <p key={i} className="transcript sky-para">
          {para}
        </p>
      ))}

      {/* 3 — placements at play */}
      <div className="stat-heading">Placements at play</div>
      <NatalSummary chart={natal} />
      {!natal.hasHouses && (
        <p className="natal-caveat">No birth time on file — Rising and houses stay hidden.</p>
      )}
      {extras.length > 0 && (
        <div className="sky-cards">
          {extras.map((p) => (
            <div key={p.point} className="sky-card">
              <span className="sky-card-glyph" aria-hidden>
                {glyphFor(p.point)}
              </span>
              <span className="sky-card-point">
                {p.point} in {ZODIAC[p.sign]}
              </span>
              <span className="sky-card-note">{noteFor(p)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 4 — symbol key */}
      {reading.symbolKeys.length > 0 && (
        <>
          <div className="stat-heading">Symbol key</div>
          <div className="tag-row sky-symbols">
            {reading.symbolKeys.map((k) => (
              <span key={k.tag} className="tag sky-symbol">
                {k.tag} → {k.note}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Hardcoded star field (no Math.random — the app forbids it); {top, left} in %,
// delay staggers the twinkle so the sky shimmers rather than blinks in unison.
const STARS = [
  { top: 18, left: 22, delay: 0 },
  { top: 30, left: 74, delay: 0.6 },
  { top: 12, left: 54, delay: 1.2 },
  { top: 52, left: 16, delay: 0.3 },
  { top: 62, left: 68, delay: 0.9 },
  { top: 44, left: 86, delay: 1.5 },
  { top: 70, left: 40, delay: 0.45 },
  { top: 26, left: 38, delay: 1.05 },
]

const LOADER_MESSAGES = ['reading your sky…', 'finding the echoes…', 'listening to the night…']

/**
 * The stand-in for an LLM "generating" the reading: a quiet animated night
 * scene (breathing moon, twinkling stars) with a caption that cycles while the
 * ~5s timer in DreamDetail runs. Purely cosmetic — the reading is already computed.
 */
function SkyLoader() {
  const [msg, setMsg] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setMsg((m) => (m + 1) % LOADER_MESSAGES.length), 1600)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="sky-loader" role="status" aria-live="polite" aria-label="Reading your sky">
      <div className="sky-loader-scene" aria-hidden>
        {STARS.map((s, i) => (
          <span
            key={i}
            className="sky-loader-star"
            style={{ top: `${s.top}%`, left: `${s.left}%`, animationDelay: `${s.delay}s` }}
          />
        ))}
        <span className="sky-loader-moon">☾</span>
      </div>
      <p className="sky-loader-caption">{LOADER_MESSAGES[msg]}</p>
    </div>
  )
}

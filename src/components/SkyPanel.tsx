// The per-dream Sky Reading panel — the "Sky" tab on DreamDetail. Everything
// here is computed on view from the user's stored birth chart + the dream's
// createdAt; nothing is persisted and nothing hits the network.
import { useMemo } from 'react'
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
}: {
  dream: Dream
  birthChart: BirthChart | null
  onChartSaved: (chart: BirthChart) => void
}) {
  const natal = useMemo(() => computeNatalChart(birthChart), [birthChart])
  const transit = useMemo(() => transitSky(dream.createdAt), [dream.createdAt])
  const reading = useMemo(
    () => (natal ? skyReading(dream, natal, transit) : null),
    [dream, natal, transit],
  )

  // No chart yet (never set up, or skipped) → prompt setup inline, mirroring Me.tsx.
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

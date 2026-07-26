// The per-dream Sky Reading panel — the "Sky" tab on DreamDetail. Everything
// here is computed on view from the user's stored birth chart + the dream's
// createdAt; nothing is persisted and nothing hits the network.
import { useEffect, useMemo, useState } from 'react'
import type { BirthChart, Dream } from '../lib/types'
import { ZODIAC } from '../lib/types'
import { computeNatalChart, glyphFor, noteFor } from '../lib/astrology'
import { transitSky, skyReading } from '../lib/skyReading'
import { fetchRemoteNarrative } from '../lib/skyReadingRemote'
import { getCachedReading, saveCachedReading } from '../lib/db'
import type { CachedReading } from '../lib/db'
import { llmEnabled, supabase } from '../lib/supabase'
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
  // The local reading is the fallback AND the source of placements/symbolKeys —
  // those stay deterministic; only the narrative may be overridden by the LLM.
  const localReading = useMemo(
    () => (natal ? skyReading(dream, natal, transit) : null),
    [dream, natal, transit],
  )

  // The prose — both tiers (main + expansion). null → still resolving (show the
  // loader). Resolves, in order, from the IndexedDB cache, the allowlisted LLM
  // path, or the local reading. Any failure / not-allowlisted / offline falls
  // back to local — the app never requires the network.
  const [reading, setReading] = useState<CachedReading | null>(null)
  useEffect(() => {
    if (!natal || !localReading) return
    let cancelled = false
    setReading(null) // show the loader while we resolve
    ;(async () => {
      const cached = await getCachedReading(dream.id)
      if (cancelled) return
      if (cached) return setReading(cached)

      const email = (await supabase?.auth.getSession())?.data.session?.user.email
      if (llmEnabled(email)) {
        try {
          const remote = await fetchRemoteNarrative(dream, natal, transit)
          if (cancelled) return
          await saveCachedReading(dream.id, remote)
          if (cancelled) return
          return setReading(remote)
        } catch {
          /* fall through to the local reading */
        }
      }
      if (!cancelled) {
        setReading({
          narrative: localReading.narrative,
          expandedNarrative: localReading.expandedNarrative,
        })
      }
    })()
    return () => {
      cancelled = true
    }
    // localReading is derived from natal + transit, both in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dream.id, natal, transit])

  // The whole-chart expansion is collapsed by default.
  const [expanded, setExpanded] = useState(false)

  // No chart yet (never set up, or skipped) → prompt setup inline, mirroring Me.tsx.
  // Shown immediately — there's nothing to "analyze" without a chart.
  if (!natal || !localReading) {
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

  // Reading still resolving (cache / LLM / local) — SkyLoader is the pending state.
  if (reading === null) return <SkyLoader />

  const extras = localReading.placements.filter(
    (p) => p.point !== 'Sun' && p.point !== 'Moon' && p.point !== 'ASC',
  )
  // The whole-chart expansion: its own narrative, the extra-planet cards, and
  // the symbol key. Only offer the drop-down if there's something inside it.
  const hasExpansion =
    reading.expandedNarrative.length > 0 || extras.length > 0 || localReading.symbolKeys.length > 0

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

      {/* 2 — the reading (Sun / Moon / Rising) */}
      <p className="sky-quote">{reading.narrative[0]}</p>
      {reading.narrative.slice(1).map((para, i) => (
        <p key={i} className="transcript sky-para">
          {para}
        </p>
      ))}

      {/* 3 — placements at play (the big three) */}
      <div className="stat-heading">Placements at play</div>
      <NatalSummary chart={natal} />
      {!natal.hasHouses && (
        <p className="natal-caveat">No birth time on file — Rising and houses stay hidden.</p>
      )}

      {/* 4 — the whole chart, hidden until asked for */}
      {hasExpansion && (
        <div className="sky-expand">
          <button
            type="button"
            className="sky-expand-btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'hide the whole chart' : 'read the whole chart'}
            <span className="sky-expand-caret" aria-hidden>
              ▾
            </span>
          </button>
          {expanded && (
            <div className="sky-expand-body">
              {reading.expandedNarrative.map((para, i) => (
                <p key={i} className="transcript sky-para">
                  {para}
                </p>
              ))}
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
              {localReading.symbolKeys.length > 0 && (
                <>
                  <div className="stat-heading">Symbol key</div>
                  <div className="tag-row sky-symbols">
                    {localReading.symbolKeys.map((k) => (
                      <span key={k.tag} className="tag sky-symbol">
                        {k.tag} → {k.note}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
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

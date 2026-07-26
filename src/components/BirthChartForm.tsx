import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { saveBirthChart } from '../lib/db'
import { pushBirthChart } from '../lib/sync'
import { searchPlaces, type GeoPlace } from '../lib/geocode'
import type { BirthChart } from '../lib/types'

/**
 * Fields-only — no card/title chrome of its own. Callers wrap this in their
 * own .auth-card/.auth-title, same as SignIn/ClaimName in Circle.tsx.
 *
 * The place field is a typeahead: picking a suggestion caches lat/lng + timezone
 * (Open-Meteo) so the natal chart can place the Ascendant and houses. Typing a
 * place without picking still saves the raw text — the chart then degrades to
 * planets-in-signs rather than guessing a location.
 */
export function BirthChartForm({
  initial,
  onSaved,
  onSkip,
}: {
  initial: BirthChart | null
  onSaved: (chart: BirthChart) => void
  onSkip?: () => void
}) {
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? '')
  const [birthTime, setBirthTime] = useState(initial?.birthTime ?? '')
  const [timeUnknown, setTimeUnknown] = useState(initial?.timeUnknown ?? false)
  const [birthPlace, setBirthPlace] = useState(initial?.placeLabel ?? initial?.birthPlace ?? '')
  const [picked, setPicked] = useState<GeoPlace | null>(
    initial?.lat != null && initial?.lng != null && initial?.timezone
      ? {
          name: initial.placeLabel ?? initial.birthPlace ?? '',
          label: initial.placeLabel ?? initial.birthPlace ?? '',
          lat: initial.lat,
          lng: initial.lng,
          timezone: initial.timezone,
        }
      : null,
  )
  const [results, setResults] = useState<GeoPlace[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const skipQuery = useRef(false) // don't re-search right after a pick

  // Debounced place search — skips the lookup right after the user picks one.
  useEffect(() => {
    if (skipQuery.current) {
      skipQuery.current = false
      return
    }
    const q = birthPlace.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const id = setTimeout(async () => {
      const places = await searchPlaces(q)
      setResults(places)
      setOpen(places.length > 0)
    }, 300)
    return () => clearTimeout(id)
  }, [birthPlace])

  // Open the native date/time picker on any click, not just the small icon —
  // this mirrors the mobile tap-to-open behaviour on desktop browsers.
  // showPicker() needs a user gesture (this click supplies it) and is absent
  // on older browsers, so guard both.
  function openPicker(e: MouseEvent<HTMLInputElement>) {
    try {
      e.currentTarget.showPicker?.()
    } catch {
      // Some browsers throw (e.g. cross-origin frames); fall back to focus.
    }
  }

  function pick(place: GeoPlace) {
    skipQuery.current = true
    setPicked(place)
    setBirthPlace(place.label)
    setResults([])
    setOpen(false)
  }

  async function save() {
    setBusy(true)
    const useGeo = picked && picked.label === birthPlace.trim()
    const chart: BirthChart = {
      birthDate: birthDate || null,
      birthTime: timeUnknown ? null : birthTime || null,
      timeUnknown,
      birthPlace: birthPlace.trim() || null,
      lat: useGeo ? picked!.lat : null,
      lng: useGeo ? picked!.lng : null,
      timezone: useGeo ? picked!.timezone : null,
      placeLabel: useGeo ? picked!.label : null,
      skipped: false,
      updatedAt: Date.now(),
    }
    await saveBirthChart(chart)
    pushBirthChart(chart) // fire-and-forget cloud mirror
    setBusy(false)
    onSaved(chart)
  }

  async function skip() {
    const chart: BirthChart = {
      birthDate: null,
      birthTime: null,
      timeUnknown: false,
      birthPlace: null,
      lat: null,
      lng: null,
      timezone: null,
      placeLabel: null,
      skipped: true,
      updatedAt: Date.now(),
    }
    await saveBirthChart(chart)
    pushBirthChart(chart)
    onSkip?.()
  }

  return (
    <div className="birth-form">
      <label className="birth-field">
        <span className="birth-label">date of birth</span>
        <input
          className="auth-input"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          onClick={openPicker}
        />
      </label>
      <label className="birth-field">
        <span className="birth-label">time of birth</span>
        <input
          className="auth-input"
          type="time"
          value={birthTime}
          disabled={timeUnknown}
          onChange={(e) => setBirthTime(e.target.value)}
          onClick={openPicker}
        />
      </label>
      <label className="birth-check">
        <input
          type="checkbox"
          checked={timeUnknown}
          onChange={(e) => setTimeUnknown(e.target.checked)}
        />
        <span>I don't know my birth time</span>
      </label>
      <div className="birth-field" style={{ position: 'relative' }}>
        <span className="birth-label">place of birth</span>
        <input
          className="auth-input"
          type="text"
          placeholder="Portland, OR"
          value={birthPlace}
          autoComplete="off"
          onChange={(e) => {
            setPicked(null)
            setBirthPlace(e.target.value)
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {open && (
          <ul className="place-menu">
            {results.map((r, i) => (
              <li key={`${r.label}-${i}`}>
                <button type="button" className="place-option" onClick={() => pick(r)}>
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="birth-actions">
        <button className="auth-btn" onClick={save} disabled={busy || !birthDate}>
          {busy ? '…' : 'save'}
        </button>
        {onSkip && (
          <button className="quiet-btn" onClick={skip} disabled={busy}>
            skip for now
          </button>
        )}
      </div>
      <p className="auth-sub birth-note">
        Pick your birth place from the list so we can place your Rising sign and houses. Birth
        time is optional — without it the chart shows planets by sign only, not the Rising sign.
      </p>
    </div>
  )
}

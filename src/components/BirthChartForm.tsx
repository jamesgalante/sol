import { useState } from 'react'
import { saveBirthChart } from '../lib/db'
import { pushBirthChart } from '../lib/sync'
import type { BirthChart } from '../lib/types'

/**
 * Fields-only — no card/title chrome of its own. Callers wrap this in their
 * own .auth-card/.auth-title, same as SignIn/ClaimName in Circle.tsx.
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
  const [birthPlace, setBirthPlace] = useState(initial?.birthPlace ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const chart: BirthChart = {
      birthDate: birthDate || null,
      birthTime: timeUnknown ? null : birthTime || null,
      timeUnknown,
      birthPlace: birthPlace.trim() || null,
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
      skipped: true,
      updatedAt: Date.now(),
    }
    await saveBirthChart(chart)
    pushBirthChart(chart)
    onSkip?.()
  }

  return (
    <>
      <div className="auth-row">
        <input
          className="auth-input"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
      </div>
      <div className="auth-row">
        <input
          className="auth-input"
          type="time"
          value={birthTime}
          disabled={timeUnknown}
          onChange={(e) => setBirthTime(e.target.value)}
        />
      </div>
      <div className="auth-row">
        <label className="auth-sub" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <input
            type="checkbox"
            checked={timeUnknown}
            onChange={(e) => setTimeUnknown(e.target.checked)}
          />
          I don't know my birth time
        </label>
      </div>
      <div className="auth-row">
        <input
          className="auth-input"
          type="text"
          placeholder="Portland, OR"
          value={birthPlace}
          onChange={(e) => setBirthPlace(e.target.value)}
        />
      </div>
      <div className="auth-row">
        <button className="auth-btn" onClick={save} disabled={busy || !birthDate}>
          {busy ? '…' : 'save'}
        </button>
        {onSkip && (
          <button className="quiet-btn" onClick={skip} disabled={busy}>
            skip for now
          </button>
        )}
      </div>
      <div className="auth-sub">
        Birth time is optional — without it the reading skips the Rising sign
        and house-based placements rather than guessing.
      </div>
    </>
  )
}

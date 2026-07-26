// A quiet page of its own for birth details — reached from the profile,
// returns to it on save. The profile only ever shows the result.
import { useEffect, useState } from 'react'
import { getBirthChart, saveBirthChart } from '../lib/db'
import { myBirthChart } from '../lib/sync'
import { BirthChartForm } from '../components/BirthChartForm'
import type { BirthChart as BirthChartData, View } from '../lib/types'

export function BirthChart({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [chart, setChart] = useState<BirthChartData | null | undefined>(undefined)

  useEffect(() => {
    // local first, cloud fallback — same pattern as Profile/DreamDetail
    getBirthChart().then((local) => {
      if (local) return setChart(local)
      myBirthChart().then((remote) => {
        if (remote) saveBirthChart(remote)
        setChart(remote ?? null)
      })
    })
  }, [])

  if (chart === undefined) return null

  return (
    <div>
      <button className="back-link" onClick={() => window.history.back()}>
        ← back
      </button>
      <h1 className="detail-title">Your birth chart</h1>
      <p className="welcome-body chart-page-sub">
        The sky you arrived under. A date is enough to start; an exact time and
        place unlock your rising sign and houses.
      </p>
      <BirthChartForm initial={chart} onSaved={() => onNavigate({ name: 'me' })} />
      <p className="stat-note chart-page-note">
        Birth details are visible only to you — never on your profile, never to
        followers. Only the chart they produce appears, and only where you
        choose.
      </p>
    </div>
  )
}

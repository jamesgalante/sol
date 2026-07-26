// Calls the server-side synthesis endpoint (api/sky-reading.ts). Returns the LLM
// narrative, or throws — callers fall back to the local skyReading(). The chart
// and transit are turned into plain-language lines here so the function (and the
// model) need no astrology code of their own.
import { supabase } from './supabase'
import type { Dream, NatalChart, TransitSky } from './types'
import { ZODIAC } from './types'
import { noteFor } from './astrology'
import { SYMBOL_SIGNIFIERS } from './skyReading'
import { dreamMood } from './categorize'

export async function fetchRemoteNarrative(
  dream: Dream,
  natal: NatalChart,
  transit: TransitSky,
): Promise<string[]> {
  if (!supabase) throw new Error('offline')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('not signed in')

  const natalLines = natal.placements
    .filter((p) => p.point !== 'ASC' && p.point !== 'MC')
    .map((p) => `${p.point} in ${ZODIAC[p.sign]} — ${noteFor(p)}`)
  const transitLine =
    `${transit.moonPhase} Moon in ${ZODIAC[transit.moonSign]}` +
    (transit.retrogrades.length ? `; ${transit.retrogrades.join(', ')} retrograde` : '')
  const symbolLines = dream.tags
    .filter((t) => SYMBOL_SIGNIFIERS[t])
    .map((t) => {
      const s = SYMBOL_SIGNIFIERS[t]
      return `${t} → ${s.point}${s.sign ? ` / ${s.sign}` : ''}: ${s.note}`
    })

  const res = await fetch('/api/sky-reading', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      transcript: dream.transcript,
      tags: dream.tags,
      mood: dreamMood(dream),
      natalLines,
      transitLine,
      symbolLines,
    }),
  })
  if (!res.ok) throw new Error(`sky-reading ${res.status}`)
  const json = (await res.json()) as { narrative: string[] }
  if (!Array.isArray(json.narrative) || json.narrative.length === 0) throw new Error('empty')
  return json.narrative
}

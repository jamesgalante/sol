// The Sky Reading engine — pure, deterministic, no network, no persistence.
// Given a dream, the user's natal chart, and the transiting sky the night the
// dream was recorded, compose a structured reading (see SkyReading in types.ts).
//
// This is the local stand-in for an LLM, exactly like categorize.ts is for
// tagging: the narrative is template-composed from real placements/transits/tags,
// referencing nothing that isn't in the inputs (no invented planets or aspects).
// Keep the SkyReading shape stable so a model call can drop in later.
import { MoonPhase } from 'astronomy-engine'
import type { Dream, Mood, NatalChart, Placement, SkyReading, TransitSky } from './types'
import { ZODIAC } from './types'
import { bodyLongitude, isRetrograde, noteFor, BODIES } from './astrology'
import { dreamMood } from './categorize'

const norm360 = (d: number) => ((d % 360) + 360) % 360
const signOf = (lon: number) => Math.floor(norm360(lon) / 30)
const degInSign = (lon: number) => norm360(lon) % 30

const PLANETS = BODIES.filter((b) => b.point !== 'Sun' && b.point !== 'Moon').map((b) => b.point)

/** Eight moon phases, each spanning 45° of Sun–Moon elongation, centered on the canonical angles. */
const PHASE_NAMES = [
  'new moon',
  'waxing crescent',
  'first quarter',
  'waxing gibbous',
  'full moon',
  'waning gibbous',
  'last quarter',
  'waning crescent',
]

/** Classical elements by sign index — Aries fire, Taurus earth, Gemini air, Cancer water, repeating. */
const ELEMENTS = ['fire', 'earth', 'air', 'water']
const elementOf = (sign: number) => ELEMENTS[sign % 4]

/** One evocative clause per sign, describing the current a Moon in that sign runs on. */
const MOON_IN_SIGN = [
  'a restless, forward-driving current',
  'a slow, sensory, body-anchored current',
  'a quick, scattering, word-filled current',
  'a tender, tidal, protective current',
  'a warm, dramatic, heart-first current',
  'a fine-grained, sorting, worried current',
  'a weighing, relational, mirror-seeking current',
  'a deep, submerged, all-or-nothing current',
  'a roaming, meaning-hungry current',
  'a cool, structural, self-contained current',
  'an odd, electric, far-seeing current',
  'a dissolving, boundless, dreaming current',
]

const MOOD_OPENER: Record<Mood, string> = {
  dark: 'This one came edged with fear or unrest — the kind of night the Moon tends to stir when it crosses shadowed ground.',
  neutral: 'This one kept an even keel, neither bright nor dark, more watched than felt.',
  bright: 'This one ran bright and buoyant — the sort of night the Moon lifts rather than troubles.',
}

/** A dream symbol → the astrological signifier it answers to, and a plain gloss. */
interface Signifier {
  point: string
  sign?: string
  note: string
}

/**
 * Maps the fixed dream tags (categorize.ts LEXICON) to an astrological signifier.
 * Keyword-driven and hand-authored, in the same spirit as the LEXICON itself.
 */
export const SYMBOL_SIGNIFIERS: Record<string, Signifier> = {
  flying: { point: 'Uranus', note: 'breaking free, rising above the ordinary' },
  falling: { point: 'Saturn', note: 'gravity, limits, the ground rushing up' },
  water: { point: 'Moon', sign: 'Pisces', note: 'feeling, tides, the unconscious' },
  chase: { point: 'Mars', note: 'pursuit, threat, the alarm of the body' },
  teeth: { point: 'Saturn', note: 'aging, loss, what holds you together' },
  school: { point: 'Mercury', note: 'being tested, the anxious mind at work' },
  work: { point: 'Saturn', note: 'duty, structure, the weight of the day' },
  family: { point: 'Moon', sign: 'Cancer', note: 'roots, home, the people who raised you' },
  animals: { point: 'Mars', note: 'instinct, appetite, the untamed self' },
  death: { point: 'Pluto', note: 'endings, rebirth, deep transformation' },
  love: { point: 'Venus', note: 'desire, union, what you hold dear' },
  home: { point: 'Moon', sign: 'Cancer', note: 'shelter, belonging, the inner room' },
  travel: { point: 'Jupiter', note: 'seeking, distance, the wider world' },
  lucid: { point: 'Neptune', note: 'dreaming awake, the veil grown thin' },
  night: { point: 'Moon', note: 'the dark, the hours the Moon keeps' },
}

/** The transiting sky at a moment (epoch ms) — Moon-first, since dreaming is Moon-ruled. */
export function transitSky(when: number): TransitSky {
  const date = new Date(when)
  const moonLon = bodyLongitude('Moon', date)
  const phaseAngle = MoonPhase(date) // 0–360, 0 = new, 90 = first quarter, 180 = full
  const idx = Math.floor((norm360(phaseAngle + 22.5) % 360) / 45)
  return {
    moonSign: signOf(moonLon),
    moonDegree: degInSign(moonLon),
    moonPhase: PHASE_NAMES[idx],
    waxing: phaseAngle < 180,
    retrogrades: PLANETS.filter((p) => isRetrograde(p, date)),
  }
}

/**
 * Compose a Sky Reading for one dream. References only the transiting Moon, the
 * dream's own tags/mood, and natal placements that actually exist — no invention.
 */
export function skyReading(dream: Dream, natal: NatalChart, transit: TransitSky): SkyReading {
  const nat = (point: string) => natal.placements.find((p) => p.point === point) ?? null
  const sun = nat('Sun')
  const moon = nat('Moon')

  // Symbols present in this dream that we have a signifier for.
  const matched = dream.tags.filter((t) => SYMBOL_SIGNIFIERS[t])
  const symbolKeys = matched.map((t) => {
    const s = SYMBOL_SIGNIFIERS[t]
    return { tag: t, point: s.point, note: s.sign ? `${s.point} / ${s.sign}` : s.point }
  })

  // Placements the narrative leans on: the big three, plus each matched signifier.
  const wanted = new Set<string>(['Sun', 'Moon'])
  matched.forEach((t) => wanted.add(SYMBOL_SIGNIFIERS[t].point))
  const placements: Placement[] = []
  if (sun) placements.push(sun)
  if (moon) placements.push(moon)
  if (natal.hasHouses && natal.ascendant) placements.push(natal.ascendant)
  for (const b of BODIES) {
    if (b.point === 'Sun' || b.point === 'Moon') continue
    if (!wanted.has(b.point)) continue
    const p = nat(b.point)
    if (p) placements.push(p)
  }

  // ——— narrative: the main reading — Sun/Moon/Rising only ———
  const tSign = ZODIAC[transit.moonSign]
  const rising = natal.hasHouses ? natal.ascendant : null
  const narrative: string[] = []

  // [0] pull-quote line, rendered in the serif display face
  narrative.push(`You dreamt under a ${transit.moonPhase} in ${tSign}.`)

  // [1] the moment — Moon that night + this dream's mood
  narrative.push(
    `Astrology hands the night to the Moon, and that night it swam through ${tSign} — ${MOON_IN_SIGN[transit.moonSign]}. ${MOOD_OPENER[dreamMood(dream)]}`,
  )

  // [2] the natal echo — your own Moon against the transiting one
  if (moon) {
    const same = elementOf(transit.moonSign) === elementOf(moon.sign)
    const rel = same
      ? `both run on ${elementOf(moon.sign)}, so the night's sky and your own inner weather were speaking one language`
      : `the night ran on ${elementOf(transit.moonSign)} while yours runs on ${elementOf(moon.sign)} — a pull between two tides`
    narrative.push(
      `Your own Moon — ${noteFor(moon)} — sits in ${ZODIAC[moon.sign]}. Read together, ${rel}.`,
    )
  }

  // [3] the Sun (and Rising, when a birth time gives us one) — the core self
  if (sun) {
    const risingClause = rising
      ? ` And your ${ZODIAC[rising.sign]} Rising is the face this all wears — ${noteFor(rising)}.`
      : ''
    narrative.push(
      `Your Sun in ${ZODIAC[sun.sign]} — ${noteFor(sun)} — is the light the rest of you turns around.${risingClause}`,
    )
  }

  // ——— expandedNarrative: the whole chart, read against the dream ———
  const expandedNarrative: string[] = []

  // the loudest symbol and the planet it answers to
  if (matched.length > 0) {
    const first = matched[0]
    const s = SYMBOL_SIGNIFIERS[first]
    const p = nat(s.point)
    const where = p ? ` — in your chart it sits in ${ZODIAC[p.sign]}` : ''
    expandedNarrative.push(
      `The ${first} threading through this dream answers to ${s.point}: ${s.note}${where}.`,
    )
  }

  // one line per placement the reading leans on beyond the big three
  const covered = new Set<string>(['Sun', 'Moon', 'ASC'])
  if (matched.length > 0) covered.add(SYMBOL_SIGNIFIERS[matched[0]].point)
  for (const p of placements) {
    if (covered.has(p.point)) continue
    expandedNarrative.push(`${p.point} in ${ZODIAC[p.sign]} — ${noteFor(p)}.`)
  }

  // nothing else pressed on this dream — say so honestly rather than pad
  if (expandedNarrative.length === 0) {
    expandedNarrative.push(
      `The rest of your chart stayed quiet against this dream — no other placement pressed on its symbols tonight.`,
    )
  }

  return { narrative, expandedNarrative, placements, symbolKeys }
}

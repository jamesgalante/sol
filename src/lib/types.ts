/** nightmare ← neutral → bright; drives cloud + chart colors */
export type Mood = 'dark' | 'neutral' | 'bright'

export interface Dream {
  id: string
  /** epoch ms — when the recording started */
  createdAt: number
  durationSec: number
  transcript: string
  /** first words of the transcript, or "Untitled dream" */
  title: string
  tags: string[]
  mood?: Mood
  hasAudio: boolean
  /** visible to your circle's feed — dreams are private unless shared */
  shared?: boolean
  /** on display on your profile, visible to any signed-in visitor */
  pinned?: boolean
}

export type View =
  | { name: 'welcome' }
  | { name: 'record' }
  | { name: 'journal' }
  | { name: 'stats' }
  | { name: 'circle' }
  | { name: 'me' }
  | { name: 'profile'; username: string }
  | { name: 'dream'; id: string }

export interface BirthChart {
  /** "YYYY-MM-DD" */
  birthDate: string | null
  /** "HH:mm" 24h, or null if unknown/unset */
  birthTime: string | null
  /** explicit "I don't know my birth time" flag */
  timeUnknown: boolean
  /** free text as typed, e.g. "Portland, OR" */
  birthPlace: string | null
  /** geocoded latitude, filled in once a place is resolved (Open-Meteo) */
  lat?: number | null
  /** geocoded longitude (east positive) */
  lng?: number | null
  /** IANA timezone of the birth place, e.g. "America/Los_Angeles" */
  timezone?: string | null
  /** resolved display name from geocoding, e.g. "Portland, Oregon, United States" */
  placeLabel?: string | null
  /** true once the user has explicitly dismissed setup without filling data */
  skipped: boolean
  /** epoch ms, local bookkeeping */
  updatedAt: number
}

/** The twelve signs, index 0 = Aries … 11 = Pisces. */
export const ZODIAC = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const
export type Sign = (typeof ZODIAC)[number]

/** A body (planet/luminary) or the Ascendant/Midheaven axis, placed on the wheel. */
export interface Placement {
  /** 'Sun' | 'Moon' | planet name, or 'ASC' | 'MC' for the axes */
  point: string
  /** ecliptic longitude 0–360, measured from 0° Aries */
  longitude: number
  /** 0–11 index into ZODIAC */
  sign: number
  /** 0–30 degrees within the sign */
  degree: number
  /** 1–12 whole-sign house, or null when no exact time/location */
  house: number | null
  /** true when the body's apparent motion is retrograde (not computed for luminaries/axes) */
  retrograde?: boolean
}

/** A computed natal chart, derived deterministically from BirthChart. */
export interface NatalChart {
  placements: Placement[]
  /** Ascendant placement, present only with exact time + geocoded location */
  ascendant: Placement | null
  /** Midheaven placement, present only with exact time + geocoded location */
  midheaven: Placement | null
  /** true when houses/Ascendant could be computed (exact time + lat/lng) */
  hasHouses: boolean
}

/**
 * The transiting sky at a single moment — a dream's `createdAt`. Dreaming is
 * Moon-ruled, so this is Moon-first. Computed deterministically in skyReading.ts.
 */
export interface TransitSky {
  /** transiting Moon's sign, 0–11 index into ZODIAC */
  moonSign: number
  /** transiting Moon's degree within its sign, 0–30 */
  moonDegree: number
  /** eight-phase label, e.g. "waxing gibbous" */
  moonPhase: string
  /** true when the Moon is waxing (Sun–Moon elongation < 180°) */
  waxing: boolean
  /** planets in apparent retrograde that night, by point name */
  retrogrades: string[]
}

/**
 * A structured Sky Reading for one dream — the shape a future LLM could fill.
 * Today it's composed deterministically (skyReading.ts); keep this shape stable
 * so the model call is a drop-in swap.
 */
export interface SkyReading {
  /** 2–4 short paragraphs; the first is a serif pull-quote line */
  narrative: string[]
  /** the natal points the narrative actually leans on */
  placements: Placement[]
  /** the dream's tags mapped to an astrological signifier */
  symbolKeys: { tag: string; point: string; note: string }[]
}

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
  /** future Circle sync — dreams are private unless explicitly shared */
  shared?: boolean
}

export type View =
  | { name: 'record' }
  | { name: 'journal' }
  | { name: 'stats' }
  | { name: 'circle' }
  | { name: 'dream'; id: string }

export interface BirthChart {
  /** "YYYY-MM-DD" */
  birthDate: string | null
  /** "HH:mm" 24h, or null if unknown/unset */
  birthTime: string | null
  /** explicit "I don't know my birth time" flag */
  timeUnknown: boolean
  /** free text, e.g. "Portland, OR" — no geocoding */
  birthPlace: string | null
  /** true once the user has explicitly dismissed setup without filling data */
  skipped: boolean
  /** epoch ms, local bookkeeping */
  updatedAt: number
}

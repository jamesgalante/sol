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

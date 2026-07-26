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
  | { name: 'profile'; username: string }
  | { name: 'dream'; id: string }

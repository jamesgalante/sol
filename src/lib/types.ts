export interface Dream {
  id: string
  /** epoch ms — when the recording started */
  createdAt: number
  durationSec: number
  transcript: string
  /** first words of the transcript, or "Untitled dream" */
  title: string
  tags: string[]
  hasAudio: boolean
}

export type View =
  | { name: 'record' }
  | { name: 'journal' }
  | { name: 'circle' }
  | { name: 'dream'; id: string }

// Keyword-based dream tagging — the local stand-in for LLM categorization.
// Replace with a model call later; keep the same signature.
import type { Mood } from './types'

const LEXICON: Record<string, string[]> = {
  flying: ['fly', 'flying', 'flew', 'float', 'floating', 'soar', 'hover'],
  falling: ['fall', 'falling', 'fell', 'plummet', 'drop', 'cliff'],
  water: ['water', 'ocean', 'sea', 'swim', 'drown', 'wave', 'river', 'lake', 'flood', 'rain'],
  chase: ['chase', 'chased', 'chasing', 'running from', 'ran from', 'follow', 'escape', 'hide', 'hiding'],
  teeth: ['teeth', 'tooth'],
  school: ['school', 'exam', 'test', 'class', 'homework', 'late for', 'unprepared', 'lecture'],
  work: ['work', 'office', 'boss', 'job', 'meeting', 'lab', 'deadline'],
  family: ['mom', 'mother', 'dad', 'father', 'brother', 'sister', 'grandma', 'grandpa', 'family', 'parents'],
  animals: ['dog', 'cat', 'snake', 'bird', 'wolf', 'spider', 'horse', 'bear', 'animal', 'fish'],
  death: ['die', 'died', 'dying', 'death', 'dead', 'funeral', 'ghost'],
  love: ['kiss', 'love', 'crush', 'wedding', 'date', 'ex', 'girlfriend', 'boyfriend'],
  home: ['house', 'home', 'childhood', 'room', 'apartment', 'door', 'hallway'],
  travel: ['airport', 'plane', 'train', 'car', 'driving', 'road', 'trip', 'lost', 'city'],
  lucid: ['lucid', 'knew i was dreaming', 'realized i was dreaming', 'woke up inside'],
  night: ['dark', 'night', 'moon', 'stars', 'shadow'],
}

/** Whole-word occurrence count — "studied" must not match "died". */
function countHits(text: string, words: string[]): number {
  let n = 0
  for (const w of words) {
    const pattern = new RegExp(`\\b${w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    n += (text.match(pattern) ?? []).length
  }
  return n
}

export function categorize(transcript: string): string[] {
  const text = transcript.toLowerCase()
  const scores: Array<[string, number]> = []
  for (const [tag, words] of Object.entries(LEXICON)) {
    const score = countHits(text, words)
    if (score > 0) scores.push([tag, score])
  }
  return scores
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag)
}

const DARK_WORDS = [
  'nightmare', 'scared', 'terrified', 'afraid', 'fear', 'panic', 'monster',
  'trapped', 'screaming', 'scream', 'blood', 'chasing', 'chased', 'following me',
  'followed me', 'dying', 'died', 'death', 'dead', "couldn't move", 'drowning',
  'crying', 'alone', 'anxious', 'anxiety', 'horrible', 'creepy', 'shadow',
]
const BRIGHT_WORDS = [
  'flying', 'beautiful', 'happy', 'laughing', 'laughed', 'amazing', 'wonderful',
  'love', 'loved', 'warm', 'singing', 'peaceful', 'lucid', 'magic', 'magical',
  'glowing', 'golden', 'incredible', 'free', 'floating', 'sunlight',
]

export function detectMood(transcript: string): Mood {
  const text = transcript.toLowerCase()
  const dark = countHits(text, DARK_WORDS)
  const bright = countHits(text, BRIGHT_WORDS)
  if (dark > bright) return 'dark'
  if (bright > dark) return 'bright'
  return 'neutral'
}

/** Mood for any dream, deriving it for dreams saved before moods existed. */
export function dreamMood(d: { mood?: Mood; transcript: string }): Mood {
  return d.mood ?? detectMood(d.transcript)
}

export function titleFrom(transcript: string): string {
  const words = transcript.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'Untitled dream'
  const head = words.slice(0, 7).join(' ')
  return words.length > 7 ? head + '…' : head
}

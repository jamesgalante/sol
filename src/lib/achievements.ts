// Streaks earn cloud colors; deeds earn items your cloud wears.
// Unlocks are computed from your local dreams and merged into the profile,
// so they survive device changes once synced.
import type { Dream } from './types'
import { nightKey } from './time'
import { dreamMood } from './categorize'

const DAY = 24 * 3600e3

export function computeStreak(dreams: Dream[], now: number = Date.now()): number {
  const nights = new Set(dreams.map((d) => nightKey(d.createdAt)))
  let t = now
  if (new Date(t).getHours() >= 11) t -= DAY
  let streak = 0
  while (nights.has(nightKey(t - streak * DAY))) streak += 1
  return streak
}

export type CloudColor = 'fog' | 'moonlit' | 'dusk' | 'aurora' | 'sunlit' | 'midnight' | 'solar'

export interface ColorDef {
  id: CloudColor
  name: string
  streak: number // nights in a row required (0 = everyone)
  fill: string
}

export const CLOUD_COLORS: ColorDef[] = [
  { id: 'fog', name: 'a regular cloud', streak: 0, fill: '#8b90a5' },
  { id: 'moonlit', name: 'moonlit', streak: 3, fill: '#c9d0e3' },
  { id: 'dusk', name: 'dusk', streak: 7, fill: '#a89fd0' },
  { id: 'aurora', name: 'aurora', streak: 14, fill: '#8fb8a8' },
  { id: 'sunlit', name: 'sunlit', streak: 30, fill: '#ecb35f' },
  { id: 'midnight', name: 'midnight', streak: 60, fill: '#2a3046' },
  { id: 'solar', name: 'solar', streak: 100, fill: '#ecb35f' },
]

export type ItemId = 'cap' | 'star' | 'bolt' | 'lining' | 'flag' | 'moon'

export interface AchievementDef {
  id: string
  name: string
  hint: string
  item: ItemId
  earned: (dreams: Dream[]) => boolean
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-dream',
    name: 'First light',
    hint: 'Keep your first dream',
    item: 'cap',
    earned: (ds) => ds.length >= 1,
  },
  {
    id: 'ten-dreams',
    name: 'Regular',
    hint: 'Keep ten dreams',
    item: 'star',
    earned: (ds) => ds.length >= 10,
  },
  {
    id: 'storm-rider',
    name: 'Storm rider',
    hint: 'Keep a nightmare instead of losing it',
    item: 'bolt',
    earned: (ds) => ds.some((d) => dreamMood(d) === 'dark'),
  },
  {
    id: 'silver-lining',
    name: 'Silver lining',
    hint: 'Share a dream to your circle',
    item: 'lining',
    earned: (ds) => ds.some((d) => d.shared),
  },
  {
    id: 'on-display',
    name: 'On display',
    hint: 'Pin a dream to your profile',
    item: 'flag',
    earned: (ds) => ds.some((d) => d.pinned),
  },
  {
    id: 'before-the-sun',
    name: 'Before the sun',
    hint: 'Record a dream before 6am',
    item: 'moon',
    earned: (ds) => ds.some((d) => new Date(d.createdAt).getHours() < 6),
  },
]

/** Everything these dreams have earned: 'streak-N' + achievement ids. */
export function deriveUnlocks(dreams: Dream[]): string[] {
  const streak = computeStreak(dreams)
  const unlocks: string[] = []
  for (const c of CLOUD_COLORS) {
    if (c.streak > 0 && streak >= c.streak) unlocks.push(`streak-${c.streak}`)
  }
  for (const a of ACHIEVEMENTS) {
    if (a.earned(dreams)) unlocks.push(a.id)
  }
  return unlocks
}

export function colorUnlocked(def: ColorDef, unlocks: string[]): boolean {
  return def.streak === 0 || unlocks.includes(`streak-${def.streak}`)
}

export function itemsEarned(unlocks: string[]): ItemId[] {
  return ACHIEVEMENTS.filter((a) => unlocks.includes(a.id)).map((a) => a.item)
}

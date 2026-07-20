import type { Mood } from '../lib/types'

/** Small cloud glyph tinted by dream mood. Never color-alone: pair with a
 *  label or count wherever the mood distinction carries meaning. */
export function Cloud({ mood, size = 16 }: { mood: Mood; size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.7}
      viewBox="0 0 24 17"
      className={`cloud cloud-${mood}`}
      aria-hidden
    >
      <path d="M19.4 16.5H6.1a5.6 5.6 0 0 1-1.2-11 7.1 7.1 0 0 1 13.8-1.3 5.2 5.2 0 0 1 5.3 5.1 5.2 5.2 0 0 1-4.6 7.2z" />
    </svg>
  )
}

export const MOOD_LABEL: Record<Mood, string> = {
  dark: 'nightmare',
  neutral: 'plain',
  bright: 'bright',
}

import type { Dream } from '../lib/types'
import { formatClock, formatDuration } from '../lib/time'
import { dreamMood } from '../lib/categorize'
import { Cloud } from './Cloud'

export function DreamCard({ dream, onOpen }: { dream: Dream; onOpen: () => void }) {
  return (
    <button className="dream-card" onClick={onOpen}>
      <div className="dream-card-title">{dream.title}</div>
      <div className="dream-card-meta">
        <Cloud mood={dreamMood(dream)} size={14} />
        <span>{formatClock(dream.createdAt)}</span>
        <span>{formatDuration(dream.durationSec)}</span>
        {dream.tags.length > 0 && (
          <span className="tag-row">
            {dream.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </span>
        )}
      </div>
    </button>
  )
}

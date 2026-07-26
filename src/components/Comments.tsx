// Comments under a shared or pinned dream. Visibility mirrors the dream's
// own reach (enforced by RLS); the dreamer can delete anything on their
// dream, everyone can delete their own words.
import { useEffect, useState } from 'react'
import {
  addComment,
  deleteComment,
  listComments,
  currentUserId,
  type DreamComment,
} from '../lib/sync'
import type { View } from '../lib/types'

export function Comments({
  dreamId,
  ownerView = false,
  onNavigate,
}: {
  dreamId: string
  /** true when the viewer owns the dream — shows delete on every comment */
  ownerView?: boolean
  onNavigate?: (v: View) => void
}) {
  const [items, setItems] = useState<DreamComment[] | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    currentUserId().then(setUid)
    listComments(dreamId).then(setItems)
  }, [dreamId])

  async function send() {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    setError('')
    const r = await addComment(dreamId, body)
    setBusy(false)
    if (r.error || !r.comment) return setError(r.error ?? 'could not comment')
    setItems([...(items ?? []), r.comment])
    setDraft('')
  }

  async function remove(id: string) {
    await deleteComment(id)
    setItems((items ?? []).filter((c) => c.id !== id))
  }

  if (items === null) return null

  return (
    <div className="comments" onClick={(e) => e.stopPropagation()}>
      {items.length > 0 && (
        <div className="comments-list">
          {items.map((c) => (
            <div key={c.id} className="comment-row">
              <span
                className={`comment-author${onNavigate ? ' comment-author-link' : ''}`}
                role={onNavigate ? 'link' : undefined}
                onClick={() => onNavigate?.({ name: 'profile', username: c.username })}
              >
                @{c.username}
              </span>
              <span className="comment-body">{c.body}</span>
              {(ownerView || c.userId === uid) && (
                <button
                  className="comment-del"
                  aria-label="Delete comment"
                  onClick={() => remove(c.id)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="auth-row comment-input-row">
        <input
          className="auth-input"
          placeholder={items.length === 0 ? 'Say something about this dream…' : 'Reply…'}
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="auth-btn" onClick={send} disabled={busy || !draft.trim()}>
          {busy ? '…' : 'send'}
        </button>
      </div>
      {error && <div className="auth-error">{error}</div>}
    </div>
  )
}

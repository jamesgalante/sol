// The social layer. Three modes:
//  - no cloud config      → preview with example data
//  - cloud, signed out    → sign-in (email code / magic link) + preview
//  - signed in            → the real thing: follow, feed, friend stats
import { useEffect, useState } from 'react'
import { supabase, cloudEnabled } from '../lib/supabase'
import {
  feed,
  follow,
  following,
  myProfile,
  pushAll,
  type FeedDream,
  type Profile,
} from '../lib/sync'
import { listDreams } from '../lib/db'
import { formatClock } from '../lib/time'
import { Cloud } from '../components/Cloud'
import { CloudAvatar } from '../components/CloudAvatar'
import { Comments } from '../components/Comments'
import { itemsEarned } from '../lib/achievements'
import type { Mood, View } from '../lib/types'

export function Circle({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [session, setSession] = useState<boolean | null>(cloudEnabled() ? null : false)
  // undefined = still asking the server; null = confirmed no profile yet
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setChecked(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(Boolean(data.session))
      setChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(Boolean(s))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) {
      setProfile(undefined)
      myProfile().then(setProfile)
    } else setProfile(null)
  }, [session])

  // first sign-in with a profile: mirror local dreams to the cloud
  useEffect(() => {
    if (session && profile) listDreams().then(pushAll)
  }, [session, profile?.id])

  if (!checked) return null
  // profile still loading — never flash the wrong gate
  if (session && profile === undefined) return null

  if (!cloudEnabled()) {
    return (
      <div>
        <h1 className="screen-title">Circle</h1>
        <HowItWorks />
        <p className="stat-note">
          Cloud isn't configured in this build — set VITE_SUPABASE_URL and
          VITE_SUPABASE_ANON_KEY to enable sign-in.
        </p>
      </div>
    )
  }

  if (!session || !profile) {
    return (
      <div>
        <h1 className="screen-title">Circle</h1>
        <button className="goto-card" onClick={() => onNavigate({ name: 'me' })}>
          <span className="auth-title">
            {!session ? 'Sign in on your profile' : 'Name your cloud first'}
          </span>
          <span className="goto-arrow">→</span>
        </button>
        <HowItWorks />
      </div>
    )
  }

  return <LiveCircle onNavigate={onNavigate} />
}

/* ——— the real circle: your people, then their dreams ——— */
function LiveCircle({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [friends, setFriends] = useState<Profile[]>([])
  const [dreams, setDreams] = useState<FeedDream[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  async function refresh() {
    setFriends(await following())
    setDreams(await feed())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function add() {
    setError('')
    const r = await follow(name.trim().toLowerCase().replace(/^@/, ''))
    if (r.error) setError(r.error)
    else {
      setName('')
      setAdding(false)
      refresh()
    }
  }

  return (
    <div>
      <h1 className="screen-title">Circle</h1>

      <div className="friends-row">
        {friends.map((f) => (
          <button
            key={f.id}
            className="friend-cloud"
            onClick={() => onNavigate({ name: 'profile', username: f.username })}
          >
            <CloudAvatar
              color={(f.cloud?.color as any) ?? 'fog'}
              items={itemsEarned(f.unlocks ?? [])}
              size={46}
            />
            <span className="friend-cloud-name">@{f.username}</span>
          </button>
        ))}
        <button
          className="friend-add"
          aria-label="Follow someone"
          aria-expanded={adding}
          onClick={() => setAdding(!adding)}
        >
          +
        </button>
      </div>

      {adding && (
        <div className="follow-inline">
          <div className="auth-row">
            <span className="auth-at">@</span>
            <input
              className="auth-input"
              placeholder="their name"
              value={name}
              autoFocus
              autoCapitalize="none"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <button className="auth-btn" onClick={add} disabled={name.trim().length < 3}>
              follow
            </button>
          </div>
          {error && <div className="auth-error">{error}</div>}
        </div>
      )}

      {dreams !== null && dreams.length === 0 && (
        <p className="empty-sub" style={{ marginBottom: '2rem' }}>
          {friends.length === 0
            ? 'Your circle is empty — tap + and follow a friend. Their shared dreams land here, night by night.'
            : 'Nothing shared yet. Dreams stay private until a friend shares one.'}
        </p>
      )}

      {dreams !== null && dreams.length > 0 && (
        <section className="night-group">
          <div className="night-label">From your circle</div>
          {dreams.map((d) => (
            <div key={d.id} className="dream-card feed-card">
              <span
                className="circle-author circle-author-link"
                role="link"
                onClick={() => onNavigate({ name: 'profile', username: d.username })}
              >
                @{d.username}
              </span>
              <button
                className="feed-open"
                aria-expanded={open === d.id}
                onClick={() => setOpen(open === d.id ? null : d.id)}
              >
                <div className="dream-card-title">{d.title}</div>
                <div className="dream-card-meta">
                  <Cloud mood={d.mood as Mood} size={14} />
                  <span>{formatClock(d.createdAt)}</span>
                  <span className="tag-row">
                    {d.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </span>
                </div>
              </button>
              {open === d.id && (
                <>
                  <p className="feed-transcript">{d.transcript}</p>
                  <Comments dreamId={d.id} onNavigate={onNavigate} />
                </>
              )}
            </div>
          ))}
        </section>
      )}

    </div>
  )
}

/* ——— signed-out pitch ——— */
function HowItWorks() {
  return (
    <section className="stat-section">
      <div className="stat-heading">How it works</div>
      <ul className="how-list">
        <li>Everything you record is private by default. Sharing is per-dream.</li>
        <li>Follow friends by name and wake up to what they chose to share.</li>
        <li>
          Their stats — streak, nightmares, themes — are visible even when
          their dreams aren't. The shape of their nights, not the content.
        </li>
      </ul>
    </section>
  )
}

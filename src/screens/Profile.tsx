// A person's page: name, bio, the shape of their nights, pinned dreams.
// Your own profile is editable in place. Pinned dreams are the deliberately
// public shelf — anyone signed in can read them here.
import { useEffect, useState } from 'react'
import { cloudEnabled } from '../lib/supabase'
import {
  follow,
  unfollow,
  isFollowing,
  friendStats,
  myProfile,
  pinnedDreams,
  profileByUsername,
  updateProfile,
  type FeedDream,
  type FriendStats,
  type Profile as ProfileRow,
} from '../lib/sync'
import { formatNight } from '../lib/time'
import { Cloud } from '../components/Cloud'
import { Sheep } from '../components/Sheep'
import type { View } from '../lib/types'

export function Profile({ username, onNavigate }: { username: string; onNavigate: (v: View) => void }) {
  const [state, setState] = useState<'loading' | 'signed-out' | 'missing' | 'ready'>('loading')
  const [person, setPerson] = useState<ProfileRow | null>(null)
  const [me, setMe] = useState<ProfileRow | null>(null)
  const [stats, setStats] = useState<FriendStats | null>(null)
  const [pinned, setPinned] = useState<FeedDream[]>([])
  const [followed, setFollowed] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [bioDraft, setBioDraft] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setState('loading')
    ;(async () => {
      if (!cloudEnabled()) return setState('signed-out')
      const my = await myProfile()
      if (!alive) return
      setMe(my)
      if (!my) return setState('signed-out')
      const p = await profileByUsername(username)
      if (!alive) return
      if (!p) return setState('missing')
      setPerson(p)
      setState('ready')
      pinnedDreams(p.id).then((d) => alive && setPinned(d))
      friendStats(p.id).then((s) => alive && setStats(s))
      if (p.id !== my.id) isFollowing(p.id).then((f) => alive && setFollowed(f))
    })()
    return () => {
      alive = false
    }
  }, [username])

  if (state === 'loading') return null

  if (state === 'signed-out') {
    return (
      <div className="empty">
        <div className="empty-title">Profiles live behind sign-in.</div>
        <div className="empty-sub">Sign in on the circle tab to visit people's pages.</div>
      </div>
    )
  }

  if (state === 'missing' || !person) {
    return (
      <div className="empty">
        <div className="empty-title">No one named @{username} yet.</div>
        <div className="empty-sub">Names are claimed on the circle tab.</div>
      </div>
    )
  }

  const mine = me?.id === person.id

  async function saveProfile() {
    setError('')
    const r = await updateProfile({
      display_name: nameDraft.trim() || null,
      bio: bioDraft.trim() || null,
    })
    if (r.error) return setError(r.error)
    setPerson({ ...person!, display_name: nameDraft.trim() || null, bio: bioDraft.trim() || null })
    setEditing(false)
  }

  async function toggleFollow() {
    if (followed) {
      await unfollow(person!.id)
      setFollowed(false)
    } else {
      const r = await follow(person!.username)
      if (!r.error) setFollowed(true)
    }
  }

  return (
    <div>
      <button className="back-link" onClick={() => onNavigate({ name: 'circle' })}>
        ← circle
      </button>

      <div className="profile-head">
        <div>
          <h1 className="detail-title">{person.display_name || `@${person.username}`}</h1>
          <div className="profile-handle">
            @{person.username}
            {mine && <span className="profile-you">· you</span>}
          </div>
        </div>
        {mine ? (
          <button
            className="quiet-btn"
            onClick={() => {
              setNameDraft(person.display_name ?? '')
              setBioDraft(person.bio ?? '')
              setEditing(!editing)
            }}
          >
            {editing ? 'close' : 'edit profile'}
          </button>
        ) : (
          <button className="auth-btn" onClick={toggleFollow}>
            {followed ? 'following ✓' : 'follow'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="auth-card profile-edit">
          <div className="auth-title">Your page, your words</div>
          <input
            className="auth-input"
            placeholder="Display name (optional)"
            value={nameDraft}
            maxLength={40}
            onChange={(e) => setNameDraft(e.target.value)}
          />
          <textarea
            className="auth-input profile-bio-input"
            placeholder="A line about your dreams… (optional)"
            value={bioDraft}
            maxLength={200}
            onChange={(e) => setBioDraft(e.target.value)}
          />
          <div className="auth-row">
            <button className="auth-btn" onClick={saveProfile}>
              save
            </button>
          </div>
          {error && <div className="auth-error">{error}</div>}
        </div>
      ) : (
        person.bio && <p className="profile-bio">{person.bio}</p>
      )}

      {stats && (
        <div className="profile-stats">
          <span className="friend-stat">{stats.total} kept</span>
          <span className="friend-stat">{stats.last_week} this week</span>
          <span className="friend-stat">{stats.dark_pct}% nightmares</span>
          {stats.top_tag && <span className="tag">{stats.top_tag}</span>}
        </div>
      )}

      <section className="stat-section">
        <div className="stat-heading">Pinned dreams</div>
        {pinned.length === 0 ? (
          <div className="profile-empty">
            <Sheep size={56} />
            <p className="stat-note">
              {mine
                ? 'Nothing on display. Open a dream and “pin to profile” to put it here.'
                : 'Nothing on display yet.'}
            </p>
          </div>
        ) : (
          pinned.map((d) => (
            <button
              key={d.id}
              className="dream-card"
              onClick={() => setOpen(open === d.id ? null : d.id)}
            >
              <div className="dream-card-title">{d.title}</div>
              <div className="dream-card-meta">
                <Cloud mood={d.mood} size={14} />
                <span>{formatNight(d.createdAt)}</span>
                <span className="tag-row">
                  {d.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </span>
              </div>
              {open === d.id && <p className="feed-transcript">{d.transcript}</p>}
            </button>
          ))
        )}
      </section>
    </div>
  )
}

// The social layer. Three modes:
//  - no cloud config      → preview with example data
//  - cloud, signed out    → sign-in (email code / magic link) + preview
//  - signed in            → the real thing: follow, feed, friend stats
import { useEffect, useState } from 'react'
import { supabase, cloudEnabled } from '../lib/supabase'
import {
  claimUsername,
  feed,
  follow,
  following,
  friendStats,
  myProfile,
  pushAll,
  type FeedDream,
  type FriendStats,
  type Profile,
} from '../lib/sync'
import { listDreams } from '../lib/db'
import { formatClock } from '../lib/time'
import { Cloud } from '../components/Cloud'
import type { Mood } from '../lib/types'

export function Circle() {
  const [session, setSession] = useState<boolean | null>(cloudEnabled() ? null : false)
  const [profile, setProfile] = useState<Profile | null>(null)
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
    if (session) myProfile().then(setProfile)
    else setProfile(null)
  }, [session])

  // first sign-in with a profile: mirror local dreams to the cloud
  useEffect(() => {
    if (session && profile) listDreams().then(pushAll)
  }, [session, profile?.id])

  if (!checked) return null

  if (!cloudEnabled()) {
    return (
      <div>
        <div className="preview-band">PREVIEW · EXAMPLE DATA · CLOUD NOT CONFIGURED</div>
        <h1 className="screen-title">Circle</h1>
        <Preview />
      </div>
    )
  }

  if (!session) {
    return (
      <div>
        <h1 className="screen-title">Circle</h1>
        <SignIn />
        <div className="preview-band">WHAT IT LOOKS LIKE WITH FRIENDS</div>
        <Preview />
      </div>
    )
  }

  if (!profile) {
    return (
      <div>
        <h1 className="screen-title">Circle</h1>
        <ClaimName onClaimed={() => myProfile().then(setProfile)} />
      </div>
    )
  }

  return <LiveCircle profile={profile} />
}

/* ——— signed out: email code sign-in ——— */
function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    if (!supabase || !email.includes('@')) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function verify() {
    if (!supabase || code.length < 6) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError('That code didn’t work — check it or tap the email link instead.')
  }

  return (
    <div className="auth-card">
      {!sent ? (
        <>
          <div className="auth-title">Sign in to share dreams</div>
          <div className="auth-row">
            <input
              className="auth-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button className="auth-btn" onClick={send} disabled={busy || !email.includes('@')}>
              {busy ? '…' : 'send code'}
            </button>
          </div>
          <div className="auth-sub">No password — we email you a code and a link.</div>
        </>
      ) : (
        <>
          <div className="auth-title">Check your email</div>
          <div className="auth-row">
            <input
              className="auth-input"
              inputMode="numeric"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && verify()}
            />
            <button className="auth-btn" onClick={verify} disabled={busy || code.length < 6}>
              {busy ? '…' : 'verify'}
            </button>
          </div>
          <div className="auth-sub">Or tap the link in the email — either works.</div>
        </>
      )}
      {error && <div className="auth-error">{error}</div>}
    </div>
  )
}

/* ——— signed in, no username yet ——— */
function ClaimName({ onClaimed }: { onClaimed: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function claim() {
    setBusy(true)
    setError('')
    const r = await claimUsername(name.trim().toLowerCase())
    setBusy(false)
    if (r.error) setError(r.error)
    else onClaimed()
  }

  return (
    <div className="auth-card">
      <div className="auth-title">Pick your name</div>
      <div className="auth-row">
        <span className="auth-at">@</span>
        <input
          className="auth-input"
          placeholder="james"
          value={name}
          autoCapitalize="none"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && claim()}
        />
        <button className="auth-btn" onClick={claim} disabled={busy || name.trim().length < 3}>
          {busy ? '…' : 'claim'}
        </button>
      </div>
      <div className="auth-sub">This is how friends find you. Lowercase, 3–20 characters.</div>
      {error && <div className="auth-error">{error}</div>}
    </div>
  )
}

/* ——— the real circle ——— */
function LiveCircle({ profile }: { profile: Profile }) {
  const [friends, setFriends] = useState<Array<Profile & { stats?: FriendStats | null }>>([])
  const [dreams, setDreams] = useState<FeedDream[] | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  async function refresh() {
    const f = await following()
    setFriends(f)
    setDreams(await feed())
    const withStats = await Promise.all(
      f.map(async (p) => ({ ...p, stats: await friendStats(p.id) })),
    )
    setFriends(withStats)
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
      refresh()
    }
  }

  return (
    <div>
      <div className="preview-band">SIGNED IN AS @{profile.username.toUpperCase()}</div>
      <h1 className="screen-title">Circle</h1>

      <div className="auth-card">
        <div className="auth-title">Follow a friend</div>
        <div className="auth-row">
          <span className="auth-at">@</span>
          <input
            className="auth-input"
            placeholder="solbarth"
            value={name}
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

      {dreams !== null && dreams.length === 0 && (
        <p className="empty-sub" style={{ marginBottom: '2rem' }}>
          {friends.length === 0
            ? 'Follow someone and their shared dreams appear here, night by night.'
            : 'Nothing shared yet. Dreams stay private until a friend shares one.'}
        </p>
      )}

      {dreams !== null && dreams.length > 0 && (
        <section className="night-group">
          <div className="night-label">From your circle</div>
          {dreams.map((d) => (
            <button
              key={d.id}
              className="dream-card"
              onClick={() => setOpen(open === d.id ? null : d.id)}
            >
              <div className="circle-author">@{d.username}</div>
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
              {open === d.id && <p className="feed-transcript">{d.transcript}</p>}
            </button>
          ))}
        </section>
      )}

      {friends.length > 0 && (
        <section className="stat-section">
          <div className="stat-heading">Their nights</div>
          {friends.map((f) => (
            <div key={f.id} className="friend-row">
              <span className="friend-name">@{f.username}</span>
              {f.stats ? (
                <>
                  <span className="friend-stat">{f.stats.last_week} this week</span>
                  <span className="friend-stat">{f.stats.dark_pct}% nightmares</span>
                  {f.stats.top_tag && <span className="tag">{f.stats.top_tag}</span>}
                </>
              ) : (
                <span className="friend-stat">…</span>
              )}
            </div>
          ))}
          <p className="stat-note">
            Stats are shareable even when dreams aren't — the shape of their
            nights, not the content.
          </p>
        </section>
      )}
    </div>
  )
}

/* ——— example data, shown until the real thing has content ——— */
function Preview() {
  const FEED: Array<{ author: string; title: string; time: string; mood: Mood; tags: string[]; mentions?: string }> = [
    { author: 'sol', title: 'We were all on a train that ran underwater…', time: '6:02 am', mood: 'bright', tags: ['water', 'travel'], mentions: 'you' },
    { author: 'maya', title: 'The lab printers were printing my thoughts…', time: '4:47 am', mood: 'dark', tags: ['work', 'chase'] },
    { author: 'theo', title: 'A dog taught me to whistle in Portuguese…', time: '7:15 am', mood: 'neutral', tags: ['animals'] },
  ]
  return (
    <div>
      <div className="ping-card">
        <div className="ping-glyph">
          <Cloud mood="bright" size={22} />
        </div>
        <div>
          <div className="ping-text">
            <strong>sol</strong> dreamt about you last night
          </div>
          <div className="ping-sub">Request to see it — dreams are private until shared.</div>
        </div>
        <button className="ping-btn" disabled>
          request
        </button>
      </div>
      <section className="night-group">
        <div className="night-label">Last night · your circle</div>
        {FEED.map((d) => (
          <div key={d.author} className="dream-card circle-card">
            <div className="circle-author">
              @{d.author}
              {d.mentions && <span className="mention-chip">mentions {d.mentions}</span>}
            </div>
            <div className="dream-card-title">{d.title}</div>
            <div className="dream-card-meta">
              <Cloud mood={d.mood} size={14} />
              <span>{d.time}</span>
              <span className="tag-row">
                {d.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </span>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

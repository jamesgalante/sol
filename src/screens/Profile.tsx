// A person's page: name, bio, the shape of their nights, pinned dreams.
// Your own profile is editable in place. Pinned dreams are the deliberately
// public shelf — anyone signed in can read them here.
import { useEffect, useMemo, useState } from 'react'
import { cloudEnabled, supabase } from '../lib/supabase'
import {
  follow,
  followCounts,
  followers,
  following,
  unfollow,
  isFollowing,
  friendStats,
  myBirthChart,
  myProfile,
  pinnedDreams,
  profileByUsername,
  updateProfile,
  type FeedDream,
  type FollowCounts,
  type FriendStats,
  type Profile as ProfileRow,
} from '../lib/sync'
import { formatNight } from '../lib/time'
import { getBirthChart, listDreams, saveBirthChart } from '../lib/db'
import {
  ACHIEVEMENTS,
  CLOUD_COLORS,
  colorUnlocked,
  deriveUnlocks,
  itemsEarned,
  type CloudColor,
} from '../lib/achievements'
import { Cloud } from '../components/Cloud'
import { CloudAvatar } from '../components/CloudAvatar'
import { Sheep } from '../components/Sheep'
import { NatalWheel, NatalLegend, NatalSummary } from '../components/NatalWheel'
import { computeNatalChart } from '../lib/astrology'
import type { BirthChart, View } from '../lib/types'

/** "1998-02-03" → "Feb 3, 1998" — for the one-line chart summary. */
function formatBirthDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (!y || !m || !d) return iso
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

export function Profile({ username, onNavigate }: { username: string; onNavigate: (v: View) => void }) {
  const [state, setState] = useState<'loading' | 'signed-out' | 'missing' | 'ready'>('loading')
  const [person, setPerson] = useState<ProfileRow | null>(null)
  const [me, setMe] = useState<ProfileRow | null>(null)
  const [stats, setStats] = useState<FriendStats | null>(null)
  const [pinned, setPinned] = useState<FeedDream[]>([])
  const [followed, setFollowed] = useState(false)
  const [friends, setFriends] = useState<ProfileRow[]>([])
  const [fans, setFans] = useState<ProfileRow[]>([])
  const [counts, setCounts] = useState<FollowCounts | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [bioDraft, setBioDraft] = useState('')
  const [error, setError] = useState('')
  const [birthChart, setBirthChart] = useState<BirthChart | null | undefined>(undefined)
  const [showFullChart, setShowFullChart] = useState(false)
  const [ptab, setPtab] = useState<'dreams' | 'cloud' | 'sky' | 'people'>('dreams')
  const natal = useMemo(() => computeNatalChart(birthChart ?? null), [birthChart])

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
      followCounts(p.id).then((c) => alive && setCounts(c))
      if (p.id !== my.id) isFollowing(p.id).then((f) => alive && setFollowed(f))
      else {
        following().then((f) => alive && setFriends(f))
        followers().then((f) => alive && setFans(f))
        // own profile: fold anything newly earned into the synced unlock set
        const dreams = await listDreams()
        const earned = deriveUnlocks(dreams)
        const merged = [...new Set([...(p.unlocks ?? []), ...earned])]
        if (merged.length > (p.unlocks ?? []).length) {
          updateProfile({ unlocks: merged })
          if (alive) setPerson({ ...p, unlocks: merged })
        }
        // birth chart: local IndexedDB first, falling back to the cloud
        // (the "second device" case — local is empty but a row already exists)
        getBirthChart().then((local) => {
          if (!alive) return
          if (local) return setBirthChart(local)
          myBirthChart().then((remote) => {
            if (!alive) return
            if (remote) saveBirthChart(remote)
            setBirthChart(remote ?? null)
          })
        })
      }
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

  const unlocks = person.unlocks ?? []
  const equippedRaw = (person.cloud?.color ?? 'fog') as CloudColor
  const equippedDef = CLOUD_COLORS.find((c) => c.id === equippedRaw)
  const equipped: CloudColor =
    equippedDef && colorUnlocked(equippedDef, unlocks) ? equippedRaw : 'fog'

  async function equipColor(id: CloudColor) {
    await updateProfile({ cloud: { ...(person!.cloud ?? {}), color: id } })
    setPerson({ ...person!, cloud: { ...(person!.cloud ?? {}), color: id } })
  }

  return (
    <div>
      {!mine && (
        <button className="back-link" onClick={() => window.history.back()}>
          ← back
        </button>
      )}

      <div className="profile-head">
        <div className="profile-id">
          <CloudAvatar color={equipped} items={itemsEarned(unlocks)} size={92} />
          <div>
            <h1 className="detail-title">{person.display_name || `@${person.username}`}</h1>
            <div className="profile-handle">
              @{person.username}
              {mine && <span className="profile-you">· you</span>}
            </div>
            {counts && (
              <div className="profile-counts">
                {counts.followers} follower{counts.followers === 1 ? '' : 's'} ·{' '}
                {counts.following} following
              </div>
            )}
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

      <div className="sky-seg profile-tabs" role="tablist" aria-label="Profile sections">
        <button
          className="sky-seg-btn"
          role="tab"
          aria-current={ptab === 'dreams'}
          onClick={() => setPtab('dreams')}
        >
          Dreams
        </button>
        <button
          className="sky-seg-btn"
          role="tab"
          aria-current={ptab === 'cloud'}
          onClick={() => setPtab('cloud')}
        >
          Cloud
        </button>
        {mine && (
          <button
            className="sky-seg-btn"
            role="tab"
            aria-current={ptab === 'sky'}
            onClick={() => setPtab('sky')}
          >
            Sky
          </button>
        )}
        {mine && (
          <button
            className="sky-seg-btn"
            role="tab"
            aria-current={ptab === 'people'}
            onClick={() => setPtab('people')}
          >
            People
          </button>
        )}
      </div>

      {ptab === 'sky' &&
        mine &&
        birthChart !== undefined &&
        (!birthChart || birthChart.skipped || !birthChart.birthDate ? (
          // nothing filled yet: one quiet line linking to the page
          <button className="chart-prompt" onClick={() => onNavigate({ name: 'birth-chart' })}>
            <span className="chart-prompt-glyph" aria-hidden>
              ✶
            </span>
            fill in your birth chart
            <span className="goto-arrow">→</span>
          </button>
        ) : (
          <div className="chart-block">
            {natal && <NatalSummary chart={natal} />}
            <div className="chart-line">
              <span className="chart-line-meta">
                {formatBirthDate(birthChart.birthDate)}
                {birthChart.timeUnknown
                  ? ''
                  : birthChart.birthTime
                    ? ` · ${birthChart.birthTime}`
                    : ''}
                {(birthChart.placeLabel || birthChart.birthPlace) &&
                  ` · ${birthChart.placeLabel || birthChart.birthPlace}`}
              </span>
              <button className="quiet-btn" onClick={() => setShowFullChart((v) => !v)}>
                {showFullChart ? 'hide chart' : 'full chart'}
              </button>
              <button className="quiet-btn" onClick={() => onNavigate({ name: 'birth-chart' })}>
                edit
              </button>
            </div>
            {natal && showFullChart && (
              <div className="chart-open">
                <NatalWheel chart={natal} />
                {!natal.hasHouses && (
                  <p className="natal-caveat">
                    Add an exact birth time and pick your birth place to unlock your Rising sign
                    and houses. Planet signs shown are computed at local noon.
                  </p>
                )}
                <NatalLegend chart={natal} />
              </div>
            )}
          </div>
        ))}

      {ptab === 'cloud' && mine && (
        <div className="color-picker">
          {CLOUD_COLORS.map((c) => {
            const open = colorUnlocked(c, unlocks)
            return (
              <button
                key={c.id}
                className="color-dot"
                data-on={c.id === equipped}
                data-locked={!open}
                style={{ background: c.fill }}
                disabled={!open}
                title={open ? c.name : `${c.name} — ${c.streak}-night streak`}
                aria-label={open ? `Wear ${c.name}` : `${c.name}: locked, needs a ${c.streak}-night streak`}
                onClick={() => equipColor(c.id)}
              />
            )
          })}
        </div>
      )}

      {ptab === 'dreams' && stats && (
        <div className="profile-stats">
          <span className="friend-stat">{stats.total} kept</span>
          <span className="friend-stat">{stats.last_week} this week</span>
          <span className="friend-stat">{stats.dark_pct}% nightmares</span>
          {stats.top_tag && <span className="tag">{stats.top_tag}</span>}
        </div>
      )}

      {ptab === 'dreams' && (
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
      )}

      {ptab === 'cloud' && (
      <section className="stat-section">
        <div className="stat-heading">Achievements</div>
        {ACHIEVEMENTS.map((a) => {
          const earned = unlocks.includes(a.id)
          return (
            <div key={a.id} className="achievement-row" data-earned={earned}>
              <span className="achievement-mark">{earned ? '●' : '○'}</span>
              <span className="achievement-name">{a.name}</span>
              <span className="achievement-hint">{a.hint}</span>
            </div>
          )
        })}
        {mine && (
          <p className="stat-note">
            Streaks color your cloud; deeds dress it. Everything earned stays earned.
          </p>
        )}
      </section>
      )}

      {ptab === 'people' && mine && (
        <>
          <section className="stat-section">
            <div className="stat-heading">Followers</div>
            {fans.length === 0 ? (
              <p className="stat-note">No one yet — dreams travel slowly.</p>
            ) : (
              fans.map((f) => (
                <div key={f.id} className="friend-row">
                  <button
                    className="friend-name friend-name-link"
                    onClick={() => onNavigate({ name: 'profile', username: f.username })}
                  >
                    @{f.username}
                  </button>
                  {f.display_name && <span className="friend-stat">{f.display_name}</span>}
                  {!friends.some((x) => x.id === f.id) && (
                    <button
                      className="quiet-btn unfollow-btn"
                      onClick={async () => {
                        const r = await follow(f.username)
                        if (!r.error) setFriends([...friends, f])
                      }}
                    >
                      follow back
                    </button>
                  )}
                </div>
              ))
            )}
          </section>

          <section className="stat-section">
            <div className="stat-heading">Following</div>
            {friends.length === 0 ? (
              <p className="stat-note">No one yet — find friends on the circle tab.</p>
            ) : (
              friends.map((f) => (
                <div key={f.id} className="friend-row">
                  <button
                    className="friend-name friend-name-link"
                    onClick={() => onNavigate({ name: 'profile', username: f.username })}
                  >
                    @{f.username}
                  </button>
                  {f.display_name && <span className="friend-stat">{f.display_name}</span>}
                  <button
                    className="quiet-btn unfollow-btn"
                    onClick={async () => {
                      await unfollow(f.id)
                      setFriends(friends.filter((x) => x.id !== f.id))
                    }}
                  >
                    unfollow
                  </button>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {mine && (
        <div className="detail-actions">
          <button
            className="quiet-btn"
            onClick={async () => {
              await supabase?.auth.signOut()
              onNavigate({ name: 'circle' })
            }}
          >
            sign out
          </button>
        </div>
      )}
    </div>
  )
}

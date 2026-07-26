import { useEffect, useState } from 'react'
import type { View } from '../lib/types'
import { supabase, cloudEnabled } from '../lib/supabase'
import { myProfile, type Profile } from '../lib/sync'
import { itemsEarned, type CloudColor } from '../lib/achievements'
import { CloudAvatar } from './CloudAvatar'

const LEFT = [
  { name: 'record', label: 'record' },
  { name: 'journal', label: 'journal' },
] as const
const RIGHT = [
  { name: 'stats', label: 'stats' },
  { name: 'circle', label: 'circle' },
] as const

/** Your cloud, center of the nav — tap for your profile (or sign-in). */
export function Nav({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [me, setMe] = useState<Profile | null>(null)

  useEffect(() => {
    if (!cloudEnabled()) return
    let alive = true
    const load = () => myProfile().then((p) => alive && setMe(p))
    load()
    const { data: sub } = supabase!.auth.onAuthStateChange(() => load())
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [view.name]) // re-check after auth/claim happens on other screens

  const current = view.name === 'dream' ? 'journal' : view.name
  const onOwnProfile =
    view.name === 'me' ||
    (view.name === 'profile' && me !== null && view.username === me.username)

  const item = (entry: { name: View['name']; label: string }) => (
    <button
      key={entry.name}
      className="nav-item"
      aria-current={current === entry.name}
      onClick={() => onNavigate({ name: entry.name } as View)}
    >
      {entry.label}
    </button>
  )

  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-inner">
        {LEFT.map(item)}
        <button
          className="nav-me"
          aria-current={onOwnProfile}
          aria-label="Your cloud"
          onClick={() => onNavigate({ name: 'me' })}
        >
          <span className="nav-me-disc" data-on={onOwnProfile}>
            <CloudAvatar
              color={(me?.cloud?.color as CloudColor) ?? 'fog'}
              items={itemsEarned(me?.unlocks ?? [])}
              size={34}
            />
          </span>
        </button>
        {RIGHT.map(item)}
      </div>
    </nav>
  )
}

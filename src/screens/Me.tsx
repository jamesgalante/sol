// The center-tab gate: everything "you" lives behind this one screen.
// Signed out → sign in here (no bouncing to other tabs); no name yet →
// claim it; otherwise → your profile.
import { useEffect, useState } from 'react'
import { supabase, cloudEnabled } from '../lib/supabase'
import { myProfile, type Profile as ProfileRow } from '../lib/sync'
import { SignIn, ClaimName } from '../components/Auth'
import { CloudAvatar } from '../components/CloudAvatar'
import { Profile } from './Profile'
import type { View } from '../lib/types'

export function Me({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [session, setSession] = useState(false)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [checked, setChecked] = useState(!cloudEnabled())

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(Boolean(data.session))
      setChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(Boolean(s)))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) myProfile().then(setProfile)
    else setProfile(null)
  }, [session])

  if (!checked) return null

  if (!cloudEnabled() || !session) {
    return (
      <div>
        <div className="me-intro">
          <CloudAvatar color="fog" size={104} />
          <h1 className="welcome-title">This cloud is yours.</h1>
          <p className="welcome-body">
            Sign in and it gets a name, a page, and colors as your streak grows.
          </p>
        </div>
        {cloudEnabled() ? (
          <SignIn />
        ) : (
          <p className="stat-note">Cloud isn't configured in this build.</p>
        )}
      </div>
    )
  }

  if (!profile) {
    return (
      <div>
        <div className="me-intro">
          <CloudAvatar color="fog" size={104} />
          <h1 className="welcome-title">Almost — name your cloud.</h1>
        </div>
        <ClaimName onClaimed={() => myProfile().then(setProfile)} />
      </div>
    )
  }

  return <Profile username={profile.username} onNavigate={onNavigate} />
}

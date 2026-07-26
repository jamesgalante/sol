// The center-tab gate: everything "you" lives behind this one screen.
// Signed out → sign in here (no bouncing to other tabs); no name yet →
// claim it; otherwise → your profile.
import { useEffect, useState } from 'react'
import { supabase, cloudEnabled } from '../lib/supabase'
import { myBirthChart, myProfile, type Profile as ProfileRow } from '../lib/sync'
import { getBirthChart, saveBirthChart } from '../lib/db'
import { SignIn, ClaimName } from '../components/Auth'
import { CloudAvatar } from '../components/CloudAvatar'
import { BirthChartForm } from '../components/BirthChartForm'
import { Profile } from './Profile'
import type { BirthChart, View } from '../lib/types'

export function Me({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [session, setSession] = useState(false)
  // undefined = still asking the server; null = confirmed no profile yet
  const [profile, setProfile] = useState<ProfileRow | null | undefined>(undefined)
  const [checked, setChecked] = useState(!cloudEnabled())
  const [birthChart, setBirthChart] = useState<BirthChart | null | undefined>(undefined)

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
    if (session) {
      setProfile(undefined)
      myProfile().then(setProfile)
    } else setProfile(null)
  }, [session])

  // load the birth chart: local IndexedDB first, falling back to the cloud
  // (the "second device" case — local is empty but a row already exists)
  useEffect(() => {
    if (!profile) {
      setBirthChart(undefined)
      return
    }
    getBirthChart().then((local) => {
      if (local) {
        setBirthChart(local)
        return
      }
      myBirthChart().then((remote) => {
        if (remote) saveBirthChart(remote)
        setBirthChart(remote ?? null)
      })
    })
  }, [profile?.id])

  if (!checked) return null
  // signed in but profile still loading — render nothing, never a flash
  if (session && profile === undefined) return null

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

  if (birthChart === undefined) return null

  if (birthChart === null) {
    return (
      <div>
        <div className="auth-card">
          <div className="auth-title">Add your birth chart</div>
          <BirthChartForm
            initial={null}
            onSaved={setBirthChart}
            onSkip={() =>
              setBirthChart({
                birthDate: null,
                birthTime: null,
                timeUnknown: false,
                birthPlace: null,
                skipped: true,
                updatedAt: Date.now(),
              })
            }
          />
        </div>
      </div>
    )
  }

  return <Profile username={profile.username} onNavigate={onNavigate} />
}

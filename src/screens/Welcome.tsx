// First-open walkthrough. A sleepy sheep explains the deal with the sun,
// then hands you the real sign-in so you leave onboarding fully set up.
// Skippable at every step; never shown again once finished (localStorage).
import { useEffect, useState } from 'react'
import { supabase, cloudEnabled } from '../lib/supabase'
import { myProfile, type Profile } from '../lib/sync'
import { SignIn, ClaimName } from '../components/Auth'
import { Sheep } from '../components/Sheep'

const CARDS = [
  {
    eyebrow: 'WELCOME TO SÓL',
    title: 'Dreams don’t keep.',
    body: 'About ninety seconds after you wake, the sun takes them. I’ve watched it happen a thousand times. Speak first, and it can’t.',
  },
  {
    eyebrow: 'THE DEAL',
    title: 'Tap the sun, start talking.',
    body: 'Record in bed, half asleep — sól writes it down live, tags the themes and the mood, and files it under the night it happened. Not a talker? Type it instead.',
  },
  {
    eyebrow: 'THE CIRCLE',
    title: 'Private by default.',
    body: 'Your dreams are yours. Share one only when you choose. Friends see the shape of your nights — streaks, moods, themes — never the words, unless you say so.',
  },
]

export function Welcome({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [session, setSession] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(Boolean(data.session)))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(Boolean(s)))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) myProfile().then(setProfile)
  }, [session])

  const last = CARDS.length // index of the sign-in step
  const card = step < last ? CARDS[step] : null

  return (
    <div className="welcome">
      <div className="welcome-sky">
        <div className="welcome-horizon" />
        <div className="welcome-sheep" key={step}>
          <Sheep size={104} />
        </div>
      </div>

      {card ? (
        <div className="welcome-card">
          <div className="record-eyebrow">{card.eyebrow}</div>
          <h1 className="welcome-title">{card.title}</h1>
          <p className="welcome-body">{card.body}</p>
          <button className="auth-btn welcome-next" onClick={() => setStep(step + 1)}>
            {step === 0 ? 'go on' : 'next'}
          </button>
        </div>
      ) : (
        <div className="welcome-card">
          <div className="record-eyebrow">LAST THING</div>
          {!cloudEnabled() || (session && profile) ? (
            <>
              <h1 className="welcome-title">
                {profile ? `You’re in, @${profile.username}.` : 'You’re all set.'}
              </h1>
              <p className="welcome-body">
                The sun rises either way. Now it has competition.
              </p>
              <button className="auth-btn welcome-next" onClick={onDone}>
                start dreaming
              </button>
            </>
          ) : (
            <>
              <h1 className="welcome-title">Claim your name.</h1>
              <p className="welcome-body">
                Sign in and pick an @name so friends can find you. Or do it later
                from the circle tab.
              </p>
              {!session ? <SignIn /> : <ClaimName onClaimed={() => myProfile().then(setProfile)} />}
            </>
          )}
        </div>
      )}

      <div className="welcome-footer">
        <div className="welcome-dots" aria-hidden>
          {[...Array(CARDS.length + 1)].map((_, i) => (
            <span key={i} className="welcome-dot" data-on={i === step} />
          ))}
        </div>
        <button className="quiet-btn" onClick={onDone}>
          skip
        </button>
      </div>
    </div>
  )
}

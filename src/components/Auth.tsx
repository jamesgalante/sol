// Shared auth UI: email-code sign-in and username claim.
// Used by Circle (signed-out state) and the Welcome walkthrough.
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { claimUsername } from '../lib/sync'

// Password sign-in exists only for the shared preview test account.
// Production users never see it — codes are the whole story there.
const SHOW_PASSWORD_OPTION = window.location.hostname !== 'sol-tan-three.vercel.app'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')

  async function signInWithPassword() {
    if (!supabase || !email.includes('@') || !password) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (error) setError(error.message)
  }

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
    const token = code.replace(/\D/g, '')
    if (!supabase || token.length < 6) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' })
    setBusy(false)
    if (error) setError(`${error.message} — codes expire and each new email replaces the old one; try “send code” again and use the newest email.`)
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
              onKeyDown={(e) => e.key === 'Enter' && (usePassword ? undefined : send())}
            />
            {!usePassword && (
              <button className="auth-btn" onClick={send} disabled={busy || !email.includes('@')}>
                {busy ? '…' : 'send code'}
              </button>
            )}
          </div>
          {usePassword && (
            <div className="auth-row" style={{ marginTop: '0.625rem' }}>
              <input
                className="auth-input"
                type="password"
                autoComplete="current-password"
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && signInWithPassword()}
              />
              <button
                className="auth-btn"
                onClick={signInWithPassword}
                disabled={busy || !email.includes('@') || !password}
              >
                {busy ? '…' : 'sign in'}
              </button>
            </div>
          )}
          <div className="auth-sub">
            {usePassword ? (
              <>Test account only — </>
            ) : (
              <>No password — we email you a code and a link. </>
            )}
            {SHOW_PASSWORD_OPTION && (
              <button className="auth-toggle" onClick={() => setUsePassword(!usePassword)}>
                {usePassword ? 'use an email code' : 'test account'}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="auth-title">Check your email</div>
          <div className="auth-row">
            <input
              className="auth-input"
              inputMode="numeric"
              placeholder="8-digit code"
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

export function ClaimName({ onClaimed }: { onClaimed: () => void }) {
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

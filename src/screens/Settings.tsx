// Settings: device prefs (text size) work signed out and offline; synced
// prefs (email pings) appear once you're signed in. Sign out lives here.
import { useEffect, useState } from 'react'
import { supabase, cloudEnabled } from '../lib/supabase'
import { myProfile, updateProfile } from '../lib/sync'
import {
  emailSettingsFrom,
  getTextScale,
  setTextScale,
  type EmailSettings,
  type TextScale,
} from '../lib/settings'
import type { View } from '../lib/types'

const SCALES: Array<{ id: TextScale; label: string }> = [
  { id: 'small', label: 'small' },
  { id: 'regular', label: 'regular' },
  { id: 'large', label: 'large' },
]

const EMAIL_KINDS: Array<{ key: keyof EmailSettings; label: string }> = [
  { key: 'follow_request', label: 'someone asks to follow you' },
  { key: 'follow_accept', label: 'someone accepts your request' },
  { key: 'comment', label: 'someone comments on your dream' },
]

export function Settings({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [scale, setScale] = useState<TextScale>(getTextScale())
  const [signedIn, setSignedIn] = useState(false)
  const [emails, setEmails] = useState<EmailSettings | null>(null)
  const [saveNote, setSaveNote] = useState('')

  useEffect(() => {
    if (!cloudEnabled()) return
    myProfile().then((p) => {
      if (p) {
        setSignedIn(true)
        setEmails(emailSettingsFrom((p as { settings?: unknown }).settings))
      }
    })
  }, [])

  function pickScale(s: TextScale) {
    setScale(s)
    setTextScale(s)
  }

  async function saveEmails(next: EmailSettings) {
    setEmails(next)
    setSaveNote('')
    const r = await updateProfile({ settings: { emails: next } })
    setSaveNote(r.error ? `couldn’t save: ${r.error}` : 'saved')
  }

  return (
    <div>
      <button className="back-link" onClick={() => window.history.back()}>
        ← back
      </button>
      <h1 className="detail-title">Settings</h1>

      <section className="stat-section">
        <div className="stat-heading">Text size</div>
        <div className="sky-seg" role="radiogroup" aria-label="Text size">
          {SCALES.map((s) => (
            <button
              key={s.id}
              className="sky-seg-btn"
              role="radio"
              aria-checked={scale === s.id}
              aria-current={scale === s.id}
              onClick={() => pickScale(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="stat-note">
          Applies everywhere on this device, including your dreams.
        </p>
      </section>

      <section className="stat-section">
        <div className="stat-heading">Email pings</div>
        {!signedIn || !emails ? (
          <p className="stat-note">Sign in on your profile to control email notifications.</p>
        ) : (
          <>
            <label className="birth-check settings-toggle">
              <input
                type="checkbox"
                checked={emails.enabled}
                onChange={(e) => saveEmails({ ...emails, enabled: e.target.checked })}
              />
              <span>Email me when things happen</span>
            </label>
            {emails.enabled &&
              EMAIL_KINDS.map((k) => (
                <label key={k.key} className="birth-check settings-toggle settings-sub">
                  <input
                    type="checkbox"
                    checked={Boolean(emails[k.key])}
                    onChange={(e) => saveEmails({ ...emails, [k.key]: e.target.checked })}
                  />
                  <span>{k.label}</span>
                </label>
              ))}
            {saveNote && <p className="stat-note">{saveNote}</p>}
          </>
        )}
      </section>

      {signedIn && (
        <div className="detail-actions">
          <button
            className="quiet-btn"
            onClick={async () => {
              await supabase?.auth.signOut()
              onNavigate({ name: 'me' })
            }}
          >
            sign out
          </button>
        </div>
      )}
    </div>
  )
}

// Preferences. Two tiers:
//  - device-local (text size): localStorage, applies instantly, works offline
//  - synced (email notifications): profiles.settings jsonb, read by the server
//    before it sends anything

export type TextScale = 'small' | 'regular' | 'large'

const SCALE_KEY = 'sol:textScale'
const SCALE_PCT: Record<TextScale, string> = {
  small: '87.5%',
  regular: '100%',
  large: '115%',
}

export function getTextScale(): TextScale {
  const v = localStorage.getItem(SCALE_KEY)
  return v === 'small' || v === 'large' ? v : 'regular'
}

export function applyTextScale(scale: TextScale = getTextScale()): void {
  document.documentElement.style.fontSize = SCALE_PCT[scale]
}

export function setTextScale(scale: TextScale): void {
  localStorage.setItem(SCALE_KEY, scale)
  applyTextScale(scale)
}

/** Synced email-notification prefs; everything defaults to on. */
export interface EmailSettings {
  enabled: boolean
  follow_request: boolean
  follow_accept: boolean
  comment: boolean
}

export const EMAIL_DEFAULTS: EmailSettings = {
  enabled: true,
  follow_request: true,
  follow_accept: true,
  comment: true,
}

export function emailSettingsFrom(settings: unknown): EmailSettings {
  const e = (settings as { emails?: Partial<EmailSettings> } | null)?.emails ?? {}
  return { ...EMAIL_DEFAULTS, ...e }
}

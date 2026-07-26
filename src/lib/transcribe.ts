// Calls the server-side speech-to-text endpoint (api/transcribe.ts) when live
// Web Speech produced nothing. Returns the transcript, or throws — the caller
// (Record.tsx) falls back to letting the user type the dream. Gated to the same
// allowlist as the Sky Reading LLM so it never surprises non-enabled users with
// a guaranteed-403 round trip.
import { supabase } from './supabase'
import { llmEnabled } from './supabase'

/** Read a Blob as a bare base64 string (no data: prefix). */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip the "data:audio/webm;base64," prefix
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  if (!supabase) throw new Error('offline')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const email = data.session?.user.email
  if (!token) throw new Error('not signed in')
  if (!llmEnabled(email)) throw new Error('not enabled')

  const audio = await toBase64(blob)
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ audio, mimeType: blob.type }),
  })
  if (!res.ok) throw new Error(`transcribe ${res.status}`)
  const json = (await res.json()) as { transcript: string }
  const transcript = (json.transcript ?? '').trim()
  if (!transcript) throw new Error('empty')
  return transcript
}

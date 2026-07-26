// Server-side speech-to-text fallback. When the browser's Web Speech API
// produces nothing (Firefox, in-app browsers, flaky mobile Safari), the client
// sends the recorded audio here. Holds the OpenAI key, verifies the caller's
// Supabase session, enforces the same email allowlist as sky-reading (cost
// control), and returns ONLY the transcript text.
//
// Progressive enhancement: any failure here is non-fatal — the client falls
// back to letting the user type the dream (see src/lib/transcribe.ts).
import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI, { toFile } from 'openai'
import { createClient } from '@supabase/supabase-js'

// Cheapest capable speech model. Swap to 'whisper-1' if gpt-4o-transcribe is
// unavailable — one-line change, same response shape.
const MODEL = 'gpt-4o-transcribe'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// A non-VITE Supabase client used only to verify the caller's JWT. The anon key
// is enough — we read identity, we don't write to Postgres.
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_ANON_KEY as string,
)

// Reuses the sky-reading allowlist — the server is authoritative on spend.
const allowed = (process.env.LLM_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

interface RequestBody {
  // base64-encoded recorded audio (webm/opus from MediaRecorder)
  audio: string
  // original blob mime, e.g. "audio/webm" — used to name the upload
  mimeType?: string
}

// ~90s of opus is ~1 MB; base64 inflates ~33%. Cap the request so a runaway
// upload can't rack up cost or blow the function's body limit.
const MAX_BASE64_BYTES = 8 * 1024 * 1024 // ~6 MB of audio

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  // 1 — verify the caller
  const auth = req.headers.authorization ?? ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!jwt) return res.status(401).json({ error: 'missing token' })

  const { data, error } = await supabase.auth.getUser(jwt)
  const email = data.user?.email?.toLowerCase()
  if (error || !email) return res.status(401).json({ error: 'invalid token' })

  // 2 — allowlist gate (this is what protects spend)
  if (!allowed.includes(email)) return res.status(403).json({ error: 'not enabled' })

  // 3 — decode the audio and transcribe
  const b = req.body as RequestBody
  if (!b?.audio) return res.status(400).json({ error: 'no audio' })
  if (b.audio.length > MAX_BASE64_BYTES) return res.status(413).json({ error: 'audio too large' })

  const ext = (b.mimeType ?? 'audio/webm').includes('mp4') ? 'mp4' : 'webm'

  try {
    const buffer = Buffer.from(b.audio, 'base64')
    const file = await toFile(buffer, `dream.${ext}`, { type: b.mimeType || 'audio/webm' })
    const result = await openai.audio.transcriptions.create({
      model: MODEL,
      file,
    })
    return res.status(200).json({ transcript: result.text ?? '' })
  } catch (e) {
    console.error('transcribe error', e)
    return res.status(502).json({ error: 'transcription failed' })
  }
}

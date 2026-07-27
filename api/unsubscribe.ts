// One-click unsubscribe from email pings. The link in every email carries an
// HMAC over the user id, so it can flip the setting without a session — but
// only for the user it was minted for.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SECRET = process.env.NOTIFY_SECRET

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const u = String(req.query.u ?? '')
  const sig = String(req.query.sig ?? '')
  if (!SERVICE_KEY || !SECRET) return res.status(503).send('not configured')
  const expected = createHmac('sha256', SECRET).update(u).digest('hex').slice(0, 32)
  if (!u || sig !== expected) return res.status(400).send('bad link')

  const service = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: profile } = await service.from('profiles').select('settings').eq('id', u).maybeSingle()
  const settings = (profile?.settings as Record<string, unknown>) ?? {}
  const emails = { ...((settings.emails as Record<string, unknown>) ?? {}), enabled: false }
  await service.from('profiles').update({ settings: { ...settings, emails } }).eq('id', u)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(200).send(
    `<body style="background:#0a0c13;color:#eae7e0;font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0">
      <div style="text-align:center;max-width:28rem;padding:1rem">
        <p style="font-size:1.25rem;font-style:italic">You're unsubscribed.</p>
        <p style="color:#8b90a5">sól won't email you about follows or comments anymore.
        You can turn them back on any time in the app's settings.</p>
      </div>
    </body>`,
  )
}

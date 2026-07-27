// Email pings for social events: someone requested to follow you, accepted
// your request, or commented on your dream. Verifies the caller's Supabase
// session, resolves the recipient server-side (service role), honors their
// settings, and sends via the soldreamapp Gmail SMTP.
//
// Env required: SUPABASE_SERVICE_ROLE_KEY, SOL_SMTP_PASS, NOTIFY_SECRET
// (plus the VITE_ Supabase vars already configured).
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'
import nodemailer from 'nodemailer'

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) as string
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY) as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SMTP_USER = process.env.SOL_SMTP_USER ?? 'soldreamapp@gmail.com'
const SMTP_PASS = process.env.SOL_SMTP_PASS
const SECRET = process.env.NOTIFY_SECRET
const APP_URL = process.env.SOL_APP_URL ?? 'https://sol-tan-three.vercel.app'

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

type Kind = 'follow_request' | 'follow_accept' | 'comment'

interface Body {
  kind: Kind
  /** recipient — required for follow kinds */
  targetUserId?: string
  /** required for comment kind; recipient = the dream's owner */
  dreamId?: string
  /** true when a follow-back auto-accepted (mutual) — changes the wording */
  mutual?: boolean
}

function unsubscribeUrl(userId: string): string {
  const sig = createHmac('sha256', SECRET!).update(userId).digest('hex').slice(0, 32)
  return `${APP_URL}/api/unsubscribe?u=${userId}&sig=${sig}`
}

function subjectAndBody(
  kind: Kind,
  from: string,
  mutual: boolean,
  dreamTitle?: string,
): { subject: string; text: string } {
  switch (kind) {
    case 'follow_request':
      return {
        subject: `@${from} asked to follow you on sól`,
        text: `@${from} wants to see the dreams you share.\n\nAccept or decline on your profile's People tab:\n${APP_URL}/#me`,
      }
    case 'follow_accept':
      return mutual
        ? {
            subject: `@${from} followed you back on sól`,
            text: `You and @${from} now follow each other — their shared dreams will land in your circle.\n\n${APP_URL}/#circle`,
          }
        : {
            subject: `@${from} accepted your follow request`,
            text: `You now follow @${from} — the dreams they share will show up in your circle.\n\n${APP_URL}/#circle`,
          }
    case 'comment':
      return {
        subject: `@${from} commented on your dream`,
        text: `@${from} left a comment${dreamTitle ? ` on “${dreamTitle}”` : ''}.\n\nRead it in the app:\n${APP_URL}/#journal`,
      }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!SERVICE_KEY || !SMTP_PASS || !SECRET) {
    return res.status(503).json({ error: 'notifications not configured' })
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller } = await anon.auth.getUser(token)
  if (!caller?.user) return res.status(401).json({ error: 'not signed in' })

  const body = req.body as Body
  if (!body?.kind) return res.status(400).json({ error: 'kind required' })

  const service = createClient(SUPABASE_URL, SERVICE_KEY)

  // resolve recipient
  let recipientId: string | null = null
  let dreamTitle: string | undefined
  if (body.kind === 'comment') {
    if (!body.dreamId) return res.status(400).json({ error: 'dreamId required' })
    const { data: dream } = await service
      .from('dreams')
      .select('user_id, title')
      .eq('id', body.dreamId)
      .maybeSingle()
    recipientId = dream?.user_id ?? null
    dreamTitle = dream?.title
  } else {
    recipientId = body.targetUserId ?? null
    // follow kinds must reference a real edge involving the caller — prevents
    // using this endpoint to email arbitrary users
    if (recipientId) {
      const { data: edge } = await service
        .from('follows')
        .select('status')
        .or(
          `and(follower.eq.${caller.user.id},followee.eq.${recipientId}),and(follower.eq.${recipientId},followee.eq.${caller.user.id})`,
        )
        .limit(1)
        .maybeSingle()
      if (!edge) return res.status(403).json({ error: 'no follow relationship' })
    }
  }
  if (!recipientId) return res.status(400).json({ error: 'no recipient' })
  if (recipientId === caller.user.id) return res.status(200).json({ skipped: 'self' })

  // recipient's settings + sender's name
  const [{ data: recipient }, { data: sender }] = await Promise.all([
    service.from('profiles').select('settings').eq('id', recipientId).maybeSingle(),
    service.from('profiles').select('username').eq('id', caller.user.id).maybeSingle(),
  ])
  const emails = {
    enabled: true,
    follow_request: true,
    follow_accept: true,
    comment: true,
    ...((recipient?.settings as { emails?: Record<string, boolean> })?.emails ?? {}),
  }
  if (!emails.enabled || emails[body.kind] === false) {
    return res.status(200).json({ skipped: 'opted out' })
  }

  const { data: authUser } = await service.auth.admin.getUserById(recipientId)
  const to = authUser?.user?.email
  if (!to) return res.status(200).json({ skipped: 'no email' })

  const { subject, text } = subjectAndBody(
    body.kind,
    sender?.username ?? 'someone',
    Boolean(body.mutual),
    dreamTitle,
  )

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  await transporter.sendMail({
    from: `"sól" <${SMTP_USER}>`,
    to,
    subject,
    text: `${text}\n\n—\nToo many emails? Turn these off: ${unsubscribeUrl(recipientId)}`,
  })

  return res.status(200).json({ sent: true })
}

// Server-side Sky Reading synthesis. Holds the Anthropic key, verifies the
// caller's Supabase session, enforces the email allowlist (cost control), and
// returns ONLY the narrative — placements/symbolKeys stay client-side.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// Cheapest capable model. Bump to 'claude-sonnet-5' / 'claude-opus-4-8' for
// richer readings — one-line change, no other edits needed.
const MODEL = 'claude-haiku-4-5'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Prefer bare names but fall back to the VITE_-prefixed vars, which are the only
// Supabase values set in Vercel; without this fallback createClient() throws at
// module load and the whole function 500s before the handler ever runs.
const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) as string
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY) as string

// A Supabase client used only to verify the caller's JWT. The anon key is enough
// for that. To spend a free credit we build a per-request client authenticated as
// the caller (see handler) so the security-definer RPCs see the right auth.uid().
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const allowed = (process.env.LLM_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

// The shape the client sends. Mirrors the inputs skyReading() already assembles.
interface RequestBody {
  transcript: string
  tags: string[]
  mood: 'dark' | 'neutral' | 'bright'
  // pre-formatted, plain-language lines so the model needs no astrology code:
  coreLines: string[] // the big three — e.g. "Moon in Scorpio — the inner emotional world, intense and probing"
  chartLines: string[] // the rest of the chart — the other planets + Midheaven
  transitLine: string // e.g. "waxing gibbous Moon in Cancer; Mars, Saturn retrograde"
  symbolLines: string[] // e.g. "flying → Uranus: breaking free, rising above the ordinary"
}

// Structured-output schema. `narrative` is the main (Sun/Moon/Rising) reading —
// item[0] is a one-line title, item[1..] the body. `expandedNarrative` is the
// hidden whole-chart expansion, one entry per remaining placement.
//
// NOTE: no `minItems` here. Structured outputs rejects array constraints like
// minItems (raw messages.create() doesn't strip them the way the zod helpers do),
// and sending one 400s the whole request. The "at least 2 items" rule is enforced
// by the prompt below and by the <2-item guard in skyReadingRemote.ts, which
// rejects the response and surfaces an error rather than an empty main narrative.
const SCHEMA = {
  type: 'object',
  properties: {
    narrative: { type: 'array', items: { type: 'string' } },
    expandedNarrative: { type: 'array', items: { type: 'string' } },
  },
  required: ['narrative', 'expandedNarrative'],
  additionalProperties: false,
} as const

const SYSTEM = `You are the dream-reading voice of sól, a voice-first dream journal.
Write a two-part astrological reading of one dream, in second person ("you").
Voice: quiet, warm, literary, a little nocturnal and oracular — read the night like a soft horoscope or a tarot pull, leaning to omen and image a touch more than to who the dreamer "is." Never clinical, no clichés, no emoji.
Rules:
- "narrative" is the MAIN reading. It MUST have at least 2 items: item[0] is a single-sentence pull-quote title (it renders in a serif display face); item[1] (and optionally item[2]) is the body of the reading — 3 to 6 sentences total, drawing ONLY on the big three (Sun, Moon, Rising) plus the transit, mood, and symbols. Never return "narrative" as only the title.
- "expandedNarrative" is a HIDDEN expansion the reader can open: return ONE entry for EACH item in the "rest of the chart" list, in that order — 1 to 2 sentences each, tying that planet/point to the dream. No pull-quote here.
- Use ONLY the placements, transit, symbols, mood, and dream text provided. Never invent planets, signs, aspects, or houses that aren't given.
- Tie the dream's imagery to the astrology you're given; you may gently speak to what the night seems to portend, but give no literal predictions or advice.`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  // 1 — verify the caller
  const auth = req.headers.authorization ?? ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!jwt) return res.status(401).json({ error: 'missing token' })

  const { data, error } = await supabase.auth.getUser(jwt)
  const email = data.user?.email?.toLowerCase()
  if (error || !email) return res.status(401).json({ error: 'invalid token' })

  // 2 — spend gate. Allowlisted emails are unlimited. Everyone else gets one
  // complimentary reading: atomically claim a free credit (as the caller, so the
  // security-definer RPC keys off their auth.uid()) before we spend on Anthropic.
  // Out of credits → 402, and the client silently falls back to the local reading.
  // `authed` is held so we can refund the credit if synthesis fails (step 3).
  let authed: ReturnType<typeof createClient> | null = null
  if (!allowed.includes(email)) {
    authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: granted, error: claimErr } = await authed.rpc('claim_free_analysis')
    if (claimErr || !granted) return res.status(402).json({ error: 'quota exhausted' })
  }

  // 3 — build the prompt and call Anthropic
  const b = req.body as RequestBody
  const userContent = [
    `Dream (verbatim): ${b.transcript}`,
    `Mood: ${b.mood}. Tags: ${b.tags.join(', ') || 'none'}.`,
    `The sky that night: ${b.transitLine}`,
    `The big three (use these for "narrative"):\n${b.coreLines.map((l) => `- ${l}`).join('\n')}`,
    b.chartLines.length
      ? `The rest of the chart — return ONE "expandedNarrative" entry per line below, in order:\n${b.chartLines.map((l) => `- ${l}`).join('\n')}`
      : `The rest of the chart couldn't be computed — keep "expandedNarrative" brief and honest about that.`,
    b.symbolLines.length
      ? `Symbols in this dream and what they answer to:\n${b.symbolLines.map((l) => `- ${l}`).join('\n')}`
      : `No familiar symbols surfaced this time.`,
  ].join('\n\n')

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536, // headroom: title + body + one expansion entry per planet
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: userContent }],
    })
    const text = message.content.find((c) => c.type === 'text')?.text ?? '{}'
    const parsed = JSON.parse(text) as { narrative: string[]; expandedNarrative: string[] }
    return res
      .status(200)
      .json({ narrative: parsed.narrative, expandedNarrative: parsed.expandedNarrative })
  } catch (e) {
    console.error('sky-reading error', e)
    // Don't burn the user's one free reading on a synthesis failure — give it back.
    if (authed) await authed.rpc('refund_free_analysis')
    return res.status(502).json({ error: 'synthesis failed' })
  }
}

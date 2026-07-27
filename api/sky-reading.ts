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
// by the prompt below and by the <2-item guard in skyReadingRemote.ts, which falls
// back to the local reading rather than rendering an empty main narrative.
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
Read ONE specific dream like a tarot pull, in second person ("you"): the dream is the querent's question laid on the table, and the chart and the night's sky are the cards drawn over it. Every line must fuse the two — name an actual image, feeling, or turn from THIS dream, then read it through a placement or the transit. A placement mentioned without the dream image it illuminates is a failed line; a line about the dream with no astrology is also a failed line. Neither the dream nor the chart may appear alone.
This is NOT a horoscope and NOT a personality profile: do not describe who the dreamer is in general or forecast their day. You are interpreting what this one dream means, with the sky as the lens.
Voice: quiet, warm, literary, a little nocturnal and oracular — the hush of a good tarot reading. No clichés, no emoji, no clinical jargon.
Rules:
- Anchor in the dream first. Before you invoke a placement, point to the specific thing in the dream it speaks to (a chase, water, a lost tooth, the mood of the night). If a sentence names no dream image, rewrite it or cut it.
- "narrative" is the MAIN reading. It MUST have at least 2 items: item[0] is a single-sentence pull-quote title drawn from THIS dream's imagery (it renders in a serif display face); item[1] (and optionally item[2]) is the body — 3 to 6 sentences total, reading the dream through the big three (Sun, Moon, Rising) plus the transit, mood, and symbols. Never return "narrative" as only the title.
- "expandedNarrative" is a HIDDEN expansion the reader can open: return ONE entry for EACH item in the "rest of the chart" list, in that order — 1 to 2 sentences each, each tying that planet/point to a concrete image or feeling from the dream. No pull-quote here.
- Use ONLY the placements, transit, symbols, mood, and dream text provided. Never invent planets, signs, aspects, houses, or dream details that aren't given.
- Interpret the dream; give no predictions, fortunes, or advice about the future.`

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
    `THE DREAM to read (this is the subject — read every card over it):\n${b.transcript}`,
    `The dream's mood: ${b.mood}. Its symbols/tags: ${b.tags.join(', ') || 'none'}.`,
    `The sky that night: ${b.transitLine}`,
    `The big three — the cards for "narrative". Read each against the dream above, not on its own:\n${b.coreLines.map((l) => `- ${l}`).join('\n')}`,
    b.chartLines.length
      ? `The rest of the chart — return ONE "expandedNarrative" entry per line below, in order, each tying its placement to something in the dream:\n${b.chartLines.map((l) => `- ${l}`).join('\n')}`
      : `The rest of the chart couldn't be computed — keep "expandedNarrative" brief and honest about that.`,
    b.symbolLines.length
      ? `Symbols in this dream and the placements they answer to — use these to bridge the dream's images to the chart:\n${b.symbolLines.map((l) => `- ${l}`).join('\n')}`
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

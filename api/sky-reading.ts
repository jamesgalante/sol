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

// A Supabase client used only to verify the caller's JWT. The anon key is
// enough — we read identity, we don't write to Postgres. Prefer bare names but
// fall back to the VITE_-prefixed vars, which are the only Supabase values set
// in Vercel; without this fallback createClient() throws at module load and the
// whole function 500s before the handler ever runs.
const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) as string,
  (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY) as string,
)

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

// Structured-output schema: the model must return exactly this. `narrative` is
// the main (Sun/Moon/Rising) reading; `expandedNarrative` is the hidden
// whole-chart expansion.
const SCHEMA = {
  type: 'object',
  properties: {
    // ≥3: the pull-quote plus at least two body paragraphs — a model that returns
    // the pull-quote alone would leave the main reading visibly empty.
    narrative: { type: 'array', items: { type: 'string' }, minItems: 3 },
    expandedNarrative: { type: 'array', items: { type: 'string' }, minItems: 2 },
  },
  required: ['narrative', 'expandedNarrative'],
  additionalProperties: false,
} as const

const SYSTEM = `You are the dream-reading voice of sól, a voice-first dream journal.
Write a two-part astrological reading of one dream, in second person ("you").
Voice: quiet, warm, literary, a little nocturnal and oracular — read the night like a soft horoscope or a tarot pull, leaning to omen and image a touch more than to who the dreamer "is." Never clinical, no clichés, no emoji.
Rules:
- "narrative" is the MAIN reading. It MUST contain at least 3 items: item[0] is a single-sentence pull-quote (it renders in a serif display face); items[1..] are the body paragraphs (2–3 of them), drawing ONLY on the big three (Sun, Moon, Rising) plus the transit, mood, and symbols. Never return "narrative" as only the pull-quote.
- "expandedNarrative" is a HIDDEN expansion the reader can open: 2–3 short paragraphs reading the REST of the chart (the other planets and Midheaven) against the dream. It may touch the big three for context, but its job is the wider chart. No pull-quote here.
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

  // 2 — allowlist gate (this is what protects spend)
  if (!allowed.includes(email)) return res.status(403).json({ error: 'not enabled' })

  // 3 — build the prompt and call Anthropic
  const b = req.body as RequestBody
  const userContent = [
    `Dream (verbatim): ${b.transcript}`,
    `Mood: ${b.mood}. Tags: ${b.tags.join(', ') || 'none'}.`,
    `The sky that night: ${b.transitLine}`,
    `The big three (use these for "narrative"):\n${b.coreLines.map((l) => `- ${l}`).join('\n')}`,
    b.chartLines.length
      ? `The rest of the chart (use these for "expandedNarrative"):\n${b.chartLines.map((l) => `- ${l}`).join('\n')}`
      : `The rest of the chart couldn't be computed — keep "expandedNarrative" brief and honest about that.`,
    b.symbolLines.length
      ? `Symbols in this dream and what they answer to:\n${b.symbolLines.map((l) => `- ${l}`).join('\n')}`
      : `No familiar symbols surfaced this time.`,
  ].join('\n\n')

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
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
    return res.status(502).json({ error: 'synthesis failed' })
  }
}

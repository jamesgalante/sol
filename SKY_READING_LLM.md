# Sky Reading — LLM synthesis setup guide

This is a step-by-step for replacing the local, template-composed Sky Reading
with a real Anthropic LLM call — held behind a secret API key, gated to a single
user, and cached so it costs almost nothing. It's written so a future session
(James's or Sol's) can execute it end to end without re-deriving the design.

**Read `DESIGN.md` first if you're touching the UI, and `CLAUDE.md` for deploy
and workflow rules.** This guide follows both.

---

## 0. TL;DR / decisions already made

- **Where the secret call lives:** a Vercel serverless function in *this* repo
  (`api/sky-reading.ts`). No separate backend repo, no new toolchain — it ships
  with the existing `npx vercel deploy --prod --yes`.
- **The public repo is fine.** The Anthropic key is a Vercel environment
  variable, never committed. `.env*` and `.vercel` are already gitignored.
  You do **not** need a private repo.
- **Cost control:** an email allowlist enforced **server-side** in the function
  (the only thing that actually protects spend), mirrored client-side to
  show/hide UI. Enabled for `solomon.barth@gmail.com` (username `bolomon`)
  first. No LaunchDarkly.
- **Model:** `claude-haiku-4-5` (cheapest; one-line change to upgrade later).
- **The LLM writes only the prose.** Placements and symbol keys stay computed
  deterministically on the client — the model never invents astrology.
- **It's a progressive enhancement.** Non-allowlisted users, offline, or any
  error all fall back to the existing local `skyReading()`. The app never
  *requires* the network (per `CLAUDE.md`).
- **One paid call per dream**, cached in IndexedDB.

---

## 1. Architecture

```
Browser (allowlisted user, Sky tab opened)
   │  POST /api/sky-reading  { dream, natal, transit }
   │  Authorization: Bearer <supabase session JWT>
   ▼
Vercel serverless function  api/sky-reading.ts
   │  1. verify the JWT with Supabase  → trusted user.email
   │  2. reject 403 unless email ∈ LLM_ALLOWED_EMAILS
   │  3. build a prompt, call Anthropic (ANTHROPIC_API_KEY, server-only)
   ▼
Anthropic Messages API  (claude-haiku-4-5)
   │  returns { narrative: string[] }
   ▼
Function returns JSON  → client merges narrative with locally-computed
placements + symbolKeys → renders → caches in IndexedDB (keyed by dream id)
```

Everyone who isn't allowlisted — and any failure, offline, or non-signed-in
state — silently uses the current local `skyReading()`. The LLM path is purely
additive.

### Why the LLM only writes the narrative

`SkyReading` (in `src/lib/types.ts`) has three parts:

```ts
export interface SkyReading {
  narrative: string[]                                    // ← LLM generates this
  placements: Placement[]                                // ← stays deterministic
  symbolKeys: { tag: string; point: string; note: string }[]  // ← stays deterministic
}
```

`placements` and `symbolKeys` are facts derived from the birth chart and the
dream's tags. Letting the model produce them would risk hallucinated planets or
aspects — exactly what today's engine is careful never to do (see the header
comment in `src/lib/skyReading.ts`). So the function returns **only**
`narrative`, and the client keeps computing the other two locally, then merges.
This also keeps the token count (and cost) tiny.

---

## 2. Step 1 — Anthropic account + API key

1. Go to <https://console.anthropic.com>, sign up / sign in.
2. **Billing → add a small credit balance** (e.g. $5) and set a low monthly
   spend limit. With one user on Haiku, real spend will be pennies, but the cap
   is a safety net.
3. **API keys → Create key.** Name it `sol-sky-reading`. **Copy it now** — it's
   shown only once. It looks like `sk-ant-api03-...`.
4. Keep it somewhere safe (a password manager). It goes into Vercel in Step 4,
   never into the repo.

---

## 3. Step 2 — Why the public repo is safe (secret handling)

The one rule that matters:

- Vite exposes **only** environment variables prefixed `VITE_` to the client
  bundle (see `src/lib/supabase.ts` — `VITE_SUPABASE_URL` etc. are public on
  purpose; the anon key is protected by RLS).
- The Anthropic key must therefore **never** be `VITE_`-prefixed and **never**
  be read from `import.meta.env` in `src/`. It's read only inside
  `api/sky-reading.ts` via `process.env.ANTHROPIC_API_KEY`, which runs on
  Vercel's server, not in the browser.
- The key is set in the **Vercel dashboard** (Step 4), not in any file. `.env*`
  and `.vercel` are already in `.gitignore`, so even a local `.env` won't leak.

Net: the repo can stay public. Nothing secret is ever in git or in the shipped
JavaScript.

---

## 4. Step 3 — The Vercel serverless function

Vercel auto-detects any file in a top-level `api/` directory as a serverless
function, alongside the Vite static build. Add two dependencies first:

```sh
npm install @anthropic-ai/sdk
npm install --save-dev @vercel/node
```

`@anthropic-ai/sdk` is imported only under `api/`, so it is **not** bundled into
the client. `@vercel/node` provides the request/response types.

Create **`api/sky-reading.ts`**:

```ts
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

// A non-VITE Supabase client used only to verify the caller's JWT. The anon key
// is enough — we read identity, we don't write to Postgres.
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_ANON_KEY as string,
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
  natalLines: string[]   // e.g. "Moon in Scorpio — the inner emotional world, intense and probing"
  transitLine: string    // e.g. "waxing gibbous Moon in Cancer; Mars, Saturn retrograde"
  symbolLines: string[]  // e.g. "flying → Uranus: breaking free, rising above the ordinary"
}

// Structured-output schema: the model must return exactly this.
const SCHEMA = {
  type: 'object',
  properties: {
    narrative: { type: 'array', items: { type: 'string' } },
  },
  required: ['narrative'],
  additionalProperties: false,
} as const

const SYSTEM = `You are the dream-reading voice of sól, a voice-first dream journal.
Write a short astrological reading of one dream, in second person ("you").
Voice: quiet, warm, literary, a little nocturnal — never clinical, never a horoscope cliché, no emoji.
Rules:
- Return 2–4 short paragraphs in the "narrative" array. The FIRST item is a single-sentence pull-quote (it renders in a serif display face).
- Use ONLY the placements, transit, symbols, mood, and dream text provided. Never invent planets, signs, aspects, or houses that aren't given.
- Tie the dream's imagery to the astrology you're given; don't predict the future or give advice.`

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
    `The dreamer's natal placements:\n${b.natalLines.map((l) => `- ${l}`).join('\n')}`,
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
    const parsed = JSON.parse(text) as { narrative: string[] }
    return res.status(200).json({ narrative: parsed.narrative })
  } catch (e) {
    console.error('sky-reading error', e)
    return res.status(502).json({ error: 'synthesis failed' })
  }
}
```

Notes:
- **Model / API details** come from the `claude-api` reference. Haiku 4.5
  supports structured outputs (`output_config.format`), so the response text is
  guaranteed-parseable JSON matching `SCHEMA`. No `thinking` config is needed on
  Haiku. `max_tokens: 1024` is ample for a few short paragraphs; non-streaming
  is fine at that size.
- If you later swap `MODEL` to `claude-sonnet-5` or `claude-opus-4-8`, add
  `thinking: { type: 'adaptive' }` for a richer reading (those models default to
  no thinking otherwise) — but that's optional and costs more.

---

## 5. Step 4 — Environment variables + `vercel.json`

In the **Vercel dashboard → Project `sol` → Settings → Environment Variables**,
add these for **Production and Preview** (they are separate from the existing
`VITE_`-prefixed client vars):

| Name | Value | Notes |
|------|-------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-…` | The key from Step 1. **Not** `VITE_`-prefixed. |
| `LLM_ALLOWED_EMAILS` | `solomon.barth@gmail.com` | Comma-separated. Add emails here to widen the rollout — no code change. |
| `SUPABASE_URL` | same value as `VITE_SUPABASE_URL` | Server-side copy for JWT verification. |
| `SUPABASE_ANON_KEY` | same value as `VITE_SUPABASE_ANON_KEY` | Anon key is safe; used only to read identity. |

After changing env vars, redeploy for them to take effect.

**`vercel.json` — protect the `/api/*` route.** The current SPA rewrite sends
everything without a dot to `index.html`:

```json
"rewrites": [{ "source": "/((?!assets/|.*\\..*).*)", "destination": "/index.html" }]
```

Vercel matches filesystem functions before rewrites, so `/api/sky-reading`
should already be safe — but add `api/` to the negative lookahead as
belt-and-suspenders so the function can never be shadowed:

```json
"rewrites": [{ "source": "/((?!api/|assets/|.*\\..*).*)", "destination": "/index.html" }]
```

---

## 6. Step 5 — Client wiring

Four edits, all additive. The goal: allowlisted-and-online → call the function;
otherwise → the existing local reading.

### 6a. The remote-reading client — `src/lib/skyReadingRemote.ts` (new)

```ts
// Calls the server-side synthesis endpoint. Returns the LLM narrative, or
// throws (callers fall back to the local skyReading()).
import { supabase } from './supabase'
import type { Dream, NatalChart, TransitSky } from './types'
import { ZODIAC } from './types'
import { noteFor } from './astrology'
import { SYMBOL_SIGNIFIERS } from './skyReading'
import { dreamMood } from './categorize'

export async function fetchRemoteNarrative(
  dream: Dream,
  natal: NatalChart,
  transit: TransitSky,
): Promise<string[]> {
  if (!supabase) throw new Error('offline')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('not signed in')

  // Turn the computed chart/transit into plain-language lines so the function
  // (and the model) need no astrology code of their own.
  const natalLines = natal.placements
    .filter((p) => p.point !== 'ASC' && p.point !== 'MC')
    .map((p) => `${p.point} in ${ZODIAC[p.sign]} — ${noteFor(p)}`)
  const transitLine =
    `${transit.moonPhase} Moon in ${ZODIAC[transit.moonSign]}` +
    (transit.retrogrades.length ? `; ${transit.retrogrades.join(', ')} retrograde` : '')
  const symbolLines = dream.tags
    .filter((t) => SYMBOL_SIGNIFIERS[t])
    .map((t) => {
      const s = SYMBOL_SIGNIFIERS[t]
      return `${t} → ${s.point}${s.sign ? ` / ${s.sign}` : ''}: ${s.note}`
    })

  const res = await fetch('/api/sky-reading', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      transcript: dream.transcript,
      tags: dream.tags,
      mood: dreamMood(dream),
      natalLines,
      transitLine,
      symbolLines,
    }),
  })
  if (!res.ok) throw new Error(`sky-reading ${res.status}`)
  const json = (await res.json()) as { narrative: string[] }
  if (!Array.isArray(json.narrative) || json.narrative.length === 0) throw new Error('empty')
  return json.narrative
}
```

### 6b. The client-side flag — mirror `cloudEnabled()` in `src/lib/supabase.ts`

Add a tiny allowlist helper next to the existing toggles. This is UX only (the
server is authoritative); it decides whether to attempt the LLM path.

```ts
// src/lib/supabase.ts
const LLM_ALLOWED_EMAILS = ['solomon.barth@gmail.com'] // keep in sync with Vercel's LLM_ALLOWED_EMAILS

export function llmEnabled(email: string | null | undefined): boolean {
  return Boolean(email) && LLM_ALLOWED_EMAILS.includes(email!.toLowerCase())
}
```

### 6c. Cache in IndexedDB — `src/lib/db.ts`

Bump the DB version and add a `readings` store so the paid call happens once per
dream. In `open()`'s `onupgradeneeded`:

```ts
const DB_VERSION = 3 // was 2

// inside onupgradeneeded, alongside the existing stores:
if (!db.objectStoreNames.contains('readings')) {
  db.createObjectStore('readings') // keyed by dream id; value = string[] (narrative)
}
```

Add accessors mirroring the birth-chart ones:

```ts
export function getCachedNarrative(id: string): Promise<string[] | undefined> {
  return tx(['readings'], 'readonly', (t) => t.objectStore('readings').get(id))
}
export function saveCachedNarrative(id: string, narrative: string[]): Promise<void> {
  return tx(['readings'], 'readwrite', (t) => {
    t.objectStore('readings').put(narrative, id)
  })
}
export function clearCachedNarrative(id: string): Promise<void> {
  return tx(['readings'], 'readwrite', (t) => t.objectStore('readings').delete(id))
}
```

**Invalidate on edit:** in `DreamDetail.saveEdit()`, after the transcript
changes, call `clearCachedNarrative(dream.id)` so an edited dream gets re-read.

### 6d. Wire the panel — `src/components/SkyPanel.tsx`

Today the reading is a synchronous `useMemo`. Make the narrative async: compute
`placements`/`symbolKeys` locally as now (via the local `skyReading()`), but
override `narrative` with the LLM's when allowlisted. Sketch:

```tsx
// natal + transit stay as useMemo. Compute the LOCAL reading synchronously —
// it's the fallback and the source of placements/symbolKeys.
const localReading = useMemo(
  () => (natal ? skyReading(dream, natal, transit) : null),
  [dream, natal, transit],
)
const [narrative, setNarrative] = useState<string[] | null>(null)

useEffect(() => {
  if (!natal || !localReading) return
  let cancelled = false
  ;(async () => {
    // 1 — cache hit?
    const cached = await getCachedNarrative(dream.id)
    if (cached && !cancelled) return setNarrative(cached)
    // 2 — allowlisted + online → LLM, else local
    const email = (await supabase?.auth.getSession())?.data.session?.user.email
    if (llmEnabled(email)) {
      try {
        const remote = await fetchRemoteNarrative(dream, natal, transit)
        if (cancelled) return
        await saveCachedNarrative(dream.id, remote)
        return setNarrative(remote)
      } catch {
        /* fall through to local */
      }
    }
    if (!cancelled) setNarrative(localReading.narrative)
  })()
  return () => { cancelled = true }
}, [dream.id, natal, transit])

// render: use `narrative` where you currently use reading.narrative; keep
// placements/symbolKeys from localReading. Keep <SkyLoader/> while narrative === null.
```

Keep the existing `SkyLoader` for the pending state, and keep the "add your
birth chart" empty state exactly as is.

### 6e. Drive the loader with the real promise — `src/screens/DreamDetail.tsx`

Today `openSky()` fakes readiness with a 5s `setTimeout`. Since `SkyPanel` now
owns the async fetch and shows `SkyLoader` until `narrative` resolves, the
simplest change is to drop the fake timer: `openSky()` just does
`setTab('sky')`, and `SkyPanel`'s internal loading state replaces the `ready`
prop. (Alternatively keep `ready`/`skyReady` and flip it from a
`SkyPanel` `onReady` callback — but removing the timer is cleaner.) Remove the
now-unused `skyTimer` ref and its cleanup effect. Keep the `kept` gate and the
Dream↔Sky toggle untouched.

---

## 7. Step 6 — Local development

- `npx vercel dev` runs the Vite app **and** the `api/` function together, so
  `/api/sky-reading` works locally. Log in once so Vercel can pull the env vars,
  or create a local `.env` (gitignored) with the four vars from Step 4.
- Plain `vite` (the `sol-dev` launch config, port 5183) does **not** run the
  function — the client will just fall back to the local reading. That's the
  expected offline behavior, not a bug.
- The fetch URL is relative (`/api/sky-reading`), so the same build works in
  local `vercel dev`, PR previews, and production with no change.
- Mic is hard-denied in the embedded browser (see `CLAUDE.md`); test the reading
  in a real browser.

---

## 8. Step 7 — Test end to end

Ship via a PR so Vercel builds a preview (workflow per `CLAUDE.md`: branch → PR
→ preview → merge).

1. **Allowlisted, happy path:** sign in as `solomon.barth@gmail.com` on the
   preview URL, open a *kept* dream (one with a transcript), open the **Sky**
   tab. Confirm the narrative reads like an LLM wrote it (not the template).
   Reopen the tab → it's instant (served from the IndexedDB cache, no new call).
2. **Cache invalidation:** edit the dream's transcript, reopen Sky → a fresh
   reading is generated.
3. **Not allowlisted:** sign in as the shared preview test account (see
   `CLAUDE.md` → `.env.secrets`). Open Sky → you get the **local** reading, and
   the network tab shows `/api/sky-reading` returning **403**. No spend.
4. **Offline / signed out:** load without a session → local reading, no call.
5. **Key never leaks:** after `npm run build`, run `grep -r "sk-ant" dist/` —
   it must return nothing. Also confirm `ANTHROPIC_API_KEY` appears nowhere in
   the client bundle.
6. **Typecheck + build:** `npx tsc -b && npm run build` clean.

---

## 9. Cost & rollout

- **Cost:** Haiku 4.5 is ~$1 / 1M input tokens, ~$5 / 1M output. One reading is
  a few hundred input tokens + a few hundred output — a fraction of a cent.
  Cached per dream and gated to one email, monthly spend is effectively noise.
  The Anthropic spend limit from Step 1 is the hard backstop.
- **Widen the rollout:** add emails to Vercel's `LLM_ALLOWED_EMAILS` (takes
  effect on redeploy, no code change) **and** to `LLM_ALLOWED_EMAILS` in
  `src/lib/supabase.ts` (so the UI attempts the call for them). To open it to
  everyone, drop the client flag and change the server to allow all
  authenticated users — but re-check cost first.
- **Richer readings later:** change `MODEL` in `api/sky-reading.ts` to
  `claude-sonnet-5` or `claude-opus-4-8` and add `thinking: { type: 'adaptive' }`.
- **Optional optimization:** prompt-cache the stable `SYSTEM` prompt (see the
  Anthropic prompt-caching docs) — only worth it once volume is meaningful and
  the prompt exceeds Haiku's ~4K-token cache minimum.

---

## 10. File checklist

New:
- `api/sky-reading.ts` — the serverless function.
- `src/lib/skyReadingRemote.ts` — the client fetch helper.

Changed:
- `package.json` — add `@anthropic-ai/sdk` (dep) and `@vercel/node` (dev).
- `src/lib/supabase.ts` — add `llmEnabled()` + client allowlist.
- `src/lib/db.ts` — `DB_VERSION = 3`, `readings` store + accessors.
- `src/components/SkyPanel.tsx` — async narrative with cache + LLM + fallback.
- `src/screens/DreamDetail.tsx` — drop the fake 5s timer.
- `vercel.json` — add `api/` to the rewrite lookahead.

Vercel dashboard (not in git):
- `ANTHROPIC_API_KEY`, `LLM_ALLOWED_EMAILS`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

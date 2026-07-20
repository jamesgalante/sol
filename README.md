# sól

**Speak your dreams before the sun burns them away.**

You have about ninety seconds after waking before a dream dissolves. sól is a
voice-first dream journal: tap the sun, monologue, and it keeps the audio,
transcribes it live, tags the themes and mood, and files it under the night it
happened. Follow your friends and wake up to what they dreamt.

**Live app: https://sol-tan-three.vercel.app** — open it on your phone,
Share → Add to Home Screen, and it installs like an app.

## What works today

- **Record** — tap the sun, speak. Live transcription via the browser's
  built-in speech recognition (no API keys), audio kept locally, typing
  fallback where speech isn't available.
- **Journal** — dreams grouped by night ("a night ends at 11am"), with a
  tappable calendar: one cloud per night, tinted by mood
  (nightmare / plain / bright), tap to filter.
- **Stats** — recall-per-week trend, night streak, mood split, theme bars,
  wake-time histogram, recurring symbols.
- **Circle** — accounts (email code sign-in), follow by username, and a feed
  of dreams friends chose to share. **Private by default**: nothing leaves
  your device as visible-to-others unless you tap "share to circle" on that
  dream. Friends can see the *shape* of your nights (streak, nightmare %,
  top theme) without content — enforced by Postgres row-level security, not
  UI.

## Roadmap ([issues](../../issues))

Real transcription from stored audio (#1) · LLM categorization (#2) ·
mention → text-ping flow (#3) · sleep-data correlation via Apple Health (#6) ·
wake-time reminders (#5).

## Stack

Vite + React + TypeScript. Local-first: dreams live in IndexedDB on your
device; a Supabase (Postgres + Auth) backend mirrors them for the social
layer. Deployed on Vercel as a PWA (offline-capable, installable).

```
src/
  screens/       Record (the sun), Journal, DreamDetail, Stats, Circle
  components/    Header, Nav, DreamCard, Calendar, Cloud
  lib/
    db.ts          IndexedDB storage (source of truth for your dreams)
    sync.ts        cloud mirror + follow/feed/friend-stats
    supabase.ts    client — null when unconfigured; app runs fully offline
    recorder.ts    MediaRecorder + Web Speech; never blocks, never hangs
    categorize.ts  keyword tagger + mood detection (LLM later, same seams)
    time.ts        nights, clocks, durations
  styles/        tokens.css (palette/type/motion) + app.css
supabase/
  migrations/    schema: profiles, follows, dreams + RLS policies
```

## Run it locally

```sh
npm install
npm run dev          # http://localhost:5183
```

Works fully offline with no configuration (Circle explains itself but can't
sign in). To enable the social layer, create a Supabase project, run
`supabase/migrations/001_init.sql` in its SQL editor, and add to `.env.local`:

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

## Design

Pre-dawn indigo, one gold sun, hairline structure. Cormorant Garamond for
dream titles, Instrument Sans for UI, Geist Mono for timestamps and tags. The
record button is a sun half-set on a horizon line; it rises while it listens.
Mood colors (rose / gray / gold) are CVD-validated against the night surface
and never used without a text label.

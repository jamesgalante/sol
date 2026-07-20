# sól — working notes for Claude

Voice-first dream journal. James + Sol (GitHub: `solbarth`) side project.
Public repo. Read `README.md` first for product + structure; this file is the
operational stuff that doesn't belong there.

## Deploy + services

- **Vercel**: project `sol` (account `jamesagalante-1583`). Production URL
  `https://sol-tan-three.vercel.app`. Deploy: `npx vercel deploy --prod --yes`
  from the repo root. Env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
  are set in Vercel production env and `.env.local` (gitignored).
- **Supabase**: project `pdwkigaotmsdnealgnbo` (region us-west-1), James's
  account. Schema lives in `supabase/migrations/` — one numbered SQL file per
  change, applied by pasting into the dashboard SQL editor (no CLI link yet).
  The anon/publishable key is safe to expose; RLS is the security boundary.
- Auth is email OTP + magic link. The magic-link email template must contain
  `{{ .Token }}` for the 6-digit code path (needed on iOS PWA where the link
  opens Safari, not the installed app). Site URL should be the Vercel URL.

## Conventions

- Local IndexedDB (`src/lib/db.ts`) is the source of truth for the user's own
  dreams; the cloud is a mirror. Never make a feature require the network.
- Dreams are **private by default** — sharing is per-dream (`shared` flag).
  Any new table/column needs an RLS policy in the same migration.
- A "night" runs until 11am (`src/lib/time.ts`). Mood is a diverging trio
  dark/neutral/bright with tokens `--mood-*`; never color-only, always pair
  with a label (see `Cloud` component).
- Tagger/mood are keyword-based on purpose (free tier). Keep the
  `categorize(transcript)` / `detectMood(transcript)` signatures when
  upgrading to an LLM (issue #2).
- Word matching must be word-boundary aware — "studied" once matched "died".

## Verify

`npx tsc -b` then `npm run build`. Dev server via `.claude/launch.json`
(`sol-dev`, port 5183). In the embedded browser pane the mic is hard-denied —
the app detects this (Permissions API) and must never re-prompt; recording
falls back to type-it-after. Test speech only in a real browser.

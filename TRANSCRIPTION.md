# Transcription — server-side speech-to-text fallback

How sól turns a recorded dream into text, and how the paid fallback is set up.
Read `DESIGN.md` before touching the record UI and `CLAUDE.md` for deploy/workflow.

## How it works

Two layers, in order — the app never *requires* the network (per `CLAUDE.md`):

1. **Live Web Speech (free, default).** `src/lib/recorder.ts` runs the browser's
   `SpeechRecognition` while recording. Where it works (Chrome, mobile Safari)
   the transcript is ready the instant the user taps **done** — no server call.
2. **Server Whisper (fallback, gated).** When live speech caught nothing
   (Firefox, in-app browsers, a silent recognition error), `src/screens/Record.tsx`
   posts the recorded audio to `api/transcribe.ts`, which calls OpenAI's
   `gpt-4o-transcribe`. If that also fails (not enabled / offline / error), the
   user just types the dream in the review step. Either way they land in the same
   **review → keep** gate and can edit before it's saved.

The dream is only written to IndexedDB once the user taps **keep** in review.

## Design decisions (already made)

- **Where the secret call lives:** a Vercel serverless function in *this* repo
  (`api/transcribe.ts`), exactly like `api/sky-reading.ts`. Ships with the same
  `npx vercel deploy --prod --yes`. No separate backend.
- **The public repo is fine.** `OPENAI_API_KEY` is a Vercel env var, never
  committed (`.env*` is gitignored).
- **Cost control:** the same server-side email allowlist as Sky Reading —
  **reuses the `LLM_ALLOWED_EMAILS`** env var. The function re-checks it; the
  client mirror (`llmEnabled()` in `src/lib/supabase.ts`) only decides whether to
  attempt the call, so non-enabled users never trigger a paid request. There's
  also an ~6 MB audio cap in the function as a runaway-cost backstop.
- **Model:** `gpt-4o-transcribe` (cheap, accurate). Swap to `whisper-1` with a
  one-line change in `api/transcribe.ts` — same response shape.
- **Progressive enhancement:** non-allowlisted, offline, or any error all fall
  back to typing in the review step.

## Setup (Vercel)

Add these env vars in the Vercel project (`sol`), Production **and** Preview so
PR previews can exercise it:

| Var | Value |
|---|---|
| `OPENAI_API_KEY` | an OpenAI API key with audio access |
| `LLM_ALLOWED_EMAILS` | already set for Sky Reading — the same allowlist gates transcription |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | already set (used to verify the caller's JWT) |

Then redeploy. To enable another user, add their email to `LLM_ALLOWED_EMAILS`
(server) and to the mirror list in `src/lib/supabase.ts` (client UX).

## Verify

- **Enabled account, no Web Speech (e.g. Firefox):** record → done → the
  "making out the words…" state → review prefilled from the server → edit → keep.
- **Enabled account, Web Speech works (Chrome):** transcript appears live and the
  server is never called (check function logs — no invocation).
- **Non-enabled account:** the server returns 403 and the review opens empty for
  typing; no OpenAI request is billed.

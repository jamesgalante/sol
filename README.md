# sól

Speak your dreams before the sun burns them away.

You have about ninety seconds after waking before a dream dissolves. sól is a
voice-first dream journal: tap the sun, monologue, and it keeps the audio,
transcribes it live, tags the themes, and files it under the night it happened.
Eventually: follow your friends and wake up to what they dreamt.

## Status

Working local prototype — no backend, no accounts. Everything lives in your
browser (IndexedDB). Speech-to-text uses the browser's built-in Web Speech API,
so recording + transcription work with zero API keys; if speech isn't available
you type what you remember instead.

## Run it

```sh
npm install
npm run dev
```

Vite serves on `:5183` with `--host`, so you can open it from your phone on the
same Wi-Fi (`http://<laptop-ip>:5183`). Note: iOS requires HTTPS for mic access
off localhost — for phone testing use a tunnel (e.g. `npx vite --host` +
Tailscale/ngrok) or run the built app somewhere with TLS.

## Structure

```
src/
  screens/       Record (the sun), Journal, DreamDetail, Circle (social stub)
  components/    Header, Nav, DreamCard
  lib/
    db.ts          IndexedDB storage — swap for a real backend later
    recorder.ts    MediaRecorder + Web Speech, never blocks, never hangs
    categorize.ts  keyword tagger — stand-in for LLM categorization
    time.ts        "nights" (a night ends at 11am), clocks, durations
  styles/        tokens.css (palette/type/motion) + app.css
```

## Design

Pre-dawn indigo, one gold sun, hairline structure. Display face Cormorant
Garamond (dream titles), UI face Instrument Sans, mono Geist Mono for
timestamps and tags. The record button is a sun sitting half-set on a horizon
line; it rises while it listens.

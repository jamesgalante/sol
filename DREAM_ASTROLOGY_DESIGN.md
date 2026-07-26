# Dream × Sky — Design Doc

Connecting a user's dream history to their natal astrology chart: what gets built, in
what order, and why. This doc is the spec for implementation sessions — update it as
decisions change.

## Why

sól already reads like a small ritual: record a dream, watch it get a mood and tags,
see it join a night's cloud of others. Astrology is the natural next layer for a product
named after the sun — it gives the "why did I dream this" question a second axis besides
keyword tagging: not just *what symbols appeared* but *what sky you were dreaming under*
and *what part of your chart that echoes*.

This doc designs the core page — a per-dream "Sky Reading" — and notes how it grows into
a cross-dream pattern view later. It does not commit to specific libraries; it flags the
open technical decisions implementation sessions still need to make.

## Goals

- Every dream can show a reading that names real natal placements (Sun/Moon/Rising +
  relevant planets) and ties them to that dream's actual symbols/mood/tags.
- The reading also accounts for transiting sky at the moment the dream was recorded
  (astrology treats the Moon as the dream-governing body — its transiting sign/phase that
  night matters as much as natal placements).
- Feels like the rest of the app: editorial, quiet, mystical — not a data dashboard.
- Degrades honestly when inputs are incomplete (no birth time, no chart set up yet).

## Non-goals (for this doc)

- Full interactive natal chart wheel (SVG chart) — future nice-to-have, not required for
  the reading to work.
- Compatibility/synastry between users (Circle friends) — not in scope.
- Picking the specific ephemeris library or LLM prompt wording — flagged as an open
  decision below, resolved in the implementation session.

---

## 1. Prerequisite: birth chart setup

The reading can't exist without real birth data. There is currently no onboarding or
profile screen in the app at all, so this is new surface area.

**Data needed, captured once (settings/onboarding screen, new):**
- Birth date — required.
- Birth time — optional, with an explicit "I don't know my birth time" toggle. Time
  determines the Rising sign and house placements; without it, the reading must degrade
  to Sun + Moon (+ sign-level, not house-level, planet placements) rather than guess.
- Birth place — required (city search → lat/long + timezone), needed for houses and to
  convert local birth time to UT for the ephemeris calculation.

**Where it lives:**
- A new settings entry point (the app currently has no settings screen — smallest version
  is a card reachable from `Header` or `Nav`, e.g. tapping the user's name/avatar).
- First-run prompt: the first time a signed-in user opens a dream's Sky Reading without a
  chart on file, show the setup form inline rather than making them hunt for settings.

**Data model additions:**
- Supabase: extend `profiles` (`supabase/migrations/001_init.sql`) with birth date/time
  (nullable time)/place/timezone columns, or a new `birth_charts` table keyed by
  `profile.id` if the fields feel like they don't belong on `profiles` directly.
- Store the **computed chart** (placements: sign + degree + house per planet, plus the
  angles) as structured JSON alongside the raw inputs, computed once at save time — not
  recomputed on every page load.
- Local-first mirror: since dreams live in IndexedDB first and sync to Supabase only when
  signed in (`src/lib/db.ts`, `src/lib/sync.ts`), the chart should follow the same
  pattern — usable offline once computed, synced when signed in.

**Open decision:** which ephemeris/calculation approach to use (a JS ephemeris package vs.
an edge function calling an external API). Pick this in the implementation session; the
important constraint is that it runs from real astronomical data, not a lookup table.

---

## 2. Core page: the Sky Reading (per dream)

**Entry point:** a new tab/segment on `src/screens/DreamDetail.tsx` (which already owns
title editing, transcript, audio, mood, share-to-Circle) — e.g. a small segmented control
near the top: `Dream` / `Sky`. Keeps the reading scoped to one dream, which is the unit
the user already thinks in.

**Routing:** extend the `View` union in `src/lib/types.ts` and the hash logic in
`src/App.tsx` — either a `tab` field on the existing `{ name: 'dream'; id }` view, or a
new `{ name: 'dream-sky'; id }` view with hash `#dream/<id>/sky`. Prefer the `tab` field:
it's one screen with two panels, not two different destinations.

**Layout (mobile-first, matches the app's ~30rem column, `tokens.css` palette — pre-dawn
indigo, single gold "dawn" accent, Cormorant Garamond serif for display text, Instrument
Sans for UI, Geist Mono for tags/eyebrows):**

1. **Header** — dream title, recorded date/time, existing mood `Cloud` glyph reused
   as-is (`src/components/Cloud.tsx`) so the two tabs feel like one object.

2. **"The sky that night"** — a quiet strip: transiting Moon sign + phase at
   `dream.createdAt`, plus any other transit worth surfacing (a retrograde in effect, a
   transit closely aspecting a natal point). This is the one piece of the reading that's
   about the *moment*, not the person — dreaming is Moon-ruled, so this goes first.

3. **"The connection"** — the LLM-generated narrative, 2–4 short paragraphs. Open with
   one pull-quote-style line in the serif display font (mirrors how `screen-title` is
   used elsewhere), then the explanation in body text. This is the emotional core of the
   page — the actual "here's why this dream and your chart rhyme" writing.

4. **"Placements at play"** — a row of small cards, one per natal point the narrative
   actually references (always Sun/Moon/Rising if available; plus specific planets when
   a symbol calls for one, e.g. Neptune for water/fog imagery, Pluto for death/rebirth
   imagery). Each card: planet glyph + sign + one plain-language line ("Moon in Scorpio —
   feelings that go underground before they surface"). Style as chips/cards consistent
   with `.dream-card`.

5. **"Symbol key"** — maps the dream's existing tags (from `categorize.ts`'s `LEXICON`)
   to the astrological signifier the narrative drew on, e.g. `water → Moon / Pisces`,
   `falling → Saturn`. Small mono-tag chip list, same visual language as the tags already
   shown elsewhere on `DreamDetail`.

6. **Footer** — link back to full chart / to the birth-data settings if the user wants to
   correct their input.

**Empty / incomplete states (reuse existing visual patterns rather than invent new ones):**
- **No chart set up** → inline card using the `.preview-band` / `.auth-card` treatment
  already established in `src/screens/Circle.tsx`, prompting birth data entry with a
  one-line explanation of why it's needed.
- **Chart set up, reading not yet generated** → skeleton/shimmer placeholders for the
  narrative and placement cards — no spinner, matches the app's calm pacing.
- **Reading generation fails** (LLM/network) → still render sections 1, 2, and 4 (all
  computable without the LLM); drop only "the connection" narrative with a quiet
  "couldn't write this one — try again" affordance. Never block the whole tab on the
  LLM call.

---

## 3. LLM synthesis

**Inputs given to the model, all already computed/available — no free-floating claims:**
- Dream transcript, `tags`, `mood` (existing `Dream` fields).
- Natal placements: Sun/Moon/Rising + any planet whose sign/house is relevant, from the
  stored chart.
- Transiting positions at `dream.createdAt`, especially Moon sign/phase.

**Output:** structured JSON, not free text — e.g.
`{ narrative: string, placements: [{ point, sign, note }], symbolKeys: [{ tag, point, note }] }`
— so the UI renders deterministically instead of parsing prose. This also makes the
"reading fails" degrade path clean: if the JSON call fails, sections 1/2/4 above still
render from data the app already computed independently of the LLM.

**Prompting constraint to carry into implementation:** the model must only reference
placements and symbols that are actually present in the input — no inventing planets or
aspects not in the computed chart. This keeps the feature honest (a real reading of a
real chart) rather than generic astrology-flavored filler.

---

## 4. Phase 2 (future, not specced in detail here): Sky Patterns

Once individual dreams carry a stored chart snapshot + reading, a cross-dream view
becomes possible — surfacing recurring correlations ("your water-tagged dreams cluster
under Moon transits in water signs"). Natural home: extend `src/screens/Stats.tsx`, which
already has a placeholder note — *"Deeper analysis arrives with the Circle update"* — as
the anchor for exactly this. Depends entirely on Phase 1's per-dream data model existing
first; do not start this before the per-dream reading ships.

---

## 5. New surface area (for scoping implementation sessions)

- `src/lib/types.ts` — extend `View`, add `BirthChart`/chart-placement types.
- `src/App.tsx` — routing for the new tab/view.
- `src/screens/DreamDetail.tsx` — add the Sky tab.
- New: a settings/birth-data screen (doesn't exist today in any form).
- New: `src/lib/astrology.ts` (chart computation from birth data) and
  `src/lib/skyReading.ts` (LLM call + structured output for a given dream + chart).
- `supabase/migrations/` — new migration for birth data + chart storage.
- `src/lib/db.ts` / `src/lib/sync.ts` — extend local-first storage + sync for the chart,
  following the existing dream sync pattern.
- No new design tokens expected — reuse `tokens.css` and existing utility classes
  (`.screen-title`, `.dream-card`, `.preview-band`, `.auth-card`).

## Open questions / risks (resolve in implementation, not this doc)

- **Unknown birth time** is likely the common case — the reading must visibly degrade
  (no Rising, no house-based claims) rather than silently guess a time.
- Ephemeris accuracy/licensing and LLM cost/latency per reading (compute on first view
  and cache vs. precompute at dream-save time) are both implementation-time calls.
- Timezone/DST correctness for historical birth dates and for `dream.createdAt` transit
  lookups.

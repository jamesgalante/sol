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

## 1. Prerequisite: birth chart setup — ✅ implemented

**Status:** the data-collection half of this section is done. What's below is now the
as-built record, not just a plan — see deviations from the original spec called out inline.

Raw birth data is collected (skippable at signup, editable later), stored locally and
mirrored to Supabase. The **ephemeris computation itself is not part of this** — no chart
is computed yet, so the Sky Reading (§2) still can't render from this data as-is. That
remains the next slice of work.

**Data captured, once per user:**
- Birth date — required.
- Birth time — optional, with an explicit "I don't know my birth time" toggle, exactly as
  specced: without it the reading will need to degrade to Sun + Moon rather than guess a
  Rising sign.
- Birth place — **free text only** (e.g. "Portland, OR"), not the city-search →
  lat/long/timezone flow originally specced here. Geocoding was deliberately deferred: it's
  only needed once house placements / UT conversion (i.e. actual ephemeris work) begins, so
  building it now would be speculative. Revisit when picking the ephemeris approach below.

**Where it lives — deviates from the original plan:**
- No standalone settings/onboarding screen was built. Instead it folds into the profile
  surface that already exists (or, in an earlier draft of this change, was folded into
  `Circle.tsx` — that surface was reorganized out from under this feature by a later
  "friends-first Circle" restructure, so it now lives where "you" actually lives):
  `src/screens/Me.tsx` (the center-tab sign-in gate) for first-run, and
  `src/screens/Profile.tsx` (the editable profile page) for later edits.
- First-run prompt fires in `Me.tsx` right after a user claims a username (`ClaimName`,
  now in `src/components/Auth.tsx`) — the true "signup" moment — rather than at first Sky
  Reading view, since the Sky Reading page doesn't exist yet. Skipping persists a
  `skipped: true` row so the prompt never reappears; a "Your birth chart" card on the
  signed-in user's own `Profile` page (next to the existing bio/display-name editor) lets
  them fill it in later or edit it, satisfying the "retroactively add" requirement.

**Data model, as built:**
- New `birth_charts` table (`supabase/migrations/004_birth_chart.sql`), not an extension of
  `profiles` — one row per profile (`id` is both PK and FK to `profiles.id`), RLS-gated to
  the owning user only. Columns: `birth_date`, `birth_time`, `time_unknown`, `birth_place`,
  `skipped`, `updated_at`. No computed-chart JSON column yet — that's added once ephemeris
  work starts.
- Local-first mirror: a new `birthChart` IndexedDB store (`src/lib/db.ts`, bumped
  `DB_VERSION` 1→2) + `myBirthChart`/`pushBirthChart` in `src/lib/sync.ts`, following the
  exact same local-first/fire-and-forget-cloud pattern as dreams. Reads check IndexedDB
  first, falling back to Supabase (and mirroring the hit back to IndexedDB) so a second
  device picks up data entered on the first.
- New shared `src/components/BirthChartForm.tsx` — the fields-only form used by both the
  first-run prompt and the later edit card.

**Open decision, unchanged:** which ephemeris/calculation approach to use (a JS ephemeris
package vs. an edge function calling an external API) is still unresolved — pick this when
starting §2/§3. That decision will also determine whether/how birth place needs geocoding.

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

3. **"The reading"** (the main analysis) — `SkyReading.narrative`, a two-item shape:
   `narrative[0]` is a single-sentence pull-quote **title** in the serif display font
   (mirrors how `screen-title` is used elsewhere); `narrative[1..]` is the body — **3–6
   sentences** relating **only the big three (Sun, Moon, Rising)** to the dream, plus the
   transit/mood/symbols. This is the emotional core of the page — kept deliberately focused
   on the big three, because relating the whole chart to a single dream at once reads as
   overload.

4. **"Placements at play"** — the big-three tiles only (`NatalSummary`): Sun/Moon/Rising +
   the no-birth-time caveat when Rising/houses are unavailable. The wider chart's cards
   live in the expansion below, not here.

5. **"Read the whole chart" expansion** (the hidden drop-down) — collapsed by default; a
   quiet mono toggle (`aria-expanded`, rotating `▾` caret, styled after the `.friend-add`
   pattern). When opened it reveals everything whole-chart:
   - a second narrative (`SkyReading.expandedNarrative`) reading the **rest of the chart** —
     **one entry of 1–2 sentences per remaining planet/point** (the other planets and
     Midheaven), against the dream;
   - the extra-planet **cards** (glyph + sign + plain-language line, one per non–big-three
     placement the reading leans on, e.g. Neptune for water/fog, Pluto for death/rebirth);
   - the **symbol key** — the dream's existing tags (from `categorize.ts`'s `LEXICON`)
     mapped to the astrological signifier the reading drew on, e.g. `water → Moon / Pisces`,
     `falling → Saturn`, as a small mono-tag chip list.

6. **Footer** — link back to full chart / to the birth-data settings if the user wants to
   correct their input.

**Empty / incomplete states (reuse existing visual patterns rather than invent new ones):**
- **No chart set up** → inline card using the `.auth-card` treatment already established
  for birth-chart entry in `src/screens/Me.tsx`/`src/screens/Profile.tsx` (§1), prompting
  birth data entry with a one-line explanation of why it's needed.
- **Chart set up, reading not yet generated** → the `SkyLoader` (breathing moon + twinkling
  stars, cycling captions) while local cache → cloud → LLM resolves — no spinner,
  matches the app's calm pacing.
- **Reading generation fails** (LLM/network/quota/not signed in) → an honest, informative
  error in place of the reading prose (`readingErrorMessage()` in `SkyPanel.tsx`). There is
  **no** local template fallback: a canned deterministic reading read as the model's own
  output and confused rather than helped. The deterministic sections — the sky that night
  (§1) and the placements/natal summary (§2 chart data) — still render, since they're
  computed from the user's own chart and are always available.

---

## 3. LLM synthesis

**Inputs given to the model, all already computed/available — no free-floating claims.**
The client (`skyReadingRemote.ts`) pre-formats the chart into plain-language lines and
splits them into two labeled sets so the model knows which feeds which tier:
- Dream transcript, `tags`, `mood` (existing `Dream` fields).
- `coreLines` — the **big three** (Sun, Moon, Rising) → feed the main `narrative`.
- `chartLines` — the **rest of the chart** (other planets + Midheaven) → feed the
  `expandedNarrative`.
- Transiting positions at `dream.createdAt`, especially Moon sign/phase.

**Output:** structured JSON, not free text —
`{ narrative: string[], expandedNarrative: string[] }` from the endpoint, widened to the
full `SkyReading` (`{ narrative, expandedNarrative, placements, symbolKeys }`) on the client,
where `placements`/`symbolKeys` stay deterministic. The schema carries **no array
constraints** — `minItems` is rejected by structured outputs on a raw `messages.create()`
call (it isn't stripped the way the `zod` helpers do it) and 400s the whole request. The
"title + body" minimum is enforced by the prompt and by the client guard in
`skyReadingRemote.ts` (a `< 2`-item `narrative` is rejected, surfacing the error state).
Two tiers:
- `narrative` — the **main reading**. `narrative[0]` is the serif pull-quote title;
  `narrative[1..]` is the 3–6 sentence body, big three only. It must carry the title **plus**
  the body (the client rejects a title-only response) — otherwise the main reading would
  render as just the title with no analysis.
- `expandedNarrative` — the **hidden expansion**: one 1–2 sentence entry per remaining
  planet/point, in the order the client sends them (see §2.5). No pull-quote.

**Voice:** gently oracular — a wise horoscope / tarot register, weighted a touch more to
omen and image than to clinical personality analysis — while staying grounded in the
supplied placements. It should not just *analyze* the dream but draw a **lesson** from it:
surface the theme the dream and sky share, tie it to something real in waking life, and land
the main reading on an empowering, actionable takeaway (a small lesson, question, or
invitation) — balancing the cosmic and the concrete, and staying an invitation rather than
a command or a deterministic prediction.

**Prompting constraint:** the model must only reference placements and symbols actually
present in the input — no inventing planets or aspects. This applies to **both** tiers, and
keeps the feature honest (a real reading of a real chart, specific to this dream) rather
than vague fortune-cookie filler that could apply to anyone.

**Persistence (durable, like the transcript):** a generated reading is written to the local
IndexedDB `readings` cache **and** mirrored to Supabase (`public.sky_readings`, migration
`010`, keyed by dream id, own-row RLS, `on delete cascade` from `dreams`). On view the
narrative resolves local cache → cloud (`readingForDream`) → remote synthesis
(`fetchRemoteNarrative`, then `pushReading`); a failure at the last step surfaces an error
rather than a local reading. So a reading survives across devices and browser eviction
without a repeat paid LLM call, and a transcript edit drops both copies
(`clearCachedReading` + `deleteCloudReading`).
`placements`/`symbolKeys` are never persisted — they recompute on view.

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

- `src/lib/types.ts` — extend `View`, add chart-placement types (`BirthChart` itself is
  already in place — §1).
- `src/App.tsx` — routing for the new tab/view.
- `src/screens/DreamDetail.tsx` — add the Sky tab.
- Birth-data collection is done (§1) — `src/screens/Me.tsx` / `src/screens/Profile.tsx`.
  Still needed: the actual chart computation.
- New: `src/lib/astrology.ts` (chart computation from birth data) and
  `src/lib/skyReading.ts` (LLM call + structured output for a given dream + chart).
- `supabase/migrations/` — new migration adding the computed-chart JSON column to
  `birth_charts` (§1's table already exists).
- `src/lib/db.ts` / `src/lib/sync.ts` — already extended for raw birth data (§1); extend
  further for the computed chart, following the existing dream sync pattern.
- No new design tokens expected — reuse `tokens.css` and existing utility classes
  (`.screen-title`, `.dream-card`, `.preview-band`, `.auth-card`).

## Open questions / risks (resolve in implementation, not this doc)

- **Unknown birth time** is likely the common case — the reading must visibly degrade
  (no Rising, no house-based claims) rather than silently guess a time.
- Ephemeris accuracy/licensing and LLM cost/latency per reading (compute on first view
  and cache vs. precompute at dream-save time) are both implementation-time calls.
- Timezone/DST correctness for historical birth dates and for `dream.createdAt` transit
  lookups.

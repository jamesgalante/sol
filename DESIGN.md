# sól design system

The rules that make every screen look like the same app. Read before
building UI; when in doubt, imitate an existing screen.

## The story (where the design comes from)

The sun burns dreams away ~90 seconds after waking — sól exists to catch
them first. Three characters carry this:

- **The sun** — the record button. A gold disc half-set on a hairline
  horizon; it rises while listening. The only strong color on screen.
- **The sheep** — the narrator. Appears in onboarding and empty states.
  Sleepy, made of cloud-puffs. Never the user's avatar.
- **Clouds** — the people. Every user is a cloud (`CloudAvatar`); their
  nights are clouds on the calendar (`Cloud`, tinted by mood).

New features should extend this world, not introduce a new one.

## Color (tokens.css — never hardcode)

| Token | Hex | Job |
|---|---|---|
| `--night` | `#0a0c13` | page background (pre-dawn indigo, never pure black) |
| `--ink` / `--ink-2` | `#11141e` / `#161a27` | raised / hover surfaces |
| `--line` | `#21263a` | hairlines — the structural element of the app |
| `--bone` | `#eae7e0` | primary text |
| `--fog` / `--fog-dim` | `#8b90a5` / `#565b70` | secondary / tertiary text |
| `--dawn` | `#e4b979` | THE accent. Sun, primary buttons, active dots. Use sparingly — its scarcity is the design. |
| `--mood-dark/-neutral/-bright` | `#d07f7f` / `#8b90a5` / `#ecb35f` | the diverging mood trio (nightmare ← plain → bright) |

Rules:
- Mood colors are **never used without a text label** nearby (calendar has
  a legend; stat bars have names; cards pair cloud + words). They were
  CVD-validated against `--night`; don't invent new status colors.
- Charts: magnitude = single hue (`--dawn`) bars; identity = the mood trio
  only; never a rainbow, never color-only meaning, no dual axes.
- One bold element per screen; everything else quiet.

## Type

- **Display** — Cormorant Garamond, italic, weight 400–500: dream titles,
  screen titles, big prompts. This face IS the app's personality; never
  use it for UI chrome or data.
- **UI** — Instrument Sans: body, buttons, forms.
- **Mono** — Geist Mono, small caps-ish with letterspacing: eyebrows,
  timestamps, tags, nav labels, stats. Mono = "metadata voice."

If text is *a dream or about dreaming* → display italic. If it's *data*
→ mono. Everything else → UI sans.

## Structure

- Single centered column, `max-width: var(--col)` (30rem), mobile-first.
- Hairline dividers (`--line`), generous whitespace, `border-radius`
  small (0.375–0.75rem) or full-round (pills, discs). No shadows except
  glows on the sun/solar cloud.
- Sections: mono uppercase `stat-heading` with a bottom hairline.
- Reuse the existing vocabulary before inventing: `quiet-btn`, `auth-btn`
  (gold pill — one per screen max), `auth-card`, `dream-card`, `tag`,
  `stat-heading`, `friend-row`, `goto-card`.

## Motion

Slow and easing (`--ease`, 0.25–0.9s). One orchestrated moment per
screen (sun rising, sheep hop) — no scattered effects. Every animation
has a `prefers-reduced-motion` fallback. Hover states shift color or
1–2px of position, nothing louder.

## Voice (copy is design)

- Quiet, warm, slightly nocturnal. Second person. No exclamation marks,
  no emoji in UI copy.
- Actions are lowercase and name what happens: `keep`, `cancel`,
  `share to circle`, `let it fade`, `sign out`. A deleted dream "fades";
  a saved one is "kept." Keep this vocabulary consistent end to end.
- Empty states invite, never apologize: "Nothing kept yet. Dreams
  dissolve within minutes of waking."
- Privacy copy is always concrete: "the shape of their nights, not the
  content."

## Non-negotiables

1. Dreams are private by default — any surface that shows someone else's
   dream must trace to an explicit share or pin.
2. Never require the network for core recording/journal.
3. `:focus-visible` outlines stay; every icon-only control gets an
   `aria-label`; mood is never conveyed by color alone.
4. Dark night background everywhere — there is no light mode.
5. New colors/typefaces don't enter the app without updating this file
   and `tokens.css` together, in the same PR.

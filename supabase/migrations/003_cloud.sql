-- sól · cloud characters: per-person cloud (color + earned items).
-- `unlocks` is the earned set; `cloud` holds equipped choices (color).
-- Both are self-managed via the existing update-own-profile policy.

alter table public.profiles
  add column cloud jsonb not null default '{}'::jsonb,
  add column unlocks jsonb not null default '[]'::jsonb;

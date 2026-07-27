-- sól · per-user settings.
-- Synced preferences the server must be able to read (email notification
-- opt-outs, future sharing defaults). Device-local prefs like text size
-- stay in localStorage and never touch this column.

alter table public.profiles
  add column settings jsonb not null default '{}'::jsonb;

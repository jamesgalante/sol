-- sól · sky readings v1
-- Durable per-dream Sky Reading (the LLM-written interpretation), so a reading
-- survives across devices and browser eviction like the dream transcript does,
-- instead of living only in the local IndexedDB cache. One row per dream; the
-- reading is private to its author (never a cross-user read), and it rides the
-- dream's lifecycle via `on delete cascade`.

create table public.sky_readings (
  id uuid primary key references public.dreams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  narrative text[] not null default '{}',
  expanded_narrative text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.sky_readings enable row level security;

create policy "own sky readings: full access"
  on public.sky_readings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

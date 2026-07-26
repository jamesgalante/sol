-- sól · birth chart v1
-- One row per profile, holding the raw birth-data inputs a natal chart
-- reading is computed from later. No cross-user reads needed — a user's
-- own birth data is visible only to them, unlike `profiles` (public username).

create table public.birth_charts (
  id uuid primary key references public.profiles (id) on delete cascade,
  birth_date date,
  birth_time time,
  time_unknown boolean not null default false,
  birth_place text,
  skipped boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.birth_charts enable row level security;

create policy "own birth chart: full access"
  on public.birth_charts for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

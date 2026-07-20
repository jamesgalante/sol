-- sól · Circle backend v1
-- profiles + follows + dreams with row-level security.
-- Dreams are PRIVATE BY DEFAULT; only rows with shared = true are visible
-- to followers. Friend stats come from a security-definer function so
-- followers can see the shape of your nights without reading content.

-- ——— profiles ———
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);

create policy "create own profile"
  on public.profiles for insert to authenticated with check ((select auth.uid()) = id);

create policy "update own profile"
  on public.profiles for update to authenticated using ((select auth.uid()) = id);

-- ——— follows ———
create table public.follows (
  follower uuid not null references public.profiles (id) on delete cascade,
  followee uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);

alter table public.follows enable row level security;

create policy "see follow edges you belong to"
  on public.follows for select to authenticated
  using ((select auth.uid()) in (follower, followee));

create policy "follow someone"
  on public.follows for insert to authenticated with check ((select auth.uid()) = follower);

create policy "unfollow"
  on public.follows for delete to authenticated using ((select auth.uid()) = follower);

-- ——— dreams ———
create table public.dreams (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null,
  duration_sec real not null default 0,
  transcript text not null default '',
  title text not null default '',
  tags text[] not null default '{}',
  mood text not null default 'neutral' check (mood in ('dark', 'neutral', 'bright')),
  shared boolean not null default false,
  updated_at timestamptz not null default now()
);

create index dreams_user_created on public.dreams (user_id, created_at desc);

alter table public.dreams enable row level security;

create policy "own dreams: full access"
  on public.dreams for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "followers read shared dreams"
  on public.dreams for select to authenticated
  using (
    shared
    and exists (
      select 1 from public.follows f
      where f.followee = dreams.user_id and f.follower = (select auth.uid())
    )
  );

-- ——— friend stats (shape, not content) ———
create or replace function public.friend_stats(target uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select case
    when target = auth.uid() or exists (
      select 1 from follows where follower = auth.uid() and followee = target
    )
    then (
      select json_build_object(
        'total', count(*),
        'dark_pct', coalesce(round(100.0 * count(*) filter (where mood = 'dark') / nullif(count(*), 0)), 0),
        'last_week', count(*) filter (where created_at > now() - interval '7 days'),
        'top_tag', (
          select t from dreams d2, unnest(d2.tags) t
          where d2.user_id = target
          group by t order by count(*) desc limit 1
        )
      )
      from dreams where user_id = target
    )
    else null
  end;
$$;

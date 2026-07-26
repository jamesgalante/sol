-- sól · comments on dreams.
-- Visibility piggybacks on the dream's own RLS: you can read/write comments
-- exactly where you can read the dream (yours, shared-to-you, or pinned).
-- The dreamer can delete any comment on their dream.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  dream_id uuid not null references public.dreams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index comments_dream on public.comments (dream_id, created_at);

alter table public.comments enable row level security;

-- the dreams subquery runs under dreams' own RLS, so "dream exists" here
-- means "dream is visible to the current user"
create policy "comments visible where the dream is"
  on public.comments for select to authenticated
  using (exists (select 1 from public.dreams d where d.id = comments.dream_id));

create policy "comment on dreams you can see"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.dreams d where d.id = comments.dream_id)
  );

create policy "delete own comments, or any on your own dream"
  on public.comments for delete to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.dreams d
      where d.id = comments.dream_id and d.user_id = (select auth.uid())
    )
  );

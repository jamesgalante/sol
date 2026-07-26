-- sól · profiles v1: display name + bio, pinned dreams, public-ish stats.
-- "Pinned" is deliberately more public than "shared": a pinned dream is
-- visible to ANY signed-in user who visits your profile, not just followers.

alter table public.profiles
  add column display_name text check (char_length(display_name) <= 40),
  add column bio text check (char_length(bio) <= 200);

alter table public.dreams
  add column pinned boolean not null default false;

create policy "pinned dreams visible to signed-in users"
  on public.dreams for select to authenticated
  using (pinned);

-- Stats were followers-only; profiles make them visible to any signed-in
-- viewer (still shape only — counts and percentages, never content).
create or replace function public.friend_stats(target uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null
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

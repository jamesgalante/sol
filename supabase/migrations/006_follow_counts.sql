-- sól · follower/following counts for any profile.
-- Edge rows stay private to the two people involved (RLS unchanged);
-- this security-definer function exposes only the totals.

create or replace function public.follow_counts(target uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null then
      json_build_object(
        'followers', (select count(*) from follows where followee = target),
        'following', (select count(*) from follows where follower = target)
      )
    else null
  end;
$$;

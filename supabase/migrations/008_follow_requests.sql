-- sól · follow requests: following now needs the followee's approval.
-- New follows start 'pending'; existing follows are grandfathered in as
-- 'accepted'. Shared dreams (and via them, comments) flow only across
-- accepted edges. Stats stay visible to any signed-in user (by design:
-- the shape of your nights was always shareable).

alter table public.follows
  add column status text not null default 'pending'
    check (status in ('pending', 'accepted'));

-- everyone who follows today was implicitly accepted
update public.follows set status = 'accepted';

-- inserts may only create pending requests, by the follower themself
drop policy "follow someone" on public.follows;
create policy "request to follow"
  on public.follows for insert to authenticated
  with check ((select auth.uid()) = follower and status = 'pending');

-- the followee accepts by flipping status
create policy "followee accepts requests"
  on public.follows for update to authenticated
  using ((select auth.uid()) = followee)
  with check ((select auth.uid()) = followee and status = 'accepted');

-- decline / unfollow / remove-a-follower are all deletes, by either side
drop policy "unfollow" on public.follows;
create policy "either side can sever"
  on public.follows for delete to authenticated
  using ((select auth.uid()) in (follower, followee));

-- shared dreams now require an ACCEPTED follow
drop policy "followers read shared dreams" on public.dreams;
create policy "accepted followers read shared dreams"
  on public.dreams for select to authenticated
  using (
    shared
    and exists (
      select 1 from public.follows f
      where f.followee = dreams.user_id
        and f.follower = (select auth.uid())
        and f.status = 'accepted'
    )
  );

-- counts only count accepted edges
create or replace function public.follow_counts(target uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null then
      json_build_object(
        'followers', (select count(*) from follows where followee = target and status = 'accepted'),
        'following', (select count(*) from follows where follower = target and status = 'accepted')
      )
    else null
  end;
$$;

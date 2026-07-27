-- sól · mutual follows skip the approval queue.
-- If someone already follows you (accepted), your follow-back shouldn't
-- need their sign-off — intent is mutual by definition. The insert policy
-- gains an accepted path guarded by a security-definer check.

create or replace function public.follows_me(other uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from follows
    where follower = other
      and followee = auth.uid()
      and status = 'accepted'
  );
$$;

drop policy "request to follow" on public.follows;
create policy "request to follow (mutuals auto-accept)"
  on public.follows for insert to authenticated
  with check (
    (select auth.uid()) = follower
    and (
      status = 'pending'
      or (status = 'accepted' and public.follows_me(followee))
    )
  );

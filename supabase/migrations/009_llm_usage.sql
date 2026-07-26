-- sól · complimentary LLM usage v1
-- One private row per profile tracking how many free Sky Readings a user has
-- spent. Allowlisted accounts (LLM_ALLOWED_EMAILS, enforced in api/sky-reading.ts)
-- stay unlimited and never touch this table; everyone else gets one free LLM
-- reading, claimed atomically by the RPC below before we spend on Anthropic.
-- Private like `birth_charts` — a user sees only their own usage.

create table public.llm_usage (
  id uuid primary key references public.profiles (id) on delete cascade,
  free_analyses_used int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.llm_usage enable row level security;

-- Owner may READ their own usage (so the UI could show "1 free reading left").
-- Deliberately NO insert/update policy — all writes go through the security-definer
-- RPCs below, so the counter can't be reset by a hand-rolled client update.
create policy "own llm usage: read"
  on public.llm_usage for select to authenticated
  using ((select auth.uid()) = id);

-- Atomically consume one free credit for the calling user. Returns true iff a
-- credit was granted. The `free_analyses_used < free_limit` guard on the UPDATE
-- makes the claim atomic — two concurrent calls can't both succeed. Must be
-- called by a client authenticated as the user (auth.uid() drives everything).
create or replace function public.claim_free_analysis(free_limit int default 1)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  granted boolean;
begin
  insert into public.llm_usage (id) values (auth.uid()) on conflict (id) do nothing;
  update public.llm_usage
    set free_analyses_used = free_analyses_used + 1, updated_at = now()
    where id = auth.uid() and free_analyses_used < free_limit
    returning true into granted;
  return coalesce(granted, false);
end;
$$;

-- Give a credit back — called when synthesis fails after a claim, so a failed
-- reading (e.g. a 502 from Anthropic) doesn't burn the user's one free analysis.
create or replace function public.refund_free_analysis()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.llm_usage
    set free_analyses_used = greatest(free_analyses_used - 1, 0), updated_at = now()
    where id = auth.uid();
end;
$$;

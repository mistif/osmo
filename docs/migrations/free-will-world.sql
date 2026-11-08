-- Osmo's free will, the big world (spec 2026-10-11-osmo-free-will-design.md section 6.1): one row per owner, the seed
-- the world is generated from, the generator version, how many islands have risen, and how far the work budget is spent.
-- STATUS: applied 2026-10-12 as migration free_will_world (Gur's OK; main). Was: not applied. An Ask to main: apply with Gur's OK before the code that reads it is pushed with
-- NEXT_PUBLIC_OSMO_BIGWORLD on. Apply it before free-will-builds.sql.
-- The database picks the seed (the world code draws no random numbers). A save never moves islands, budget_at or
-- seen_at backwards, and never changes the seed, the version or when the world was made (the trigger), so two tabs or a
-- late save cannot undo either. seen_at is when a page last ran the world (saved at each load and each hide): "Gur away
-- a long time" is read from it, since budget_at moves only when free blocks are spent.

create table public.world (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  seed bigint not null default (floor(random() * 2147483647))::bigint,
  gen smallint not null default 1 check (gen between 1 and 100),
  islands smallint not null default 4 check (islands between 1 and 8),
  budget_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now());
create function public.world_forward() returns trigger language plpgsql set search_path = '' as $$
begin
  new.seed = old.seed;
  new.gen = old.gen;
  new.created_at = old.created_at;
  new.islands = greatest(old.islands, new.islands);
  new.budget_at = greatest(old.budget_at, new.budget_at);
  new.seen_at = greatest(old.seen_at, new.seen_at);
  return new;
end $$;
create trigger world_forward before update on public.world for each row execute function public.world_forward();
alter table public.world enable row level security;
create policy "own world" on public.world for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.world from anon, authenticated;
grant select, insert, update on public.world to authenticated;

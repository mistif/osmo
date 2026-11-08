-- Village phase 1 (spec 2026-10-09-osmo-village-design.md section 4): how far Osmo has built each room.
-- STATUS: applied 2026-10-09 as migration village_phase_1 (Gur's OK). authenticated has select, insert, update, delete (verified). Was: before the
-- code that reads it is pushed.
-- One row per room. The browser reads and writes its own rows; a save never moves laid backwards and never changes
-- when a room was started or first finished (the trigger), so two tabs, or a late save from an old tab, cannot undo
-- progress. The room names for phase 2 are allowed now so phase 2 needs no migration.

create table public.village (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  room text not null check (room in ('hall', 'library', 'workshop', 'study', 'gate', 'observatory')),
  laid int not null default 0 check (laid between 0 and 10000),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (user_id, room));
create function public.village_forward() returns trigger language plpgsql set search_path = '' as $$
begin
  new.laid = greatest(old.laid, new.laid);
  new.started_at = old.started_at;
  new.finished_at = coalesce(old.finished_at, new.finished_at);
  return new;
end $$;
create trigger village_forward before update on public.village for each row execute function public.village_forward();
alter table public.village enable row level security;
create policy "own village" on public.village for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.village from anon, authenticated;
grant select, insert, update, delete on public.village to authenticated;

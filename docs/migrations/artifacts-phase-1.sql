-- Artifacts phase 1 (spec 2026-10-08-osmo-artifacts-design.md section 7). Insert only through /api/artifacts (service role).
-- STATUS: written, NOT applied. Main applies it as migration artifacts_phase_1 after Gur's OK in chat, then records "as applied" here.
-- The browser may read and delete its own rows and change only title and kept; it can never insert.

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  kind text not null default 'react' check (kind = 'react'),
  source text not null check (octet_length(source) <= 12288),
  version smallint not null default 1 check (version between 1 and 99),
  parent_id uuid references public.artifacts (id) on delete set null,
  kept boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create index artifacts_user_created on public.artifacts (user_id, created_at desc);
create function public.artifacts_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger artifacts_touch before update on public.artifacts for each row execute function public.artifacts_touch();
alter table public.artifacts enable row level security;
create policy "own artifacts read" on public.artifacts for select to authenticated using ((select auth.uid()) = user_id);
create policy "own artifacts update" on public.artifacts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own artifacts delete" on public.artifacts for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.artifacts from anon, authenticated;
grant select, delete on public.artifacts to authenticated;
grant update (title, kept) on public.artifacts to authenticated;

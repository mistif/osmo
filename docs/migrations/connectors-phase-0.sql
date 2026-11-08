-- Connectors phase 0, applied to Supabase on 2026-10-07 as migration connectors_phase0 (spec 2026-10-07-osmo-connectors-design.md sections 4.2, 5, 6.1, 10).
-- Server-only tables have RLS on, no policies and no grants for anon or authenticated; the service role bypasses RLS.

create table public.profile (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  timezone text, place text,
  lat numeric(5,2) check (lat between -90 and 90), lon numeric(5,2) check (lon between -180 and 180),
  paused boolean not null default false, hide_reminder_text boolean not null default false,
  levels jsonb not null default '{}'::jsonb check (jsonb_typeof(levels) = 'object'),
  updated_at timestamptz not null default now());
alter table public.profile enable row level security;
create policy "own profile" on public.profile for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.profile from anon, authenticated;
grant select, insert, update on public.profile to authenticated;

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google','spotify')),
  level text not null default 'act' check (level in ('off','read','ask','act')),
  scopes text[] not null default '{}', account text,
  access_enc text, refresh_enc text, access_expires_at timestamptz,
  status text not null default 'ok' check (status in ('ok','needs_reconnect')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, provider));
alter table public.connections enable row level security;
create policy "own connections read" on public.connections for select to authenticated using ((select auth.uid()) = user_id);
create policy "own connections level" on public.connections for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.connections from anon, authenticated;
grant select (id, provider, level, scopes, account, status, access_expires_at, created_at, updated_at) on public.connections to authenticated;
grant update (level) on public.connections to authenticated;

create table public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null, nonce_hash text not null unique,
  expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null default now());
alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from anon, authenticated;

create table public.actions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  surface text not null check (surface in ('room','telegram','cron','confirm')),
  connector text not null, name text not null, tier smallint not null check (tier between 1 and 3),
  status text not null check (status in ('done','failed','refused','waiting','cancelled','expired')),
  summary text not null check (char_length(summary) <= 200), error text, pending_id uuid);
create index actions_user_at on public.actions (user_id, at desc);
alter table public.actions enable row level security;
create policy "own actions read" on public.actions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own actions delete" on public.actions for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.actions from anon, authenticated;
grant select, delete on public.actions to authenticated;

create table public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(), expires_at timestamptz not null,
  name text not null, args jsonb not null, summary text not null, surface text not null,
  status text not null default 'pending' check (status in ('pending','running','done','cancelled','expired','failed')),
  action_id bigint);
create unique index pending_one_per_user on public.pending_actions (user_id) where status = 'pending';
alter table public.pending_actions enable row level security;
revoke all on public.pending_actions from anon, authenticated;

alter table public.messages add column surface text check (surface in ('room','telegram'));

-- Connectors phase 1a, the tables (spec 2026-10-07-osmo-connectors-design.md sections 6.2, 7.1, 10). NOT YET APPLIED: main applies it with Gur's OK
-- (apply_migration, name connectors_phase1_tables); this header is then changed to say "applied on <date>".
-- The browser may only read and delete its own rows; the server (service role) inserts and updates. push_subscriptions keys are never readable by the browser.

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200), due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','cancelled')),
  created_at timestamptz not null default now(), sent_at timestamptz);
create index reminders_due on public.reminders (status, due_at);
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 1000), created_at timestamptz not null default now());
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null,
  label text check (char_length(label) <= 40), created_at timestamptz not null default now(), last_ok_at timestamptz);
alter table public.reminders enable row level security;
alter table public.notes enable row level security;
alter table public.push_subscriptions enable row level security;
create policy "own reminders read" on public.reminders for select to authenticated using ((select auth.uid()) = user_id);
create policy "own reminders delete" on public.reminders for delete to authenticated using ((select auth.uid()) = user_id);
create policy "own notes read" on public.notes for select to authenticated using ((select auth.uid()) = user_id);
create policy "own notes delete" on public.notes for delete to authenticated using ((select auth.uid()) = user_id);
create policy "own push read" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own push delete" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.reminders, public.notes, public.push_subscriptions from anon, authenticated;
grant select, delete on public.reminders, public.notes to authenticated;
grant select (id, label, created_at, last_ok_at) on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;

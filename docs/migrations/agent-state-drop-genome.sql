-- Bloat audit B1 (docs/osmo-bloat-2026-10-09.md): agent_state.genome was left from the 100-donor days; no code reads it since
-- the one-character rewrite (5c10710). STATUS: applied 2026-10-10 as migration agent_state_drop_genome (Gur's OK). The one
-- row's value was copied to a local file outside the repo first (GroupProject/agent_state_genome_backup_2026-10-10.json).

alter table public.agent_state drop column if exists genome;

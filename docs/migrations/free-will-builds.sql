-- Osmo's free will, builds (spec 2026-10-11-osmo-free-will-design.md sections 6.2 and 6.3): every build he makes, the
-- castle's six rooms included, each with the footprint it was compiled to (saved, never recomputed), how far it is
-- laid, and his line for it; and the castle moved over from village.
-- STATUS: not applied. An Ask to main: apply after free-will-world.sql, with Gur's OK, before the code that reads it is
-- pushed with NEXT_PUBLIC_OSMO_BUILDS on.
-- A save never moves laid backwards and never changes what was chosen, where, or when it started; finished_at is set
-- once. One unfinished free build at a time (two tabs choosing at once: the second insert fails and that tab adopts the
-- first one's build). The castle's rooms are outside that rule (a room can open while a free build is half done, and
-- the castle comes first) and are unique per room instead.
-- village is not revoked here: with NEXT_PUBLIC_OSMO_BUILDS off the room still writes it. With it on the code only
-- reads it (to carry progress made after this copy). Main makes it read-only, and later drops it, with Gur's OK.

create table public.builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe text not null check (char_length(recipe) between 1 and 60),
  params jsonb not null default '{}'::jsonb check (octet_length(params::text) <= 2048),
  island smallint not null check (island between 0 and 7),
  x int not null check (x between 0 and 1023),
  y int not null check (y between 0 and 159),
  footprint jsonb not null check (octet_length(footprint::text) <= 16384),
  total int not null check (total between 1 and 10000),
  laid int not null default 0 check (laid between 0 and total),
  reason text check (reason is null or char_length(reason) <= 200),
  started_at timestamptz not null default now(),
  finished_at timestamptz);
create function public.builds_forward() returns trigger language plpgsql set search_path = '' as $$
begin
  new.user_id = old.user_id;
  new.recipe = old.recipe;
  new.params = old.params;
  new.island = old.island;
  new.x = old.x;
  new.y = old.y;
  new.footprint = old.footprint;
  new.total = old.total;
  new.reason = coalesce(old.reason, new.reason);
  new.laid = greatest(old.laid, new.laid);
  new.started_at = old.started_at;
  new.finished_at = coalesce(old.finished_at, new.finished_at);
  return new;
end $$;
create trigger builds_forward before update on public.builds for each row execute function public.builds_forward();
create unique index builds_one_unfinished on public.builds (user_id) where finished_at is null and recipe not like 'castle:%';
create unique index builds_castle_room on public.builds (user_id, recipe) where recipe like 'castle:%';
alter table public.builds enable row level security;
create policy "own builds" on public.builds for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.builds from anon, authenticated;
grant select, insert, update, delete on public.builds to authenticated;

-- The castle moves over (6.3): one builds row per village row, its footprint today's blueprint, placed by the home
-- offset (445 columns, 60 rows), laid and its times copied (laid capped at the room's blocks).
insert into public.builds (user_id, recipe, params, island, x, y, footprint, total, laid, reason, started_at, finished_at)
select v.user_id, 'castle:' || v.room, '{}'::jsonb, 0, c.x, c.y, c.footprint, c.total, least(v.laid, c.total), null, v.started_at,
  case when least(v.laid, c.total) >= c.total then coalesce(v.finished_at, v.started_at) else null end
from public.village v
join (values
  ('hall', 468, 71, '{"map":[".........^.........","........<=>..T.....",".......<===>.C.....","......<=====>C.....",".....<=======>.....","....<=========>....","...<===========>...","..hhhhhhhhhhhhhhh..","..IBBBBBBBBBBBBBI..","..IBBvBBBBBBBvBBI..","..IBBwBBBBBBBwBBI..","..IBBBBBBBBBBBBBI..","..IBBBBBBaBBBBBBI..","..IBBBBBBdBBBBBBI..",".SSSSSSSSSSSSSSSSS."],"decor":["...................","...................","...................","...................","...................","...................","...................","...................",".......b...b.......",".......e...e.......","...................","...................","........l.l........","...................","..................."],"legend":{"S":{"tile":"step","layer":"floor"},"I":{"tile":"pillar","layer":"walls"},"B":{"tile":"brick","layer":"walls"},"h":{"tile":"beam-h","layer":"walls"},"<":{"tile":"roof-left","layer":"roof"},">":{"tile":"roof-right","layer":"roof"},"=":{"tile":"roof-flat","layer":"roof"},"^":{"tile":"roof-peak","layer":"roof"},"C":{"tile":"brick","layer":"roof"},"T":{"tile":"battlement","layer":"roof"},"v":{"tile":"window-top","layer":"windows"},"w":{"tile":"window","layer":"windows"},"a":{"tile":"door-top","layer":"door"},"d":{"tile":"door","layer":"door"},"l":{"tile":"lantern","layer":"lanterns"},"b":{"tile":"banner","layer":"banners"},"e":{"tile":"banner-end","layer":"banners"}}}'::jsonb, 180),
  ('library', 461, 77, '{"map":["<=======>","hhhhhhhhh","BBBBBBBBB","BBkBBBBBk","BBkBBBBBk","BBBBBBBBB","BBBBBaBBB","BBBBBdBBB","SSSSSSSS."],"decor":[".........",".........",".....b...",".....e...",".........",".........","....l.l..",".........","........."],"legend":{"S":{"tile":"step","layer":"floor"},"B":{"tile":"brick","layer":"walls"},"h":{"tile":"beam-h","layer":"walls"},"<":{"tile":"roof-left","layer":"roof"},">":{"tile":"roof-right","layer":"roof"},"=":{"tile":"roof-flat","layer":"roof"},"k":{"tile":"shelf-window","layer":"windows"},"a":{"tile":"door-top","layer":"door"},"d":{"tile":"door","layer":"door"},"l":{"tile":"lantern","layer":"lanterns"},"b":{"tile":"banner","layer":"banners"},"e":{"tile":"banner-end","layer":"banners"}}}'::jsonb, 84),
  ('workshop', 485, 77, '{"map":["<=======>T.","hhhhhhhhhCh","BBBBBBBBBBB","BvBBBBBvBBB","BwBBBBBwBBB","BBBBBBBBBBB","BBBBaBBBBBB","BBBBdBBBffB",".SSSSSSSSSS"],"decor":["...........","...........","....b......","....e......","...........","...........","...l.l.....","...........","..........."],"legend":{"S":{"tile":"step","layer":"floor"},"B":{"tile":"brick","layer":"walls"},"h":{"tile":"beam-h","layer":"walls"},"<":{"tile":"roof-left","layer":"roof"},">":{"tile":"roof-right","layer":"roof"},"=":{"tile":"roof-flat","layer":"roof"},"C":{"tile":"brick","layer":"roof"},"T":{"tile":"battlement","layer":"roof"},"v":{"tile":"window-top","layer":"windows"},"w":{"tile":"window","layer":"windows"},"f":{"tile":"forge","layer":"windows"},"a":{"tile":"door-top","layer":"door"},"d":{"tile":"door","layer":"door"},"l":{"tile":"lantern","layer":"lanterns"},"b":{"tile":"banner","layer":"banners"},"e":{"tile":"banner-end","layer":"banners"}}}'::jsonb, 101),
  ('study', 456, 73, '{"map":["..c..",".<=>.","<===>","hhhhh","BBBBI","BBkBI","BBBBI","BBvBI","BBwBI","BBBBI","BBaBI","BBdBI","SSSSS"],"decor":[".....",".....",".....",".....",".....",".....",".....",".....",".....",".....",".l.l.",".....","....."],"legend":{"S":{"tile":"step","layer":"floor"},"I":{"tile":"pillar","layer":"walls"},"B":{"tile":"brick","layer":"walls"},"h":{"tile":"beam-h","layer":"walls"},"<":{"tile":"roof-left","layer":"roof"},">":{"tile":"roof-right","layer":"roof"},"=":{"tile":"roof-flat","layer":"roof"},"c":{"tile":"tower-cap","layer":"roof"},"v":{"tile":"window-top","layer":"windows"},"w":{"tile":"window","layer":"windows"},"k":{"tile":"shelf-window","layer":"windows"},"a":{"tile":"door-top","layer":"door"},"d":{"tile":"door","layer":"door"},"l":{"tile":"lantern","layer":"lanterns"}}}'::jsonb, 61),
  ('gate', 449, 75, '{"map":["T.....T","I.....I","ITTTTTI","IhhhhhI","IBBBBBI","IvBBBvI","IwBBBwI","IBBBBBI","IBBaBBI","IBBdBBI","SSSSSSS"],"decor":[".......",".......",".......",".......",".......",".......",".......",".......","..l.l..",".......","......."],"legend":{"S":{"tile":"step","layer":"floor"},"I":{"tile":"pillar","layer":"walls"},"B":{"tile":"brick","layer":"walls"},"h":{"tile":"beam-h","layer":"walls"},"T":{"tile":"battlement","layer":"roof"},"v":{"tile":"window-top","layer":"windows"},"w":{"tile":"window","layer":"windows"},"a":{"tile":"door-top","layer":"door"},"d":{"tile":"door","layer":"door"},"l":{"tile":"lantern","layer":"lanterns"}}}'::jsonb, 69),
  ('observatory', 496, 69, '{"map":["..(ggg)..",".(ggggg).",".ggggggg.","ThhhhhhhT","IBBBBBBBI","IBBvBvBBI","IBBwBwBBI","IBBBBBBBI","IBBBBBBBI","hhhhhhhhh","IBBBBBBBI","IBvBBBvBI","IBwBBBwBI","IBBBBBBBI","IBBBaBBBI","IBBBdBBBI","SSSSSSSSS"],"decor":[".........",".........",".........",".........",".........",".........",".........",".........",".........",".........","....b....","....e....",".........",".........","...l.l...",".........","........."],"legend":{"S":{"tile":"step","layer":"floor"},"I":{"tile":"pillar","layer":"walls"},"B":{"tile":"brick","layer":"walls"},"h":{"tile":"beam-h","layer":"walls"},"T":{"tile":"battlement","layer":"roof"},"(":{"tile":"dome-l","layer":"roof"},")":{"tile":"dome-r","layer":"roof"},"g":{"tile":"dome","layer":"roof"},"v":{"tile":"window-top","layer":"windows"},"w":{"tile":"window","layer":"windows"},"a":{"tile":"door-top","layer":"door"},"d":{"tile":"door","layer":"door"},"l":{"tile":"lantern","layer":"lanterns"},"b":{"tile":"banner","layer":"banners"},"e":{"tile":"banner-end","layer":"banners"}}}'::jsonb, 149)
) as c(room, x, y, footprint, total) on c.room = v.room
on conflict do nothing;

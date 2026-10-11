# Handoff: Osmo's free will, the big world and the build grammar

From main to the Language lane ("Opus 5.5 Secondary Osmo Agent"), at Gur's request on 2026-10-11 ("have the secondary osmo agent work on this"). Main keeps migrations, pushes to `main`, the room's part of `app/assistant.tsx`, and the shell. The world is yours from here: `lib/world/**`, `components/osmo/world.tsx`, `world.module.css`, `app/dev/world/**`, the village specs and plans. Read this brain's README, `lanes.md` (updated today) and the top of every desk first.

## What Gur asked for (his words, 2026-10-11)

"can we give osmo like free will and maybe make it so i can zoom out into the world and in and its like he has much more land to build with whatever he wants we give him like 100 of terrarias style builds aka 2d that he learns from and chooses what he wants"

Main's write-back, which Gur approved ("looks good"):

- A much larger world (several islands, more land); Gur can zoom and pan freely and zoom back to him.
- He decides on his own what to build next, where and when, from a wide vocabulary of 2D Terraria-style builds; it grows over months into something that is his.
- Constraint: no actual Terraria builds or art (proprietary; the community builds are other people's work). "Terraria-style" as a style guide only. All art is ours (letter grids in code; Kenney Tiny Town CC0 is allowed and credited in `lib/world/tiles.ts`).
- Approach recommended and accepted: a grammar of parts (about forty parts: wall kinds, roof shapes, towers, arches, balconies, gardens, bridges, lanterns, banners); code composes a building from a short recipe; a seed set of about twenty authored recipes gives it taste; his own past builds become recipes he varies; the grammar keeps weights for parts he has used ("learns from"). Hero blueprints by hand (a keep, a lighthouse) can come later as landmarks, not now.
- Free will: a planner in code decides when (a quiet hour, a good day, a finished conversation), where (free land near his last work, a new island when full) and offers three candidates; the model picks one and says why in his words (the village probe measured about 1,000 tokens per choice with gpt-5.4-mini; several a day is under 1% of the daily mini pool). Mood feeds the choice (lanterns and gardens on lonely days, towers on hopeful ones).
- Zoom and pan: wheel or pinch from scale 4 down to a far view where islands are silhouettes; drag to pan; a tap on him or a message brings the camera home. World about 1024 tiles across, three to five islands, generated once and saved.

## Where things are

- Spec: `my-app/docs/superpowers/specs/2026-10-09-osmo-village-design.md` (phases 1 to 3; this project supersedes its phase 3). Plans: `docs/superpowers/plans/2026-10-09-osmo-village-phase-1.md`, `2026-10-10-osmo-village-phase-2.md`, `2026-10-10-osmo-village-polish.md` (read the first 120 lines of each: constraints and rulings).
- Code: `lib/world/` (palette, raster, tiles, osmo-sprite, blueprints/, sky, backdrop, actor, face, signals, camera, pace, progress, village, village-data, village-counts, rooms, unlock, texture, life, render, pixel-painter, canvas-painter, png), `components/osmo/world.tsx`, `world.module.css`, `app/dev/world/`. All behind `NEXT_PUBLIC_OSMO_SHELL2` and `NEXT_PUBLIC_OSMO_WORLD` (both on in Vercel production since 2026-10-11, build `1f44ea7`).
- Reports of how things ended up (git-ignored, in main's tree; ask main for copies if your tree lacks them): `my-app/.superpowers/sdd/2026-10-09-osmo-village-phase-1/`, `.../2026-10-10-osmo-village-phase-2/`, `.../2026-10-10-osmo-village-polish/` (final reviews, art and look reports, fix reports). Key facts: pixel scale 1 on desktop, 2 on phone; 30 fps cap, 15 fps with particles, 3 s tick, nothing while hidden, still frames under reduced motion; a 1920x1080 frame costs about 3 ms (hills and far islands are cached bitmaps); the `village` table (user_id, room, laid, started_at, finished_at; an update trigger never moves laid backwards; owner-only RLS) holds progress per room; `takeNews()` (a queue) and `roomContext()` are the hooks for your `TurnFacts.village` and the room context line (still owed, see main's desk).
- Rules that stay: spec, then plan, then a subagent-driven build with reviews; the cheapest model that can do the job (Sonnet for pure modules, Opus for art and anything judged by eye; no Haiku); ASCII, no BOM; stage by exact path; never push `main` (post the Ask to main with the commits); migrations are SQL files under `docs/migrations/` with an Ask to main; the design needs Gur's approval section by section before the spec, and the spec before the plan.

## Suggested first steps

1. Brainstorm with Gur in sections: the world and camera (size, islands, zoom levels, saving the generated world), the grammar (parts, recipes, the seed set, how taste and weights work), his will (the planner's triggers, candidates, the model's pick and line, mood), persistence (a `builds` table generalising `village`: id, recipe, x, y, laid, started, finished; how the five rooms we have become builds), cost (tokens per choice, bytes, battery), and what it means for the rail and rooms (rooms stay as places; new builds can hold things too).
2. Write the spec at `docs/superpowers/specs/2026-10-11-osmo-free-will-design.md`, then the plan, then build.
3. Ask main for the migration and the push when the gate is green.

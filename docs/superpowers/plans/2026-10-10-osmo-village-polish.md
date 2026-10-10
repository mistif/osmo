# Osmo's village, the polish pass

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `NEXT_PUBLIC_OSMO_SHELL2=on` and `NEXT_PUBLIC_OSMO_WORLD=on`, the village looks finished: the camera eases instead of stepping, he breathes, blinks, swings a hammer and trails his scarf, the walls and the island stop repeating every 16 px, the castle lights up at night, the sky has hills, haze, birds and snow, the workshop smokes, and the conversation sits on a faint glass band over the world. Either switch off: the room is exactly as today.

**Architecture:** Every rule is a pure module in `lib/world/` with a vitest test: the camera's easing (`camera.ts`), his breath, blink and scarf timing (`actor.ts`) and the wake-ups they need (`pace.ts`), the life in the world as pure functions of the clock with hard caps (new `life.ts`), the stars' twinkle (`sky.ts`), and the renderer's texture and light rules (new `texture.ts`). The art stays letter grids in code (`tiles.ts`, `osmo-sprite.ts`, `backdrop.ts`), drawn by Opus and judged from PNG previews. The renderer (`render.ts`) and its two painters learn to draw a cell into a box of any size (the eased zoom) and a pool of light; it then draws the variants, shadows, light, hills, haze and life. The world component (`components/osmo/world.tsx`) wires the clock, the last landed block and the pace. The room changes in CSS only, under `.stage[data-world]`: no edit to `app/assistant.tsx`.

**Tech Stack:** Next.js 16.4.0 (App Router; `NEXT_PUBLIC_*` inlined at build), React 19.2, TypeScript 5.9 strict, vitest 5 (node environment, `lib/**/*.test.ts` only; there is no canvas or jsdom, so pictures are drawn by `pixelPainter` and hashed), Node 24.

**Spec:** `docs/superpowers/specs/2026-10-09-osmo-village-design.md` (owner-approved; sections 2, 3 and 6 bind this pass: the redraw rules, him, battery and accessibility), and the owner's list below, approved 2026-10-10, all six items. Phases 1 and 2 are built and pushed (`68350b7`, release 0.2.4); their plans `docs/superpowers/plans/2026-10-09-osmo-village-phase-1.md` and `docs/superpowers/plans/2026-10-10-osmo-village-phase-2.md` hold 36 rulings this plan builds on. Read the spec, `AGENTS.md`, this plan's Global Constraints and Rulings, and your own task before you start.

**The owner's list (approved 2026-10-10):**
1. **Motion.** Easing curves on the camera zoom and follow (ease-out cubic, no linear steps); a hammer swing in the kneel-build frames; a one-frame pop and a small dust puff when a block lands; idle breathing (a 1 px rise every few seconds) and a blink every 3 to 6 seconds on the facing frames; the scarf trailing as he walks (two extra frames or a palette-row shift). All inside the existing redraw rules (30 fps cap, slow tick, hidden, reduced motion: no particles, no blink).
2. **Him.** A detail pass on the 16 by 32 sprite at the same size and frame contract: trousers and outline separated in tone so the legs read, a cleaner walk cycle, a two-tone face (eyes with a highlight pixel), the coat with a lit edge. Frames and face patches keep their names and sizes.
3. **Texture.** Two extra variants each of brick, stone (island) and snow, chosen per cell by a deterministic hash of the cell position in the renderer (no blueprint change, no saved-progress change); darker grout; a one-row shadow under every eave and sill drawn by the renderer; hand-drawn far island silhouettes (replace the generated bowls) and a nearer hill layer with a haze band at the horizon.
4. **Light.** Lit bookshelf windows and the dome at night (lit tile variants); warm light spilling on the ground under lanterns and doors (a soft ellipse by the painter); a soft halo around the sun; stars that twinkle (a few stars change alpha on the slow tick); chimney smoke from the workshop (a few drifting puffs).
5. **The room over the world.** A faint glass band behind the conversation column and the composer (backdrop blur where supported, a translucent fill otherwise), the subtitle above his head set in the room's type with a soft shadow, panels sliding over the world with the same easing as the rail uses today; all only under `.stage[data-world]`, nothing changes with the switches off.
6. **Weather and life.** Light snow at night, one or two birds by day crossing the sky, the forge glow breathing. Cheap canvas particles with a hard cap on count, off under reduced motion and when hidden.

## Global Constraints
- **Lanes.** Everything here is main's lane: `lib/world/`, `components/osmo/world.tsx`, `components/osmo/world.module.css`, `app/dev/world/`, `app/assistant.module.css`. **`app/assistant.tsx` is not edited** (shared with language; nothing in this pass needs it, see ruling 21). No language or speaking file is touched.
- **Checks for every commit:** `npx vitest run`, `npx tsc --noEmit -p .` (run `npx next typegen` once first if it complains about `LayoutProps`), `npm run lint`. The gate also runs `npx next build --webpack` (plain `next build` is blocked on this machine), once with both switches unset and once with `NEXT_PUBLIC_OSMO_SHELL2=on` and `NEXT_PUBLIC_OSMO_WORLD=on` set for that command only, never written to `.env.local`.
- **Files:** UTF-8 without BOM, ASCII only (no curly quotes, no ellipsis character, no dashes other than `-`). Keep each file's line endings as they are.
- **No new npm dependency.** Stage by exact path (`git add <paths>`), never `git add -A` or `git add .`. Never push.
- **Every commit message ends with** the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (pass it as a second `-m`).
- **Both switches gate everything.** The world renders only when `WORLD` (`lib/shell/flag.ts`) is true; the CSS of this pass is scoped to `.stage[data-world]` or lives in `world.module.css`, which only the world loads.
- **No model calls.** Nothing in this pass calls a model or spends tokens.
- **Saved progress.** No blueprint changes, no block count changes (the hall's 180 and the five rooms' pinned counts in `blueprints.test.ts` stay), no migration. Variants and lit tiles are chosen where blocks are drawn; the blocks keep their base tiles.
- **Sheet contracts.** The frame sheet stays 18 frames of 16 by 32 (`osmo-sheet.png` stays 288 by 32) with the same names; the three face patches keep their names and their 8 by 4 size (blinks are new cells after them); the tile sheet only grows by appending (cells 61 to 70; an optional `public/village/tiles.png` must then be 1136 by 16).
- **The redraw rules (spec 2) hold:** never more than 30 frames a second (`FRAME_MS` 33), the 3 s slow tick when nothing moves, nothing while hidden, and under `prefers-reduced-motion` still frames with no particles, no blink, no breathing, no twinkle, no pop, and a camera that jumps.
- **The pixel hash** in `render.test.ts` ("draws the hall at 40 blocks to the same pixels every time") is re-pinned only by a task that changes that picture, only after writing and looking at `world-40.png` (`WORLD_SNAPSHOT_DIR=<dir> npx vitest run lib/world/render.test.ts`), and the report says what changed in it. Tasks 7, 8 and 9 re-pin it; no other task may change it.
- **Pixel art** is our own, authored as letter grids in code. Nothing is copied or traced from any game. Art tasks must write their previews, look at every PNG, iterate, and list the PNGs in their report for the main agent to show Gur.
- **Preview files are never committed** (`lib/world/zz-*.test.ts`): delete them before staging and make sure `git status` does not list them.

## Review Focus (each has a test in the task named)
1. **A night left open.** A tab left on the Talk page all night must not run frames all night: snow and smoke come in spells, the loop falls back to its 3 s tick between them, and nothing runs while hidden (Task 3: "falls in spells of 45 s every two minutes", "stops between spells once the last puff has faded", "frames for a landing, the ambient pace for weather, smoke and birds, and nothing when the world is still"; Task 2: "keeps the pace the life in the world asks for", "ignores both under reduced motion, and while hidden"; Task 13 measures it).
2. **The frames between two scales.** While the camera eases the zoom is fractional: no seam may open between cells, nothing may throw on a fractional atlas size, and at rest the picture must be exactly what it was (Task 1: "fills a box between two scales", "draws exactly as before when the box is the cell's own size", "draws between two scales with no gap between neighbours"; Task 6: "eases in over 400 ms on the curve, with no steps").
3. **Reduced motion everywhere.** No particle, blink, breath, twinkle or pop, and the camera and its glide jump (Task 3: "has none of it under reduced motion"; Task 2: "breathes in for 700 ms" (still under reduced motion), "blinks for 140 ms ... never under reduced motion", "ignores both under reduced motion"; Task 6: "jumps at once under reduced motion" for the zoom and the glide).
4. **Everything at once.** Night, snow, smoke, a landing and the dev page's "All life now": the caps hold in every frame at any clock time and the renderer draws it without trouble (Task 3: "never holds more than MAX_PARTICLES in a frame, whatever the time"; Task 10: "draws a full frame of life at its cap, at night, without trouble").
5. **Saved and hashed pictures stay put.** A variant is a pure function of the cell, the same on every load and every device, and a cell's block keeps its base tile, so saved counts and blueprints are untouched; the life is absent from the hashed scene (Task 9: "are chosen the same way every time, and only for brick, stone and snow"; Task 10: "draws nothing of it when none is given"; the unchanged `blueprints.test.ts` counts).

## Verified before planning (reading the tree at `68350b7`, local main, release 0.2.4)
- `lib/world/camera.ts`: `zoomAt` steps whole scales every `STEP_MS` 200; `follow` is exponential smoothing (`SMOOTH_MS` 120) toward a dead-zone aim measured from the camera's own centre. `rooms.ts hitAreas` uses `zoomAt` and copes with a fractional zoom; `rooms.test.ts` spreads a camera (`{ ...camera, from: 2, to: 2 }`), so new camera fields are harmless there.
- `lib/world/render.ts`: every stamp is at the whole zoom; `rasterize` throws on a fractional scale (a typed array of fractional length), so a fractional zoom must never reach an atlas: Task 1 draws from `Math.ceil(z)` into boxes, before Task 6 makes the zoom fractional.
- `lib/world/actor.ts look`: idle cycles `idle-1`/`idle-2` every 600 ms and facing `face-1`/`face-2` every 700 ms; the walk frames carry the scarf's tail in their columns 0 to 3. `pace.ts nextTickIn` has no wake-up for an animation of a standing figure.
- `lib/world/palette.ts`: all 52 letters are taken; `raster.test.ts` requires one-letter keys. The brick's joint is already `a`, the darkest stone step: "darker grout" needs a new colour. His trousers are `M` (#1b2744) beside his outline `H` (#1a1726): that is why the legs do not read.
- `lib/world/tiles.ts`: 61 tiles; `brickAt` is used inside `window`, `forge`, `shelf-window` and `beam-h`, so a new grout reaches them too. `shelf-window` and the dome have no lit variant (task-4 report of phase 2: "the one gap in the lit-window rhythm").
- `lib/world/backdrop.ts`: `FAR_ISLANDS` come from `farIsland(plan)`, a generated bowl; the renderer reads only `runs`, `w`, `fx`, `lift`.
- The workshop's chimney cap is the `battlement` at tile (49, 17) (`blueprints/workshop.ts`, map row 0, `T`).
- `components/osmo/world.module.css`: `.said` and `.heard` sit on a dark pill (`--ink` 78%); the sun is the DOM `Figure` in `.sun`, which has a `translate` and so is its own stacking context.
- `app/assistant.module.css`: `.column` is `position: relative` with no z-index inside the isolated `.stage`; the world root is `z-index: -1`. Panels are `aside#osmo-panel` (`components/osmo/panel.tsx`, `shell-panel.tsx`) and already slide in with `slide-in 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)` from 2rem, the same curve as the rail's `--ease`.
- **Dry run of this plan** (an isolated scratch copy of `68350b7` made with `git archive`, never the shared tree, with stand-in art for Tasks 7, 8 and 4 written to the contracts below): every edit (P1 to D6, 97 of them) was applied by script, in the dispatch order below, to the repo's own files and matched exactly once; every new file was copied in as written here. After each wave `npx vitest run` and `npx tsc --noEmit -p .` were run: the only failures at any point were the four art tests of Task 8 (trousers, the coat's edge, the bob, the hammer: the stand-in art does not draw them, the real art must) and the world-40 hash (re-pinned by the art tasks after looking). At the end: 2381 tests pass beside those five; `npx tsc --noEmit -p .` and `npx eslint lib/world components/osmo app/dev/world` are clean; `npx next build --webpack` passes with both switches unset and with both on, and builds `/dev/world`. All five preview files ran and wrote their PNGs, and the renderer's previews (castle by night with lit glass and pools, 1920 by 1080 with hills and haze, smoke, a landing, the trail) were looked at.


## The list read against the spec and the tree (rulings)
1. **The zoom eases instead of stepping.** Phase 1's ruling 10 (whole-number steps at 200 and 400 ms) is replaced: `zoomAt` runs from wherever the zoom is to the next whole scale on `easeOutCubic(t) = 1 - (1 - t)^3` over `ZOOM_MS` 400 (spec 2's 400 ms kept). At rest the zoom is always a whole scale. Frames in between are fractional: the renderer draws each cell from the next whole scale's atlas (`Math.ceil(z)`) into the box between the screen points of its two corners, nearest neighbour, so cells meet with no gap; pixels are briefly uneven, for 400 ms.
2. **The follow glides.** The dead zone is now measured from the camera's aim, not its drawn centre. The aim follows him exactly (at the zone's edge it moves at his walking pace, 1.6 world px a frame); whenever the aim moves more than `JUMP_PX` 4 in one frame (he turns to Gur or back, the zoom reframes, a room far off) the centre glides after it from where it is, on the same ease-out cubic, over `GLIDE_MS` 500. Reduced motion: no glide (`follow(..., instant)`). A `dt` that is not a positive number still moves nothing.
3. **"A one-frame pop"** is `POP_MS` 100 (three frames at the 30 fps cap; one 33 ms frame would not be seen): the block that just landed is drawn one world pixel bigger on every side. The dust is `DUST_MAX` 6 motes from the block's foot, three each way, falling and fading over `DUST_MS` 450. Both only with motion.
4. **Breathing** is `idle-2` / `face-2` (the chest a pixel up, head and feet still) for `BREATH_IN_MS` 700 at the end of every `BREATH_MS` 3200, replacing today's alternation every 600 and 700 ms, which reads as a twitch. The loop wakes for each edge (`nextLookIn`) instead of running frames.
5. **The blink** lasts `BLINK_MS` 140, once in each `BLINK_WINDOW_MS` 4500 at an offset in its first `BLINK_SPREAD_MS` 1500 from a fixed hash of the window's number, so two blinks are always 3 to 6 s apart and every run blinks the same. Only while facing Gur (in profile his eye is part of the frame). Blink patches are three new face cells (9 to 11), one per face, after the nine gaze cells: the three face patches keep their names and size.
6. **The scarf** trails in **two extra cells on a sheet of their own** (`trail`, 8 by 6, his letters `H` and `Z` only), stamped behind him while he walks and swapped every `TRAIL_MS` 160, out of step with his 100 ms stride so it flutters. Not new frames: the 18-frame contract stays. The walk frames keep a short root of the tail that the trail continues.
7. **New palette letters are digits.** No letter is free, so the polish pass adds `"0"` (grout), `"1"` (eye glint), `"2"` and `"3"` (trousers base and shadow), `"4"` (the coat's lit edge); `raster.test.ts` widens its key rule to one ASCII letter or digit. Values are fixed in Task 1; art tasks do not edit `palette.ts` (if a value must change, say so in the report).
8. **Darker grout** is the new `"0"` (#15171d) as the brick's joint. Every tile that draws brick through `brickAt` (window surrounds, forge, bookcase window, the eave's timber) gets it too. `brick-dark` keeps its own joint.
9. **Variants** are chosen in the renderer by `variantOf(id, x, y)` (`texture.ts`): a fixed integer hash of the tile position, each variant in about one cell in six (`VARIANT_SHARE`), for `brick`, `stone` and `snow` only, laid or ground, outline and next block alike. A variant keeps its base's outermost ring of pixels exactly (`keepRing`), so it joins any neighbour as the base does, and the snow variants keep rows 0 to 3 in snow letters (`n`, `o`, `p`) as the render test of the snow under his feet requires.
10. **Shadows** are one world pixel row (`SHADOW_COLOR` #0b0d12 at `SHADOW_ALPHA` 0.3) over the top row of a wall (`brick`, `brick-dark`, `pillar`) right below a `beam-h` (the eaves' timber), a `window` (its lower half, the sill) or a `shelf-window`. A cell holding a wall and a banner still counts as wall.
11. **Light on the ground** is the painter's new `pool` (the glow squashed into an ellipse): under each `lantern` (26 by 5 world px) and `door` (20 by 4), on the snow's top edge where he stands, at `strength * dark`, only after dark.
12. **Lit tiles** are `shelf-window-lit`, `dome-l-lit`, `dome-lit` and `dome-r-lit`, used from `LIT_FROM` 0.5 like the windows (`litOf`), with a glow on the bookcases (`r` 28, 0.26) and the dome (`r` 34, 0.22).
13. **The sun's halo** is CSS (`.sun::before`): the sun is the DOM heart (`Figure`), not canvas. It fades with the sun when it sets.
14. **Twinkling:** one star in four (`i % 4 === 0`) shines at 1, 0.66 or 0.33 by a hash of its index and the slow tick's number (`Math.floor(Date.now() / SLOW_MS)`); the sky canvas is redrawn on each slow tick only while stars are out; none under reduced motion.
15. **Smoke** rises from the workshop's chimney cap (tile 49, 17) only once that block is laid, in spells (`SMOKE_SPELL_MS` 9000 of every `SMOKE_CYCLE_MS` 30000), a puff every 1.4 s that rises 9 px a second, drifts east 5, grows and fades over 5.6 s; at most `SMOKE_MAX` 6.
16. **Snow** falls only at night (`dark >= 0.5`), in spells (`SNOW_ON_MS` 45000 of every `SNOW_CYCLE_MS` 120000, thinning over `SNOW_RAMP_MS` 6000 at each end), at most `SNOW_MAX` 40 flakes in screen space, 1 or 2 world px. Spells, not all night: that is what lets the loop rest (ruling 17).
17. **The ambient pace.** While snow, smoke or birds are on screen the loop wakes every `AMBIENT_MS` 66 (15 a second); while a landing's pop or dust shows, at frame pace; otherwise the rules are as before (3 s tick, nothing hidden). This is a new wake-up inside the 30 fps cap; under reduced motion and while hidden there is none.
18. **The forge breathes** by `forgeBreath(now)`: its glow's strength swings 18% either way over 2.4 s. Smooth while frames run; on the 3 s tick it is sampled, so it sits a little brighter or dimmer each time (no frames are run for it).
19. **Birds** fly only in full daylight, one flight in every `BIRD_CYCLE_MS` 80000 at a hashed time, `BIRD_FLIGHT_MS` 16000 to cross, one or two birds (`BIRDS_MAX` 2), high (10 to 28% down the view), screen space, behind the clouds. Their art (`BIRD_GRIDS`, 9 by 5, two cells) is in `backdrop.ts`.
20. **All the life is a pure function of the clock** (`life.ts`): the wall clock for the spells and flights (so they are the same in every tab), the loop's clock for a landing. The world keeps only the last landed block. The hard cap is `MAX_PARTICLES` 54; `lifeAt` returns nothing at all without motion.
21. **The room over the world is CSS only**, so `app/assistant.tsx` gets no edit (no C1, C2, ...): the glass band is `.stage[data-world] .column::before` (a `z-index: -1` box inside the isolated stage, so above the world and under the column's content; `pointer-events: none`, so the rooms behind the empty column stay clickable), blurred where `backdrop-filter` is supported and a translucent fill where it is not, fading at its sides; it covers the column and the composer in it.
22. **The subtitle** loses its dark pill: the room's own type (the stage's font, which the world root inherits; the conversation's size and line height) in Bone, with a soft three-layer text shadow so it reads over sky, snow and castle. Gur's heard line, smaller, the same way.
23. **Panels over the world** slide in the whole of their width from the room's right edge (`translate: 100% 0` to `0`) over 0.42 s on the rail's curve `cubic-bezier(0.2, 0.8, 0.2, 1)`, instead of fading in from 2rem; under reduced motion a 0.15 s fade. Entry only: a panel unmounts on close, and an exit would need JavaScript in the shell (not this pass).
24. **The hills** (`HILLS`) are one hand-drawn ridge at least 640 px wide that wraps without a seam, drawn behind the clouds at parallax 0.25 (nearer than the far islands' 0.12), its top line `HILLS.drop` world px below the island's snow, in `hillTones` (darker and a little more coloured than the far islands). A haze band in the horizon colour, 6 px lighter, lies over their foot (`HAZE`: rising from 6 to 44 px below their top line, held at 0.9 to 72, gone by 124); the ridge reaches at least 72 deep so its foot is lost in it. Hills and haze are drawn only when the scene has a sky, so the hashed scene does not change for them.
25. **The far islands** are hand-drawn outlines (closed polygons of points) filled by `silhouette()`; the `FarIsland` type and the renderer's drawing of them are unchanged. Three places of their own, each with something standing on it and something hanging under it.
26. **Snow, birds and the trail are screen-space or sprite-space and drawn at whole scales;** smoke, dust and the pop are world-space and drawn through the camera like the castle.
27. **The dev page** gets a row: "Life by the clock", "All life now" (snow, smoke and birds whatever the hour or spell) and "No life" (`WorldFixed.life`).
28. **Hash re-pins.** Task 7 (the grout and variants' base art), Task 8 (him) and Task 9 (variants by cell, shadows) change the hashed frame and re-pin it after looking; Task 10 must leave it as Task 9 left it (life is absent from that scene, and his look there has no blink or trail).


## File structure
Create:
- `lib/world/painter.test.ts` (Task 1)
- `lib/world/life.ts`, `lib/world/life.test.ts` (Task 3)
- `lib/world/texture.ts`, `lib/world/texture.test.ts` (Task 9)

Modify:
- `lib/world/palette.ts`, `raster.test.ts`, `pixel-painter.ts`, `canvas-painter.ts` (Task 1)
- `lib/world/actor.ts`, `actor.test.ts`, `pace.ts`, `pace.test.ts` (Task 2)
- `lib/world/sky.ts`, `sky.test.ts` (Task 3)
- `lib/world/backdrop.ts`, `backdrop.test.ts` (Task 4)
- `components/osmo/world.module.css`, `app/assistant.module.css` (Task 5)
- `lib/world/camera.ts`, `camera.test.ts` and one line of `components/osmo/world.tsx` (Task 6)
- `lib/world/tiles.ts`, `tiles.test.ts` (Task 7)
- `lib/world/osmo-sprite.ts`, `osmo-sprite.test.ts` (Task 8)
- `lib/world/render.ts`: Tasks 1, 9 and 10, in that order; `lib/world/render.test.ts`: Tasks 1, 7, 8, 9 and 10, in that order (Tasks 7 and 8 change only the atlas line and the hash)
- `components/osmo/world.tsx` (Task 11)
- `app/dev/world/page.tsx` (Task 12)

Not touched: `app/assistant.tsx`, every blueprint, `progress.ts`, `village.ts`, `village-data.ts`, `rooms.ts`, `unlock.ts`, the migration, every language and speaking file.

## Tasks, models and dispatch order
| # | Task | Model | Waits for |
|---|---|---|---|
| 1 | Painters fill a box and pool light; the digit letters; drawing between two scales | Sonnet | - |
| 2 | His breath, blink and scarf timing; the pace's two wake-ups | Sonnet | - |
| 3 | Life in the world (pure) and the stars' twinkle | Sonnet | - |
| 4 | Backdrop art: hand-drawn far islands, the hills, the birds | Opus | - |
| 5 | The room over the world and the sun's halo (CSS) | Sonnet | - |
| 6 | The camera eases and glides | Sonnet | 1 |
| 7 | Tile art: darker grout, six variants, the lit bookcase and dome | Opus | 1 |
| 8 | Him: the detail pass, the hammer, the walk, eyes, blinks, the scarf's trail | Opus | 1, 7 |
| 9 | The renderer: variants, shadows, light, lit glass, hills and haze, twinkle | Opus | 3, 4, 7, 8 |
| 10 | The renderer: the life, the pop, the trail and the blink | Opus | 2, 9 |
| 11 | The world component: the clock, the landing, the life and the pace | Sonnet | 2, 3, 6, 10 |
| 12 | `/dev/world`: the life row | Sonnet | 11 |
| 13 | The gate | main agent | all |

**Dispatch order.**
- **Wave 1, in parallel:** Tasks 1, 2, 3, 4 and 5. Their files are disjoint (1: palette, raster test, painters, `render.ts`, `render.test.ts`, new `painter.test.ts`; 2: actor and pace; 3: new `life.ts`, sky; 4: backdrop; 5: the two CSS files).
- **Wave 2, in parallel, after Task 1:** Tasks 6 and 7 (6: camera and one line of `world.tsx`; 7: tiles and the hash line of `render.test.ts`). Task 6 must not land before Task 1: until the renderer draws into boxes, a fractional zoom would reach `rasterize` and stop the world.
- **Wave 3, after Task 7:** Task 8 (it changes the atlas line and the hash of `render.test.ts`, which Task 7 has just re-pinned, so not beside it).
- **Wave 4, after Tasks 3, 4, 7 and 8:** Task 9.
- **Wave 5, after Tasks 2 and 9:** Task 10.
- **Wave 6, after Tasks 2, 3, 6 and 10:** Task 11.
- **Wave 7:** Task 12. Then the gate, Task 13.

Each task's reviewer checks the task's own diff, its tests and, for the art and renderer tasks (4, 7, 8, 9, 10), looks at the PNGs the report lists.

## The previews (art and renderer tasks)
Each art or renderer task has its own preview file, given in full in the task. Put it at `lib/world/zz-<name>.test.ts`, make the output folder in your scratchpad, run it with `WORLD_SNAPSHOT_DIR` set to that folder (in PowerShell: `$env:WORLD_SNAPSHOT_DIR = "<folder>"; npx vitest run lib/world/zz-<name>.test.ts`; in bash: `WORLD_SNAPSHOT_DIR=<folder> npx vitest run lib/world/zz-<name>.test.ts`), and look at every PNG (the Read tool shows PNGs). Iterate until each one reads as the task describes, keep each round in its own folder, and list the final folder and the PNGs to show Gur in your report. Delete the preview file before you stage anything; it is never committed. The test snapshots (`tiles.png`, `osmo-frames.png`, `world-40.png`) are written by the same variable when you run those test files.


---
### Task 1: Painters fill a box and pool light; the digit letters; drawing between two scales
**Model:** Sonnet. **Waits for:** nothing (wave 1).
**Files:** Modify `lib/world/palette.ts`, `lib/world/raster.test.ts`, `lib/world/render.ts`, `lib/world/pixel-painter.ts`, `lib/world/canvas-painter.ts`, `lib/world/render.test.ts`. Create `lib/world/painter.test.ts`.

**Interfaces:**
- Consumes: `Painter`, `CELL`, `GLOW_STOPS`, `sheetBitmap`, `glowAt` (render.ts, pixel-painter.ts), `parseColor` (raster.ts), `zoomAt`, `toScreen` (camera.ts).
- Produces:
  - `PALETTE` keys `"0"` grout #15171d, `"1"` eye glint #fffaf0, `"2"` trousers #56546a, `"3"` trousers shadow #3a3949, `"4"` coat's lit edge #7d9ad8 (Tasks 7 and 8 draw with them).
  - `Painter.stamp(sheet, cell, x, y, scale, alpha, flip, w?, h?)`: with `w` and `h`, fills that box from the cell at `scale`, nearest neighbour; without, exactly as before.
  - `Painter.pool(x, y, rx, ry, color, alpha)`: the glow's falloff in an ellipse, added like the glow ("lighter").
  - `drawWorld` draws at any zoom `zoomAt` returns, fractional included, from the atlas at `Math.ceil(z)`, every cell into the box between its two corners' screen points; at a whole zoom the output is byte for byte what it was (the world-40 hash does not change).

- [ ] **Step 1: Write the failing tests.** Create `lib/world/painter.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hashPixels, pixelPainter } from "./pixel-painter";
import { colours } from "./raster";
import { artFor, sheetBitmap } from "./render";
import { tileIndex } from "./tiles";

// The polish pass's two additions to the Painter (render.ts): stamp into a box of any size (the camera eases between
// whole scales), and pool (a lamp's light on the ground). Both are drawn here by the pixel painter the tests hash.
const art = artFor("hsl(172 38% 50%)");
const W = 64;
const H = 48;
const px = (d: Uint8ClampedArray, x: number, y: number) => Array.from(d.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
const brick = tileIndex("brick");

describe("stamping into a box", () => {
	it("draws exactly as before when the box is the cell's own size", () => {
		const a = pixelPainter(W, H, art);
		const b = pixelPainter(W, H, art);
		a.stamp("tiles", brick, 5, 3, 2, 1, false);
		b.stamp("tiles", brick, 5, 3, 2, 1, false, 32, 32);
		expect(hashPixels(b.data)).toBe(hashPixels(a.data));
		const fa = pixelPainter(W, H, art);
		const fb = pixelPainter(W, H, art);
		fa.stamp("tiles", brick, 5, 3, 2, 1, true);
		fb.stamp("tiles", brick, 5, 3, 2, 1, true, 32, 32);
		expect(hashPixels(fb.data)).toBe(hashPixels(fa.data));
	});
	it("fills a box between two scales, nearest neighbour, corner to corner", () => {
		const p = pixelPainter(W, H, art);
		p.stamp("tiles", brick, 0, 0, 2, 1, false, 27, 27); // a 16 px tile at zoom 1.7, from the scale 2 atlas
		let opaque = 0;
		for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px(p.data, x, y)[3] > 0) opaque++;
		expect(opaque).toBe(27 * 27); // brick has no transparent pixel
		const cell = sheetBitmap(art, "tiles", 2);
		const src = (x: number, y: number) => Array.from(cell.data.slice((y * cell.w + brick * 32 + x) * 4, (y * cell.w + brick * 32 + x) * 4 + 4));
		expect(px(p.data, 0, 0)).toEqual(src(0, 0));
		expect(px(p.data, 26, 26)).toEqual(src(Math.floor((26 * 32) / 27), Math.floor((26 * 32) / 27)));
	});
	it("mirrors a box too", () => {
		const p = pixelPainter(W, H, art);
		const q = pixelPainter(W, H, art);
		p.stamp("tiles", brick, 0, 0, 2, 1, false, 27, 27);
		q.stamp("tiles", brick, 0, 0, 2, 1, true, 27, 27);
		for (let y = 0; y < 27; y++) expect(px(q.data, 0, y)).toEqual(px(p.data, 26, y));
	});
	it("draws nothing into a box of no size", () => {
		const p = pixelPainter(W, H, art);
		p.stamp("tiles", brick, 0, 0, 2, 1, false, 0, 10);
		expect(p.data.every((v) => v === 0)).toBe(true);
	});
});

describe("a pool of light", () => {
	it("is brightest at its centre and squashed: it reaches further across than up and down", () => {
		const p = pixelPainter(W, H, art);
		p.pool(32, 24, 24, 6, "#ffcf6e", 0.8);
		const a = (x: number, y: number) => px(p.data, x, y)[3];
		expect(a(32, 24)).toBeGreaterThan(a(44, 24));
		expect(a(44, 24)).toBeGreaterThan(0); // half way across: still lit
		expect(a(32, 27)).toBeLessThan(a(44, 24)); // half way down is as far out as half way across
		expect(a(32, 31)).toBe(0); // beyond its height: dark
		expect(a(57, 24)).toBe(0); // beyond its width: dark
	});
	it("adds light like the glow does, and does nothing with no radius or an unreadable colour", () => {
		const p = pixelPainter(W, H, art);
		p.rect(0, 0, W, H, "#20242c", 1);
		const before = px(p.data, 32, 24);
		p.pool(32, 24, 10, 4, "#ffcf6e", 0.5);
		const after = px(p.data, 32, 24);
		for (let i = 0; i < 3; i++) expect(after[i]).toBeGreaterThanOrEqual(before[i]);
		const q = pixelPainter(W, H, art);
		q.pool(32, 24, 0, 4, "#ffcf6e", 1);
		q.pool(32, 24, 10, 4, "nope", 1);
		expect(q.data.every((v) => v === 0)).toBe(true);
	});
});

describe("the digit letters", () => {
	it("are coloured like the other letters", () => {
		const c = colours();
		expect(c["0"]).toBeDefined();
		expect(c["4"]).toBeDefined();
	});
});
```
Then apply these edits (`raster.test.ts`: the key rule and a digit test; `render.test.ts`: a frame half way between two scales):
- [ ] **P2** `lib/world/raster.test.ts`. Find:
```ts
	it("has single-letter ASCII keys, six-digit hex values, and no dot", () => {
		for (const [k, v] of Object.entries(PALETTE)) {
			expect(k).toMatch(/^[a-zA-Z]$/);
```
Replace with:
```ts
	it("has one ASCII letter or digit per key, six-digit hex values, and no dot", () => {
		for (const [k, v] of Object.entries(PALETTE)) {
			expect(k).toMatch(/^[a-zA-Z0-9]$/);
```
- [ ] **P3** `lib/world/raster.test.ts`. Find:
```ts
	it("takes an override for the scarf, and ignores one it cannot read", () => {
```
Replace with:
```ts
	it("reads the digit letters of the polish pass like any other", () => {
		const bmp = rasterize([["01", "34"]], 2, 2, 1, cols);
		expect(Array.from(bmp.data.slice(0, 4))).toEqual([...(parseColor(PALETTE["0"]) ?? [])]);
		expect(Array.from(bmp.data.slice(12, 16))).toEqual([...(parseColor(PALETTE["4"]) ?? [])]);
		expect(gridProblems(["0123", "4..."], 4, 2)).toEqual([]);
	});
	it("takes an override for the scarf, and ignores one it cannot read", () => {
```
- [ ] **RT1** `lib/world/render.test.ts`. Find:
```ts
import { newCamera, toScreen } from "./camera";
```
Replace with:
```ts
import { newCamera, toScreen, zoomAt } from "./camera";
```
- [ ] **RT2** `lib/world/render.test.ts`. Find:
```ts
	it("copes with a canvas of no size", () => {
```
Replace with:
```ts
	it("draws between two scales with no gap between neighbours while the camera eases (polish pass)", () => {
		const s = scene(hall.length);
		const camera = { ...s.camera, from: 2.66, to: 2.66 }; // as the camera draws a frame part way from 2 to 3
		const now = 0;
		expect(zoomAt(camera, now) % 1).not.toBe(0);
		const data = paint({ ...s, camera, now }).data;
		// The hall's wall from x 29 to 35 and y 20 to 23: brick, pillars, windows, the door and banners, every one solid.
		const a = toScreen(camera, VIEW, now, 29 * TILE, 20 * TILE);
		const b = toScreen(camera, VIEW, now, 35 * TILE, 23 * TILE);
		let checked = 0;
		for (let y = Math.max(0, a.y); y < Math.min(VIEW.h, b.y); y++) {
			for (let x = Math.max(0, a.x); x < Math.min(VIEW.w, b.x); x++) {
				expect(px(data, x, y)[3], `${x},${y}`).toBe(255);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(2000);
	});
	it("copes with a canvas of no size", () => {
```

- [ ] **Step 2: Run them and see them fail.**
Run: `npx vitest run lib/world/painter.test.ts lib/world/raster.test.ts lib/world/render.test.ts`
Expected: FAIL: `p.pool is not a function`; the box tests count 1024 opaque pixels, not 729; "reads the digit letters" reports `row 0 has unknown letter 0`; "draws between two scales" throws `Invalid typed array length` (a fractional scale reached `rasterize`).

- [ ] **Step 3: The palette, the Painter, both painters, and drawing at any zoom.**
- [ ] **P1** `lib/world/palette.ts`. Find:
```ts
	// his scarf: at runtime it takes the mood's first aura colour (raster overrides); this is its dev colour
	Z: "#3aa597",
} as const;
```
Replace with:
```ts
	// his scarf: at runtime it takes the mood's first aura colour (raster overrides); this is its dev colour
	Z: "#3aa597",
	// Added in the polish pass. No letter was free, so these keys are digits: the brick's grout (darker than the stone
	// outline a), his eye glint, his trousers' base and shadow (apart from his outline H and his coat), and the lit
	// edge of his coat.
	"0": "#15171d",
	"1": "#fffaf0",
	"2": "#56546a",
	"3": "#3a3949",
	"4": "#7d9ad8",
} as const;
```
- [ ] **R1** `lib/world/render.ts`. Find:
```ts
// What the renderer draws with. Coordinates are whole canvas pixels; stamp draws cell `cell` of a sheet at `scale`
// with its top-left at (x, y), mirrored left to right when flip is set. gradient fills the canvas top to bottom through
// its stops (a share of the height, a colour); glow adds a warm light that falls off from (x, y) to radius r.
export type Stop = readonly [at: number, color: string];
export interface Painter {
	readonly w: number;
	readonly h: number;
	clear(): void;
	gradient(stops: readonly Stop[]): void;
	rect(x: number, y: number, w: number, h: number, color: string, alpha: number): void;
	stamp(sheet: Sheet, cell: number, x: number, y: number, scale: number, alpha: number, flip: boolean): void;
	glow(x: number, y: number, r: number, color: string, alpha: number): void;
}
```
Replace with:
```ts
// What the renderer draws with. Coordinates are whole canvas pixels; stamp draws cell `cell` of a sheet at `scale`
// with its top-left at (x, y), mirrored left to right when flip is set; given w and h it fills that box instead, pixel
// for pixel from the cell at `scale` (nearest neighbour: how the world is drawn while the camera eases between two
// scales). gradient fills the canvas top to bottom through its stops (a share of the height, a colour); glow adds a
// warm light that falls off from (x, y) to radius r; pool is the same light squashed into an ellipse rx wide and ry
// tall (the light a lamp spills on the ground).
export type Stop = readonly [at: number, color: string];
export interface Painter {
	readonly w: number;
	readonly h: number;
	clear(): void;
	gradient(stops: readonly Stop[]): void;
	rect(x: number, y: number, w: number, h: number, color: string, alpha: number): void;
	stamp(sheet: Sheet, cell: number, x: number, y: number, scale: number, alpha: number, flip: boolean, w?: number, h?: number): void;
	glow(x: number, y: number, r: number, color: string, alpha: number): void;
	pool(x: number, y: number, rx: number, ry: number, color: string, alpha: number): void;
}
```
- [ ] **X1** `lib/world/pixel-painter.ts`. Find:
```ts
		stamp(sheet, cell, x, y, scale, alpha, flip) {
			const key = `${sheet}@${scale}`;
			let bmp = sheets.get(key);
			if (!bmp) {
				bmp = sheetBitmap(art, sheet, scale);
				sheets.set(key, bmp);
			}
			const cw = CELL[sheet].w * scale;
			const ch = CELL[sheet].h * scale;
			for (let dy = 0; dy < ch; dy++) {
				const ty = y + dy;
				if (ty < 0 || ty >= h) continue;
				for (let dx = 0; dx < cw; dx++) {
					const tx = x + dx;
					if (tx < 0 || tx >= w) continue;
					const s = (dy * bmp.w + cell * cw + (flip ? cw - 1 - dx : dx)) * 4;
					blend((ty * w + tx) * 4, bmp.data[s], bmp.data[s + 1], bmp.data[s + 2], (bmp.data[s + 3] / 255) * alpha);
				}
			}
		},
```
Replace with:
```ts
		stamp(sheet, cell, x, y, scale, alpha, flip, dw, dh) {
			const key = `${sheet}@${scale}`;
			let bmp = sheets.get(key);
			if (!bmp) {
				bmp = sheetBitmap(art, sheet, scale);
				sheets.set(key, bmp);
			}
			const cw = CELL[sheet].w * scale;
			const ch = CELL[sheet].h * scale;
			// The box drawn: the cell's own size, or the one asked for, sampled nearest neighbour as a canvas does with
			// smoothing off. At the cell's own size every pixel maps to itself.
			const bw = Math.max(0, Math.round(dw ?? cw));
			const bh = Math.max(0, Math.round(dh ?? ch));
			for (let dy = 0; dy < bh; dy++) {
				const ty = y + dy;
				if (ty < 0 || ty >= h) continue;
				const sy = Math.floor((dy * ch) / bh);
				for (let dx = 0; dx < bw; dx++) {
					const tx = x + dx;
					if (tx < 0 || tx >= w) continue;
					const sx = Math.floor(((flip ? bw - 1 - dx : dx) * cw) / bw);
					const s = (sy * bmp.w + cell * cw + sx) * 4;
					blend((ty * w + tx) * 4, bmp.data[s], bmp.data[s + 1], bmp.data[s + 2], (bmp.data[s + 3] / 255) * alpha);
				}
			}
		},
```
- [ ] **X2** `lib/world/pixel-painter.ts`. Find:
```ts
					for (let i = 0; i < 3; i++) data[o + i] = Math.min(255, Math.round((data[o + i] * da + c[i] * a) / oa));
					data[o + 3] = Math.round(oa * 255);
				}
			}
		},
	};
}
```
Replace with:
```ts
					for (let i = 0; i < 3; i++) data[o + i] = Math.min(255, Math.round((data[o + i] * da + c[i] * a) / oa));
					data[o + 3] = Math.round(oa * 255);
				}
			}
		},
		// The glow squashed into an ellipse: its strength by the distance measured in each radius.
		pool(cx, cy, rx, ry, color, alpha) {
			const c = parseColor(color);
			if (!c || rx <= 0 || ry <= 0) return;
			for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(h, Math.ceil(cy + ry)); y++) {
				for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(w, Math.ceil(cx + rx)); x++) {
					const a = alpha * glowAt(Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry));
					if (a <= 0) continue;
					const o = (y * w + x) * 4;
					const da = data[o + 3] / 255;
					const oa = Math.min(1, da + a);
					for (let i = 0; i < 3; i++) data[o + i] = Math.min(255, Math.round((data[o + i] * da + c[i] * a) / oa));
					data[o + 3] = Math.round(oa * 255);
				}
			}
		},
	};
}
```
- [ ] **X3** `lib/world/canvas-painter.ts`. Find:
```ts
		stamp(sheet, cell, x, y, scale, alpha, flip) {
			const src = atlas(sheet, scale);
			const cw = CELL[sheet].w * scale;
			const ch = CELL[sheet].h * scale;
			ctx.imageSmoothingEnabled = false;
			ctx.globalAlpha = alpha;
			if (flip) {
				ctx.save();
				ctx.translate(x + cw, y);
				ctx.scale(-1, 1);
				ctx.drawImage(src, cell * cw, 0, cw, ch, 0, 0, cw, ch);
				ctx.restore();
			} else {
				ctx.drawImage(src, cell * cw, 0, cw, ch, x, y, cw, ch);
			}
			ctx.globalAlpha = 1;
		},
```
Replace with:
```ts
		stamp(sheet, cell, x, y, scale, alpha, flip, dw, dh) {
			const src = atlas(sheet, scale);
			const cw = CELL[sheet].w * scale;
			const ch = CELL[sheet].h * scale;
			const bw = Math.max(0, Math.round(dw ?? cw));
			const bh = Math.max(0, Math.round(dh ?? ch));
			if (bw === 0 || bh === 0) return;
			ctx.imageSmoothingEnabled = false;
			ctx.globalAlpha = alpha;
			if (flip) {
				ctx.save();
				ctx.translate(x + bw, y);
				ctx.scale(-1, 1);
				ctx.drawImage(src, cell * cw, 0, cw, ch, 0, 0, bw, bh);
				ctx.restore();
			} else {
				ctx.drawImage(src, cell * cw, 0, cw, ch, x, y, bw, bh);
			}
			ctx.globalAlpha = 1;
		},
```
- [ ] **X4** `lib/world/canvas-painter.ts`. Find:
```ts
			ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
			ctx.restore();
		},
	};
}
```
Replace with:
```ts
			ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
			ctx.restore();
		},
		pool(x, y, rx, ry, color, alpha) {
			const c = parseColor(color);
			if (!c || rx <= 0 || ry <= 0) return;
			ctx.save();
			ctx.translate(x, y);
			ctx.scale(1, ry / rx);
			const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
			for (const [at, k] of GLOW_STOPS) g.addColorStop(at, `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${k})`);
			ctx.globalCompositeOperation = "lighter";
			ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
			ctx.fillStyle = g;
			ctx.fillRect(-rx, -rx, 2 * rx, 2 * rx);
			ctx.restore();
		},
	};
}
```
- [ ] **R2** `lib/world/render.ts`. Find:
```ts
	p.clear();
	const z = zoomAt(s.camera, s.now);
	const size = TILE * z;
	const dark = s.dark ?? 0;
	const seen = (x: number, y: number, w: number, h: number) => x + w > 0 && y + h > 0 && x < p.w && y < p.h;
	const tile = (id: TileId, wx: number, wy: number, alpha: number, parallax = 1) => {
		const at = toScreen(s.camera, s.view, s.now, wx, wy, parallax);
		if (seen(at.x, at.y, size, size)) p.stamp("tiles", tileIndex(id), at.x, at.y, z, alpha, false);
	};
```
Replace with:
```ts
	p.clear();
	// The zoom: a whole scale at rest, between two while the camera eases (polish pass). Every cell is then drawn from
	// the next whole scale's atlas into the box between the screen points of its two corners, so neighbours meet with
	// no gap and no overlap at any zoom; at a whole scale the box is the cell's own size and nothing changes.
	const z = zoomAt(s.camera, s.now);
	const zs = Math.max(1, Math.ceil(z - 1e-9));
	const dark = s.dark ?? 0;
	const seen = (x: number, y: number, w: number, h: number) => x + w > 0 && y + h > 0 && x < p.w && y < p.h;
	const put = (sheet: Sheet, cell: number, wx: number, wy: number, cw: number, ch: number, alpha: number, flip = false, parallax = 1) => {
		const a = toScreen(s.camera, s.view, s.now, wx, wy, parallax);
		const b = toScreen(s.camera, s.view, s.now, wx + cw, wy + ch, parallax);
		if (seen(a.x, a.y, b.x - a.x, b.y - a.y)) p.stamp(sheet, cell, a.x, a.y, zs, alpha, flip, b.x - a.x, b.y - a.y);
	};
	const tile = (id: TileId, wx: number, wy: number, alpha: number) => put("tiles", tileIndex(id), wx, wy, TILE, TILE, alpha);
```
- [ ] **R3** `lib/world/render.ts`. Find:
```ts
		for (const f of FAR_ISLANDS) {
			const ox = Math.round(f.fx * s.view.w + shift - (f.w * fz) / 2);
			const oy = ground.y - f.lift * fz;
			const tones = hazeTones(s.sky, s.view.h > 0 ? (oy + 20 * fz) / s.view.h : 0);
			for (const [y, x0, x1, t] of f.runs) p.rect(ox + x0 * fz, oy + y * fz, (x1 - x0) * fz, fz, tones[t], 1);
		}
```
Replace with:
```ts
		for (const f of FAR_ISLANDS) {
			const ox = f.fx * s.view.w + shift - (f.w * fz) / 2;
			const oy = ground.y - f.lift * fz;
			const tones = hazeTones(s.sky, s.view.h > 0 ? (oy + 20 * fz) / s.view.h : 0);
			for (const [y, x0, x1, t] of f.runs) {
				const left = Math.round(ox + x0 * fz);
				const top = Math.round(oy + y * fz);
				p.rect(left, top, Math.round(ox + x1 * fz) - left, Math.round(oy + (y + 1) * fz) - top, tones[t], 1);
			}
		}
```
- [ ] **R4** `lib/world/render.ts`. Find:
```ts
	const cw = CLOUD_CELL.w * z;
	const ch = CLOUD_CELL.h * z;
	for (const layer of [0, 1] as const) {
```
Replace with:
```ts
	for (const layer of [0, 1] as const) {
```
- [ ] **R5** `lib/world/render.ts`. Find:
```ts
				const at = toScreen(s.camera, s.view, s.now, x + k * CLOUD_SPAN, c.y, PARALLAX[layer]);
				if (seen(at.x, at.y, cw, ch)) p.stamp("clouds", c.shape, at.x, at.y, z, CLOUD_ALPHA[layer] * (1 - CLOUD_NIGHT_FADE * dark), false);
```
Replace with:
```ts
				const alpha = CLOUD_ALPHA[layer] * (1 - CLOUD_NIGHT_FADE * dark);
				put("clouds", c.shape, x + k * CLOUD_SPAN, c.y, CLOUD_CELL.w, CLOUD_CELL.h, alpha, false, PARALLAX[layer]);
```
- [ ] **R6** `lib/world/render.ts`. Find:
```ts
	const at = toScreen(s.camera, s.view, s.now, s.him.x - FRAME_W / 2, GROUND_Y * TILE - FRAME_H);
	if (seen(at.x, at.y, FRAME_W * z, FRAME_H * z)) {
		p.stamp("sprite", frameIndex(s.him.look.frame), at.x, at.y, z, 1, s.him.look.flip);
		if (s.him.look.face) p.stamp("faces", faceCell(s.him.look.face, s.him.look.gaze), at.x + FACE_AT.x * z, at.y + FACE_AT.y * z, z, 1, false);
	}
```
Replace with:
```ts
	const hx = s.him.x - FRAME_W / 2; // his sprite's top-left, world px
	const hy = GROUND_Y * TILE - FRAME_H;
	put("sprite", frameIndex(s.him.look.frame), hx, hy, FRAME_W, FRAME_H, 1, s.him.look.flip);
	if (s.him.look.face) put("faces", faceCell(s.him.look.face, s.him.look.gaze), hx + FACE_AT.x, hy + FACE_AT.y, FACE_W, FACE_H, 1);
```

- [ ] **Step 4: Run the checks.**
Run: `npx vitest run lib/world` then `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`.
Expected: all pass, and the world-40 hash in `render.test.ts` is still `d498b675` (this task must not change the picture at a whole zoom; if it moved, a box is off by a pixel somewhere: find it, do not re-pin).

- [ ] **Step 5: Commit.**
```bash
git add lib/world/palette.ts lib/world/raster.test.ts lib/world/render.ts lib/world/pixel-painter.ts lib/world/canvas-painter.ts lib/world/render.test.ts lib/world/painter.test.ts
git commit -m "feat(world): painters fill a box and pool light; digit letters; the world drawn between two scales" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---
### Task 2: His breath, blink and scarf timing; the pace's two wake-ups
**Model:** Sonnet. **Waits for:** nothing (wave 1).
**Files:** Modify `lib/world/actor.ts`, `lib/world/actor.test.ts`, `lib/world/pace.ts`, `lib/world/pace.test.ts`.

**Interfaces:**
- Consumes: `Actor`, `LAY_MS`, `TURN_MS`, `FrameName`, `FaceId`, `Gaze` (unchanged).
- Produces:
  - `Look = { frame; flip; face; gaze; blink: boolean; trail: 0 | 1 | null }` (Tasks 10 and 11 read `blink` and `trail`).
  - `look(a, now, face, motion = true)`: `motion` false under reduced motion (no breath, no blink).
  - `blinking(now): boolean`; `nextLookIn(a, now, motion = true): number | null` (ms until his look changes by itself while he stands).
  - `BREATH_MS` 3200, `BREATH_IN_MS` 700, `BLINK_WINDOW_MS` 4500, `BLINK_SPREAD_MS` 1500, `BLINK_MS` 140, `TRAIL_MS` 160.
  - `pace.ts`: `AMBIENT_MS` 66; `PaceInput` gains optional `lookIn?: number | null` and `ambient?: number | null` (the pace the life asks for: `FRAME_MS` or `AMBIENT_MS`). Every existing call keeps working unchanged.

The easing, as code (ruling 4 and 5): breathing in is `t % BREATH_MS >= BREATH_MS - BREATH_IN_MS` with `t = now - a.since`; a blink is on when `0 <= now - (n * BLINK_WINDOW_MS + offset(n)) < BLINK_MS` with `n = floor(now / BLINK_WINDOW_MS)` and `offset(n)` a fixed integer hash of `n` modulo `BLINK_SPREAD_MS`.

- [ ] **Step 1: Write the failing tests.**
- [ ] **AT1** `lib/world/actor.test.ts`. Find:
```ts
import {
	BLOCK_GAP_MS, FOLLOW_UP_MS, LAY_MS, MAX_DT, PRESENT_MS, TURN_MS,
	facingViewer, look, newActor, pose, step,
	type Actor, type ActorEvent, type ActorWorld,
} from "./actor";
```
Replace with:
```ts
import {
	BLINK_MS, BLINK_WINDOW_MS, BLOCK_GAP_MS, BREATH_IN_MS, BREATH_MS, FOLLOW_UP_MS, LAY_MS, MAX_DT, PRESENT_MS, TRAIL_MS, TURN_MS,
	blinking, facingViewer, look, newActor, nextLookIn, pose, step,
	type Actor, type ActorEvent, type ActorWorld,
} from "./actor";
```
- [ ] **AT2** `lib/world/actor.test.ts`. Find:
```ts
	it("poses every state for the dev page", () => {
```
Replace with:
```ts
	it("breathes in for 700 ms at the end of every 3.2 s, standing or facing Gur (polish pass)", () => {
		const idle = newActor(200, 0, 12);
		const frameAt = (a: Actor, t: number) => look(a, t, "warm").frame;
		expect(frameAt(idle, 0)).toBe("idle-1");
		expect(frameAt(idle, BREATH_MS - BREATH_IN_MS - 1)).toBe("idle-1");
		expect(frameAt(idle, BREATH_MS - BREATH_IN_MS)).toBe("idle-2");
		expect(frameAt(idle, BREATH_MS)).toBe("idle-1");
		const facing = { ...pose("facing", 200, 0), talk: "listening" as const };
		expect(frameAt(facing, BREATH_MS - 1)).toBe("face-2");
		expect(frameAt(facing, 100)).toBe("face-1");
		expect(look(idle, BREATH_MS - 1, "warm", false).frame).toBe("idle-1"); // reduced motion: still
	});
	it("blinks for 140 ms, 3 to 6 s apart, only facing Gur, never under reduced motion (polish pass)", () => {
		const starts: number[] = [];
		for (let t = 0; t < 120_000; t++) if (blinking(t) && !blinking(t - 1)) starts.push(t);
		expect(starts.length).toBeGreaterThan(18);
		for (let i = 1; i < starts.length; i++) {
			expect(starts[i] - starts[i - 1]).toBeGreaterThan(3000);
			expect(starts[i] - starts[i - 1]).toBeLessThan(6000);
		}
		const on = starts[3];
		expect(blinking(on + BLINK_MS - 1)).toBe(true);
		expect(blinking(on + BLINK_MS)).toBe(false);
		const facing = { ...pose("facing", 200, 0), talk: "listening" as const };
		expect(look(facing, on, "warm").blink).toBe(true);
		expect(look(facing, on, "warm", false).blink).toBe(false);
		expect(look(newActor(200, 0, 12), on, "warm").blink).toBe(false); // in profile his eye is drawn in the frame
		expect(blinking(Number.NaN)).toBe(false);
		expect(BLINK_WINDOW_MS).toBe(4500);
	});
	it("trails his scarf in two cells that swap every 160 ms while he walks, and only then (polish pass)", () => {
		const walking = run(newActor(100, 0, 12), 0, 50).a;
		expect(walking.kind).toBe("walking");
		const trails = Array.from({ length: 4 }, (_, i) => look(walking, walking.since + i * TRAIL_MS, "warm").trail);
		expect(trails).toEqual([0, 1, 0, 1]);
		expect(look(newActor(100, 0, 12), 0, "warm").trail).toBeNull();
		expect(look(pose("building", 100, 0), 0, "warm").trail).toBeNull();
	});
	it("says when his look will change by itself, so the loop can wake for it (polish pass)", () => {
		const idle = newActor(200, 0, 12);
		expect(nextLookIn(idle, 0)).toBe(BREATH_MS - BREATH_IN_MS);
		expect(nextLookIn(idle, BREATH_MS - 100)).toBe(100);
		expect(nextLookIn(idle, 0, false)).toBeNull();
		expect(nextLookIn({ ...idle, hidden: true }, 0)).toBeNull();
		expect(nextLookIn({ ...idle, kind: "walking" }, 0)).toBeNull();
		expect(nextLookIn(pose("resting", 200, 0), 0)).toBeNull();
		// Facing: whichever comes first, a breath or a blink's start or end; never 0, and the look really changes then.
		const facing = { ...pose("facing", 200, 0), talk: "listening" as const };
		for (let now = 0; now < 30_000; now += 777) {
			const ms = nextLookIn(facing, now);
			expect(ms).not.toBeNull();
			if (ms === null) continue;
			expect(ms).toBeGreaterThanOrEqual(1);
			expect(ms).toBeLessThanOrEqual(BREATH_MS);
			const before = look(facing, now + ms - 1, "warm");
			const after = look(facing, now + ms, "warm");
			expect(before.frame !== after.frame || before.blink !== after.blink).toBe(true);
		}
	});
	it("poses every state for the dev page", () => {
```
- [ ] **PT1** `lib/world/pace.test.ts`. Find:
```ts
import { CALM_FRAME_MS, FRAME_MS, nextTickIn, shouldDraw, SLOW_MS } from "./pace";
```
Replace with:
```ts
import { AMBIENT_MS, CALM_FRAME_MS, FRAME_MS, nextTickIn, shouldDraw, SLOW_MS } from "./pace";
```
- [ ] **PT2** `lib/world/pace.test.ts`. Find:
```ts
const input = (actor: Actor, over: Partial<{ now: number; easing: boolean; hasWork: boolean; reducedMotion: boolean }> = {}) =>
```
Replace with:
```ts
type Over = Partial<{ now: number; easing: boolean; hasWork: boolean; reducedMotion: boolean; lookIn: number | null; ambient: number | null }>;
const input = (actor: Actor, over: Over = {}) =>
```
- [ ] **PT3** `lib/world/pace.test.ts`. Find:
```ts
	it("redraws a still frame only on a new block, mode, sky phase, zoom or tile", () => {
```
Replace with:
```ts
	it("wakes for a breath or a blink while he stands, never faster than a frame (polish pass)", () => {
		expect(nextTickIn(input(a, { hasWork: false, lookIn: 400 }))).toBe(400);
		expect(nextTickIn(input(a, { hasWork: false, lookIn: 5 }))).toBe(FRAME_MS);
		expect(nextTickIn(input(a, { hasWork: false, lookIn: 9000 }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, nextAt: 300 }, { lookIn: 900 }))).toBe(300); // the next block comes first
		expect(nextTickIn(input({ ...a, kind: "facing", quietSince: 0 }, { now: 1000, lookIn: 140 }))).toBe(140);
	});
	it("keeps the pace the life in the world asks for while it is on screen (polish pass)", () => {
		expect(nextTickIn(input(a, { hasWork: false, ambient: AMBIENT_MS }))).toBe(AMBIENT_MS);
		expect(nextTickIn(input(a, { hasWork: false, ambient: FRAME_MS }))).toBe(FRAME_MS);
		expect(nextTickIn(input(a, { hasWork: false, ambient: 1 }))).toBe(FRAME_MS); // the 30 frames a second cap holds
		expect(nextTickIn(input(a, { hasWork: false, ambient: null }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, kind: "resting" }, { ambient: AMBIENT_MS }))).toBe(AMBIENT_MS);
	});
	it("ignores both under reduced motion, and while hidden", () => {
		expect(nextTickIn(input(a, { hasWork: false, ambient: AMBIENT_MS, lookIn: 100, reducedMotion: true }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, hidden: true }, { ambient: AMBIENT_MS, lookIn: 100 }))).toBeNull();
	});
	it("redraws a still frame only on a new block, mode, sky phase, zoom or tile", () => {
```

- [ ] **Step 2: Run them and see them fail.**
Run: `npx vitest run lib/world/actor.test.ts lib/world/pace.test.ts`
Expected: FAIL: `blinking`, `nextLookIn`, `BREATH_MS` and the other constants are not exported (TypeError: not a function / undefined); the pace tests expecting 400, 140 and `AMBIENT_MS` get `SLOW_MS`.

- [ ] **Step 3: Implement.**
- [ ] **A1** `lib/world/actor.ts`. Find:
```ts
export type Look = { frame: FrameName; flip: boolean; face: FaceId | null; gaze: Gaze };
const IDLE: readonly FrameName[] = ["idle-1", "idle-2"];
const WALK: readonly FrameName[] = ["walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6"];
const BUILD: readonly FrameName[] = ["build-1", "build-2", "build-3", "build-4"];
const TURN: readonly FrameName[] = ["turn-1", "turn-2", "turn-3"];
const FACE: readonly FrameName[] = ["face-1", "face-2"];
// While he speaks his eyes go slightly off Gur and back: 600 ms away in every 2.4 s.
const speakingGaze = (t: number): Gaze => (Math.floor(t / 600) % 4 === 1 ? 1 : 0);

// The frame to draw now. `face` comes from his mood (face.ts) and shows only toward the viewer.
export function look(a: Actor, now: number, face: FaceId): Look {
	const t = Math.max(0, now - a.since);
	const flip = a.dir < 0;
	const cycle = (names: readonly FrameName[], ms: number) => names[Math.floor(t / ms) % names.length];
	switch (a.kind) {
		case "walking":
			return { frame: cycle(WALK, 100), flip, face: null, gaze: 0 };
		case "building":
			return { frame: cycle(BUILD, LAY_MS / BUILD.length), flip, face: null, gaze: 0 };
		case "resting":
			return { frame: "sit-1", flip: false, face: null, gaze: 0 };
		case "turning": {
			const order = a.toward === "viewer" ? TURN : [...TURN].reverse();
			const frame = order[Math.min(2, Math.floor(t / (TURN_MS / 3)))];
			return { frame, flip, face: frame === "turn-3" ? face : null, gaze: 0 };
		}
		case "facing":
			return { frame: cycle(FACE, 700), flip: false, face, gaze: a.talk === "speaking" ? speakingGaze(t) : 0 };
		default:
			return { frame: cycle(IDLE, 600), flip, face: null, gaze: 0 };
	}
}
```
Replace with:
```ts
// blink: his eyes are shut this frame (the face's blink cell). trail: which of the scarf's two trailing cells streams
// behind him (walking only), or null.
export type Look = { frame: FrameName; flip: boolean; face: FaceId | null; gaze: Gaze; blink: boolean; trail: 0 | 1 | null };
const WALK: readonly FrameName[] = ["walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6"];
const BUILD: readonly FrameName[] = ["build-1", "build-2", "build-3", "build-4"];
const TURN: readonly FrameName[] = ["turn-1", "turn-2", "turn-3"];
// While he speaks his eyes go slightly off Gur and back: 600 ms away in every 2.4 s.
const speakingGaze = (t: number): Gaze => (Math.floor(t / 600) % 4 === 1 ? 1 : 0);

// The polish pass: he breathes and blinks, and his scarf trails as he walks. Breathing in (idle-2 and face-2, the
// shoulders a pixel up) lasts BREATH_IN_MS at the end of every BREATH_MS. A blink shuts his eyes for BLINK_MS once in
// every BLINK_WINDOW_MS, at an offset in its first BLINK_SPREAD_MS taken from a fixed hash of the window's number, so
// two blinks are always 3 to 6 s apart and every run blinks the same. The scarf's two trailing cells swap every
// TRAIL_MS, out of step with his 100 ms stride so it flutters.
export const BREATH_MS = 3200;
export const BREATH_IN_MS = 700;
export const BLINK_WINDOW_MS = 4500;
export const BLINK_SPREAD_MS = 1500;
export const BLINK_MS = 140;
export const TRAIL_MS = 160;
const blinkOffset = (n: number): number => {
	let h = Math.imul(n + 1, 0x9e3779b1) >>> 0;
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
	return ((h ^ (h >>> 13)) >>> 0) % BLINK_SPREAD_MS;
};
const blinkStart = (n: number): number => n * BLINK_WINDOW_MS + blinkOffset(n);
// True while a blink is on at this clock time (ms).
export function blinking(now: number): boolean {
	if (!Number.isFinite(now)) return false;
	const t = now - blinkStart(Math.floor(now / BLINK_WINDOW_MS));
	return t >= 0 && t < BLINK_MS;
}
const breathingIn = (t: number): boolean => t % BREATH_MS >= BREATH_MS - BREATH_IN_MS;

// The frame to draw now. `face` comes from his mood (face.ts) and shows only toward the viewer. motion is false under
// reduced motion: no breathing and no blink, so a still frame stays still.
export function look(a: Actor, now: number, face: FaceId, motion = true): Look {
	const t = Math.max(0, now - a.since);
	const flip = a.dir < 0;
	const still = { blink: false, trail: null };
	const cycle = (names: readonly FrameName[], ms: number) => names[Math.floor(t / ms) % names.length];
	switch (a.kind) {
		case "walking":
			return { frame: cycle(WALK, 100), flip, face: null, gaze: 0, blink: false, trail: Math.floor(t / TRAIL_MS) % 2 === 0 ? 0 : 1 };
		case "building":
			return { frame: cycle(BUILD, LAY_MS / BUILD.length), flip, face: null, gaze: 0, ...still };
		case "resting":
			return { frame: "sit-1", flip: false, face: null, gaze: 0, ...still };
		case "turning": {
			const order = a.toward === "viewer" ? TURN : [...TURN].reverse();
			const frame = order[Math.min(2, Math.floor(t / (TURN_MS / 3)))];
			return { frame, flip, face: frame === "turn-3" ? face : null, gaze: 0, ...still };
		}
		case "facing":
			return {
				frame: motion && breathingIn(t) ? "face-2" : "face-1", flip: false, face, gaze: a.talk === "speaking" ? speakingGaze(t) : 0,
				blink: motion && blinking(now), trail: null,
			};
		default:
			return { frame: motion && breathingIn(t) ? "idle-2" : "idle-1", flip, face: null, gaze: 0, ...still };
	}
}

// How long until his look changes by itself while he stands (a breath, a blink), so the loop can wake for it instead
// of drawing frames; null when nothing of him moves on its own (or under reduced motion, or hidden). Walking,
// building, turning and speaking already run at frame pace.
export function nextLookIn(a: Actor, now: number, motion = true): number | null {
	if (!motion || a.hidden || (a.kind !== "idle" && a.kind !== "facing")) return null;
	const into = Math.max(0, now - a.since) % BREATH_MS;
	const edge = BREATH_MS - BREATH_IN_MS;
	let ms = into < edge ? edge - into : BREATH_MS - into;
	if (a.kind === "facing" && Number.isFinite(now)) {
		const n = Math.floor(now / BLINK_WINDOW_MS);
		const start = blinkStart(n);
		const blinkEdge = now < start ? start - now : now < start + BLINK_MS ? start + BLINK_MS - now : blinkStart(n + 1) - now;
		ms = Math.min(ms, blinkEdge);
	}
	return Math.max(1, Math.ceil(ms));
}
```
- [ ] **PC1** `lib/world/pace.ts`. Find:
```ts
// The redraw rules (spec 2): frames only while he moves, builds or speaks or the camera eases; one timer for the gap
// between blocks or the end of the follow-up window; otherwise a tick every 3 s; nothing while hidden. Under reduced
// motion he still works, the ticks are slower, and the picture is redrawn only on a new block, mode or tile he steps to.
import { FOLLOW_UP_MS, type Actor } from "./actor";

export const FRAME_MS = 33;
export const CALM_FRAME_MS = 250;
export const SLOW_MS = 3000;
export type PaceInput = { actor: Actor; now: number; easing: boolean; hasWork: boolean; reducedMotion: boolean };

export function nextTickIn(p: PaceInput): number | null {
	const a = p.actor;
	if (a.hidden) return null;
	const frame = p.reducedMotion ? CALM_FRAME_MS : FRAME_MS;
	const wait = (ms: number) => Math.min(SLOW_MS, Math.max(frame, Math.ceil(ms)));
	if (a.kind === "walking" || a.kind === "building" || a.kind === "turning" || p.easing) return frame;
	if (a.kind === "facing") return a.talk === "speaking" ? frame : wait(a.quietSince + FOLLOW_UP_MS - p.now);
	if (a.kind === "idle" && p.hasWork) return wait(a.nextAt - p.now);
	return SLOW_MS;
}
```
Replace with:
```ts
// The redraw rules (spec 2): frames only while he moves, builds or speaks or the camera eases; one timer for the gap
// between blocks or the end of the follow-up window; otherwise a tick every 3 s; nothing while hidden. Under reduced
// motion he still works, the ticks are slower, and the picture is redrawn only on a new block, mode or tile he steps to.
// The polish pass adds two wake-ups inside those rules, both off under reduced motion: lookIn, when his look changes by
// itself (a breath, a blink: actor.ts nextLookIn), and ambient, the pace the life in the world asks for while some of
// it is on screen (life.ts lifePace: frames for a block's dust, AMBIENT_MS for snow, smoke and birds). Neither is ever
// faster than the 30 frames a second cap.
import { FOLLOW_UP_MS, type Actor } from "./actor";

export const FRAME_MS = 33;
export const CALM_FRAME_MS = 250;
export const SLOW_MS = 3000;
export const AMBIENT_MS = 66;
export type PaceInput = {
	actor: Actor;
	now: number;
	easing: boolean;
	hasWork: boolean;
	reducedMotion: boolean;
	lookIn?: number | null;
	ambient?: number | null;
};

export function nextTickIn(p: PaceInput): number | null {
	const a = p.actor;
	if (a.hidden) return null;
	const frame = p.reducedMotion ? CALM_FRAME_MS : FRAME_MS;
	const wait = (ms: number) => Math.min(SLOW_MS, Math.max(frame, Math.ceil(ms)));
	if (a.kind === "walking" || a.kind === "building" || a.kind === "turning" || p.easing) return frame;
	let ms = SLOW_MS;
	if (a.kind === "facing") ms = a.talk === "speaking" ? frame : wait(a.quietSince + FOLLOW_UP_MS - p.now);
	else if (a.kind === "idle" && p.hasWork) ms = wait(a.nextAt - p.now);
	if (p.reducedMotion) return ms;
	if (p.lookIn != null && Number.isFinite(p.lookIn)) ms = Math.min(ms, wait(p.lookIn));
	if (p.ambient != null && Number.isFinite(p.ambient)) ms = Math.min(ms, wait(p.ambient));
	return ms;
}
```

- [ ] **Step 4: Run the checks.**
Run: `npx vitest run lib/world/actor.test.ts lib/world/pace.test.ts`, then `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`.
Expected: all pass. `components/osmo/world.tsx` still compiles: it calls `look(actor, now, face)` and `nextTickIn({...})` without the new arguments, which are optional; Task 11 passes them.

- [ ] **Step 5: Commit.**
```bash
git add lib/world/actor.ts lib/world/actor.test.ts lib/world/pace.ts lib/world/pace.test.ts
git commit -m "feat(world): he breathes every few seconds, blinks 3 to 6 s apart, and his scarf trails; the loop wakes for them" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---
### Task 3: Life in the world (pure) and the stars' twinkle
**Model:** Sonnet. **Waits for:** nothing (wave 1).
**Files:** Create `lib/world/life.ts`, `lib/world/life.test.ts`. Modify `lib/world/sky.ts`, `lib/world/sky.test.ts`.

**Interfaces:**
- Consumes: `WORKSHOP` (`blueprints/workshop.ts`), `TILE`, `Block` (`blueprints/types.ts`), `CASTLE_BLOCKS` (tests).
- Produces (Tasks 10 and 11 use every name):
  - Types `Flake { x; y; size; alpha }`, `Bird { x; y; frame: 0 | 1; flip }` (screen px), `Puff { x; y; r; alpha }`, `Mote { x; y; size; alpha }` (world px), `Landing { block: Block; at: number }`, `Life { snow; birds; smoke; dust; pop: Block | null }`, `NO_LIFE`, `LifeInput`.
  - Caps `SNOW_MAX` 40, `SMOKE_MAX` 6, `BIRDS_MAX` 2, `DUST_MAX` 6, `MAX_PARTICLES` 54.
  - `snowShare(wallMs)`, `snowAt(wallMs, view, scale, share)`, `birdsAt(wallMs, view, scale, always?)`, `smokeAt(wallMs, always?)`, `dustAt(landing, now)`, `popOf(landing, now)`, `CHIMNEY` (tile 49, 17), `SMOKE_FROM`, `chimneyLaid(laid)`.
  - `lifeAt(o: LifeInput): Life` (everything in one frame; `NO_LIFE` when `motion` is false), `particleCount(l)`, `lifeWants(l): "frames" | "ambient" | null`.
  - The timings: `SNOW_CYCLE_MS` 120000, `SNOW_ON_MS` 45000, `SNOW_RAMP_MS` 6000, `BIRD_CYCLE_MS` 80000, `BIRD_FLIGHT_MS` 16000, `SMOKE_EVERY_MS` 1400, `SMOKE_SPELL_MS` 9000, `SMOKE_CYCLE_MS` 30000, `SMOKE_LIFE_MS` 5600, `POP_MS` 100, `DUST_MS` 450.
  - `sky.ts`: `twinkle(i, tick): number` (1, 0.66 or 0.33 for one star in four; 1 for the rest).

The motion, as code (all in `life.ts` below): a flake falls `(14 + 12 * hash) * scale` px a second and sways `sin(2 pi t / (3 + 2 * hash)) * 5 * scale`, wrapping bottom to top; a bird crosses `view.w + 24 * scale` px in `BIRD_FLIGHT_MS`, four wingbeats of 170 ms then a two-beat glide; a puff of age `a` seconds sits at `SMOKE_FROM + (5a + 1.5 sin(1.7a + k), -9a)` with radius `2 + 1.1a` and alpha `0.55 * (1 - a / 5.6) * min(1, a / 0.3)`; a mote of age `a` moves `(+-(14 + 10n), -(10 + 6n))` px a second with a fall of `30 a^2` and alpha `0.7 * (1 - a / 0.45)`.

- [ ] **Step 1: Write the failing tests.** Create `lib/world/life.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { TILE, type Block } from "./blueprints/types";
import {
	BIRD_CYCLE_MS, BIRD_FLIGHT_MS, BIRDS_MAX, birdsAt, CHIMNEY, chimneyLaid, DUST_MAX, DUST_MS, dustAt, lifeAt, lifeWants, MAX_PARTICLES,
	NO_LIFE, particleCount, POP_MS, popOf, SMOKE_CYCLE_MS, SMOKE_FROM, SMOKE_LIFE_MS, SMOKE_MAX, SMOKE_SPELL_MS, smokeAt, SNOW_CYCLE_MS,
	SNOW_MAX, SNOW_ON_MS, snowAt, snowShare, type LifeInput,
} from "./life";

const VIEW = { w: 1200, h: 800 };
const block: Block = { x: 30, y: 20, tile: "brick", layer: "walls" };
const base: LifeInput = {
	wallMs: 0, now: 0, view: VIEW, scale: 1, day: false, night: true, chimney: true, landing: null, motion: true,
};

describe("the caps", () => {
	it("never holds more than MAX_PARTICLES in a frame, whatever the time, and each kind keeps its own cap", () => {
		expect(MAX_PARTICLES).toBe(SNOW_MAX + SMOKE_MAX + BIRDS_MAX + DUST_MAX);
		for (let wallMs = 0; wallMs < 2 * SNOW_CYCLE_MS; wallMs += 997) {
			for (const force of [undefined, "all"] as const) {
				const l = lifeAt({ ...base, wallMs, now: 100, day: true, night: true, landing: { block, at: 0 }, force });
				expect(l.snow.length).toBeLessThanOrEqual(SNOW_MAX);
				expect(l.smoke.length).toBeLessThanOrEqual(SMOKE_MAX);
				expect(l.birds.length).toBeLessThanOrEqual(BIRDS_MAX);
				expect(l.dust.length).toBeLessThanOrEqual(DUST_MAX);
				expect(particleCount(l)).toBeLessThanOrEqual(MAX_PARTICLES);
			}
		}
	});
	it("has none of it under reduced motion, and none with force none but a landing's dust", () => {
		expect(lifeAt({ ...base, motion: false, landing: { block, at: 0 }, force: "all" })).toEqual(NO_LIFE);
		const l = lifeAt({ ...base, wallMs: 10_000, day: true, force: "none", landing: { block, at: 0 }, now: 50 });
		expect([l.snow.length, l.birds.length, l.smoke.length]).toEqual([0, 0, 0]);
		expect(l.dust.length).toBe(DUST_MAX);
	});
	it("is the same for the same clock: nothing is random", () => {
		const a = lifeAt({ ...base, wallMs: 12_345, day: true });
		const b = lifeAt({ ...base, wallMs: 12_345, day: true });
		expect(a).toEqual(b);
	});
});

describe("snow", () => {
	it("falls in spells of 45 s every two minutes, thinning at each end", () => {
		expect(snowShare(0)).toBe(0);
		expect(snowShare(3_000)).toBeCloseTo(0.5, 6);
		expect(snowShare(20_000)).toBe(1);
		expect(snowShare(SNOW_ON_MS - 3_000)).toBeCloseTo(0.5, 6);
		expect(snowShare(SNOW_ON_MS + 1)).toBe(0);
		expect(snowShare(SNOW_CYCLE_MS + 20_000)).toBe(1);
		expect(snowShare(-SNOW_CYCLE_MS + 20_000)).toBe(1);
	});
	it("only at night", () => {
		expect(lifeAt({ ...base, wallMs: 20_000, night: false }).snow).toEqual([]);
		expect(lifeAt({ ...base, wallMs: 20_000 }).snow.length).toBe(SNOW_MAX);
	});
	it("stays inside the view, falls, and comes back at the top", () => {
		const a = snowAt(20_000, VIEW, 2, 1);
		const b = snowAt(20_500, VIEW, 2, 1);
		for (const f of a) {
			expect(f.x).toBeGreaterThanOrEqual(0);
			expect(f.x).toBeLessThanOrEqual(VIEW.w);
			expect(f.y).toBeGreaterThanOrEqual(-8);
			expect(f.y).toBeLessThanOrEqual(VIEW.h + 8);
			expect([2, 4]).toContain(f.size);
		}
		const fell = a.filter((f, i) => b[i].y > f.y).length;
		expect(fell).toBeGreaterThan(SNOW_MAX * 0.8); // the rest wrapped to the top
	});
	it("copes with a view of no size", () => {
		expect(snowAt(20_000, { w: 0, h: 0 }, 1, 1)).toEqual([]);
	});
});

describe("birds", () => {
	it("cross by day, one or two at a time, and never at night", () => {
		let flights = 0;
		let seen = 0;
		for (let wallMs = 0; wallMs < 10 * BIRD_CYCLE_MS; wallMs += 500) {
			const day = lifeAt({ ...base, wallMs, day: true, night: false }).birds;
			expect(day.length).toBeLessThanOrEqual(2);
			if (day.length > 0) seen++;
			if (day.length > 0 && lifeAt({ ...base, wallMs: wallMs - 500, day: true, night: false }).birds.length === 0) flights++;
			expect(lifeAt({ ...base, wallMs, day: false }).birds).toEqual([]);
		}
		expect(flights).toBe(10); // one flight in every cycle
		expect(seen * 500).toBeGreaterThanOrEqual(10 * BIRD_FLIGHT_MS - 10 * 500);
	});
	it("cross the whole view during a flight", () => {
		const forced = (t: number) => birdsAt(t, VIEW, 1, true);
		const start = forced(BIRD_FLIGHT_MS * 3 + 10)[0];
		const end = forced(BIRD_FLIGHT_MS * 4 - 10)[0];
		expect(Math.abs(end.x - start.x)).toBeGreaterThan(VIEW.w);
		expect(start.y).toBeLessThan(VIEW.h * 0.35);
	});
});

describe("smoke", () => {
	it("rises from the workshop's chimney cap, which is a laid block of the workshop", () => {
		const cap = CASTLE_BLOCKS.workshop.find((b) => b.x === CHIMNEY.x && b.y === CHIMNEY.y);
		expect(cap?.tile).toBe("battlement");
		expect(SMOKE_FROM).toEqual({ x: (CHIMNEY.x + 0.5) * TILE, y: CHIMNEY.y * TILE + 3 });
		expect(chimneyLaid(CASTLE_BLOCKS.workshop)).toBe(true);
		expect(chimneyLaid(CASTLE_BLOCKS.workshop.filter((b) => b !== cap))).toBe(false);
		expect(lifeAt({ ...base, wallMs: 5_000, chimney: false }).smoke).toEqual([]);
	});
	it("puffs during its spell, each puff rising, drifting east, growing and fading", () => {
		const during = smokeAt(5_000);
		expect(during.length).toBeGreaterThan(1);
		const later = smokeAt(5_600);
		const newest = during[during.length - 1]; // 0.6 s on, the same puff is 0.66 px wider
		const sameLater = later.find((p) => Math.abs(p.r - newest.r - 0.66) < 1e-6);
		expect(sameLater).toBeDefined();
		if (!sameLater) return;
		expect(sameLater.y).toBeLessThan(newest.y);
		expect(sameLater.x).toBeGreaterThan(newest.x - 2);
		for (const p of during) {
			expect(p.y).toBeLessThanOrEqual(SMOKE_FROM.y);
			expect(p.alpha).toBeGreaterThanOrEqual(0);
			expect(p.alpha).toBeLessThanOrEqual(0.55);
		}
	});
	it("stops between spells once the last puff has faded", () => {
		expect(smokeAt(SMOKE_SPELL_MS + SMOKE_LIFE_MS + 100)).toEqual([]);
		expect(smokeAt(SMOKE_CYCLE_MS - 1)).toEqual([]);
		expect(smokeAt(SMOKE_CYCLE_MS + 3_000).length).toBeGreaterThan(0);
		expect(smokeAt(SMOKE_CYCLE_MS - 1, true).length).toBeGreaterThan(0);
	});
});

describe("a block landing", () => {
	it("pops for 100 ms", () => {
		const landing = { block, at: 1000 };
		expect(popOf(landing, 999)).toBeNull();
		expect(popOf(landing, 1000)).toBe(block);
		expect(popOf(landing, 1000 + POP_MS - 1)).toBe(block);
		expect(popOf(landing, 1000 + POP_MS)).toBeNull();
		expect(popOf(null, 1000)).toBeNull();
	});
	it("throws six motes of dust from its foot, three each way, which fall and fade by 450 ms", () => {
		const landing = { block, at: 1000 };
		const first = dustAt(landing, 1000);
		expect(first).toHaveLength(DUST_MAX);
		const foot = { x: (block.x + 0.5) * TILE, y: (block.y + 1) * TILE - 1 };
		expect(first.filter((m) => m.x < foot.x)).toHaveLength(3);
		expect(first.filter((m) => m.x > foot.x)).toHaveLength(3);
		const late = dustAt(landing, 1000 + DUST_MS - 10);
		for (let j = 0; j < DUST_MAX; j++) {
			expect(Math.abs(late[j].x - foot.x)).toBeGreaterThan(Math.abs(first[j].x - foot.x));
			expect(late[j].alpha).toBeLessThan(first[j].alpha);
		}
		expect(dustAt(landing, 1000 + DUST_MS)).toEqual([]);
		expect(dustAt(landing, 999)).toEqual([]);
	});
});

describe("what the loop is asked for", () => {
	it("frames for a landing, the ambient pace for weather, smoke and birds, and nothing when the world is still", () => {
		expect(lifeWants(lifeAt({ ...base, wallMs: 50_000, chimney: false, landing: { block, at: 0 }, now: 50 }))).toBe("frames");
		expect(lifeWants(lifeAt({ ...base, wallMs: 20_000 }))).toBe("ambient");
		expect(lifeWants(lifeAt({ ...base, wallMs: 50_000, night: false, chimney: false }))).toBeNull();
		expect(lifeWants(NO_LIFE)).toBeNull();
	});
});
```
And add the twinkle test to `lib/world/sky.test.ts`:
- [ ] **ST1** `lib/world/sky.test.ts`. Find:
```ts
	CLOUD_SPAN, CLOUD_SPEED, CLOUDS, cloudX, daylight, hourOf, hslCss, isNight, PARALLAX, phaseOf, SKY_STOPS, skyAt, skyHslAt, starField, sunAt,
} from "./sky";
```
Replace with:
```ts
	CLOUD_SPAN, CLOUD_SPEED, CLOUDS, cloudX, daylight, hourOf, hslCss, isNight, PARALLAX, phaseOf, SKY_STOPS, skyAt, skyHslAt, starField, sunAt,
	twinkle,
} from "./sky";

describe("the stars twinkling (polish pass)", () => {
	it("dims one star in four on some ticks, the same way every run, and never the others", () => {
		const field = starField();
		const levels = new Set<number>();
		for (let tick = 0; tick < 40; tick++) {
			field.forEach((_, i) => {
				const k = twinkle(i, tick);
				if (i % 4 !== 0) expect(k).toBe(1);
				levels.add(k);
				expect(twinkle(i, tick)).toBe(k);
			});
		}
		expect([...levels].sort()).toEqual([0.33, 0.66, 1]);
		const changes = Array.from({ length: 40 }, (_, t) => twinkle(0, t)).filter((k, t, all) => t > 0 && k !== all[t - 1]).length;
		expect(changes).toBeGreaterThan(10);
		expect(twinkle(0, Number.NaN)).toBe(1);
	});
});
```

- [ ] **Step 2: Run them and see them fail.**
Run: `npx vitest run lib/world/life.test.ts lib/world/sky.test.ts`
Expected: FAIL: `Failed to resolve import "./life"`; `twinkle is not a function`.

- [ ] **Step 3: Implement.** Create `lib/world/life.ts`:
```ts
// Life in the world (the polish pass): light snow at night, one or two birds crossing the sky by day, smoke from the
// workshop's chimney, and a small puff of dust when a block lands. Every particle is a pure function of the clock;
// the only thing the world keeps between frames is the last block that landed. So any frame can be drawn at any time,
// the tests can pin it, and a hidden tab (no frames) costs nothing. The caps are hard: no frame holds more than
// MAX_PARTICLES. Under reduced motion there is none of it (spec 2: still frames).
//
// Snow and smoke come in spells, so the loop can fall back to its 3 s tick between them (spec 2's redraw rules):
// while any of this is on screen the loop runs at AMBIENT_MS (pace.ts), or at frame pace for the dust.
import { WORKSHOP } from "./blueprints/workshop";
import { TILE, type Block } from "./blueprints/types";

export const SNOW_MAX = 40;
export const SMOKE_MAX = 6;
export const BIRDS_MAX = 2;
export const DUST_MAX = 6;
export const MAX_PARTICLES = SNOW_MAX + SMOKE_MAX + BIRDS_MAX + DUST_MAX;

// Screen px for snow and birds (they belong to the sky, not to a place); world px for smoke and dust.
export type Flake = { x: number; y: number; size: number; alpha: number };
export type Bird = { x: number; y: number; frame: 0 | 1; flip: boolean };
export type Puff = { x: number; y: number; r: number; alpha: number };
export type Mote = { x: number; y: number; size: number; alpha: number };
// The block that landed last and when (the loop's clock, ms).
export type Landing = { block: Block; at: number };
export type Life = { snow: readonly Flake[]; birds: readonly Bird[]; smoke: readonly Puff[]; dust: readonly Mote[]; pop: Block | null };
export const NO_LIFE: Life = { snow: [], birds: [], smoke: [], dust: [], pop: null };

// A fixed hash of an integer and a salt, in 0..1.
function hash(n: number, salt: number): number {
	let h = Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(salt + 0x51ed, 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
	h = Math.imul(h ^ (h >>> 13), 0x27d4eb2d);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (a: number, n: number) => ((a % n) + n) % n;

// --- Snow: at night, in spells of SNOW_ON_MS every SNOW_CYCLE_MS (the first and last SNOW_RAMP_MS of a spell thin
// out), up to SNOW_MAX flakes falling and swaying across the whole view, wrapping from the bottom to the top. ---
export const SNOW_CYCLE_MS = 120_000;
export const SNOW_ON_MS = 45_000;
export const SNOW_RAMP_MS = 6_000;
export function snowShare(wallMs: number): number {
	const p = mod(wallMs, SNOW_CYCLE_MS);
	if (p >= SNOW_ON_MS) return 0;
	return Math.min(1, p / SNOW_RAMP_MS, (SNOW_ON_MS - p) / SNOW_RAMP_MS);
}
export function snowAt(wallMs: number, view: { w: number; h: number }, scale: number, share: number): Flake[] {
	const count = Math.min(SNOW_MAX, Math.round(SNOW_MAX * Math.min(1, Math.max(0, share))));
	if (count === 0 || view.w <= 0 || view.h <= 0) return [];
	const k = Math.max(1, Math.round(scale));
	const t = wallMs / 1000;
	const out: Flake[] = [];
	for (let i = 0; i < count; i++) {
		const big = i % 5 === 0;
		const fall = (14 + 12 * hash(i, 1)) * k; // px a second
		const span = view.h + 8 * k;
		const y = mod(t * fall + hash(i, 2) * span, span) - 4 * k;
		const sway = Math.sin((t * 2 * Math.PI) / (3 + 2 * hash(i, 3)) + hash(i, 4) * 6.283) * 5 * k;
		const x = mod(hash(i, 5) * view.w + t * 4 * k + sway, view.w);
		out.push({ x: Math.round(x), y: Math.round(y), size: (big ? 2 : 1) * k, alpha: big ? 0.85 : 0.6 });
	}
	return out;
}

// --- Birds: by day, a flight every BIRD_CYCLE_MS at a time of its own within it, one or two birds crossing the view
// in BIRD_FLIGHT_MS, left to right or right to left, high in the sky, flapping and gliding. ---
export const BIRD_CYCLE_MS = 80_000;
export const BIRD_FLIGHT_MS = 16_000;
export function birdsAt(wallMs: number, view: { w: number; h: number }, scale: number, always = false): Bird[] {
	if (view.w <= 0 || view.h <= 0) return [];
	const k = Math.max(1, Math.round(scale));
	const n = Math.floor(wallMs / BIRD_CYCLE_MS);
	const start = always ? Math.floor(wallMs / BIRD_FLIGHT_MS) * BIRD_FLIGHT_MS : n * BIRD_CYCLE_MS + hash(n, 11) * (BIRD_CYCLE_MS - BIRD_FLIGHT_MS);
	const t = wallMs - start;
	if (t < 0 || t >= BIRD_FLIGHT_MS) return [];
	const seed = always ? Math.floor(wallMs / BIRD_FLIGHT_MS) : n;
	const leftward = hash(seed, 12) < 0.5;
	const two = hash(seed, 13) < 0.45;
	const fy = 0.1 + 0.18 * hash(seed, 14);
	const share = t / BIRD_FLIGHT_MS;
	const out: Bird[] = [];
	for (let b = 0; b < (two ? 2 : 1); b++) {
		const across = -12 * k + (view.w + 24 * k) * share - b * 14 * k;
		const x = leftward ? view.w - across : across;
		const y = fy * view.h + Math.sin(t / 420 + b * 1.7) * 2 * k + b * 6 * k;
		// Four wingbeats, then a glide of two.
		const beat = Math.floor(t / 170 + b * 2) % 6;
		out.push({ x: Math.round(x), y: Math.round(y), frame: beat < 4 ? ((beat % 2) as 0 | 1) : 0, flip: leftward });
	}
	return out.slice(0, BIRDS_MAX);
}

// --- Smoke: from the workshop's chimney once it is built, a puff every SMOKE_EVERY_MS during a spell of
// SMOKE_SPELL_MS in every SMOKE_CYCLE_MS; each rises, drifts east, grows and fades over SMOKE_LIFE_MS. ---
const chimneyRow = WORKSHOP.map.findIndex((r) => r.includes("T"));
// The chimney's cap (tile coordinates): the battlement over the workshop's chimney brick.
export const CHIMNEY = { x: WORKSHOP.x + WORKSHOP.map[chimneyRow].indexOf("T"), y: WORKSHOP.y + chimneyRow };
export const SMOKE_FROM = { x: (CHIMNEY.x + 0.5) * TILE, y: CHIMNEY.y * TILE + 3 }; // world px
export const chimneyLaid = (laid: readonly Block[]): boolean => laid.some((b) => b.x === CHIMNEY.x && b.y === CHIMNEY.y);
export const SMOKE_EVERY_MS = 1400;
export const SMOKE_SPELL_MS = 9_000;
export const SMOKE_CYCLE_MS = 30_000;
export const SMOKE_LIFE_MS = 5_600;
export function smokeAt(wallMs: number, always = false): Puff[] {
	const out: Puff[] = [];
	const first = Math.ceil((wallMs - SMOKE_LIFE_MS) / SMOKE_EVERY_MS);
	const last = Math.floor(wallMs / SMOKE_EVERY_MS);
	for (let k = first; k <= last; k++) {
		const born = k * SMOKE_EVERY_MS;
		if (!always && mod(born, SMOKE_CYCLE_MS) >= SMOKE_SPELL_MS) continue;
		const age = (wallMs - born) / 1000;
		const life = SMOKE_LIFE_MS / 1000;
		if (age < 0 || age >= life) continue;
		out.push({
			x: SMOKE_FROM.x + age * 5 + Math.sin(age * 1.7 + k) * 1.5,
			y: SMOKE_FROM.y - age * 9,
			r: 2 + age * 1.1,
			alpha: 0.55 * (1 - age / life) * Math.min(1, age / 0.3),
		});
	}
	return out.slice(-SMOKE_MAX);
}

// --- A block lands: it pops (drawn a world pixel bigger all round) for POP_MS, and DUST_MAX motes of dust spring
// from its foot, three each way, and fall and fade over DUST_MS. ---
export const POP_MS = 100;
export const DUST_MS = 450;
export const popOf = (landing: Landing | null, now: number): Block | null =>
	landing && now >= landing.at && now - landing.at < POP_MS ? landing.block : null;
export function dustAt(landing: Landing | null, now: number): Mote[] {
	if (!landing) return [];
	const age = (now - landing.at) / 1000;
	if (!(age >= 0 && age < DUST_MS / 1000)) return [];
	const foot = { x: (landing.block.x + 0.5) * TILE, y: (landing.block.y + 1) * TILE - 1 };
	const out: Mote[] = [];
	for (let j = 0; j < DUST_MAX; j++) {
		const side = j < DUST_MAX / 2 ? -1 : 1;
		const n = j % 3;
		const vx = side * (14 + 10 * n);
		const vy = -(10 + 6 * n);
		out.push({
			x: foot.x + side * (4 + 2 * n) + vx * age,
			y: foot.y + vy * age + 30 * age * age,
			size: n === 0 ? 2 : 1, // world px
			alpha: 0.7 * (1 - age / (DUST_MS / 1000)),
		});
	}
	return out;
}

// Everything alive in one frame. day: full daylight (birds); night: dark enough for snow; chimney: the workshop's
// chimney cap is laid; motion: false under reduced motion (nothing at all). force (the dev page): "all" keeps snow,
// smoke and birds going whatever the hour or spell, "none" turns them off.
export type LifeInput = {
	wallMs: number;
	now: number;
	view: { w: number; h: number };
	scale: number;
	day: boolean;
	night: boolean;
	chimney: boolean;
	landing: Landing | null;
	motion: boolean;
	force?: "all" | "none";
};
export function lifeAt(o: LifeInput): Life {
	if (!o.motion) return NO_LIFE;
	const all = o.force === "all";
	const none = o.force === "none";
	return {
		snow: none || !(o.night || all) ? [] : snowAt(o.wallMs, o.view, o.scale, all ? 1 : snowShare(o.wallMs)),
		birds: none || !(o.day || all) ? [] : birdsAt(o.wallMs, o.view, o.scale, all),
		smoke: none || !o.chimney ? [] : smokeAt(o.wallMs, all),
		dust: dustAt(o.landing, o.now),
		pop: popOf(o.landing, o.now),
	};
}
export const particleCount = (l: Life): number => l.snow.length + l.birds.length + l.smoke.length + l.dust.length;
// What the life on screen asks of the loop: frames for a landing (short), the ambient pace for the rest, or nothing.
export function lifeWants(l: Life): "frames" | "ambient" | null {
	if (l.dust.length > 0 || l.pop !== null) return "frames";
	return l.snow.length + l.birds.length + l.smoke.length > 0 ? "ambient" : null;
}
```
And the twinkle:
- [ ] **S1** `lib/world/sky.ts`. Find:
```ts
export type Star = { fx: number; fy: number; big: boolean };
```
Replace with:
```ts
export type Star = { fx: number; fy: number; big: boolean };
// The polish pass: one star in four twinkles. On each slow tick (pace.ts SLOW_MS) it shines at full, two thirds or a
// third, from a fixed hash of its place in the field and the tick's number; the others always shine at full.
export function twinkle(i: number, tick: number): number {
	if (i % 4 !== 0 || !Number.isFinite(tick)) return 1;
	let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(Math.floor(tick) + 7, 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
	return [1, 0.66, 0.33][((h ^ (h >>> 13)) >>> 0) % 3];
}
```

- [ ] **Step 4: Run the checks.**
Run: `npx vitest run lib/world/life.test.ts lib/world/sky.test.ts`, then `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`.
Expected: all pass. Nothing imports `life.ts` yet.

- [ ] **Step 5: Commit.**
```bash
git add lib/world/life.ts lib/world/life.test.ts lib/world/sky.ts lib/world/sky.test.ts
git commit -m "feat(world): life in the world as pure functions of the clock, with hard caps; stars that twinkle" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---
### Task 4: Backdrop art: hand-drawn far islands, the hills, the birds
**Model:** Opus (judged by eye). **Waits for:** nothing (wave 1).
**Files:** Modify `lib/world/backdrop.ts`, `lib/world/backdrop.test.ts`.

**Interfaces:**
- Consumes: `Grid` (raster.ts); the renderer's existing drawing of `FAR_ISLANDS` (runs, `w`, `fx`, `lift`; unchanged) and `hazeTones` (render.ts) for the preview.
- Produces (Tasks 9 and 10 use them):
  - `Run`, `FarIsland` (unchanged), `Pt = readonly [x, y]`, `silhouette(outline, hazeFrom?, hazeAll?): { runs; w }`.
  - `FAR_ISLANDS`: three hand-drawn islands, `FAR_PARALLAX` 0.12 (unchanged).
  - `Hills = { runs; w; drop; parallax }` and `HILLS` (a ridge at least 640 wide that wraps, at least 72 deep below its top line, `parallax` between 0.12 and 0.6 (use 0.25), `drop` the world px its top line lies below the island's snow (use about 40)).
  - `BIRD_CELL = { w: 9, h: 5 }`, `BIRD_GRIDS` (two cells: wings up, wings down; letters `a` and `b` only, facing right).

**What to draw** (all silhouettes; the renderer tints them from the sky, so draw shapes, not colours). Each outline is a closed polygon of hand-placed points, x across from the left end, y down from the top line (negative above it); `silhouette()` fills it, lights the top and hazes the underside. Use 30 to 70 points an island; look at `1920x1080-day.png` and each `island-<n>-4x.png`.

| Name | Where (`fx`, `lift`) | Width | What it must show |
|---|---|---|---|
| The watchtower isle | 0.12, 170 | about 260 | A long, slightly tilted top line; a broken watchtower (about 10 wide, rising 30 to 36 above the top line, its top stepped as if part fell) left of centre; two narrow pines toward the right end; an underside that is not a bowl: a deep central keel with three hanging rocks of different lengths and a ragged root fringe between them. |
| The lone tree | 0.62, 300 | about 150 | A small, high islet: one broad round-crowned tree (a lumpy dome about 40 wide and 26 tall on a short trunk) off centre; a shallow body that narrows into one long drip-stone hanging far below, and a smaller one beside it. High over the castle's roofs at most sizes: its crown and the drip-stone must read as a tree and a stone, not a blob. |
| The cottage isle | 0.89, 120 | about 210 | Two humps on the top line with a saddle; a small cottage with a pitched roof and a chimney on the larger hump; a short fence line of posts; an underside of two lobes with a gap between them, each with a hanging stone. |
| The hills (`HILLS`) | the whole width, repeating | 960 to 1100 | One continuous ridge: three or four rounded summits 30 to 60 px above the lowest saddle, one long gentle shoulder, a crest lined with small tree bumps on one stretch; its two ends at the same height (within 2 px) so it wraps without a seam; at least 72 px deep below its top line (its foot disappears into the haze band). |
| Birds (`BIRD_GRIDS`) | - | 9 by 5 | A small dark gull, facing right: wings up (a shallow V, the body a pixel or two of `b` with an `a` outline) and wings down (wings level or dipped). Readable at scale 1 against a light sky. |

- [ ] **Step 1: Write the failing tests.**
- [ ] **BT1** `lib/world/backdrop.test.ts`. Find:
```ts
import { CLOUD_CELL, CLOUD_GRIDS, CLOUD_SHAPES, FAR_ISLANDS } from "./backdrop";
```
Replace with:
```ts
import { BIRD_CELL, BIRD_GRIDS, CLOUD_CELL, CLOUD_GRIDS, CLOUD_SHAPES, FAR_ISLANDS, HILLS, silhouette } from "./backdrop";
```
- [ ] **BT2** `lib/world/backdrop.test.ts`. Find:
```ts
describe("the far islands", () => {
```
Replace with:
```ts
describe("a hand-drawn silhouette (polish pass)", () => {
	it("fills its outline by scanlines, lights its top and hazes its underside", () => {
		// A square 10 wide from y 0 to 10 with a tree 2 wide from y -4.
		const s = silhouette([[0, 0], [4, 0], [4, -4], [6, -4], [6, 0], [10, 0], [10, 10], [0, 10]]);
		expect(s.w).toBe(10);
		const at = (x: number, y: number) => s.runs.find(([ry, x0, x1]) => ry === y && x >= x0 && x < x1)?.[3];
		expect(at(5, -4)).toBe(1); // the tree's top is lit
		expect(at(1, 0)).toBe(1); // the shoulder beside it too
		expect(at(5, 2)).toBe(0); // the body
		expect(at(5, 9)).toBe(2); // the underside, in haze
		expect(at(11, 5)).toBeUndefined();
		expect(at(5, -5)).toBeUndefined();
	});
});

describe("the far islands", () => {
```
- [ ] **BT3** `lib/world/backdrop.test.ts`. Find:
```ts
				expect([0, 1, 2]).toContain(tone);
			}
		}
	});
});
```
Replace with:
```ts
				expect([0, 1, 2]).toContain(tone);
			}
		}
	});
	it("are three places of their own, hand drawn: each has something standing on it and something hanging under it", () => {
		expect(FAR_ISLANDS).toHaveLength(3);
		expect(new Set(FAR_ISLANDS.map((f) => f.w)).size).toBe(3);
		for (const f of FAR_ISLANDS) {
			const ys = f.runs.map(([y]) => y);
			expect(Math.min(...ys)).toBeLessThanOrEqual(-8); // a tree, a tower or a hill above its top line
			expect(Math.max(...ys)).toBeGreaterThanOrEqual(40);
			// Under it, in its lowest fifth, at least two parts hang apart from each other.
			const low = Math.max(...ys) - Math.round(Math.max(...ys) / 5);
			const lowRow = f.runs.filter(([y]) => y === low);
			expect(lowRow.length).toBeGreaterThanOrEqual(2);
		}
	});
});

describe("the hills (polish pass)", () => {
	it("are one ridge across their whole width that wraps without a seam", () => {
		const top = (x: number) => Math.min(...HILLS.runs.filter(([, x0, x1]) => x >= x0 && x < x1).map(([y]) => y));
		for (let x = 0; x < HILLS.w; x++) expect(Number.isFinite(top(x)), `${x}`).toBe(true);
		expect(Math.abs(top(0) - top(HILLS.w - 1))).toBeLessThanOrEqual(2);
		const tops = Array.from({ length: HILLS.w }, (_, x) => top(x));
		expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThanOrEqual(24); // hills, not a flat band
		expect(HILLS.w).toBeGreaterThanOrEqual(640);
		expect(HILLS.parallax).toBeGreaterThan(0.12); // nearer than the far islands
		expect(HILLS.parallax).toBeLessThan(0.6);
		expect(HILLS.drop).toBeGreaterThan(0);
		expect(Math.max(...HILLS.runs.map(([y]) => y))).toBeGreaterThanOrEqual(72); // deep enough for the haze band to swallow their foot
	});
});

describe("the birds (polish pass)", () => {
	it("are two small dark cells, wings up and wings down", () => {
		expect(BIRD_GRIDS).toHaveLength(2);
		for (const g of BIRD_GRIDS) {
			expect(gridProblems(g, BIRD_CELL.w, BIRD_CELL.h)).toEqual([]);
			expect(g.join("").replace(/\./g, "")).toMatch(/^[ab]+$/);
		}
		expect(BIRD_GRIDS[0]).not.toEqual(BIRD_GRIDS[1]);
	});
});
```

- [ ] **Step 2: Run them and see them fail.**
Run: `npx vitest run lib/world/backdrop.test.ts`
Expected: FAIL: `BIRD_CELL`, `BIRD_GRIDS`, `HILLS` and `silhouette` are not exported.

- [ ] **Step 3: The section and its helper.** Apply these two edits (the second replaces the generated islands, their plan type and `hash`, which nothing else uses):
- [ ] **B1** `lib/world/backdrop.ts`. Find:
```ts
// What lies behind the island (the look pass): the cloud sheet, big soft clouds drawn as palette grids so they stamp
// like tiles, and the far islands, flat silhouettes in haze that the renderer tints from the sky. Pure.
```
Replace with:
```ts
// What lies behind the island (the look pass, redrawn in the polish pass): the cloud sheet, big soft clouds drawn as
// palette grids so they stamp like tiles; the far islands, hand-drawn silhouettes in haze that the renderer tints from
// the sky; a nearer ridge of hills; and the birds that cross the sky by day. Pure.
```
- [ ] **B2** `lib/world/backdrop.ts`: replace everything from the line that starts `// --- The far islands: silhouettes as runs of pixels` to the end of the file with:
```ts
// --- The far islands and the hills: silhouettes as runs of pixels, one tone each (0 the body, 1 the lit rim along
// the top, 2 the hazier underside). y is down from the silhouette's top line (negative above it: its trees, towers and
// hills); x is across from its left end. ---
export type Run = readonly [y: number, x0: number, x1: number, tone: 0 | 1 | 2];
export type FarIsland = { runs: readonly Run[]; w: number; fx: number; lift: number };
export type Pt = readonly [x: number, y: number];

// A hand-drawn outline (a closed polygon of points, clockwise or not) filled by scanlines into runs. A filled pixel
// with sky one or two pixels above it is the lit rim; from hazeFrom of the way down to the outline's lowest point the
// body dithers into the haze, and from hazeAll on it is all haze.
export function silhouette(outline: readonly Pt[], hazeFrom = 0.5, hazeAll = 0.72): { runs: Run[]; w: number } {
	const ys = outline.map((p) => p[1]);
	const top = Math.floor(Math.min(...ys));
	const bottom = Math.ceil(Math.max(...ys));
	const w = Math.ceil(Math.max(...outline.map((p) => p[0])));
	const filled = new Map<number, Set<number>>();
	for (let y = top; y < bottom; y++) {
		const sy = y + 0.5;
		const xs: number[] = [];
		for (let i = 0; i < outline.length; i++) {
			const [ax, ay] = outline[i];
			const [bx, by] = outline[(i + 1) % outline.length];
			if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
		}
		xs.sort((a, b) => a - b);
		const row = new Set<number>();
		for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(w, Math.round(xs[k + 1])); x++) row.add(x);
		if (row.size > 0) filled.set(y, row);
	}
	const has = (x: number, y: number) => filled.get(y)?.has(x) ?? false;
	const runs: Run[] = [];
	for (const [y, row] of [...filled.entries()].sort((a, b) => a[0] - b[0])) {
		const t = bottom > 0 ? y / bottom : 0;
		const tone = (x: number): 0 | 1 | 2 => {
			if (!has(x, y - 1) || !has(x, y - 2)) return 1;
			return t > hazeAll || (t > hazeFrom && (x + y) % 2 === 0) ? 2 : 0;
		};
		const xs = [...row].sort((a, b) => a - b);
		let start = xs[0];
		for (let i = 1; i <= xs.length; i++) {
			const x = xs[i];
			const prev = xs[i - 1];
			if (x === prev + 1 && tone(x) === tone(prev)) continue;
			runs.push([y, start, prev + 1, tone(prev)]);
			start = x;
		}
	}
	return { runs, w };
}

// fx: where its centre sits across the view (a share of the width); lift: how far its top line stands above the
// island's snow, in world px. Three places of their own, the middle one far behind the hall and mostly hidden by it.
// Drawn in this task: export const FAR_ISLANDS: readonly FarIsland[] = [three { ...silhouette(OUTLINE), fx, lift }].
export const FAR_PARALLAX = 0.12;

// The hills (polish pass): a long ridge nearer than the far islands, its top line HILLS.drop world px below the
// island's snow (they lie lower, the island floats above them), repeating every HILLS.w px across the view, moving at
// HILLS.parallax. Its foot sinks into the haze band the renderer lays at the horizon (render.ts HAZE).
export type Hills = { runs: readonly Run[]; w: number; drop: number; parallax: number };
// Drawn in this task: export const HILLS: Hills = { ...silhouette(RIDGE), drop, parallax }.

// The birds (polish pass, life.ts birdsAt): a small dark bird, wings up and wings down, 9 by 5, facing right.
export const BIRD_CELL = { w: 9, h: 5 };
// Drawn in this task: export const BIRD_GRIDS: readonly Grid[] = [wings up, wings down].
```
Then replace each of the three `// Drawn in this task: ...` comment lines with your drawing, in this shape:
```ts
// The watchtower isle: (what it shows, in one line).
const WATCHTOWER: readonly Pt[] = [
	[0, 3], [14, 0], /* ... your points ... */
];
export const FAR_ISLANDS: readonly FarIsland[] = [
	{ ...silhouette(WATCHTOWER), fx: 0.12, lift: 170 },
	{ ...silhouette(LONE_TREE), fx: 0.62, lift: 300 },
	{ ...silhouette(COTTAGE), fx: 0.89, lift: 120 },
];
export const HILLS: Hills = { ...silhouette(RIDGE), drop: 40, parallax: 0.25 };
export const BIRD_GRIDS: readonly Grid[] = [
	// wings up, then wings down: 5 rows of 9 letters each
];
```
The ridge's polygon is its top line from x 0 to x `w` followed by the two bottom corners (`[w, depth]`, `[0, depth]`); keep its first and last top points at the same height.

- [ ] **Step 4: Look at it.** Create `lib/world/zz-backdrop.test.ts` (never committed), run it as "The previews" says, and look at every PNG: the three islands must read as three different places at 1920 by 1080, 1200 by 800 and 1366 by 768, by day, at dawn and dusk and at night; the hills must sit lower than the island's snow, behind everything, and wrap with no seam in `hills-2x.png`; the birds must read at 12x and as a dark tick at scale 1. Iterate.
```ts
// Scratch preview for Task 7 (backdrop): NEVER commit this file. Run with
//   WORLD_SNAPSHOT_DIR=<your scratchpad>/backdrop npx vitest run lib/world/zz-backdrop.test.ts
// (make the folder first) and look at every PNG it writes. The renderer draws the hills from Task 8 on; until then
// this preview lays them itself, in the far islands' tones, where the renderer will put them.
import { it } from "vitest";
import { look, newActor } from "./actor";
import { BIRD_CELL, BIRD_GRIDS, FAR_ISLANDS, HILLS, type Run } from "./backdrop";
import { blocksOf } from "./blueprints";
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { ISLAND } from "./blueprints/island";
import { CASTLE_ROOMS, GROUND_Y, TILE } from "./blueprints/types";
import { newCamera, toScreen } from "./camera";
import { pixelPainter, type PixelPainter } from "./pixel-painter";
import { snapshot } from "./png";
import { colours, rasterize } from "./raster";
import { artFor, drawSky, drawWorld, hazeTones } from "./render";
import { skyAt, starField } from "./sky";

const SCARF = "hsl(172 38% 50%)";
const runs = (p: PixelPainter, rs: readonly Run[], ox: number, oy: number, k: number, tones: readonly string[]) => {
	for (const [y, x0, x1, t] of rs) p.rect(ox + x0 * k, oy + y * k, (x1 - x0) * k, k, tones[t], 1);
};
function shot(name: string, view: { w: number; h: number }, hour: number) {
	const dark = hour >= 21 || hour < 5 ? 1 : 0;
	const sky = skyAt(SCARF, "hsl(212 38% 50%)", hour);
	const back = pixelPainter(view.w, view.h, artFor(SCARF, dark));
	drawSky(back, { sky, stars: starField() });
	const front = pixelPainter(view.w, view.h, artFor(SCARF, dark));
	const camera = newCamera(32.5 * TILE, view, 1);
	// The hills as the renderer will lay them: behind everything, HILLS.drop below the snow line, repeating.
	const ground = toScreen(camera, view, 0, 0, GROUND_Y * TILE).y;
	const htop = ground + HILLS.drop;
	const tones = hazeTones(sky, (htop + 12) / view.h);
	for (let ox = -HILLS.w; ox < view.w; ox += HILLS.w) runs(back, HILLS.runs, ox, htop, 1, tones);
	const him = newActor(32.5 * TILE, 0, hour);
	drawWorld(front, {
		camera, view, now: 0, clock: 0, ground: blocksOf(ISLAND), laid: CASTLE_ROOMS.flatMap((r) => [...CASTLE_BLOCKS[r]]), ghost: null,
		him: { x: him.x, look: look(him, 0, "warm") }, sky, dark,
	});
	for (let i = 0; i < front.data.length; i += 4) {
		const a = front.data[i + 3] / 255;
		for (let c = 0; c < 3; c++) back.data[i + c] = Math.round(front.data[i + c] * a + back.data[i + c] * (1 - a));
	}
	snapshot(name, back);
}

it("previews the far islands, the hills and the birds", () => {
	// 1. The whole view at three sizes and three hours: the far islands drawn by the renderer, the hills as above.
	shot("1920x1080-day", { w: 1920, h: 1080 }, 13);
	shot("1920x1080-dusk", { w: 1920, h: 1080 }, 19.5);
	shot("1200x800-day", { w: 1200, h: 800 }, 13);
	shot("1200x800-dawn", { w: 1200, h: 800 }, 6);
	shot("1366x768-night", { w: 1366, h: 768 }, 23);
	// 2. Each far island alone at 4x, and two periods of the hills at 2x, on the day sky's colour at their height.
	const sky = skyAt(SCARF, "hsl(212 38% 50%)", 13);
	FAR_ISLANDS.forEach((f, i) => {
		const ys = f.runs.map(([y]) => y);
		const y0 = Math.min(...ys);
		const h = Math.max(...ys) - y0 + 1;
		const p = pixelPainter(f.w * 4, h * 4, artFor(SCARF));
		p.rect(0, 0, p.w, p.h, "#6d8fae", 1);
		runs(p, f.runs, 0, -y0 * 4, 4, hazeTones(sky, 0.5));
		snapshot(`island-${i}-4x`, p);
	});
	const hy = HILLS.runs.map(([y]) => y);
	const hp = pixelPainter(HILLS.w * 2 * 2, (Math.max(...hy) - Math.min(...hy) + 1) * 2, artFor(SCARF));
	hp.rect(0, 0, hp.w, hp.h, "#6d8fae", 1);
	for (const ox of [0, HILLS.w * 2]) runs(hp, HILLS.runs, ox, -Math.min(...hy) * 2, 2, hazeTones(sky, 0.75));
	snapshot("hills-2x", hp);
	// 3. The birds at 12x, wings up and down.
	snapshot("birds-12x", rasterize(BIRD_GRIDS, BIRD_CELL.w, BIRD_CELL.h, 12, colours()));
});
```

- [ ] **Step 5: Run the checks.**
Run: `npx vitest run lib/world/backdrop.test.ts lib/world/render.test.ts`, then `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`.
Expected: all pass; the world-40 hash is unchanged (that scene has no sky, so no far islands).

- [ ] **Step 6: Commit.** Delete `lib/world/zz-backdrop.test.ts` first; `git status` must not list it.
```bash
git add lib/world/backdrop.ts lib/world/backdrop.test.ts
git commit -m "art(world): hand-drawn far islands, a ridge of hills, and the birds" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Report: the preview folder and the PNGs to show Gur (at least `1920x1080-day.png`, `1920x1080-dusk.png`, the three `island-*` and `hills-2x.png`).


---
### Task 5: The room over the world and the sun's halo (CSS)
**Model:** Sonnet. **Waits for:** nothing (wave 1).
**Files:** Modify `components/osmo/world.module.css`, `app/assistant.module.css`.

**Interfaces:**
- Consumes: `--aura-a`, `--base`, `--bone` (set on the stage by `app/assistant.tsx` and the dev page); `.world[data-sun]` (set by the loop); `aside#osmo-panel` (`components/osmo/panel.tsx`, `shell-panel.tsx`); the rail's curve `cubic-bezier(0.2, 0.8, 0.2, 1)` (`rail.module.css --ease`).
- Produces: CSS only. Every rule added to `app/assistant.module.css` starts with `.stage[data-world]` (or is a keyframes block only those rules use); `world.module.css` is loaded only with the world.

There is no unit test for CSS here (vitest runs `lib/**` in node). The checks are the build, lint and the look in the browser in the gate (Task 13), which also checks the switches-off room is unchanged.

- [ ] **Step 1: The sun's halo and the subtitle.**
- [ ] **V1** `components/osmo/world.module.css`. Find:
```css
.world[data-sun="down"] .sun {
	opacity: 0.35;
	filter: saturate(0.6) brightness(0.7);
}
```
Replace with:
```css
.world[data-sun="down"] .sun {
	opacity: 0.35;
	filter: saturate(0.6) brightness(0.7);
}
/* Polish pass: a soft halo round the sun in its own colour, behind the heart; gone while the sun is down. */
.sun::before {
	content: "";
	position: absolute;
	inset: -75%;
	z-index: -1;
	border-radius: 50%;
	background: radial-gradient(
		closest-side,
		color-mix(in oklab, var(--aura-a, #3aa597) 34%, transparent),
		color-mix(in oklab, var(--aura-a, #3aa597) 12%, transparent) 55%,
		transparent
	);
	pointer-events: none;
	transition: opacity 2s ease;
}
.world[data-sun="down"] .sun::before {
	opacity: 0;
}
```
- [ ] **V2** `components/osmo/world.module.css`. Find:
```css
.said,
.heard {
	margin: 0;
	padding: 0.35rem 0.7rem;
	border-radius: 0.6rem;
	text-align: center;
	text-wrap: balance;
	line-height: 1.4;
	background: color-mix(in oklab, var(--ink, #0c111b) 78%, transparent);
}
.said {
	font-size: 1rem;
	color: var(--bone);
	transition: opacity 0.3s ease;
}
.said:empty {
	padding: 0;
	background: none;
}
.heard {
	font-size: 0.9rem;
	color: color-mix(in oklab, var(--bone) 70%, transparent);
}
```
Replace with:
```css
/* Polish pass: set in the room's type (the stage's font, the conversation's size and line height) on no box, with a
   soft shadow that keeps it readable over the sky, the snow and the castle alike. */
.said,
.heard {
	margin: 0;
	padding: 0 0.25rem;
	text-align: center;
	text-wrap: balance;
	line-height: 1.5;
	letter-spacing: 0.005em;
	text-shadow:
		0 1px 2px rgb(0 0 0 / 0.7),
		0 0 10px rgb(0 0 0 / 0.55),
		0 0 22px rgb(0 0 0 / 0.35);
}
.said {
	font-size: 1.05rem;
	font-weight: 500;
	color: var(--bone);
	transition: opacity 0.3s ease;
}
.said:empty {
	padding: 0;
}
.heard {
	font-size: 0.92rem;
	color: color-mix(in oklab, var(--bone) 78%, transparent);
}
```

- [ ] **Step 2: The glass band and the panels' slide.**
- [ ] **V3** `app/assistant.module.css`. Find:
```css
.stage[data-world] .composer {
	margin-top: auto;
}
```
Replace with:
```css
.stage[data-world] .composer {
	margin-top: auto;
}
/* Polish pass: a faint glass band behind the conversation column and the composer, so the words sit on something
   while the world shows through: blurred where the browser can, a translucent fill where it cannot. It takes no
   clicks, so the rooms behind the empty column stay clickable (phase 2), and its edges fade into the world. */
.stage[data-world] .column::before {
	content: "";
	position: absolute;
	inset: 0 -1.5rem;
	z-index: -1;
	pointer-events: none;
	background: color-mix(in oklab, var(--base) 34%, transparent);
	-webkit-mask-image: linear-gradient(to right, transparent, #000 1.5rem, #000 calc(100% - 1.5rem), transparent);
	mask-image: linear-gradient(to right, transparent, #000 1.5rem, #000 calc(100% - 1.5rem), transparent);
}
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
	.stage[data-world] .column::before {
		background: color-mix(in oklab, var(--base) 16%, transparent);
		-webkit-backdrop-filter: blur(6px) saturate(1.1);
		backdrop-filter: blur(6px) saturate(1.1);
	}
}
/* A panel slides over the world from the room's edge, the whole of its width, on the rail's easing
   (rail.module.css --ease), instead of fading in from close by. */
.stage[data-world] :global(#osmo-panel) {
	animation: world-panel-in 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes world-panel-in {
	from {
		translate: 100% 0;
	}
	to {
		translate: 0 0;
	}
}
@media (prefers-reduced-motion: reduce) {
	.stage[data-world] :global(#osmo-panel) {
		animation: world-panel-fade 0.15s ease both;
	}
}
@keyframes world-panel-fade {
	from {
		opacity: 0;
	}
}
```

- [ ] **Step 3: Say what to look at.** The dev server and the browser preview are the main agent's. In your report, list what the main agent must look at in the gate (Task 13, Step 3): on `/dev/world`, the subtitle (press Speaking) by day, at night and over the castle, and the sun's halo at Day and Dusk; in the real room with both switches on, the glass band, a panel sliding in, and the room unchanged with the switches off.

- [ ] **Step 4: Run the checks.**
Run: `npm run lint`, `npx vitest run` (unchanged), and `npx next build --webpack` with both switches on for that command only (bash: `NEXT_PUBLIC_OSMO_SHELL2=on NEXT_PUBLIC_OSMO_WORLD=on npx next build --webpack`; PowerShell: set both with `$env:` in the same command line and remove them after).
Expected: lint clean (CSS files are not linted: "no matching configuration" is fine), the build passes.

- [ ] **Step 5: Commit.**
```bash
git add components/osmo/world.module.css app/assistant.module.css
git commit -m "style(world): a glass band behind the conversation, his line in the room's type, panels slide over the world, a halo round the sun" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---
### Task 6: The camera eases and glides
**Model:** Sonnet. **Waits for:** Task 1 (the renderer must draw fractional zooms first).
**Files:** Modify `lib/world/camera.ts`, `lib/world/camera.test.ts`, one line of `components/osmo/world.tsx`.

**Interfaces:**
- Consumes: Task 1's renderer (draws any zoom); `HALL`, `ISLAND`, `GROUND_Y`, `TILE`, `WORLD_W`.
- Produces:
  - `Camera` gains `aimX`, `aimY` (where it heads for), `ox`, `oy` (the lag left at `glideAt`), `glideAt`. `newCamera` sets them (no glide).
  - `easeOutCubic(t)`, `ZOOM_MS` 400, `GLIDE_MS` 500, `JUMP_PX` 4. `STEP_MS` and the private `SMOOTH_MS` are removed (nothing else uses them; check with a search).
  - `zoomAt(c, now)`: `from + (to - from) * easeOutCubic((now - at) / ZOOM_MS)`, exactly `to` once `ZOOM_MS` has passed (or `now` is not a number).
  - `follow(c, heX, v, now, dt, close, instant = false)`: the aim as ruling 2; a jump starts a glide `x = aim + ox * (1 - easeOutCubic((now - glideAt) / GLIDE_MS))`; `instant` (reduced motion) puts it at the aim.
  - `settling(...)`, `zoomTo(...)`, `easing(...)`, `toScreen(...)`, `baseZoom`, `groundAbove`: same signatures.

The easing, as code:
```ts
export const easeOutCubic = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
// zoom:  from + (to - from) * easeOutCubic((now - at) / 400)
// glide: aim + lag * (1 - easeOutCubic((now - glideAt) / 500)), restarted from where it is whenever the aim jumps > 4 px
```

- [ ] **Step 1: Write the failing tests.** (The two step tests become eased ones; the framing and dead-zone tests stay and must still pass.)
- [ ] **KT1** `lib/world/camera.test.ts`. Find:
```ts
import { baseZoom, BELOW_TILES, easing, follow, groundAbove, newCamera, settling, SKY_TILES, toScreen, zoomAt, zoomTo } from "./camera";
```
Replace with:
```ts
import {
	baseZoom, BELOW_TILES, easeOutCubic, easing, follow, GLIDE_MS, groundAbove, JUMP_PX, newCamera, settling, SKY_TILES, toScreen, ZOOM_MS, zoomAt, zoomTo,
} from "./camera";
```
- [ ] **KT2** `lib/world/camera.test.ts`. Find:
```ts
describe("coming in on him", () => {
	it("steps in two scale steps over 400 ms and eases back the same way", () => {
		let c = zoomTo(newCamera(512, V, 2), 4, 1000);
		expect([1000, 1199, 1200, 1399, 1400, 2000].map((t) => zoomAt(c, t))).toEqual([2, 2, 3, 3, 4, 4]);
		expect(easing(c, 1300)).toBe(true);
		expect(easing(c, 1400)).toBe(false);
		c = zoomTo(c, 2, 3000);
		expect([3000, 3200, 3400].map((t) => zoomAt(c, t))).toEqual([4, 3, 2]);
	});
	it("turns back from wherever it is if he turns away mid-zoom", () => {
		const c = zoomTo(zoomTo(newCamera(512, V, 2), 4, 0), 2, 250);
		expect(zoomAt(c, 250)).toBe(3);
		expect(zoomAt(c, 450)).toBe(2);
	});
```
Replace with:
```ts
describe("the easing (polish pass)", () => {
	it("is an ease-out cubic: 0 to 1, fast at first, settling softly, clamped outside", () => {
		expect([0, 0.5, 1].map(easeOutCubic)).toEqual([0, 0.875, 1]);
		expect(easeOutCubic(-1)).toBe(0);
		expect(easeOutCubic(2)).toBe(1);
		expect(easeOutCubic(0.25) - easeOutCubic(0)).toBeGreaterThan(easeOutCubic(1) - easeOutCubic(0.75));
	});
});

describe("coming in on him", () => {
	it("eases in over 400 ms on the curve, with no steps, and eases back the same way", () => {
		let c = zoomTo(newCamera(512, V, 2), 4, 1000);
		expect(ZOOM_MS).toBe(400);
		expect(zoomAt(c, 1000)).toBe(2);
		expect(zoomAt(c, 1200)).toBeCloseTo(2 + 2 * 0.875, 6);
		expect(zoomAt(c, 1400)).toBe(4);
		expect(zoomAt(c, 2000)).toBe(4);
		const seen = Array.from({ length: 13 }, (_, i) => zoomAt(c, 1000 + i * 33));
		for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]); // every frame moves: no steps
		expect(easing(c, 1300)).toBe(true);
		expect(easing(c, 1400)).toBe(false);
		c = zoomTo(c, 2, 3000);
		expect(zoomAt(c, 3200)).toBeCloseTo(4 - 2 * 0.875, 6);
		expect(zoomAt(c, 3400)).toBe(2);
	});
	it("turns back from wherever it is if he turns away mid-zoom", () => {
		const c = zoomTo(zoomTo(newCamera(512, V, 2), 4, 0), 2, 250);
		const mid = 2 + 2 * easeOutCubic(250 / 400);
		expect(zoomAt(c, 250)).toBeCloseTo(mid, 6);
		expect(zoomAt(c, 450)).toBeLessThan(mid);
		expect(zoomAt(c, 650)).toBe(2);
	});
	it("copes with a clock that is not a number", () => {
		expect(zoomAt(zoomTo(newCamera(512, V, 2), 4, 0), Number.NaN)).toBe(4);
	});
```
- [ ] **KT3** `lib/world/camera.test.ts`. Find:
```ts
	it("comes in from 1 to 2 to 3 on a desktop, a real step when he turns", () => {
		const v = { w: 1920, h: 1080 };
		const c = zoomTo(newCamera(START_X, v, baseZoom(v.w, v.h)), baseZoom(v.w, v.h) + 2, 0);
		expect([0, 200, 400].map((t) => zoomAt(c, t))).toEqual([1, 2, 3]);
	});
});
```
Replace with:
```ts
	it("comes in from 1 to 3 on a desktop when he turns, passing 2 on the way", () => {
		const v = { w: 1920, h: 1080 };
		const c = zoomTo(newCamera(START_X, v, baseZoom(v.w, v.h)), baseZoom(v.w, v.h) + 2, 0);
		expect(zoomAt(c, 0)).toBe(1);
		expect(zoomAt(c, 100)).toBeGreaterThan(2);
		expect(zoomAt(c, 400)).toBe(3);
	});
});

describe("gliding (polish pass)", () => {
	it("glides to him on the curve when he turns to Gur, instead of snapping", () => {
		let c = settle(newCamera(512, V, 2), 512);
		c = follow(c, 600, V, 10_000, 33, true); // he turned: the aim jumps 88 px to him
		expect(c.aimX).toBe(600);
		expect(c.x).toBeCloseTo(512, 6); // the first frame of the glide has not moved yet
		const at = (t: number) => follow(c, 600, V, 10_000 + t, 33, true).x;
		expect(at(GLIDE_MS / 2)).toBeCloseTo(600 - 88 * (1 - 0.875), 6);
		expect(at(GLIDE_MS)).toBe(600);
		expect(at(GLIDE_MS * 2)).toBe(600);
	});
	it("tracks him exactly at the edge of the dead zone while he walks: no lag, no glide", () => {
		expect(48 * 0.033).toBeLessThan(JUMP_PX);
		let c = settle(newCamera(512, V, 2), 584); // at the zone's edge: 512 + 72
		let x = 584;
		for (let t = 0; t < 1000; t += 33) {
			x += 48 * 0.033;
			c = follow(c, x, V, 20_000 + t, 33, false);
		}
		expect(c.x).toBeCloseTo(x - 72, 6);
		expect(c.ox).toBe(0);
	});
	it("starts a new glide from wherever it is when the aim jumps again mid-glide", () => {
		let c = settle(newCamera(512, V, 2), 512);
		c = follow(c, 600, V, 0, 33, true);
		c = follow(c, 600, V, 200, 33, true);
		const mid = c.x;
		c = follow(c, 512, V, 233, 33, false); // he turned back to work: the aim is the dead zone's edge, 512 + 72 = 584
		expect(c.aimX).toBe(584);
		expect(c.x).toBeCloseTo(mid, 6);
		expect(follow(c, 512, V, 233 + GLIDE_MS, 33, false).x).toBe(584);
	});
	it("jumps at once under reduced motion", () => {
		const c = follow(settle(newCamera(512, V, 2), 512), 600, V, 0, 33, true, true);
		expect(c.x).toBe(600);
	});
	it("counts the glide as settling until it is within half a pixel", () => {
		const c = follow(settle(newCamera(512, V, 2), 512), 600, V, 0, 33, true);
		expect(settling(c, 600, V, 0, true)).toBe(true);
		expect(settling(follow(c, 600, V, GLIDE_MS, 33, true), 600, V, GLIDE_MS, true)).toBe(false);
	});
});
```

- [ ] **Step 2: Run them and see them fail.**
Run: `npx vitest run lib/world/camera.test.ts`
Expected: FAIL: `easeOutCubic`, `GLIDE_MS`, `JUMP_PX`, `ZOOM_MS` are not exported; `zoomAt(c, 1200)` is 3, not about 3.75.

- [ ] **Step 3: Implement.**
- [ ] **K1** `lib/world/camera.ts`. Find:
```ts
// The camera (spec 2, as changed by the look pass): follows him with a dead zone, clamps at the world's left and right
// edges, tighter on a phone, and comes in on him in two whole-number scale steps when he turns to Gur. Up and down it
// is not clamped: above and below the world there is only sky. Pure; times in ms, positions in world px.
```
Replace with:
```ts
// The camera (spec 2, as changed by the look pass and the polish pass): follows him with a dead zone, clamps at the
// world's left and right edges, tighter on a phone, and comes in on him when he turns to Gur. Up and down it is not
// clamped: above and below the world there is only sky. Since the polish pass nothing moves in steps: the zoom runs
// on an ease-out cubic curve from wherever it is to the next whole scale, and when the place it heads for jumps (he
// turns to Gur or back, the zoom reframes) it glides there on the same curve. Pure; times in ms, positions in world px.
```
- [ ] **K2** `lib/world/camera.ts`. Find:
```ts
export type View = { w: number; h: number }; // canvas px
export type Camera = { x: number; y: number; from: number; to: number; at: number };
export const STEP_MS = 200;
export const ZOOM_IN = 2; // steps
```
Replace with:
```ts
export type View = { w: number; h: number }; // canvas px
// x, y: the centre drawn now. from, to, at: the zoom eases from `from` to the whole scale `to`, starting at `at`.
// aimX, aimY: where it heads for (the dead zone's own centre); ox, oy: how far the centre still lags behind that at
// glideAt, shrinking on the ease-out curve to nothing over GLIDE_MS.
export type Camera = { x: number; y: number; from: number; to: number; at: number; aimX: number; aimY: number; ox: number; oy: number; glideAt: number };
export const ZOOM_MS = 400; // spec 2's 400 ms, now one eased move instead of two steps
export const GLIDE_MS = 500;
export const JUMP_PX = 4; // the aim moving more than this in one frame is a jump to glide over (walking moves it 1.6 a frame)
export const ZOOM_IN = 2; // whole scales
```
- [ ] **K3** `lib/world/camera.ts`. Find:
```ts
const centreY = (vh: number) => GROUND_PX - groundAbove(vh) + vh / 2;
const finite = (dt: number) => (Number.isFinite(dt) && dt > 0 ? dt : 0);
export const isPhone = (v: View): boolean => v.w <= 640;
```
Replace with:
```ts
const centreY = (vh: number) => GROUND_PX - groundAbove(vh) + vh / 2;
export const isPhone = (v: View): boolean => v.w <= 640;
// The easing for every camera move: fast at first, settling softly. t is the share of the move's time, clamped.
export const easeOutCubic = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
```
- [ ] **K4** `lib/world/camera.ts`. Find:
```ts
export function newCamera(heX: number, v: View, zoom: number): Camera {
	const vw = v.w / zoom;
	const vh = v.h / zoom;
	return { x: clampAxis(heX, vw, WORLD_W * TILE), y: centreY(vh), from: zoom, to: zoom, at: 0 };
}

export function zoomAt(c: Camera, now: number): number {
	if (c.from === c.to) return c.to;
	const steps = Math.min(Math.abs(c.to - c.from), Math.floor(Math.max(0, now - c.at) / STEP_MS));
	return c.from + Math.sign(c.to - c.from) * steps;
}
export const easing = (c: Camera, now: number): boolean => zoomAt(c, now) !== c.to;
// Head for a zoom level from wherever it is now; reduced motion jumps.
export function zoomTo(c: Camera, level: number, now: number, instant = false): Camera {
	if (level === c.to) return c;
	return instant ? { ...c, from: level, to: level, at: now } : { ...c, from: zoomAt(c, now), to: level, at: now };
}

// Where the camera is heading (centre, world px): he stays at the edge of the dead zone, or is centred when close.
function aim(c: Camera, heX: number, v: View, now: number, close: boolean) {
	const z = zoomAt(c, now);
	const vw = v.w / z;
	const vh = v.h / z;
	const half = (isPhone(v) ? DEAD.phone : DEAD.desk) * vw;
	let tx = c.x;
	if (close) tx = heX;
	else if (heX > c.x + half) tx = heX - half;
	else if (heX < c.x - half) tx = heX + half;
	const ty = close ? GROUND_PX - HEAD_PX : centreY(vh);
	return { z, vw, vh, tx, ty };
}

// One step of following. close: he faces Gur, so the camera centres on him instead of using the dead zone.
export function follow(c: Camera, heX: number, v: View, now: number, dt: number, close: boolean): Camera {
	const { vw, tx, ty } = aim(c, heX, v, now, close);
	const k = 1 - Math.exp(-finite(dt) / SMOOTH_MS);
	return { ...c, x: clampAxis(c.x + (tx - c.x) * k, vw, WORLD_W * TILE), y: c.y + (ty - c.y) * k };
}
// True while the follow smoothing has more than half a screen pixel to go, so the loop keeps its frame pace for it.
export function settling(c: Camera, heX: number, v: View, now: number, close: boolean): boolean {
	const { z, vw, tx, ty } = aim(c, heX, v, now, close);
	return Math.abs(clampAxis(tx, vw, WORLD_W * TILE) - c.x) * z > 0.5 || Math.abs(ty - c.y) * z > 0.5;
}
```
Replace with:
```ts
export function newCamera(heX: number, v: View, zoom: number): Camera {
	const vw = v.w / zoom;
	const vh = v.h / zoom;
	const x = clampAxis(heX, vw, WORLD_W * TILE);
	const y = centreY(vh);
	return { x, y, from: zoom, to: zoom, at: 0, aimX: x, aimY: y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY };
}

// The zoom now: between two whole scales while it eases (the renderer draws those frames from the larger scale's
// atlas), exactly `to` once ZOOM_MS has passed.
export function zoomAt(c: Camera, now: number): number {
	if (c.from === c.to) return c.to;
	const t = (now - c.at) / ZOOM_MS;
	if (!(t < 1)) return c.to; // also when now is NaN
	return c.from + (c.to - c.from) * easeOutCubic(t);
}
export const easing = (c: Camera, now: number): boolean => zoomAt(c, now) !== c.to;
// Head for a zoom level from wherever it is now; reduced motion jumps.
export function zoomTo(c: Camera, level: number, now: number, instant = false): Camera {
	if (level === c.to) return c;
	return instant ? { ...c, from: level, to: level, at: now } : { ...c, from: zoomAt(c, now), to: level, at: now };
}

// Where the camera heads for (centre, world px): he stays at the edge of the dead zone, or is centred when close. The
// dead zone is measured from the aim, not from the gliding centre, so a glide never drags the zone along with it.
function aim(c: Camera, heX: number, v: View, now: number, close: boolean) {
	const z = zoomAt(c, now);
	const vw = v.w / z;
	const vh = v.h / z;
	const half = (isPhone(v) ? DEAD.phone : DEAD.desk) * vw;
	let tx = c.aimX;
	if (close) tx = heX;
	else if (heX > c.aimX + half) tx = heX - half;
	else if (heX < c.aimX - half) tx = heX + half;
	const ty = close ? GROUND_PX - HEAD_PX : centreY(vh);
	return { z, vw, tx: clampAxis(tx, vw, WORLD_W * TILE), ty };
}
// How much of the lag is left at `now` (1 at the start of a glide, 0 once it is over).
const lagLeft = (c: Camera, now: number) => 1 - easeOutCubic((now - c.glideAt) / GLIDE_MS);

// One step of following. close: he faces Gur, so the camera centres on him instead of using the dead zone. The aim
// follows him exactly (at the dead zone's edge it moves at his walking pace); when it jumps the centre glides after it
// on the ease-out curve, from wherever it is, over GLIDE_MS. instant (reduced motion): no glide, it is there at once.
// A dt that is not a positive number means no time has passed: nothing moves.
export function follow(c: Camera, heX: number, v: View, now: number, dt: number, close: boolean, instant = false): Camera {
	if (!(Number.isFinite(dt) && dt > 0)) return c;
	const { vw, tx, ty } = aim(c, heX, v, now, close);
	const jumped = Math.abs(tx - c.aimX) > JUMP_PX || Math.abs(ty - c.aimY) > JUMP_PX;
	let { ox, oy, glideAt } = c;
	if (instant) {
		ox = 0;
		oy = 0;
	} else if (jumped) {
		ox = c.x - tx;
		oy = c.y - ty;
		glideAt = now;
	}
	const k = instant ? 0 : lagLeft({ ...c, glideAt }, now);
	return { ...c, aimX: tx, aimY: ty, ox, oy, glideAt, x: clampAxis(tx + ox * k, vw, WORLD_W * TILE), y: ty + oy * k };
}
// True while the centre is more than half a screen pixel from where it heads for, so the loop keeps its frame pace.
export function settling(c: Camera, heX: number, v: View, now: number, close: boolean): boolean {
	const { z, tx, ty } = aim(c, heX, v, now, close);
	return Math.abs(tx - c.x) * z > 0.5 || Math.abs(ty - c.y) * z > 0.5;
}
```
- [ ] **K5** `lib/world/camera.ts`. Find:
```ts
const DEAD = { desk: 0.15, phone: 0.06 }; // dead zone half-width, as a share of the visible width
const SMOOTH_MS = 120;
const GROUND_PX = GROUND_Y * TILE;
```
Replace with:
```ts
const DEAD = { desk: 0.15, phone: 0.06 }; // dead zone half-width, as a share of the visible width
const GROUND_PX = GROUND_Y * TILE;
```
And pass reduced motion to the follow in the loop:
- [ ] **K6** `components/osmo/world.tsx`. Find:
```tsx
		camera = follow(camera, actor.x, view, now, dt, close);
```
Replace with:
```tsx
		camera = follow(camera, actor.x, view, now, dt, close, reduced);
```

- [ ] **Step 4: Run the checks.**
Run: `npx vitest run lib/world`, then `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`.
Expected: all pass, including `rooms.test.ts` (it spreads a camera) and the world-40 hash (unchanged: that scene is at a whole zoom).

- [ ] **Step 5: Commit.**
```bash
git add lib/world/camera.ts lib/world/camera.test.ts components/osmo/world.tsx
git commit -m "feat(world): the camera eases its zoom and glides after him on an ease-out curve, no steps" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---
### Task 7: Tile art: darker grout, six variants, the lit bookcase and dome
**Model:** Opus (judged by eye). **Waits for:** Task 1 (the letter `0`).
**Files:** Modify `lib/world/tiles.ts`, `lib/world/tiles.test.ts`, and the one hash line of `lib/world/render.test.ts`.

**Interfaces:**
- Consumes: the helpers already in `tiles.ts` (`make`, `over`, `noise`, `ramp`, `checker`, `darker`, `masonry`, `rock`, `snowCap`, `brickAt`, `shelfWindow`, `domeGlass`, `domeEdge`, the `SHELF_WINDOW` grid); `PALETTE` with the digit letters (Task 1).
- Produces (Task 9 draws them by name):
  - `TILE_IDS` with ten ids appended after `"dome-r"`, in this order: `"brick-2"`, `"brick-3"`, `"stone-2"`, `"stone-3"`, `"snow-2"`, `"snow-3"`, `"shelf-window-lit"`, `"dome-l-lit"`, `"dome-lit"`, `"dome-r-lit"` (cells 61 to 70; the 61 before keep theirs).
  - The brick's joint is `"0"`.

**What to draw.** Only tile letters, never Osmo's `H` to `Q` or the scarf `Z` (the test says so). Light from the top left as everywhere. Each variant is a full 16 by 16 grid; `keepRing` keeps the base's outermost ring, so draw freely inside it and make what crosses the ring (a brick, a stone, the snow's depth) continue the base's.

| # | id | What it shows |
|---|---|---|
| 61 | `brick-2` | Weathered: the same bond and joints as `brick`; two or three bricks re-shaded (one warmer, one darker), one with a chipped top-left corner, a hairline crack in another place than the base's, and moss (`C`, `D`) in one bed joint, two to four pixels. |
| 62 | `brick-3` | Mended: the same bond; one brick replaced by a newer, lighter stone (`d`, `e` face, `R` shadow), a small dark drain hole or pit in another, and a faint soot streak running down from a joint. Different from `brick-2` at a glance. |
| 63 | `stone-2` | The island's rock with other stones bedded in it (move and resize them; keep the base's seed 3 and ramp for the mottling, so it stays the same material: the test allows at most 150 changed pixels inside the ring), a short quartz vein of light pixels (`e`, `d`), a crack with its lit lower lip. |
| 64 | `stone-3` | The same rock (the same seed and ramp) with one larger stone, a shell-like fossil of a few pixels, and fewer cracks. |
| 65 | `snow-2` | A drift: the cap deeper in the middle columns, a second sparkle cluster, one icicle at a different column. Rows 0 to 3 only `n`, `o`, `p` (the render test checks the snow under his feet). |
| 66 | `snow-3` | A tuft of grass (`C`, `D`, `E`) poking through the cap near one side, and a shallow dent with a blue shadow (`Y`, `n`) beside it. Rows 0 to 3 only `n`, `o`, `p` (the grass starts below row 3). |
| 67 | `shelf-window-lit` | The bookcase window at night, lit from inside: the same stone frame, arch and sill as `shelf-window` (unchanged pixels), the gaps between and behind the books warm lamp light (`t`, `u`, `v`), the books darker silhouettes against it (their own colours stepped down, or `j`, `k`, `l`), the glint gone. At least 21 lamp pixels. |
| 68 | `dome-l-lit` | `dome-l` lit: the same transparent pixels and the same rim (`e`, `d`, `a`), the panes below the rim warm (`u` body, `t` along each pane's top and left, a `v` spark or two). At least 31 lamp pixels. |
| 69 | `dome-lit` | `dome` lit the same way: the cames (`a`, `b`) unchanged, the panes warm, the top-left pane brightest, seamless both ways. At least 31 lamp pixels. |
| 70 | `dome-r-lit` | `dome-r` lit: the same outline and rim (`d`, `b`, `a`), the panes a dimmer warm (more `u`, little `t`, no `v`): the shadow side. At least 31 lamp pixels. |

- [ ] **Step 1: Write the failing tests.**
- [ ] **GT1** `lib/world/tiles.test.ts`. Find:
```ts
// Appended for the rooms (village phase 2), after the 55, so every earlier cell keeps its place.
const ROOMS = ["tower-cap", "shelf-window", "forge", "dome-l", "dome", "dome-r"];
// Tiles with no transparent pixel.
const FILLED: TileId[] = [
	"snow", "stone", "stone-dark", "brick", "brick-dark", "plank", "beam-h", "glass", "window", "window-top",
	"door", "door-top", "roof-flat", "step", "pillar", "shelf-window", "forge", "dome",
];
// Tiles whose whole surface must read as lit from the top left.
const LIT: TileId[] = ["snow", "stone", "stone-dark", "brick", "brick-dark", "plank", "beam-h", "roof-flat", "step", "pillar"];
```
Replace with:
```ts
// Appended for the rooms (village phase 2), after the 55, so every earlier cell keeps its place.
const ROOMS = ["tower-cap", "shelf-window", "forge", "dome-l", "dome", "dome-r"];
// Appended in the polish pass, after the 61.
const POLISH = [
	"brick-2", "brick-3", "stone-2", "stone-3", "snow-2", "snow-3", "shelf-window-lit", "dome-l-lit", "dome-lit", "dome-r-lit",
];
// Tiles with no transparent pixel.
const FILLED: TileId[] = [
	"snow", "stone", "stone-dark", "brick", "brick-dark", "plank", "beam-h", "glass", "window", "window-top",
	"door", "door-top", "roof-flat", "step", "pillar", "shelf-window", "forge", "dome",
	"brick-2", "brick-3", "stone-2", "stone-3", "snow-2", "snow-3", "shelf-window-lit", "dome-lit",
];
// Tiles whose whole surface must read as lit from the top left.
const LIT: TileId[] = [
	"snow", "stone", "stone-dark", "brick", "brick-dark", "plank", "beam-h", "roof-flat", "step", "pillar",
	"brick-2", "brick-3", "stone-2", "stone-3", "snow-2", "snow-3",
];
```
- [ ] **GT2** `lib/world/tiles.test.ts`. Find:
```ts
	it("are the 38 tiles in the fixed cell order, then the look pass's, then the rooms', appended", () => {
		expect([...TILE_IDS]).toEqual([...ORDER, ...ADDED, ...ROOMS]);
		expect(Object.keys(TILES).sort()).toEqual([...ORDER, ...ADDED, ...ROOMS].sort());
		expect(tileIndex("fence")).toBe(54);
		expect(tileIndex("tower-cap")).toBe(55);
		expect(tileIndex("dome-r")).toBe(60);
```
Replace with:
```ts
	it("are the 38 tiles in the fixed cell order, then the look pass's, the rooms' and the polish pass's, appended", () => {
		expect([...TILE_IDS]).toEqual([...ORDER, ...ADDED, ...ROOMS, ...POLISH]);
		expect(Object.keys(TILES).sort()).toEqual([...ORDER, ...ADDED, ...ROOMS, ...POLISH].sort());
		expect(tileIndex("fence")).toBe(54);
		expect(tileIndex("tower-cap")).toBe(55);
		expect(tileIndex("dome-r")).toBe(60);
		expect(tileIndex("brick-2")).toBe(61);
		expect(tileIndex("dome-r-lit")).toBe(70);
```
- [ ] **GT3** `lib/world/tiles.test.ts`. Find:
```ts
	it("keeps the worked example exactly", () => {
```
Replace with:
```ts
	it("lays brick in grout darker than the stone's outline (polish pass)", () => {
		expect(lum("0") ?? 255).toBeLessThan(lum("a") ?? 0);
		const grout = TILES.brick.join("").split("0").length - 1;
		expect(grout).toBeGreaterThan(40); // every joint of the bond
		expect(TILES.brick.join("")).not.toContain("a");
		expect(TILES.brick[15]).toBe("0".repeat(16)); // the bed joint under the last course
	});
	it.each([
		["brick", "brick-2"], ["brick", "brick-3"], ["stone", "stone-2"], ["stone", "stone-3"], ["snow", "snow-2"], ["snow", "snow-3"],
	] as const)("%s's variant %s joins its neighbours as %s does, and is its own inside (polish pass)", (base, variant) => {
		const b = TILES[base];
		const v = TILES[variant];
		expect(v[0]).toBe(b[0]);
		expect(v[15]).toBe(b[15]);
		for (let y = 0; y < 16; y++) {
			expect(v[y][0], `${variant} ${y}`).toBe(b[y][0]);
			expect(v[y][15], `${variant} ${y}`).toBe(b[y][15]);
		}
		let differ = 0;
		for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if (v[y][x] !== b[y][x]) differ++;
		expect(differ).toBeGreaterThanOrEqual(12);
		expect(differ).toBeLessThanOrEqual(150); // still the same material
	});
	it("tells the two variants of each apart (polish pass)", () => {
		expect(TILES["brick-2"]).not.toEqual(TILES["brick-3"]);
		expect(TILES["stone-2"]).not.toEqual(TILES["stone-3"]);
		expect(TILES["snow-2"]).not.toEqual(TILES["snow-3"]);
	});
	it("lights the bookcase window and the dome at night in the same frame as by day (polish pass)", () => {
		for (const [day, night] of [["shelf-window", "shelf-window-lit"], ["dome-l", "dome-l-lit"], ["dome", "dome-lit"], ["dome-r", "dome-r-lit"]] as const) {
			const d = TILES[day];
			const n = TILES[night];
			let same = 0;
			for (let y = 0; y < 16; y++) {
				for (let x = 0; x < 16; x++) {
					if (d[y][x] === n[y][x]) same++;
					expect(n[y][x] === ".", `${night} ${x},${y}`).toBe(d[y][x] === "."); // the same outline against the sky
				}
			}
			expect(same, night).toBeGreaterThan(day === "dome" ? 40 : 96); // the frame, the cames, the rim are unchanged
			expect(n.join(""), night).toMatch(/[tuv]/); // lamp light behind the glass
			expect(n.join("").replace(/[^tuv]/g, "").length, night).toBeGreaterThan(day === "shelf-window" ? 20 : 30);
		}
	});
	it("keeps the worked example exactly", () => {
```

- [ ] **Step 2: Run them and see them fail.**
Run: `npx vitest run lib/world/tiles.test.ts`
Expected: FAIL: the cell order has 61 ids, not 71; the grout test finds `a`, not `0`; `TILES["brick-2"]` is undefined.

- [ ] **Step 3: The ids, the grout, and the scaffold.**
- [ ] **G1** `lib/world/tiles.ts`. Find:
```ts
	// Appended for the rooms (village phase 2); the 55 above keep their cells.
	"tower-cap", "shelf-window", "forge", "dome-l", "dome", "dome-r",
] as const;
```
Replace with:
```ts
	// Appended for the rooms (village phase 2); the 55 above keep their cells.
	"tower-cap", "shelf-window", "forge", "dome-l", "dome", "dome-r",
	// Appended in the polish pass; the 61 above keep their cells. Two variants each of brick, the island's stone and
	// snow (the renderer chooses per cell, texture.ts), and the bookcase window and the dome lit for the night.
	"brick-2", "brick-3", "stone-2", "stone-3", "snow-2", "snow-3", "shelf-window-lit", "dome-l-lit", "dome-lit", "dome-r-lit",
] as const;
```
- [ ] **G2** `lib/world/tiles.ts`. Find:
```ts
	joint: "a", steps: "bcRde", seed: 7, pits: 0.08, flat: true, warm: new Set(["C", "G", "K"]), warmSteps: "bSSTe",
```
Replace with:
```ts
	joint: "0", steps: "bcRde", seed: 7, pits: 0.08, flat: true, warm: new Set(["C", "G", "K"]), warmSteps: "bSSTe",
```
- [ ] **G3** `lib/world/tiles.ts`. Find:
```ts
	"dome-l": make((x, y) => domeEdge(x, y, "l")),
	dome: make((x, y) => domeGlass(x, y, 0)),
	"dome-r": make((x, y) => domeEdge(x, y, "r")),
};
```
Replace with:
```ts
	"dome-l": make((x, y) => domeEdge(x, y, "l")),
	dome: make((x, y) => domeGlass(x, y, 0)),
	"dome-r": make((x, y) => domeEdge(x, y, "r")),
	"brick-2": keepRing(brick, brick2),
	"brick-3": keepRing(brick, brick3),
	"stone-2": keepRing(stone, stone2),
	"stone-3": keepRing(stone, stone3),
	"snow-2": keepRing(snowBase, snow2),
	"snow-3": keepRing(snowBase, snow3),
	"shelf-window-lit": make(shelfWindowLit),
	"dome-l-lit": make((x, y) => domeEdgeLit(x, y, "l")),
	"dome-lit": make((x, y) => domeGlassLit(x, y, 0)),
	"dome-r-lit": make((x, y) => domeEdgeLit(x, y, "r")),
};
```
- [ ] **G4** `lib/world/tiles.ts`. Find:
```ts
export const TILES: Readonly<Record<TileId, Grid>> = {
	snow: make((x, y) => snowCap(x, y)),
```
Replace with:
```ts
// --- Added in the polish pass. A variant keeps its base's outermost ring of pixels exactly, so it joins any neighbour
// (the base, the other variant, an edge tile) the way the base does; everything inside the ring is its own. ---
const keepRing = (base: Grid, inner: Grid): Grid =>
	base.map((row, y) => (y === 0 || y === N - 1 ? row : row[0] + inner[y].slice(1, N - 1) + row[N - 1]));
const snowBase = make((x, y) => snowCap(x, y));
// The drawings of the polish pass go here: brick2, brick3, stone2, stone3, snow2, snow3 (each a full 16 by 16 grid;
// keepRing keeps only its inside), shelfWindowLit, domeGlassLit and domeEdgeLit.

export const TILES: Readonly<Record<TileId, Grid>> = {
	snow: snowBase,
```
Then replace the comment line `// The drawings of the polish pass go here: ...` (two lines) with your ten definitions, in this shape: `const brick2: Grid = [ /* 16 strings of 16 letters */ ];` (or built with `over(brick, PATCH)`, `make(...)` or `rock({...})` as the art pass did), the same for `brick3`, `stone2`, `stone3`, `snow2`, `snow3`; and three functions `shelfWindowLit(x, y): string`, `domeGlassLit(x, y, shade): string` and `domeEdgeLit(x, y, side): string` that follow `shelfWindow`, `domeGlass` and `domeEdge` and change only the glass.

- [ ] **Step 4: Look at it.** Create `lib/world/zz-tiles.test.ts` (never committed), run it as "The previews" says, and also run `tiles.test.ts` with `WORLD_SNAPSHOT_DIR` set for the contact sheet `tiles.png`. In `brick-wall-3x.png` and `island-top-3x.png` no seam may show where a variant meets anything, and no variant may stand out as a pattern; at night the bookcase must read as books against lamplight and the dome as a lit glass lantern. Iterate.
```ts
// Scratch preview for Task 6 (tiles): NEVER commit this file. Run with
//   WORLD_SNAPSHOT_DIR=<your scratchpad>/tiles npx vitest run lib/world/zz-tiles.test.ts
// (make the folder first) and look at every PNG it writes.
import { it } from "vitest";
import { snapshot } from "./png";
import { colours, rasterize, type Grid } from "./raster";
import { TILES, type TileId } from "./tiles";

const day = colours();
const night = colours({}, 1);
// Tiles laid in a grid of cells (rows of ids), as one picture.
function wall(rows: readonly (readonly TileId[])[]): Grid {
	return rows.flatMap((row) => Array.from({ length: 16 }, (_, y) => row.map((id) => TILES[id][y]).join("")));
}
// A scattered pick between a base and its two variants, as the renderer's hash will (about one in six each).
const pick = (base: TileId, a: TileId, b: TileId, x: number, y: number): TileId => {
	const h = (x * 7 + y * 13 + ((x * y) % 5)) % 6;
	return h === 0 ? a : h === 3 ? b : base;
};

it("previews the polish pass's tiles", () => {
	// 1. Each base beside its variants and each lit tile beside its day tile, at 8x.
	const sheet: TileId[] = [
		"brick", "brick-2", "brick-3", "stone", "stone-2", "stone-3", "snow", "snow-2", "snow-3",
		"shelf-window", "shelf-window-lit", "dome-l", "dome-l-lit", "dome", "dome-lit", "dome-r", "dome-r-lit",
	];
	snapshot("sheet-8x", rasterize(sheet.map((id) => TILES[id]), 16, 16, 8, day));
	// 2. A wall of 12 by 6 cells, the variants scattered: no seam may show where a variant meets anything. At 3x, by
	// day and by night.
	const brickWall = Array.from({ length: 6 }, (_, y) => Array.from({ length: 12 }, (_, x) => pick("brick", "brick-2", "brick-3", x, y)));
	snapshot("brick-wall-3x", rasterize([wall(brickWall)], 192, 96, 3, day));
	snapshot("brick-wall-night-3x", rasterize([wall(brickWall)], 192, 96, 3, night));
	// 3. The island's top: a row of 20 snow over two rows of stone, scattered the same way, at 3x.
	const top = [
		Array.from({ length: 20 }, (_, x) => pick("snow", "snow-2", "snow-3", x, 0)),
		Array.from({ length: 20 }, (_, x) => pick("stone", "stone-2", "stone-3", x, 1)),
		Array.from({ length: 20 }, (_, x) => pick("stone", "stone-2", "stone-3", x, 2)),
	];
	snapshot("island-top-3x", rasterize([wall(top)], 320, 48, 3, day));
	// 4. The library's bookcase window, two stacked in brick, and the observatory's dome (a cap row and a body row), by
	// day and lit at night, at 6x.
	const library = (lit: boolean): TileId[][] => {
		const w: TileId = lit ? "shelf-window-lit" : "shelf-window";
		return [["brick", w, "brick"], ["brick", w, "brick"]];
	};
	const dome = (lit: boolean): TileId[][] => {
		const s = lit ? "-lit" : "";
		return [
			[`dome-l${s}` as TileId, `dome${s}` as TileId, `dome${s}` as TileId, `dome-r${s}` as TileId],
			[`dome${s}` as TileId, `dome${s}` as TileId, `dome${s}` as TileId, `dome${s}` as TileId],
		];
	};
	snapshot("library-day-6x", rasterize([wall(library(false))], 48, 32, 6, day));
	snapshot("library-night-6x", rasterize([wall(library(true))], 48, 32, 6, night));
	snapshot("dome-day-6x", rasterize([wall(dome(false))], 64, 32, 6, day));
	snapshot("dome-night-6x", rasterize([wall(dome(true))], 64, 32, 6, night));
});
```

- [ ] **Step 5: Re-pin the hash, after looking.** The grout changes the hashed scene. Run `WORLD_SNAPSHOT_DIR=<folder> npx vitest run lib/world/render.test.ts`, look at `world-40.png` (the hall at 40 blocks: the new grout in the walls, nothing else changed), then `npx vitest run lib/world/render.test.ts -u` and check that `git diff lib/world/render.test.ts` shows only the one hash line. Say the old and new hash and what changed in your report.

- [ ] **Step 6: Run the checks.**
Run: `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`.
Expected: all pass.

- [ ] **Step 7: Commit.** Delete `lib/world/zz-tiles.test.ts` first.
```bash
git add lib/world/tiles.ts lib/world/tiles.test.ts lib/world/render.test.ts
git commit -m "art(world): darker grout, two variants each of brick, stone and snow, the bookcase and dome lit at night" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Report: the preview folder and the PNGs to show Gur (`sheet-8x.png`, `brick-wall-3x.png`, `island-top-3x.png`, `library-night-6x.png`, `dome-night-6x.png`).


---
### Task 8: Him: the detail pass, the hammer, the walk, eyes, blinks, the scarf's trail
**Model:** Opus (judged by eye). **Waits for:** Tasks 1 (the digit letters) and 7 (it re-pins the hash line this task re-pins again).
**Files:** Modify `lib/world/osmo-sprite.ts`, `lib/world/osmo-sprite.test.ts`, and two lines of `lib/world/render.test.ts` (the faces atlas width and the hash).

**Interfaces:**
- Consumes: the part builders in `osmo-sprite.ts` (`paint`, `paints`, the heads, torsos, arms, tails, legs); `PALETTE` with `"1"` to `"4"` (Task 1).
- Produces (Task 10 draws them):
  - `FRAMES`: the same 18 names, 16 by 32 each, in `FRAME_NAMES` order (unchanged); letters `H I J K L M N O P Q Z 0 2 3 4 a b c d e k l m` and `.` (the test's rule).
  - `FACES` (same three ids, 8 by 4): two-row eyes, the glint `1` directly over the pupil `P`; `withGaze` moves both (code below).
  - `BLINKS: Record<FaceId, Grid>` (8 by 4, no `P`, `1` or `N`); `blinkCell(face)` = 9, 10, 11; `FACE_CELLS` = the nine gaze cells then the three blinks.
  - `TRAIL_W` 8, `TRAIL_H` 6, `TRAIL_AT = { x: -6, y: 12 }` (the cell's top-left from the sprite's top-left, facing right), `TRAIL_CELLS` (two cells, `H`, `Z` and `.` only).

**What to draw.** Spec 3's size and frames stay; this is a detail pass, light from the top left as in `palette.ts`.

| Frames | What changes |
|---|---|
| All 18 | **Trousers** in `2` (base) and `3` (the shadow side and the far leg), so the legs read against his outline `H`; boots stay `Q`. **The coat's lit edge** in `4` along the top of the shoulders and the leading edge toward the light (one pixel wide; the coat stays `K`, `L`, `M`). At least six trouser pixels in rows 25 to 30 of every standing and walking frame and of `turn-1`. |
| `idle-1`, `idle-2`; `face-1`, `face-2` | `idle-1`/`face-1` breathing out; `idle-2`/`face-2` breathing in: the chest and shoulders a pixel up, the head (rows 0 to 10) and the feet (rows 27 to 31) unchanged. (Shown 700 ms in every 3.2 s.) |
| `walk-1` to `walk-6` | A cleaner cycle of six at 100 ms each: `walk-1` contact (near leg forward, far leg back, both feet down), `walk-2` down (the body a row lower, knees bent), `walk-3` passing (the legs together under him, the body back up), `walk-4` contact with the other leg forward, `walk-5` down, `walk-6` passing. The near arm swings against the near leg. The scarf's tail in the frame becomes a short root (columns 0 to 2, rows 12 to 14) that the trail cells continue. |
| `build-1` to `build-4` | Kneeling, a **hammer**: handle in wood (`k`, `l`), head `c` with a `b` shadow and an `a` outline. `build-1` the hammer raised over his head (the head's pixels above row 14), `build-2` swinging down past his shoulder, `build-3` striking the stone at his toes (the head's pixels below row 24, on the stone `e d a` at columns 13 to 15, rows 29 to 31), `build-4` the rebound, a little up. 300 ms each. |
| `turn-1` to `turn-3`, `sit-1` | The trousers and the coat's edge as above; `turn-3`'s face box (columns 4 to 11, rows 7 to 10) stays plain skin `I` for the face patch. |
| `FACES` | Two-tone eyes: each eye three wide in its socket (columns 0 to 2 and 5 to 7), two rows: the glint `1` over the pupil `P` in the middle column, whites `N` either side. `warm`: eyes in rows 0 and 1, a soft smile below; `attentive`: brows `H` in row 0, eyes rows 1 and 2, a small mouth in row 3; `tired`: heavy lids `H` in row 0, eyes rows 1 and 2, a flat mouth in row 3. `.` keeps the skin under it; `J` for a cheek shadow if it helps. |
| `BLINKS` | The same faces with the eyes shut: the lids a line of `H` (or `J` and `H`) where the eyes were, the brows and mouth as in the face. |
| `TRAIL_CELLS` | The end of the scarf streaming back from his neck, 8 by 6, in `Z` with an `H` outline, its right edge meeting the root of the tail drawn in the walk frames. Cell 0 the end lifted, cell 1 the end dipped with a flick, so the two swapping every 160 ms read as cloth in the wind. |

- [ ] **Step 1: Write the failing tests.**
- [ ] **HT1** `lib/world/osmo-sprite.test.ts`. Find:
```ts
import {
	FACE_AT, FACE_CELLS, FACE_H, FACE_IDS, FACE_W, FACES, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex, withGaze,
} from "./osmo-sprite";
```
Replace with:
```ts
import {
	BLINKS, blinkCell, FACE_AT, FACE_CELLS, FACE_H, FACE_IDS, FACE_W, FACES, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex,
	TRAIL_AT, TRAIL_CELLS, TRAIL_H, TRAIL_W, withGaze,
} from "./osmo-sprite";
```
- [ ] **HT2** `lib/world/osmo-sprite.test.ts`. Find:
```ts
		expect(f.join("")).toMatch(/^[HIJKLMNOPQZade.]+$/);
```
Replace with:
```ts
		expect(f.join("")).toMatch(/^[HIJKLMNOPQZ0234abcdeklm.]+$/);
```
- [ ] **HT3** `lib/world/osmo-sprite.test.ts`. Find:
```ts
	it("writes a contact sheet when WORLD_SNAPSHOT_DIR is set", () => {
		const bmp = rasterize(FRAME_NAMES.map((n) => FRAMES[n]), FRAME_W, FRAME_H, 6, colours({ Z: "hsl(172 38% 50%)" }));
		snapshot("osmo-frames", bmp);
		expect(bmp.w).toBe(18 * 96);
	});
});
```
Replace with:
```ts
	it("writes a contact sheet when WORLD_SNAPSHOT_DIR is set", () => {
		const bmp = rasterize(FRAME_NAMES.map((n) => FRAMES[n]), FRAME_W, FRAME_H, 6, colours({ Z: "hsl(172 38% 50%)" }));
		snapshot("osmo-frames", bmp);
		expect(bmp.w).toBe(18 * 96);
	});
});

// The polish pass's detail pass on him (spec 3's 16 by 32 and 18 frames unchanged).
const legRows = (name: (typeof FRAME_NAMES)[number]) => FRAMES[name].slice(25, 31).join("");
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
describe("his detail pass (polish pass)", () => {
	it("wears trousers a tone apart from his outline, so his legs read, in every standing and walking frame", () => {
		for (const name of ["idle-1", "idle-2", "walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6", "turn-1"] as const) {
			expect(count(legRows(name), /[23]/g), name).toBeGreaterThanOrEqual(6);
		}
		const lum = (hex: string) => {
			const n = parseInt(hex.slice(1), 16);
			return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
		};
		const c = colours();
		const l = (ch: string) => lum(`#${[0, 1, 2].map((i) => c[ch][i].toString(16).padStart(2, "0")).join("")}`);
		expect(l("3") - l("H")).toBeGreaterThan(20);
		expect(l("2") - l("M")).toBeGreaterThan(30);
	});
	it("lights the edge of his coat", () => {
		for (const name of ["idle-1", "walk-1", "build-1", "face-1"] as const) expect(FRAMES[name].join(""), name).toContain("4");
	});
	it("breathes with his chest only: the head and the feet stay, standing and facing", () => {
		for (const [out, inn] of [["idle-1", "idle-2"], ["face-1", "face-2"]] as const) {
			expect(FRAMES[inn].slice(0, 11), inn).toEqual(FRAMES[out].slice(0, 11));
			expect(FRAMES[inn].slice(27), inn).toEqual(FRAMES[out].slice(27));
			expect(FRAMES[inn], inn).not.toEqual(FRAMES[out]);
		}
	});
	it("bobs as he walks: the down frames sit a row lower than the contact frames", () => {
		const top = (name: (typeof FRAME_NAMES)[number]) => FRAMES[name].findIndex((r) => r.replace(/\./g, "") !== "");
		expect(top("walk-2")).toBe(top("walk-1") + 1);
		expect(top("walk-5")).toBe(top("walk-4") + 1);
	});
	it("swings a hammer as he builds: raised over his head, then down on the stone at his toes", () => {
		const head = (name: (typeof FRAME_NAMES)[number]) => {
			const rows = FRAMES[name].map((r, y) => [y, [...r].filter((ch) => ch === "c").length] as const).filter(([, n]) => n > 0);
			return rows.length === 0 ? -1 : rows.reduce((a, [y, n]) => a + y * n, 0) / rows.reduce((a, [, n]) => a + n, 0);
		};
		for (const name of ["build-1", "build-2", "build-3", "build-4"] as const) {
			expect(FRAMES[name].join(""), name).toMatch(/[kl]/); // the handle
			expect(head(name), name).toBeGreaterThan(-1); // the head
		}
		expect(head("build-1")).toBeLessThan(14);
		expect(head("build-3")).toBeGreaterThan(24);
	});
});

describe("his eyes, blinks and scarf (polish pass)", () => {
	it("are two rows each: a glint over the pupil, both moved by his gaze", () => {
		for (const id of FACE_IDS) {
			expect(FACES[id].join("")).toMatch(/^[HIJNP1.]+$/);
			expect(count(FACES[id].join(""), /1/g)).toBe(2);
			FACES[id].forEach((row, y) => {
				[...row].forEach((ch, x) => {
					if (ch === "1") expect(FACES[id][y + 1]?.[x], `${id} ${x},${y}`).toBe("P");
				});
			});
		}
		expect(withGaze(["N1N..N1N", "NPN..NPN"], 1)).toEqual(["NN1..NN1", "NNP..NNP"]);
		expect(withGaze(["N1N..N1N", "NPN..NPN"], -1)).toEqual(["1NN..1NN", "PNN..PNN"]);
	});
	it("shut for a blink: one patch per face, no pupil, after the nine face cells", () => {
		expect(FACE_CELLS).toHaveLength(12);
		for (const id of FACE_IDS) {
			expect(gridProblems(BLINKS[id], FACE_W, FACE_H)).toEqual([]);
			expect(BLINKS[id].join("")).not.toMatch(/[P1N]/);
			expect(FACE_CELLS[blinkCell(id)]).toEqual(BLINKS[id]);
		}
		expect(blinkCell("warm")).toBe(9);
		expect(blinkCell("tired")).toBe(11);
	});
	it("trails his scarf in two cells of 8 by 6 in his letters, reaching back from the root of the tail", () => {
		expect(TRAIL_CELLS).toHaveLength(2);
		for (const g of TRAIL_CELLS) {
			expect(gridProblems(g, TRAIL_W, TRAIL_H)).toEqual([]);
			expect(g.join("")).toMatch(/^[HZ.]+$/);
			expect(g.join("")).toContain("Z");
		}
		expect(TRAIL_CELLS[0]).not.toEqual(TRAIL_CELLS[1]);
		expect(TRAIL_AT.x + TRAIL_W).toBeGreaterThan(0); // it overlaps the sprite's first columns
		expect(TRAIL_AT.x + TRAIL_W).toBeLessThanOrEqual(3);
	});
});
```
- [ ] **HT4** `lib/world/osmo-sprite.test.ts`. Find:
```ts
	it("are 8 by 4 with exactly two pupils", () => {
		for (const id of FACE_IDS) {
			expect(gridProblems(FACES[id], FACE_W, FACE_H)).toEqual([]);
			expect(FACES[id].join("")).toMatch(/^[HJNP.]+$/);
```
Replace with:
```ts
	it("are 8 by 4 with exactly two pupils", () => {
		for (const id of FACE_IDS) {
			expect(gridProblems(FACES[id], FACE_W, FACE_H)).toEqual([]);
			expect(FACES[id].join("")).toMatch(/^[HIJNP1.]+$/);
```
- [ ] **HT5** `lib/world/osmo-sprite.test.ts`. Find:
```ts
	it("lays out the face cells three gazes per face", () => {
		expect(FACE_CELLS).toHaveLength(9);
```
Replace with:
```ts
	it("lays out the face cells three gazes per face, then a blink for each", () => {
		expect(FACE_CELLS).toHaveLength(12);
```
- [ ] **HR1** `lib/world/render.test.ts`. Find:
```ts
		expect([sheetBitmap(art, "faces", 2).w, sheetBitmap(art, "faces", 2).h]).toEqual([9 * 16, 8]);
```
Replace with:
```ts
		expect([sheetBitmap(art, "faces", 2).w, sheetBitmap(art, "faces", 2).h]).toEqual([12 * 16, 8]); // nine faces, three blinks
```

- [ ] **Step 2: Run them and see them fail.**
Run: `npx vitest run lib/world/osmo-sprite.test.ts lib/world/render.test.ts`
Expected: FAIL: `BLINKS`, `blinkCell`, `TRAIL_*` are not exported; `FACE_CELLS` has 9 cells, not 12; the detail-pass tests fail on the old art (no `2`, `3` or `4`; one bob; no hammer).

- [ ] **Step 3: The gaze, the blinks and the trail as code.** This edit generalises `withGaze` to two-row eyes and adds the blink and trail cells with starting grids that pass the shape tests; you then redraw them by eye in Step 4:
- [ ] **H1** `lib/world/osmo-sprite.ts`. Find:
```ts
// The pupils within their 3-pixel eyes: -1 to his right (the viewer's left), 0 at Gur, 1 the other way.
const EYES = [[0, 2], [5, 7]] as const;
export function withGaze(face: Grid, gaze: Gaze): Grid {
	return face.map((row) => {
		const out = [...row];
		for (const [from, to] of EYES) {
			if (!out.slice(from, to + 1).includes("P")) continue;
			for (let i = from; i <= to; i++) out[i] = "N";
			out[from + 1 + gaze] = "P";
		}
		return out.join("");
	});
}
export const faceCell = (face: FaceId, gaze: Gaze): number => FACE_IDS.indexOf(face) * 3 + gaze + 1;
const GAZES: readonly Gaze[] = [-1, 0, 1];
export const FACE_CELLS: readonly Grid[] = FACE_IDS.flatMap((f) => GAZES.map((g) => withGaze(FACES[f], g)));
```
Replace with:
```ts
// The pupils within their 3-pixel eyes: -1 to his right (the viewer's left), 0 at Gur, 1 the other way. Since the
// polish pass an eye is two rows, the glint 1 over the pupil P in one column; the gaze moves that column, glint and
// pupil together, and leaves the whites N round it.
const EYES = [[0, 2], [5, 7]] as const;
export function withGaze(face: Grid, gaze: Gaze): Grid {
	return face.map((row) => {
		const out = [...row];
		for (const [from, to] of EYES) {
			const i = out.slice(from, to + 1).findIndex((c) => c === "P" || c === "1");
			if (i < 0) continue;
			const ch = out[from + i];
			for (let k = from; k <= to; k++) out[k] = "N";
			out[from + 1 + gaze] = ch;
		}
		return out.join("");
	});
}
// His eyes shut, one patch per face, the same size and place as the face (the polish pass's blink, actor.ts).
export const BLINKS: Readonly<Record<FaceId, Grid>> = {
	warm: ["........", "JHJ..JHJ", "..H..H..", "...HH..."],
	attentive: [".HH..HH.", "JHJ..JHJ", "........", "...HH..."],
	tired: ["........", "HHH..HHH", "JHJ..JHJ", "..HHHH.."],
};
export const faceCell = (face: FaceId, gaze: Gaze): number => FACE_IDS.indexOf(face) * 3 + gaze + 1;
// The blink cells come after the nine face cells, one per face, in FACE_IDS order.
export const blinkCell = (face: FaceId): number => FACE_IDS.length * 3 + FACE_IDS.indexOf(face);
const GAZES: readonly Gaze[] = [-1, 0, 1];
export const FACE_CELLS: readonly Grid[] = [...FACE_IDS.flatMap((f) => GAZES.map((g) => withGaze(FACES[f], g))), ...FACE_IDS.map((f) => BLINKS[f])];

// The polish pass: the end of his scarf streaming behind him as he walks, two cells that swap (actor.ts TRAIL_MS).
// Facing right, a cell's top-left sits at TRAIL_AT from the sprite's top-left, so its right edge overlaps the root of
// the tail drawn in the walk frames (columns 0 and 1); facing left the renderer mirrors it onto the other side.
export const TRAIL_W = 8;
export const TRAIL_H = 6;
export const TRAIL_AT = { x: -6, y: 12 } as const;
export const TRAIL_CELLS: readonly Grid[] = [
	["........", "....HHHH", "..HHZZZZ", "HHZZZZHH", "..HH....", "........"],
	["........", "......HH", "...HHHZZ", "HHHZZZZH", "HZZHHH..", ".HH....."],
];
```

- [ ] **Step 4: Draw him.** Redraw the parts and frames as the table says (edit the part builders where that is cleaner than the frames), then `FACES`, `BLINKS` and `TRAIL_CELLS`. Create `lib/world/zz-him.test.ts` (never committed), run it as "The previews" says, and look at every PNG: the legs must read as two legs in trousers at 8x and at scale 3 in the world by day and by night; the walk strip must read as a walk with the scarf flowing back; the hammer must read as a swing; the faces must read at 12x with a glint in each eye and the blinks as shut eyes. Iterate.
```ts
// Scratch preview for Task 5 (him): NEVER commit this file. Run with
//   WORLD_SNAPSHOT_DIR=<your scratchpad>/him npx vitest run lib/world/zz-him.test.ts
// (make the folder first) and look at every PNG it writes.
import { it } from "vitest";
import { look, pose } from "./actor";
import { blocksOf } from "./blueprints";
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { ISLAND } from "./blueprints/island";
import { CASTLE_ROOMS, TILE, type Block } from "./blueprints/types";
import { newCamera } from "./camera";
import { FACE_CELLS, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, TRAIL_AT, TRAIL_CELLS, TRAIL_W } from "./osmo-sprite";
import { pixelPainter } from "./pixel-painter";
import { snapshot } from "./png";
import { colours, rasterize, type Bitmap, type Grid } from "./raster";
import { artFor, drawSky, drawWorld } from "./render";
import { skyAt, starField } from "./sky";

const SCARF = "hsl(172 38% 50%)";
const cols = colours({ Z: SCARF });
// A bitmap laid on a flat ground colour, so transparent pixels show as that ground.
function onGround(b: Bitmap, rgb: readonly [number, number, number]): Bitmap {
	const data = new Uint8ClampedArray(b.data.length);
	for (let i = 0; i < b.data.length; i += 4) {
		const a = b.data[i + 3] / 255;
		for (let c = 0; c < 3; c++) data[i + c] = Math.round(b.data[i + c] * a + rgb[c] * (1 - a));
		data[i + 3] = 255;
	}
	return { w: b.w, h: b.h, data };
}
// A grid laid over another at (x, y); "." keeps what is under it.
function overlay(base: Grid, patch: Grid, x: number, y: number): Grid {
	return base.map((row, ry) => [...row].map((ch, rx) => {
		const p = patch[ry - y]?.[rx - x];
		return p !== undefined && p !== "." ? p : ch;
	}).join(""));
}
const blank = (w: number, h: number): Grid => Array.from({ length: h }, () => ".".repeat(w));
function scene(name: string, kind: Parameters<typeof pose>[0], hour: number, at: number, flip = false) {
	const view = { w: 360, h: 240 };
	const dark = hour >= 21 || hour < 5 ? 1 : 0;
	const sky = skyAt(SCARF, "hsl(212 38% 50%)", hour);
	const back = pixelPainter(view.w, view.h, artFor(SCARF, dark));
	drawSky(back, { sky, stars: starField() });
	const front = pixelPainter(view.w, view.h, artFor(SCARF, dark));
	const him = { ...pose(kind, 32.5 * TILE, 0, hour), dir: flip ? (-1 as const) : (1 as const) };
	const laid: Block[] = CASTLE_ROOMS.flatMap((r) => [...CASTLE_BLOCKS[r]]);
	drawWorld(front, {
		camera: { ...newCamera(him.x, view, 3), y: 26 * TILE - 20 }, view, now: at, clock: 0, ground: blocksOf(ISLAND), laid, ghost: null,
		him: { x: him.x, look: look(him, at, "warm") }, sky, dark,
	});
	for (let i = 0; i < front.data.length; i += 4) {
		const a = front.data[i + 3] / 255;
		for (let c = 0; c < 3; c++) back.data[i + c] = Math.round(front.data[i + c] * a + back.data[i + c] * (1 - a));
	}
	snapshot(name, back);
}

it("previews him", () => {
	const grey = [92, 96, 108] as const;
	// 1. All 18 frames at 8x on a mid grey: the outline, the trousers and the coat's lit edge must all read.
	snapshot("frames-8x", onGround(rasterize(FRAME_NAMES.map((n) => FRAMES[n]), FRAME_W, FRAME_H, 8, cols), grey));
	// 2. The walk in order, each frame with its trail cell where the renderer puts it (facing right), at 8x.
	const pad = -TRAIL_AT.x;
	const walk = (["walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6"] as const).map((n, i) =>
		overlay(overlay(blank(FRAME_W + pad, FRAME_H), TRAIL_CELLS[i % 2], 0, TRAIL_AT.y), FRAMES[n], pad, 0),
	);
	snapshot("walk-trail-8x", onGround(rasterize(walk, FRAME_W + pad, FRAME_H, 8, cols), grey));
	// 3. The build: the four hammer frames, then the trail cells alone.
	snapshot("build-8x", onGround(rasterize((["build-1", "build-2", "build-3", "build-4"] as const).map((n) => FRAMES[n]), FRAME_W, FRAME_H, 8, cols), grey));
	snapshot("trail-16x", onGround(rasterize(TRAIL_CELLS, TRAIL_W, TRAIL_CELLS[0].length, 16, cols), grey));
	// 4. The faces: nine gazes then three blinks, each laid on the facing head at 12x.
	const head = FRAMES["face-1"].slice(0, 12);
	const faces = FACE_CELLS.map((f) => overlay(head, f, 4, 7));
	snapshot("faces-12x", onGround(rasterize(faces, FRAME_W, 12, 12, cols), grey));
	// 5. Him in the world at scale 3, by day and by night.
	scene("world-idle-day", "idle", 13, 0);
	scene("world-walk-day", "walking", 13, 150);
	scene("world-walk-left-night", "walking", 23, 350, true);
	for (let i = 0; i < 4; i++) scene(`world-build-${i + 1}`, "building", 13, i * 300);
	scene("world-face-day", "facing", 13, 0);
	scene("world-face-night", "facing", 23, 0);
});
```

- [ ] **Step 5: Re-pin the hash, after looking.** He stands in the hashed scene (`idle-1`). Run `WORLD_SNAPSHOT_DIR=<folder> npx vitest run lib/world/render.test.ts`, look at `world-40.png` (only he changed), then `npx vitest run lib/world/render.test.ts -u`; `git diff lib/world/render.test.ts` must show only the faces line from Step 1 and the hash. Report the old and new hash.

- [ ] **Step 6: Run the checks.**
Run: `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`.
Expected: all pass (the render test "draws him standing on the ground line" still finds his coat, lowest pixel row 183).

- [ ] **Step 7: Commit.** Delete `lib/world/zz-him.test.ts` first.
```bash
git add lib/world/osmo-sprite.ts lib/world/osmo-sprite.test.ts lib/world/render.test.ts
git commit -m "art(world): him in detail - trousers that read, a lit coat edge, a hammer, a cleaner walk, eyes with a glint, blinks, the scarf's trail" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Report: the preview folder and the PNGs to show Gur (`frames-8x.png`, `walk-trail-8x.png`, `build-8x.png`, `faces-12x.png`, `world-walk-day.png`, `world-face-night.png`).


---
### Task 9: The renderer: variants, shadows, light, lit glass, hills and haze, twinkle
**Model:** Opus (judged by eye). **Waits for:** Tasks 3 (`twinkle`), 4 (`HILLS`), 7 (the tile ids) and 8 (it re-pins the hash after him).
**Files:** Create `lib/world/texture.ts`, `lib/world/texture.test.ts`. Modify `lib/world/render.ts`, `lib/world/render.test.ts`.

**Interfaces:**
- Consumes: `Painter.pool` and the box-filling `put` in `drawWorld` (Task 1); `twinkle` (Task 3); `HILLS` (Task 4); the ten new tile ids (Task 7).
- Produces:
  - `texture.ts`: `VARIANT_SHARE`, `cellHash(x, y)`, `variantOf(id, x, y)`, `LIT_FROM`, `litOf(id, dark)`, `SHADOW_ALPHA`, `SHADOW_COLOR`, `shadowed(laid): Block[]`, `Pool`, `poolsOf(blocks): Pool[]`, `FORGE_BREATH`, `FORGE_BREATH_MS`, `forgeBreath(now)`.
  - `render.ts`: `SkyScene.tick?: number`; `LIT_FROM` re-exported from `texture.ts`; `HAZE`; `hillTones(sky, at)`; `drawWorld` draws variants, the shadow rows, the pools, the lit glass and its glow, the breathing forge, and (with a sky) the hills and the haze band.

The drawing order after this task (each step's code is in the edits): the far islands; the hills, then the haze band; the clouds; the island and the castle, each cell as `variantOf(litOf(tile, dark), x, y)`; the shadow rows; the outline and the next block; the pools (after dark); him; the glows (after dark, the forge's times `forgeBreath(now)`).

- [ ] **Step 1: Write the failing tests.** Create `lib/world/texture.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { blocksOf } from "./blueprints";
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { HALL } from "./blueprints/hall";
import { GROUND_Y, TILE } from "./blueprints/types";
import { cellHash, FORGE_BREATH, FORGE_BREATH_MS, forgeBreath, LIT_FROM, litOf, poolsOf, shadowed, VARIANT_SHARE, variantOf } from "./texture";

describe("variants by the cell", () => {
	it("are chosen the same way every time, and only for brick, stone and snow", () => {
		expect(variantOf("brick", 30, 20)).toBe(variantOf("brick", 30, 20));
		for (let x = 0; x < 64; x++) {
			expect(variantOf("window", x, 20)).toBe("window");
			expect(variantOf("stone-dark", x, 30)).toBe("stone-dark");
			expect(["snow", "snow-2", "snow-3"]).toContain(variantOf("snow", x, GROUND_Y));
		}
	});
	it("show each variant in about one cell in six, scattered, not in stripes", () => {
		const n = { base: 0, a: 0, b: 0 };
		for (let y = 0; y < 40; y++) {
			for (let x = 0; x < 64; x++) {
				const v = variantOf("brick", x, y);
				if (v === "brick") n.base++;
				else if (v === "brick-2") n.a++;
				else n.b++;
			}
		}
		const total = 64 * 40;
		expect(n.a / total).toBeGreaterThan(VARIANT_SHARE - 0.03);
		expect(n.a / total).toBeLessThan(VARIANT_SHARE + 0.03);
		expect(n.b / total).toBeGreaterThan(VARIANT_SHARE - 0.03);
		expect(n.b / total).toBeLessThan(VARIANT_SHARE + 0.03);
		// Along the island's 58-cell top, each variant shows a few times and never more than three in a row.
		const row = Array.from({ length: 58 }, (_, i) => variantOf("snow", 3 + i, GROUND_Y));
		expect(row.filter((v) => v === "snow-2").length).toBeGreaterThanOrEqual(3);
		expect(row.filter((v) => v === "snow-3").length).toBeGreaterThanOrEqual(3);
		let run = 1;
		for (let i = 1; i < row.length; i++) {
			run = row[i] !== "snow" && row[i] === row[i - 1] ? run + 1 : 1;
			expect(run).toBeLessThanOrEqual(3);
		}
	});
	it("hash a cell into 0..1", () => {
		for (const [x, y] of [[0, 0], [63, 39], [-5, 7], [1e6, 3]]) {
			expect(cellHash(x, y)).toBeGreaterThanOrEqual(0);
			expect(cellHash(x, y)).toBeLessThan(1);
		}
	});
});

describe("lit after dark", () => {
	it("lights the windows, the bookcase windows and the dome from LIT_FROM, and nothing else", () => {
		expect(litOf("window", LIT_FROM)).toBe("window-lit");
		expect(litOf("window-top", 1)).toBe("window-top-lit");
		expect(litOf("shelf-window", 1)).toBe("shelf-window-lit");
		expect([litOf("dome-l", 1), litOf("dome", 1), litOf("dome-r", 1)]).toEqual(["dome-l-lit", "dome-lit", "dome-r-lit"]);
		expect(litOf("shelf-window", LIT_FROM - 0.01)).toBe("shelf-window");
		expect(litOf("brick", 1)).toBe("brick");
	});
});

describe("shadows under the eaves and sills", () => {
	it("fall on the wall under the hall's eaves timber and under each window, not under a window's top half", () => {
		const hall = blocksOf(HALL);
		const got = shadowed(hall);
		const at = (x: number, y: number) => hall.find((b) => b.x === x && b.y === y);
		for (const b of got) expect(["brick", "brick-dark", "pillar"]).toContain(b.tile);
		// The beam runs x 25 to 39 at y 18 over the wall: every cell of the wall's top row is shadowed.
		for (let x = 25; x <= 39; x++) expect(got.some((b) => b.x === x && b.y === 19), `${x}`).toBe(true);
		// Under each window (its lower tile at y 21) the brick at y 22.
		expect(got.some((b) => b.x === 28 && b.y === 22)).toBe(true);
		expect(got.some((b) => b.x === 36 && b.y === 22)).toBe(true);
		// Under the window's top half lies its lower half, which takes no shadow.
		expect(at(28, 21)?.tile).toBe("window");
		expect(got.some((b) => b.x === 28 && b.y === 21)).toBe(false);
	});
	it("fall under the library's bookcase window only where brick is below it", () => {
		const library = CASTLE_BLOCKS.library;
		const shelves = library.filter((b) => b.tile === "shelf-window");
		expect(shelves.length).toBeGreaterThan(0);
		for (const b of shadowed(library)) expect(b.tile).not.toBe("shelf-window");
	});
	it("need the wall below to be laid", () => {
		expect(shadowed([{ x: 5, y: 5, tile: "beam-h", layer: "walls" }])).toEqual([]);
	});
});

describe("light on the ground", () => {
	it("pools under each lantern and door, on the snow's top edge, wider than tall", () => {
		const pools = poolsOf(blocksOf(HALL));
		expect(pools).toHaveLength(3);
		for (const p of pools) {
			expect(p.y).toBe(GROUND_Y * TILE + 1);
			expect(p.rx).toBeGreaterThan(3 * p.ry);
		}
		expect(pools.map((p) => p.x).sort((a, b) => a - b)).toEqual([31.5 * TILE, 32.5 * TILE, 33.5 * TILE]);
	});
});

describe("the forge breathing", () => {
	it("swings its glow by FORGE_BREATH either way over FORGE_BREATH_MS", () => {
		expect(forgeBreath(0)).toBe(1);
		expect(forgeBreath(FORGE_BREATH_MS / 4)).toBeCloseTo(1 + FORGE_BREATH, 6);
		expect(forgeBreath((3 * FORGE_BREATH_MS) / 4)).toBeCloseTo(1 - FORGE_BREATH, 6);
		expect(forgeBreath(Number.NaN)).toBe(1);
	});
});
```
And in `render.test.ts` (the imports, a shadow, a pool, the hills and the twinkle, and the snow-under-his-feet test made aware of the snow variants):
- [ ] **LT1** `lib/world/render.test.ts`. Find:
```ts
import { artFor, drawSky, drawWorld, GHOST_ALPHA, OUTLINE_ALPHA, sheetBitmap, type WorldScene } from "./render";
```
Replace with:
```ts
import { artFor, drawSky, drawWorld, GHOST_ALPHA, HAZE, OUTLINE_ALPHA, sheetBitmap, type WorldScene } from "./render";
```
- [ ] **LT2** `lib/world/render.test.ts`. Find:
```ts
import { CLOUD_CELL, CLOUD_GRIDS } from "./backdrop";
```
Replace with:
```ts
import { CLOUD_CELL, CLOUD_GRIDS, HILLS } from "./backdrop";
```
- [ ] **LT3** `lib/world/render.test.ts`. Find:
```ts
import { hslCss, skyAt, starField } from "./sky";
```
Replace with:
```ts
import { hslCss, skyAt, starField, twinkle } from "./sky";
import { poolsOf, shadowed, SHADOW_ALPHA, variantOf } from "./texture";
```
- [ ] **LT4** `lib/world/render.test.ts`. Find:
```ts
	it("copes with a canvas of no size", () => {
```
Replace with:
```ts
	it("lays a row of shadow under the eaves' timber, over the top of the wall below (polish pass)", () => {
		const done = scene(hall.length);
		const s = { ...done, ghost: null, camera: { ...done.camera, y: 320 } }; // up a little: world y 270 to 370 in view
		const under = shadowed(s.laid).filter((b) => b.y === 19 && b.x >= 29 && b.x <= 35); // under the beam at y 18
		expect(under.length).toBeGreaterThan(0);
		const b = under[0];
		const data = paint(s).data;
		const at = toScreen(s.camera, VIEW, 0, b.x * TILE, b.y * TILE);
		const cols = colours();
		// The wall's top row, drawn: darker than the tile's own pixel by the shadow's share; the row below it is not.
		const tileId = variantOf(b.tile, b.x, b.y);
		for (let dx = 0; dx < 2 * TILE; dx += 5) {
			const own = cols[TILES[tileId][0][dx >> 1]];
			const drawn = px(data, at.x + dx, at.y);
			expect(drawn[0], `${dx}`).toBe(Math.round(own[0] * (1 - SHADOW_ALPHA) + 11 * SHADOW_ALPHA));
			const next = px(data, at.x + dx, at.y + 2);
			expect(next.slice(0, 3)).toEqual([...cols[TILES[tileId][1][dx >> 1]]].slice(0, 3));
		}
	});
	it("pools warm light on the ground under the lanterns and the door after dark (polish pass)", () => {
		const done = scene(hall.length);
		const pools = poolsOf(done.laid);
		expect(pools.length).toBe(3); // two lanterns and the door
		const pool = pools[0];
		const c = toScreen(done.camera, VIEW, 0, pool.x, pool.y);
		const bright = (d: Uint8ClampedArray) => px(d, c.x, c.y + 1).slice(0, 3).reduce((a, b) => a + b, 0); // out of the lanterns' glow
		const night = pixelPainter(VIEW.w, VIEW.h, artFor("hsl(172 38% 50%)", 1));
		drawWorld(night, { ...done, dark: 1 });
		const unlit = pixelPainter(VIEW.w, VIEW.h, artFor("hsl(172 38% 50%)", 1));
		drawWorld(unlit, { ...done, dark: 0 });
		expect(bright(night.data)).toBeGreaterThan(bright(unlit.data) + 20);
	});
	it("draws the hills and the haze band only when given the sky (polish pass)", () => {
		const wide = { w: 1600, h: 500 }; // wide enough that the island leaves the first 300 px clear
		const base = { ...scene(40), view: wide, camera: newCamera(32 * TILE, wide, 1) };
		const draw = (sc: WorldScene) => {
			const p = pixelPainter(wide.w, wide.h, art);
			drawWorld(p, sc);
			return p.data;
		};
		const a = draw({ ...base, sky: skyAt("hsl(172 38% 50%)", "hsl(212 38% 50%)", 12) });
		const b = draw(base);
		// Below the island's snow (the far islands all stand above it): only the hills and the haze differ there.
		const ground = toScreen(base.camera, wide, 0, 0, GROUND_Y * TILE).y;
		let differ = 0;
		for (let y = ground + 4; y < Math.min(wide.h, ground + 100); y++) {
			for (let x = 0; x < 300; x++) if (a[(y * wide.w + x) * 4 + 3] !== b[(y * wide.w + x) * 4 + 3]) differ++;
		}
		expect(differ).toBeGreaterThan(500);
		expect(Math.max(...HILLS.runs.map(([y]) => y))).toBeGreaterThanOrEqual(HAZE.hold); // their foot is lost in the haze
	});
	it("twinkles some stars from one slow tick to the next, and keeps the rest steady (polish pass)", () => {
		const sky = skyAt("hsl(172 38% 50%)", "hsl(212 38% 50%)", 0);
		const stars = starField();
		const p0 = pixelPainter(VIEW.w, VIEW.h, art);
		drawSky(p0, { sky, stars, tick: 0 });
		const p1 = pixelPainter(VIEW.w, VIEW.h, art);
		drawSky(p1, { sky, stars, tick: 1 });
		const changed = stars.filter((_, i) => twinkle(i, 0) !== twinkle(i, 1));
		expect(changed.length).toBeGreaterThan(0);
		for (const star of changed) {
			const x = Math.round(star.fx * VIEW.w);
			const y = Math.round(star.fy * VIEW.h);
			expect(px(p0.data, x, y)).not.toEqual(px(p1.data, x, y));
		}
	});
	it("copes with a canvas of no size", () => {
```
- [ ] **LT5** `lib/world/render.test.ts`. Find:
```ts
				const letter = TILES.snow[(y - rows.y0) >> 1][wx % TILE];
```
Replace with:
```ts
				// Since the polish pass a snow cell may show a variant (texture.ts); its top rows are snow as well.
				const letter = TILES[variantOf("snow", Math.floor(wx / TILE), GROUND_Y)][(y - rows.y0) >> 1][wx % TILE];
```

- [ ] **Step 2: Run them and see them fail.**
Run: `npx vitest run lib/world/texture.test.ts lib/world/render.test.ts`
Expected: FAIL: `Failed to resolve import "./texture"`; `HAZE` is not exported.

- [ ] **Step 3: Implement.** Create `lib/world/texture.ts`:
```ts
// The polish pass's texture and light rules for the renderer (render.ts), kept pure so they are tested without
// drawing: which variant of a tile a cell shows, which tiles are lit after dark, which blocks cast a one-row shadow on
// the wall below them, where lanterns and doors spill light on the ground, and the forge's breathing glow. None of it
// changes a blueprint or what is saved: the blocks keep their base tiles, and the choice is made where they are drawn.
import { GROUND_Y, TILE, type Block } from "./blueprints/types";
import type { TileId } from "./tiles";

// --- Variants: a fixed hash of the cell's tile position picks the tile, so the same cell always shows the same one
// and the 16 px repeat stops showing on long walls and the island's top. Each variant in about one cell in six. ---
const VARIANTS: Partial<Record<TileId, readonly [TileId, TileId]>> = {
	brick: ["brick-2", "brick-3"],
	stone: ["stone-2", "stone-3"],
	snow: ["snow-2", "snow-3"],
};
export const VARIANT_SHARE = 1 / 6;
export function cellHash(x: number, y: number): number {
	let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x3c6e, 0x165667b1);
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function variantOf(id: TileId, x: number, y: number): TileId {
	const v = VARIANTS[id];
	if (!v) return id;
	const h = cellHash(x, y);
	return h < VARIANT_SHARE ? v[0] : h < 2 * VARIANT_SHARE ? v[1] : id;
}

// --- After dark (from LIT_FROM): the windows, the library's bookcase windows and the observatory's dome are lit. ---
export const LIT_FROM = 0.5;
const LIT: Partial<Record<TileId, TileId>> = {
	window: "window-lit",
	"window-top": "window-top-lit",
	"shelf-window": "shelf-window-lit",
	"dome-l": "dome-l-lit",
	dome: "dome-lit",
	"dome-r": "dome-r-lit",
};
export const litOf = (id: TileId, dark: number): TileId => (dark >= LIT_FROM ? (LIT[id] ?? id) : id);

// --- Shadows: a block of CASTERS darkens the top world pixel row of the block right below it, when that block is a
// wall (RECEIVERS): under the eaves' timber, under a window's sill, under the bookcase window's sill. ---
const CASTERS: ReadonlySet<TileId> = new Set<TileId>(["beam-h", "window", "shelf-window"]);
const RECEIVERS: ReadonlySet<TileId> = new Set<TileId>(["brick", "brick-dark", "pillar"]);
export const SHADOW_ALPHA = 0.3;
export const SHADOW_COLOR = "#0b0d12";
// The blocks that receive a shadow on their top row, from the blocks laid so far. A cell can hold two blocks (a
// banner or a lantern hangs on a wall): the wall is the one that receives it.
export function shadowed(laid: readonly Block[]): Block[] {
	const walls = new Map<string, Block>();
	for (const b of laid) if (RECEIVERS.has(b.tile)) walls.set(`${b.x},${b.y}`, b);
	const out: Block[] = [];
	for (const b of laid) {
		if (!CASTERS.has(b.tile)) continue;
		const below = walls.get(`${b.x},${b.y + 1}`);
		if (below) out.push(below);
	}
	return out;
}

// --- Light on the ground: after dark each lantern and each door spills a soft ellipse of warm light on the ground
// under it (the snow's top edge, where he stands). World px; strength is at full dark. ---
export type Pool = { x: number; y: number; rx: number; ry: number; strength: number };
const POOLS: Partial<Record<TileId, { rx: number; ry: number; strength: number }>> = {
	lantern: { rx: 26, ry: 5, strength: 0.34 },
	door: { rx: 20, ry: 4, strength: 0.26 },
};
export function poolsOf(blocks: readonly Block[]): Pool[] {
	const out: Pool[] = [];
	for (const b of blocks) {
		const p = POOLS[b.tile];
		if (p) out.push({ x: (b.x + 0.5) * TILE, y: GROUND_Y * TILE + 1, ...p });
	}
	return out;
}

// --- The forge's glow breathes: its strength swings FORGE_BREATH either way over FORGE_BREATH_MS. Smooth while the
// loop draws frames; on the 3 s tick it is sampled, so it simply sits a little brighter or dimmer each time. ---
export const FORGE_BREATH = 0.18;
export const FORGE_BREATH_MS = 2400;
export const forgeBreath = (now: number): number =>
	Number.isFinite(now) ? 1 + FORGE_BREATH * Math.sin((2 * Math.PI * now) / FORGE_BREATH_MS) : 1;
```
Then the renderer:
- [ ] **L1** `lib/world/render.ts`. Find:
```ts
import { CLOUD_CELL, CLOUD_GRIDS, CLOUD_SHAPES, FAR_ISLANDS, FAR_PARALLAX } from "./backdrop";
```
Replace with:
```ts
import { CLOUD_CELL, CLOUD_GRIDS, CLOUD_SHAPES, FAR_ISLANDS, FAR_PARALLAX, HILLS } from "./backdrop";
```
- [ ] **L2** `lib/world/render.ts`. Find:
```ts
import { CLOUD_SPAN, CLOUDS, cloudX, hslCss, PARALLAX, SKY_STOPS, skyHslAt, type Sky, type Star } from "./sky";
import { TILE_IDS, TILES, tileIndex, type TileId } from "./tiles";
```
Replace with:
```ts
import { CLOUD_SPAN, CLOUDS, cloudX, hslCss, PARALLAX, SKY_STOPS, skyHslAt, twinkle, type Sky, type Star } from "./sky";
import { forgeBreath, litOf, poolsOf, SHADOW_ALPHA, SHADOW_COLOR, shadowed, variantOf } from "./texture";
import { TILE_IDS, TILES, tileIndex, type TileId } from "./tiles";
```
- [ ] **L3** `lib/world/render.ts`. Find:
```ts
export type SkyScene = { sky: Sky; stars: readonly Star[] };
```
Replace with:
```ts
// tick: the slow tick's number (pace.ts SLOW_MS), for the stars that twinkle (sky.ts twinkle); none: all steady.
export type SkyScene = { sky: Sky; stars: readonly Star[]; tick?: number };
```
- [ ] **L4** `lib/world/render.ts`. Find:
```ts
export const LIT_FROM = 0.5; // windows are lit from this dark on
const LIT: Partial<Record<TileId, TileId>> = { window: "window-lit", "window-top": "window-top-lit" };
// Where a lamp's light sits in its tile (px) and how far it reaches (world px).
const LIGHTS: Partial<Record<TileId, { x: number; y: number; r: number; strength: number }>> = {
	lantern: { x: 8.5, y: 9.5, r: 40, strength: 0.42 },
	"window-lit": { x: 8, y: 2, r: 30, strength: 0.3 },
	forge: { x: 8, y: 11, r: 44, strength: 0.5 },
};
```
Replace with:
```ts
export { LIT_FROM } from "./texture"; // windows, bookcases and the dome are lit from this dark on (texture.ts litOf)
// Where a lamp's light sits in its tile (px) and how far it reaches (world px).
const LIGHTS: Partial<Record<TileId, { x: number; y: number; r: number; strength: number }>> = {
	lantern: { x: 8.5, y: 9.5, r: 40, strength: 0.42 },
	"window-lit": { x: 8, y: 2, r: 30, strength: 0.3 },
	forge: { x: 8, y: 11, r: 44, strength: 0.5 },
	"shelf-window-lit": { x: 8, y: 8, r: 28, strength: 0.26 },
	"dome-lit": { x: 8, y: 8, r: 34, strength: 0.22 },
};
// The haze band at the horizon (polish pass): it lies over the hills' foot, rising from nothing HAZE.from world px
// below their top line to HAZE.alpha at HAZE.peak, holding to HAZE.hold (the hills reach at least that deep, so their
// foot is lost in it) and fading out by HAZE.to, in the sky's horizon colour a little lighter.
export const HAZE = { from: 6, peak: 44, hold: 72, to: 124, alpha: 0.9, lift: 6 } as const;
```
- [ ] **L5** `lib/world/render.ts`. Find:
```ts
	if (s.sky.stars <= 0) return;
	for (const star of s.stars) {
		const size = star.big ? 2 : 1;
		p.rect(Math.round(star.fx * p.w), Math.round(star.fy * p.h), size, size, PALETTE.p, s.sky.stars * (star.big ? 1 : 0.7));
	}
}
```
Replace with:
```ts
	if (s.sky.stars <= 0) return;
	s.stars.forEach((star, i) => {
		const size = star.big ? 2 : 1;
		const shine = s.tick === undefined ? 1 : twinkle(i, s.tick);
		p.rect(Math.round(star.fx * p.w), Math.round(star.fy * p.h), size, size, PALETTE.p, s.sky.stars * (star.big ? 1 : 0.7) * shine);
	});
}
```
- [ ] **L6** `lib/world/render.ts`. Find:
```ts
				p.rect(left, top, Math.round(ox + x1 * fz) - left, Math.round(oy + (y + 1) * fz) - top, tones[t], 1);
			}
		}
	}
```
Replace with:
```ts
				p.rect(left, top, Math.round(ox + x1 * fz) - left, Math.round(oy + (y + 1) * fz) - top, tones[t], 1);
			}
		}
		// 1b. the hills (polish pass): nearer and lower than the far islands, repeating across the view, then the haze
		// band over their foot
		const htop = ground.y + HILLS.drop * fz;
		const hTones = hillTones(s.sky, s.view.h > 0 ? (htop + 12 * fz) / s.view.h : 0);
		const period = HILLS.w * fz;
		const hshift = (START_X - s.camera.x) * HILLS.parallax * fz;
		if (period > 0) {
			for (let ox = (((hshift % period) + period) % period) - period; ox < s.view.w; ox += period) {
				for (const [y, x0, x1, t] of HILLS.runs) {
					const left = Math.round(ox + x0 * fz);
					const top = Math.round(htop + y * fz);
					p.rect(left, top, Math.round(ox + x1 * fz) - left, Math.round(htop + (y + 1) * fz) - top, hTones[t], 1);
				}
			}
		}
		const [hh, hs, hl] = skyHslAt(s.sky, 1);
		const hazeColor = hslCss([Math.round(hh), Math.round(hs), Math.min(100, Math.round(hl + HAZE.lift))]);
		for (let y = HAZE.from; y < HAZE.to; y++) {
			const k = y < HAZE.peak ? (y - HAZE.from) / (HAZE.peak - HAZE.from) : y < HAZE.hold ? 1 : (HAZE.to - y) / (HAZE.to - HAZE.hold);
			const top = Math.round(htop + y * fz);
			p.rect(0, top, s.view.w, Math.round(htop + (y + 1) * fz) - top, hazeColor, HAZE.alpha * k);
		}
	}
```
- [ ] **L7** `lib/world/render.ts`. Find:
```ts
// The far islands' three tones from the sky at their height: a body a little darker than the sky behind it, a rim lit
// like snow, and an underside fading back into the haze.
export function hazeTones(sky: Sky, at: number): [string, string, string] {
	const [h, sat, l] = skyHslAt(sky, at);
	const tone = (k: number, dl: number): string => hslCss([Math.round(h), Math.round(sat * 0.75), Math.max(2, Math.round(l * k + dl))]);
	return [tone(0.88, -1), tone(1.12, 2), tone(0.96, 0)];
}
```
Replace with:
```ts
// The far islands' three tones from the sky at their height: a body a little darker than the sky behind it, a rim lit
// like snow, and an underside fading back into the haze.
export function hazeTones(sky: Sky, at: number): [string, string, string] {
	const [h, sat, l] = skyHslAt(sky, at);
	const tone = (k: number, dl: number): string => hslCss([Math.round(h), Math.round(sat * 0.75), Math.max(2, Math.round(l * k + dl))]);
	return [tone(0.88, -1), tone(1.12, 2), tone(0.96, 0)];
}
// The hills' tones (polish pass): nearer than the far islands, so darker and a little more coloured, with the same
// lit rim and hazy foot.
export function hillTones(sky: Sky, at: number): [string, string, string] {
	const [h, sat, l] = skyHslAt(sky, at);
	const tone = (k: number, dl: number): string => hslCss([Math.round(h), Math.round(sat * 0.85), Math.max(2, Math.round(l * k + dl))]);
	return [tone(0.74, -2), tone(1.02, 1), tone(0.86, 0)];
}
```
- [ ] **L8** `lib/world/render.ts`. Find:
```ts
	// 3. the island, 4. the castle so far (its windows lit after dark), 5. the outline of what is still to come in each
	// open room, then the next block, both faint
	const lit = (id: TileId) => (dark >= LIT_FROM ? (LIT[id] ?? id) : id);
	for (const b of s.ground) tile(b.tile, b.x * TILE, b.y * TILE, 1);
	for (const b of s.laid) tile(lit(b.tile), b.x * TILE, b.y * TILE, 1);
	for (const b of s.outline ?? []) tile(b.tile, b.x * TILE, b.y * TILE, OUTLINE_ALPHA);
	if (s.ghost) tile(s.ghost.tile, s.ghost.x * TILE, s.ghost.y * TILE, GHOST_ALPHA);
```
Replace with:
```ts
	// 3. the island, 4. the castle so far (its windows lit after dark) with a row of shadow under each eave and sill,
	// 5. the outline of what is still to come in each open room, then the next block, both faint. Brick, stone and
	// snow show one of their variants by the cell (texture.ts), the blocks themselves unchanged.
	const lit = (id: TileId) => litOf(id, dark);
	const block = (b: Block, alpha: number) => tile(variantOf(lit(b.tile), b.x, b.y), b.x * TILE, b.y * TILE, alpha);
	for (const b of s.ground) block(b, 1);
	for (const b of s.laid) block(b, 1);
	for (const b of shadowed(s.laid)) {
		const a = toScreen(s.camera, s.view, s.now, b.x * TILE, b.y * TILE);
		const c = toScreen(s.camera, s.view, s.now, (b.x + 1) * TILE, b.y * TILE + 1);
		if (seen(a.x, a.y, c.x - a.x, c.y - a.y)) p.rect(a.x, a.y, c.x - a.x, c.y - a.y, SHADOW_COLOR, SHADOW_ALPHA);
	}
	for (const b of s.outline ?? []) block(b, OUTLINE_ALPHA);
	if (s.ghost) block(s.ghost, GHOST_ALPHA);
	// 5b. after dark, each lantern and door spills a soft ellipse of warm light on the ground under it
	if (dark > 0) {
		for (const pool of poolsOf([...s.ground, ...s.laid])) {
			const c = toScreen(s.camera, s.view, s.now, pool.x, pool.y);
			const rx = pool.rx * z;
			const ry = pool.ry * z;
			if (seen(c.x - rx, c.y - ry, 2 * rx, 2 * ry)) p.pool(c.x, c.y, rx, ry, PALETTE.t, pool.strength * dark);
		}
	}
```
- [ ] **L9** `lib/world/render.ts`. Find:
```ts
		const r = light.r * z;
		if (seen(c.x - r, c.y - r, 2 * r, 2 * r)) p.glow(c.x, c.y, r, PALETTE.t, light.strength * dark);
```
Replace with:
```ts
		const r = light.r * z;
		const strength = light.strength * (b.tile === "forge" ? forgeBreath(s.now) : 1);
		if (seen(c.x - r, c.y - r, 2 * r, 2 * r)) p.glow(c.x, c.y, r, PALETTE.t, strength * dark);
```

- [ ] **Step 4: Look at it.** Create `lib/world/zz-castle.test.ts` (never committed), run it as "The previews" says, and look at every PNG: by day the walls must no longer show the 16 px repeat, and no variant may stand out as a pattern; the shadow row must read as depth under the eaves and sills, not as a line; at night the bookcases and the dome must glow, the pools lie on the snow under the lanterns and doors; at 1920 by 1080 the hills must sit low behind the island with their foot lost in the haze, by day, at dusk and at night; `easing-2.5.png` must show no seams. Tune the numbers in `texture.ts` (`VARIANT_SHARE`, `SHADOW_ALPHA`, the pools, `FORGE_BREATH`) and in `render.ts` (`HAZE`, `hillTones`, the new `LIGHTS`) by eye, keeping the tests' meaning; say what you changed.
```ts
// Scratch preview for Task 8 (the renderer's light and texture): NEVER commit this file. Run with
//   WORLD_SNAPSHOT_DIR=<your scratchpad>/castle npx vitest run lib/world/zz-castle.test.ts
// (make the folder first) and look at every PNG it writes.
import { it } from "vitest";
import { look, newActor } from "./actor";
import { blocksOf } from "./blueprints";
import { CASTLE, CASTLE_BLOCKS } from "./blueprints/castle";
import { ISLAND } from "./blueprints/island";
import { CASTLE_ROOMS, TILE, type Block, type CastleRoom } from "./blueprints/types";
import { newCamera } from "./camera";
import { pixelPainter } from "./pixel-painter";
import { snapshot } from "./png";
import { artFor, drawSky, drawWorld, type WorldScene } from "./render";
import { skyAt, starField } from "./sky";

const SCARF = "hsl(172 38% 50%)";
const ALL: Block[] = CASTLE_ROOMS.flatMap((r) => [...CASTLE_BLOCKS[r]]);
function shot(name: string, view: { w: number; h: number }, zoom: number, centreX: number, hour: number, over: Partial<WorldScene> = {}) {
	const dark = hour >= 21 || hour < 5 ? 1 : hour >= 19 ? (hour - 19) / 2 : hour < 7 ? (7 - hour) / 2 : 0;
	const sky = skyAt(SCARF, "hsl(212 38% 50%)", hour);
	const back = pixelPainter(view.w, view.h, artFor(SCARF, dark));
	drawSky(back, { sky, stars: starField(), tick: 0 });
	const front = pixelPainter(view.w, view.h, artFor(SCARF, dark));
	const him = newActor(32.5 * TILE, 0, hour);
	drawWorld(front, {
		camera: newCamera(centreX, view, zoom), view, now: 0, clock: 0, ground: blocksOf(ISLAND), laid: ALL, ghost: null, outline: [],
		him: { x: him.x, look: look(him, 0, "warm") }, sky, dark, ...over,
	});
	for (let i = 0; i < front.data.length; i += 4) {
		const a = front.data[i + 3] / 255;
		for (let c = 0; c < 3; c++) back.data[i + c] = Math.round(front.data[i + c] * a + back.data[i + c] * (1 - a));
	}
	snapshot(name, back);
}
const centreOf = (room: CastleRoom) => (CASTLE[room].x + CASTLE[room].map[0].length / 2) * TILE;

it("previews the castle in its light and texture", () => {
	const wide = { w: 1100, h: 600 };
	// 1. The whole castle by day and by night at scale 1: the variants scattered, the shadow rows under eaves and sills,
	// the lit windows, bookcases and dome, the pools of light at the doors.
	shot("castle-day", wide, 1, 32.5 * TILE, 13);
	shot("castle-night", wide, 1, 32.5 * TILE, 23);
	shot("castle-dusk", wide, 1, 32.5 * TILE, 20);
	// 2. Close: the middle at scale 2, the library and the observatory at scale 3, by night.
	shot("middle-day-2x", { w: 1100, h: 520 }, 2, 32.5 * TILE, 13);
	shot("middle-night-2x", { w: 1100, h: 520 }, 2, 32.5 * TILE, 23);
	shot("library-night-3x", { w: 900, h: 600 }, 3, centreOf("library"), 23);
	shot("observatory-night-3x", { w: 900, h: 700 }, 3, centreOf("observatory"), 23);
	shot("workshop-night-3x", { w: 900, h: 600 }, 3, centreOf("workshop"), 23);
	// 3. The hills and the haze at the sizes people use, by day, at dusk and at night.
	shot("1920x1080-day", { w: 1920, h: 1080 }, 1, 32.5 * TILE, 13);
	shot("1920x1080-dusk", { w: 1920, h: 1080 }, 1, 32.5 * TILE, 19.5);
	shot("1366x768-night", { w: 1366, h: 768 }, 1, 32.5 * TILE, 23);
	shot("375x700-day", { w: 375, h: 700 }, 2, 32.5 * TILE, 13);
	// 4. Half way between two scales, as the camera eases in: no seams between cells.
	shot("easing-2.5", { w: 900, h: 520 }, 2.5, 32.5 * TILE, 13);
});
```

- [ ] **Step 5: Re-pin the hash, after looking.** The variants and the shadow rows change the hashed scene. Run `WORLD_SNAPSHOT_DIR=<folder> npx vitest run lib/world/render.test.ts`, look at `world-40.png` (variant bricks and snow scattered, a shadow row only where a beam or sill has a wall under it: at 40 blocks there may be none), then `-u`; report the old and new hash.

- [ ] **Step 6: Run the checks.**
Run: `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`.
Expected: all pass.

- [ ] **Step 7: Commit.** Delete `lib/world/zz-castle.test.ts` first.
```bash
git add lib/world/texture.ts lib/world/texture.test.ts lib/world/render.ts lib/world/render.test.ts
git commit -m "feat(world): variants by the cell, shadows under eaves and sills, light pooling on the ground, lit bookcases and dome, hills and haze, twinkling stars" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Report: the preview folder and the PNGs to show Gur (`castle-day.png`, `castle-night.png`, `middle-day-2x.png`, `library-night-3x.png`, `observatory-night-3x.png`, `1920x1080-day.png`, `1920x1080-dusk.png`).


---
### Task 10: The renderer: the life, the pop, the trail and the blink
**Model:** Opus (judged by eye). **Waits for:** Tasks 2 (`Look.blink`, `Look.trail`) and 9.
**Files:** Modify `lib/world/render.ts`, `lib/world/render.test.ts`.

**Interfaces:**
- Consumes: `Life`, `NO_LIFE`, `snowAt`, `birdsAt`, `smokeAt`, `dustAt`, `lifeAt`, `MAX_PARTICLES` (Task 3); `BIRD_CELL`, `BIRD_GRIDS` (Task 4); `blinkCell`, `TRAIL_AT`, `TRAIL_CELLS`, `TRAIL_W`, `TRAIL_H` (Task 8); `Look.blink`, `Look.trail` (Task 2); `nightColour` (raster.ts).
- Produces:
  - `Sheet` gains `"trail"` and `"birds"` (`CELL` and `artFor` carry their grids).
  - `WorldScene.life?: Life`: none means none (the hashed scene does not change).
  - `drawWorld` draws: the birds behind the clouds (screen px, at a whole scale `round(z)`); after the next block, the pop (the landed block one world px bigger all round), the dust (squares of `m.size` world px in the stone's light colour) and the smoke (each puff a disc of rows, pale grey), both graded toward night with the art; the trail behind his sprite (mirrored with him); the blink cell instead of the face while `look.blink`; after the glows, the snow (screen px, `p` at the flake's alpha).

- [ ] **Step 1: Write the failing tests.**
- [ ] **NT1** `lib/world/render.test.ts`. Find:
```ts
import { CLOUD_CELL, CLOUD_GRIDS, HILLS } from "./backdrop";
```
Replace with:
```ts
import { BIRD_CELL, CLOUD_CELL, CLOUD_GRIDS, HILLS } from "./backdrop";
```
- [ ] **NT2** `lib/world/render.test.ts`. Find:
```ts
import { TILE_IDS, TILES } from "./tiles";
```
Replace with:
```ts
import { TILE_IDS, TILES } from "./tiles";
import { birdsAt, dustAt, lifeAt, MAX_PARTICLES, NO_LIFE, smokeAt, snowAt, type Life } from "./life";
import { pose } from "./actor";
import { TRAIL_AT, TRAIL_W } from "./osmo-sprite";
```
- [ ] **NT3** `lib/world/render.test.ts`. Find:
```ts
		expect([sheetBitmap(art, "sprite", 3).w, sheetBitmap(art, "sprite", 3).h]).toEqual([18 * 48, 96]);
```
Replace with:
```ts
		expect([sheetBitmap(art, "sprite", 3).w, sheetBitmap(art, "sprite", 3).h]).toEqual([18 * 48, 96]);
		expect([sheetBitmap(art, "trail", 2).w, sheetBitmap(art, "trail", 2).h]).toEqual([2 * 16, 12]);
		expect([sheetBitmap(art, "birds", 1).w, sheetBitmap(art, "birds", 1).h]).toEqual([2 * BIRD_CELL.w, BIRD_CELL.h]);
```
- [ ] **NT4** `lib/world/render.test.ts`. Find:
```ts
describe("the sky", () => {
```
Replace with:
```ts
describe("life in the world (polish pass)", () => {
	const scarf = (parseColor("hsl(172 38% 50%)") ?? [0, 0, 0]).slice(0, 3); // the scarf in the scene's mood colour
	const withLife = (life: Life, over: Partial<WorldScene> = {}) => paint({ ...scene(40), life, ...over }).data;
	const differs = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
		let n = 0;
		for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
		return n;
	};
	it("draws nothing of it when none is given, or when it is empty", () => {
		expect(hashPixels(withLife(NO_LIFE))).toBe(hashPixels(paint(scene(40)).data));
	});
	it("streams his scarf behind him while he walks, on the side away from where he goes", () => {
		const s = scene(40);
		const walking = { ...pose("walking", s.him.x, 0), dir: 1 as const };
		const draw = (flip: boolean, trail: 0 | 1 | null) =>
			paint({ ...s, him: { x: s.him.x, look: { ...look(walking, 0, "warm"), flip, trail } } }).data;
		const at = toScreen(s.camera, VIEW, 0, s.him.x - 8, GROUND_Y * TILE - 32);
		const scarfIn = (d: Uint8ClampedArray, x0: number, x1: number) => {
			let n = 0;
			for (let y = at.y + 24; y < at.y + 36; y++) for (let x = x0; x < x1; x++) if (px(d, x, y).slice(0, 3).join() === scarf.join()) n++;
			return n;
		};
		// Facing right the trail lies left of his sprite; facing left, right of it.
		const left = [at.x + TRAIL_AT.x * 2, at.x] as const;
		const right = [at.x + 32, at.x + 32 + (TRAIL_W + TRAIL_AT.x) * 2 + 12] as const;
		expect(scarfIn(draw(false, 0), ...left)).toBeGreaterThan(3);
		expect(scarfIn(draw(false, null), ...left)).toBe(0);
		expect(scarfIn(draw(true, 1), ...right)).toBeGreaterThan(3);
	});
	it("shuts his eyes on a blink", () => {
		const s = scene(40);
		const facing = pose("facing", s.him.x, 0);
		const open = paint({ ...s, him: { x: s.him.x, look: { ...look(facing, 0, "warm"), blink: false } } }).data;
		const shut = paint({ ...s, him: { x: s.him.x, look: { ...look(facing, 0, "warm"), blink: true } } }).data;
		expect(differs(open, shut)).toBeGreaterThan(0);
		const pupil = rgb("P").join();
		const at = toScreen(s.camera, VIEW, 0, s.him.x - 8, GROUND_Y * TILE - 32);
		let pupils = 0;
		for (let y = at.y; y < at.y + 32; y++) for (let x = at.x; x < at.x + 32; x++) if (px(shut, x, y).slice(0, 3).join() === pupil) pupils++;
		expect(pupils).toBe(0);
	});
	it("pops a landed block a world pixel bigger all round, for its moment", () => {
		const s = scene(40);
		const top = s.laid[s.laid.length - 1]; // the newest block: sky above it
		const a = withLife({ ...NO_LIFE, pop: top });
		const b = paint(s).data;
		const at = toScreen(s.camera, VIEW, 0, top.x * TILE, top.y * TILE);
		const above = px(a, at.x + 8, at.y - 1);
		expect(px(b, at.x + 8, at.y - 1)[3]).toBe(0);
		expect(above[3]).toBeGreaterThan(0);
	});
	it("throws the dust, puffs the smoke, lets the snow fall and the birds fly", () => {
		const s = scene(40);
		const base = paint(s).data;
		const landing = { block: s.laid[s.laid.length - 1], at: 0 };
		expect(differs(withLife({ ...NO_LIFE, dust: dustAt(landing, 100) }), base)).toBeGreaterThan(0);
		const smoke = smokeAt(5_000).map((p) => ({ ...p, x: s.him.x + 20, y: 360 })); // moved into view
		expect(differs(withLife({ ...NO_LIFE, smoke }), base)).toBeGreaterThan(20);
		expect(differs(withLife({ ...NO_LIFE, snow: snowAt(20_000, VIEW, 2, 1) }), base)).toBeGreaterThan(40);
		expect(differs(withLife({ ...NO_LIFE, birds: birdsAt(16_000 * 3 + 8_000, VIEW, 2, true) }), base)).toBeGreaterThan(4);
	});
	it("draws a full frame of life at its cap, at night, without trouble", () => {
		const life = lifeAt({
			wallMs: 20_000, now: 50, view: VIEW, scale: 2, day: true, night: true, chimney: true, landing: { block: hall[0], at: 0 }, motion: true, force: "all",
		});
		expect(life.snow.length + life.smoke.length + life.birds.length + life.dust.length).toBeLessThanOrEqual(MAX_PARTICLES);
		const night = pixelPainter(VIEW.w, VIEW.h, artFor("hsl(172 38% 50%)", 1));
		expect(() => drawWorld(night, { ...scene(40), life, dark: 1 })).not.toThrow();
	});
});

describe("the sky", () => {
```

- [ ] **Step 2: Run them and see them fail.**
Run: `npx vitest run lib/world/render.test.ts`
Expected: FAIL: the atlas has no `trail` or `birds` sheet (`rasterize` reads `undefined`); the life is not drawn (no pixel differs); the blink is not drawn.

- [ ] **Step 3: Implement.**
- [ ] **N1** `lib/world/render.ts`. Find:
```ts
import { CLOUD_CELL, CLOUD_GRIDS, CLOUD_SHAPES, FAR_ISLANDS, FAR_PARALLAX, HILLS } from "./backdrop";
```
Replace with:
```ts
import { BIRD_CELL, BIRD_GRIDS, CLOUD_CELL, CLOUD_GRIDS, CLOUD_SHAPES, FAR_ISLANDS, FAR_PARALLAX, HILLS } from "./backdrop";
```
- [ ] **N2** `lib/world/render.ts`. Find:
```ts
import { FACE_AT, FACE_CELLS, FACE_H, FACE_W, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex } from "./osmo-sprite";
import { PALETTE } from "./palette";
import { colours, rasterize, type Bitmap, type Colours, type Grid } from "./raster";
```
Replace with:
```ts
import type { Life } from "./life";
import {
	blinkCell, FACE_AT, FACE_CELLS, FACE_H, FACE_W, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex, TRAIL_AT, TRAIL_CELLS, TRAIL_H,
	TRAIL_W,
} from "./osmo-sprite";
import { PALETTE } from "./palette";
import { colours, nightColour, parseColor, rasterize, type Bitmap, type Colours, type Grid } from "./raster";
```
- [ ] **N3** `lib/world/render.ts`. Find:
```ts
export type Sheet = "tiles" | "sprite" | "faces" | "clouds";
export const CELL: Readonly<Record<Sheet, { w: number; h: number }>> = {
	tiles: { w: TILE, h: TILE },
	sprite: { w: FRAME_W, h: FRAME_H },
	faces: { w: FACE_W, h: FACE_H },
	clouds: CLOUD_CELL,
};
export type Art = { grids: Readonly<Record<Sheet, readonly Grid[]>>; colours: Colours };
// The drawn art with his scarf in the mood's first aura colour; dark (0 by day, 1 at night) grades it toward night.
export function artFor(scarf: string, dark = 0): Art {
	return {
		grids: { tiles: TILE_IDS.map((id) => TILES[id]), sprite: FRAME_NAMES.map((n) => FRAMES[n]), faces: FACE_CELLS, clouds: CLOUD_GRIDS },
		colours: colours({ Z: scarf }, dark),
	};
}
```
Replace with:
```ts
export type Sheet = "tiles" | "sprite" | "faces" | "clouds" | "trail" | "birds";
export const CELL: Readonly<Record<Sheet, { w: number; h: number }>> = {
	tiles: { w: TILE, h: TILE },
	sprite: { w: FRAME_W, h: FRAME_H },
	faces: { w: FACE_W, h: FACE_H },
	clouds: CLOUD_CELL,
	trail: { w: TRAIL_W, h: TRAIL_H },
	birds: BIRD_CELL,
};
export type Art = { grids: Readonly<Record<Sheet, readonly Grid[]>>; colours: Colours };
// The drawn art with his scarf in the mood's first aura colour; dark (0 by day, 1 at night) grades it toward night.
export function artFor(scarf: string, dark = 0): Art {
	return {
		grids: {
			tiles: TILE_IDS.map((id) => TILES[id]), sprite: FRAME_NAMES.map((n) => FRAMES[n]), faces: FACE_CELLS, clouds: CLOUD_GRIDS,
			trail: TRAIL_CELLS, birds: BIRD_GRIDS,
		},
		colours: colours({ Z: scarf }, dark),
	};
}
```
- [ ] **N4** `lib/world/render.ts`. Find:
```ts
	sky?: Sky; // when given, the far islands are drawn, tinted from it
	dark?: number; // 0 by day to 1 at night: lit windows and the lamps' glow (the art itself is graded by artFor)
};
```
Replace with:
```ts
	sky?: Sky; // when given, the far islands are drawn, tinted from it
	dark?: number; // 0 by day to 1 at night: lit windows and the lamps' glow (the art itself is graded by artFor)
	life?: Life; // polish pass: snow, birds, smoke, a landing's dust and pop (life.ts); none when left out
};
```
- [ ] **N5** `lib/world/render.ts`. Find:
```ts
// The haze band at the horizon (polish pass):
```
Replace with:
```ts
// The life's colours (polish pass): smoke a pale grey, dust the stone's light, both graded toward night with the
// art; snow the snow's highlight, never graded (it catches what light there is).
const SMOKE = "#a9afbb";
const DUST = PALETTE.e;
const graded = (hex: string, dark: number): string => {
	const c = parseColor(hex);
	if (!c || dark <= 0) return hex;
	const [r, g, b] = nightColour(c, dark);
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};
// The haze band at the horizon (polish pass):
```
- [ ] **N6** `lib/world/render.ts`. Find:
```ts
	// 2. clouds: the far layer, fainter, then the near one, each with its parallax, each cloud drawn again a span over
	// wherever the view reaches
```
Replace with:
```ts
	// 1c. birds crossing the sky by day (polish pass), behind the clouds; screen px, at a whole scale
	const k = Math.max(1, Math.round(z));
	for (const b of s.life?.birds ?? []) {
		if (seen(b.x, b.y, BIRD_CELL.w * k, BIRD_CELL.h * k)) p.stamp("birds", b.frame, b.x, b.y, k, 1, b.flip);
	}
	// 2. clouds: the far layer, fainter, then the near one, each with its parallax, each cloud drawn again a span over
	// wherever the view reaches
```
- [ ] **N7** `lib/world/render.ts`. Find:
```ts
	for (const b of s.outline ?? []) block(b, OUTLINE_ALPHA);
	if (s.ghost) block(s.ghost, GHOST_ALPHA);
```
Replace with:
```ts
	for (const b of s.outline ?? []) block(b, OUTLINE_ALPHA);
	if (s.ghost) block(s.ghost, GHOST_ALPHA);
	// 5a. polish pass: the block that just landed, a world pixel bigger all round for a moment; the dust from its foot;
	// the smoke from the workshop's chimney
	const pop = s.life?.pop;
	if (pop) put("tiles", tileIndex(variantOf(lit(pop.tile), pop.x, pop.y)), pop.x * TILE - 1, pop.y * TILE - 1, TILE + 2, TILE + 2, 1);
	const dot = (wx: number, wy: number, ww: number, wh: number, color: string, alpha: number) => {
		const a = toScreen(s.camera, s.view, s.now, wx, wy);
		const c = toScreen(s.camera, s.view, s.now, wx + ww, wy + wh);
		if (c.x > a.x && c.y > a.y && seen(a.x, a.y, c.x - a.x, c.y - a.y)) p.rect(a.x, a.y, c.x - a.x, c.y - a.y, color, alpha);
	};
	const dust = graded(DUST, dark);
	for (const m of s.life?.dust ?? []) dot(Math.round(m.x), Math.round(m.y), m.size, m.size, dust, m.alpha);
	const smoke = graded(SMOKE, dark);
	for (const puff of s.life?.smoke ?? []) {
		// A soft round puff: a disc of rows, each its own width, in world px.
		const r = Math.max(1, Math.round(puff.r));
		for (let dy = -r; dy < r; dy++) {
			const half = Math.round(Math.sqrt(r * r - (dy + 0.5) * (dy + 0.5)));
			dot(Math.round(puff.x) - half, Math.round(puff.y) + dy, 2 * half, 1, smoke, puff.alpha);
		}
	}
```
- [ ] **N8** `lib/world/render.ts`. Find:
```ts
	const hx = s.him.x - FRAME_W / 2; // his sprite's top-left, world px
	const hy = GROUND_Y * TILE - FRAME_H;
	put("sprite", frameIndex(s.him.look.frame), hx, hy, FRAME_W, FRAME_H, 1, s.him.look.flip);
	if (s.him.look.face) put("faces", faceCell(s.him.look.face, s.him.look.gaze), hx + FACE_AT.x, hy + FACE_AT.y, FACE_W, FACE_H, 1);
	// 8. after dark, the warm light of each lamp and lit window falls on what is round it
	if (dark <= 0) return;
	for (const b of [...s.ground, ...s.laid]) {
		const light = LIGHTS[lit(b.tile)];
		if (!light) continue;
		const c = toScreen(s.camera, s.view, s.now, b.x * TILE + light.x, b.y * TILE + light.y);
		const r = light.r * z;
		const strength = light.strength * (b.tile === "forge" ? forgeBreath(s.now) : 1);
		if (seen(c.x - r, c.y - r, 2 * r, 2 * r)) p.glow(c.x, c.y, r, PALETTE.t, strength * dark);
	}
}
```
Replace with:
```ts
	const look = s.him.look;
	const hx = s.him.x - FRAME_W / 2; // his sprite's top-left, world px
	const hy = GROUND_Y * TILE - FRAME_H;
	// 6a. polish pass: the end of his scarf streaming behind him while he walks, behind his body (mirrored with him)
	if (look.trail !== null) {
		const tx = look.flip ? hx + FRAME_W - TRAIL_AT.x - TRAIL_W : hx + TRAIL_AT.x;
		put("trail", look.trail, tx, hy + TRAIL_AT.y, TRAIL_W, TRAIL_H, 1, look.flip);
	}
	put("sprite", frameIndex(look.frame), hx, hy, FRAME_W, FRAME_H, 1, look.flip);
	if (look.face) put("faces", look.blink ? blinkCell(look.face) : faceCell(look.face, look.gaze), hx + FACE_AT.x, hy + FACE_AT.y, FACE_W, FACE_H, 1);
	// 8. after dark, the warm light of each lamp and lit window falls on what is round it
	if (dark > 0) {
		for (const b of [...s.ground, ...s.laid]) {
			const light = LIGHTS[lit(b.tile)];
			if (!light) continue;
			const c = toScreen(s.camera, s.view, s.now, b.x * TILE + light.x, b.y * TILE + light.y);
			const r = light.r * z;
			const strength = light.strength * (b.tile === "forge" ? forgeBreath(s.now) : 1);
			if (seen(c.x - r, c.y - r, 2 * r, 2 * r)) p.glow(c.x, c.y, r, PALETTE.t, strength * dark);
		}
	}
	// 9. polish pass: snow at night, in front of everything; screen px
	for (const f of s.life?.snow ?? []) if (seen(f.x, f.y, f.size, f.size)) p.rect(f.x, f.y, f.size, f.size, PALETTE.p, f.alpha);
}
```

- [ ] **Step 4: Look at it.** Create `lib/world/zz-life.test.ts` (never committed), run it as "The previews" says, and look at every PNG: the snow must read as light snow at scale 1, not as noise; the birds as a small flight; the smoke as soft puffs from the workshop's chimney, rising and thinning; the landing as a small pop and a puff of dust that settles; the trail as his scarf behind him on the correct side; the blink as shut eyes. Tune by eye in `render.ts` (`SMOKE`, the dust colour, the puff's shape) and, if the numbers in `life.ts` must change, say which and why (they are pinned by Task 3's tests: change a test only when the ruling still holds).
```ts
// Scratch preview for Task 9 (life in the renderer): NEVER commit this file. Run with
//   WORLD_SNAPSHOT_DIR=<your scratchpad>/life npx vitest run lib/world/zz-life.test.ts
// (make the folder first) and look at every PNG it writes.
import { it } from "vitest";
import { look, newActor, pose, type Actor } from "./actor";
import { blocksOf } from "./blueprints";
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { ISLAND } from "./blueprints/island";
import { CASTLE_ROOMS, TILE, type Block } from "./blueprints/types";
import { newCamera } from "./camera";
import { birdsAt, CHIMNEY, dustAt, lifeAt, NO_LIFE, popOf, smokeAt, snowAt, type Life } from "./life";
import { pixelPainter } from "./pixel-painter";
import { snapshot } from "./png";
import { artFor, drawSky, drawWorld } from "./render";
import { skyAt, starField } from "./sky";

const SCARF = "hsl(172 38% 50%)";
const ALL: Block[] = CASTLE_ROOMS.flatMap((r) => [...CASTLE_BLOCKS[r]]);
function shot(name: string, view: { w: number; h: number }, zoom: number, centre: { x: number; y?: number }, hour: number, life: Life, him: { a: Actor; at: number; blink?: boolean }, laid = ALL) {
	const dark = hour >= 21 || hour < 5 ? 1 : 0;
	const sky = skyAt(SCARF, "hsl(212 38% 50%)", hour);
	const back = pixelPainter(view.w, view.h, artFor(SCARF, dark));
	drawSky(back, { sky, stars: starField(), tick: 0 });
	const front = pixelPainter(view.w, view.h, artFor(SCARF, dark));
	const camera = newCamera(centre.x, view, zoom);
	const l = look(him.a, him.at, "warm");
	drawWorld(front, {
		camera: centre.y === undefined ? camera : { ...camera, y: centre.y }, view, now: him.at, clock: 0, ground: blocksOf(ISLAND), laid, ghost: null,
		him: { x: him.a.x, look: { ...l, blink: him.blink ?? l.blink } }, sky, dark, life,
	});
	for (let i = 0; i < front.data.length; i += 4) {
		const a = front.data[i + 3] / 255;
		for (let c = 0; c < 3; c++) back.data[i + c] = Math.round(front.data[i + c] * a + back.data[i + c] * (1 - a));
	}
	snapshot(name, back);
}
const standing = { a: newActor(32.5 * TILE, 0, 13), at: 0 };

it("previews the life in the world", () => {
	const wide = { w: 1200, h: 800 };
	// 1. Snow at night over the whole castle, at its fullest and at a spell's thin start; birds by day, three moments of
	// one flight.
	shot("snow-night", wide, 1, { x: 32.5 * TILE }, 23, { ...NO_LIFE, snow: snowAt(20_000, wide, 1, 1) }, standing);
	shot("snow-thin", wide, 1, { x: 32.5 * TILE }, 23, { ...NO_LIFE, snow: snowAt(2_000, wide, 1, 0.33) }, standing);
	for (const [i, t] of [2_000, 8_000, 14_000].entries()) {
		shot(`birds-${i + 1}`, wide, 1, { x: 32.5 * TILE }, 13, { ...NO_LIFE, birds: birdsAt(16_000 * 5 + t, wide, 1, true) }, standing);
	}
	// 2. The workshop's chimney smoking, by day and by night, four moments 0.8 s apart, at scale 3.
	const chimney = { x: (CHIMNEY.x + 0.5) * TILE, y: CHIMNEY.y * TILE + 10 };
	for (let i = 0; i < 4; i++) {
		shot(`smoke-day-${i + 1}`, { w: 480, h: 360 }, 3, chimney, 13, { ...NO_LIFE, smoke: smokeAt(3_000 + i * 800) }, standing);
	}
	shot("smoke-night", { w: 480, h: 360 }, 3, chimney, 23, { ...NO_LIFE, smoke: smokeAt(5_000) }, standing);
	// 3. A block landing in the hall's wall: the pop at 0 and 60 ms, the dust at 100, 250 and 400 ms, at scale 4.
	const hall = CASTLE_BLOCKS.hall;
	const n = hall.findIndex((b) => b.y === 21 && b.tile === "brick");
	const landing = { block: hall[n], at: 0 };
	for (const t of [0, 60, 100, 250, 400]) {
		const life = { ...NO_LIFE, pop: popOf(landing, t), dust: dustAt(landing, t) };
		shot(`landing-${t}ms`, { w: 400, h: 300 }, 4, { x: (landing.block.x + 0.5) * TILE, y: landing.block.y * TILE + 8 }, 13, life, standing, hall.slice(0, n + 1));
	}
	// 4. Him close at scale 4: walking right and left with the scarf trailing (two moments each), and facing with his
	// eyes open and shut.
	const walking = (dir: 1 | -1): Actor => ({ ...pose("walking", 32.5 * TILE, 0), dir });
	for (const dir of [1, -1] as const) {
		for (const t of [0, 160]) shot(`walk-${dir > 0 ? "right" : "left"}-${t}`, { w: 320, h: 240 }, 4, { x: 32.5 * TILE, y: 26 * TILE - 16 }, 13, NO_LIFE, { a: walking(dir), at: t });
	}
	const facing = pose("facing", 32.5 * TILE, 0);
	shot("face-open", { w: 320, h: 240 }, 4, { x: 32.5 * TILE, y: 26 * TILE - 16 }, 13, NO_LIFE, { a: facing, at: 0, blink: false });
	shot("face-blink", { w: 320, h: 240 }, 4, { x: 32.5 * TILE, y: 26 * TILE - 16 }, 13, NO_LIFE, { a: facing, at: 0, blink: true });
	// 5. Everything at once at night, at its cap (dev page's "All life now").
	const all = lifeAt({ wallMs: 20_000, now: 100, view: wide, scale: 1, day: false, night: true, chimney: true, landing: { block: hall[n], at: 0 }, motion: true, force: "all" });
	shot("all-night", wide, 1, { x: 32.5 * TILE }, 23, all, standing);
});
```

- [ ] **Step 5: Run the checks.**
Run: `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`.
Expected: all pass, and the world-40 hash is exactly what Task 9 pinned (this task must not change it: the scene has no life, and his look there has no blink or trail).

- [ ] **Step 6: Commit.** Delete `lib/world/zz-life.test.ts` first.
```bash
git add lib/world/render.ts lib/world/render.test.ts
git commit -m "feat(world): snow, birds, chimney smoke, a landing's pop and dust, his scarf's trail and his blink, drawn" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Report: the preview folder and the PNGs to show Gur (`snow-night.png`, `birds-2.png`, `smoke-day-1.png` to `-4`, `landing-100ms.png`, `walk-right-0.png`, `face-blink.png`, `all-night.png`).


---
### Task 11: The world component: the clock, the landing, the life and the pace
**Model:** Sonnet. **Waits for:** Tasks 2, 3, 6 and 10.
**Files:** Modify `components/osmo/world.tsx`.

**Interfaces:**
- Consumes: `nextLookIn`, `look(..., motion)` (Task 2); `lifeAt`, `lifeWants`, `chimneyLaid`, `Landing` (Task 3); `AMBIENT_MS`, `FRAME_MS`, `SLOW_MS`, `PaceInput.lookIn`, `PaceInput.ambient` (Task 2); `drawSky`'s `tick` and `drawWorld`'s `life` (Tasks 9 and 10).
- Produces: `WorldFixed.life?: "all" | "none"` (Task 12's row). Nothing else outside the file changes.

What the loop now does each frame: it computes the life (`lifeAt` with the wall clock, the loop's clock, the view, the zoom, full daylight, `dark >= 0.5`, whether the workshop's chimney cap is laid, the last landing, `!reduced`, and the dev page's force), draws it, and schedules the next tick with `lookIn: nextLookIn(actor, now, !reduced)` and `ambient` from `lifeWants` (`FRAME_MS` for a landing, `AMBIENT_MS` for snow, smoke and birds). When a block is laid it keeps `{ block, at }` as the landing. The sky is redrawn on each slow tick while stars are out, with `tick` for the twinkle (none under reduced motion).

There is no unit test for the component (vitest runs `lib/**` in node); the behaviour is pinned by Tasks 2, 3, 9 and 10, and checked by hand in Task 12 and the gate.

- [ ] **Step 1: Apply the edits.**
- [ ] **W1** `components/osmo/world.tsx`. Find:
```tsx
import { facingViewer, look, newActor, pose, step, type Actor, type ActorEvent, type ActorKind, type ActorWorld } from "@/lib/world/actor";
```
Replace with:
```tsx
import { facingViewer, look, newActor, nextLookIn, pose, step, type Actor, type ActorEvent, type ActorKind, type ActorWorld } from "@/lib/world/actor";
```
- [ ] **W2** `components/osmo/world.tsx`. Find:
```tsx
import { FRAME_MS, nextTickIn, shouldDraw, type DrawKey } from "@/lib/world/pace";
```
Replace with:
```tsx
import { chimneyLaid, lifeAt, lifeWants, type Landing } from "@/lib/world/life";
import { AMBIENT_MS, FRAME_MS, nextTickIn, shouldDraw, SLOW_MS, type DrawKey } from "@/lib/world/pace";
```
- [ ] **W3** `components/osmo/world.tsx`. Find:
```tsx
// The dev page's pins: the hour, each room's laid blocks (a room left out is locked), his pose, and the hit areas drawn.
export type WorldFixed = { hour?: number; rooms?: Partial<Record<CastleRoom, number>>; pose?: ActorKind; hits?: boolean };
```
Replace with:
```tsx
// The dev page's pins: the hour, each room's laid blocks (a room left out is locked), his pose, the hit areas drawn,
// and the life in the world (polish pass: "all" keeps snow, smoke and birds going whatever the hour, "none" stops them).
export type WorldFixed = { hour?: number; rooms?: Partial<Record<CastleRoom, number>>; pose?: ActorKind; hits?: boolean; life?: "all" | "none" };
```
- [ ] **W4** `components/osmo/world.tsx`. Find:
```tsx
	let news: VillageNews[] = [];
	let hitKey = "";
```
Replace with:
```tsx
	let news: VillageNews[] = [];
	let landing: Landing | null = null; // the block laid last and when: its pop and its dust (life.ts)
	let hitKey = "";
```
- [ ] **W5** `components/osmo/world.tsx`. Find:
```tsx
	const onLaid = () => {
		if (!village || pinned()) return;
		const r = layNext(village, iso());
```
Replace with:
```tsx
	const onLaid = () => {
		if (!village || pinned()) return;
		const laidNow = nextBlock(village);
		if (laidNow) landing = { block: laidNow, at: clock() };
		const r = layNext(village, iso());
```
- [ ] **W6** `components/osmo/world.tsx`. Find:
```tsx
	// The sky changes slowly: redrawn when the size, the mood colours or the five-minute slot changes.
	const paintSky = (hour: number) => {
		const { colorA, colorB } = live.current;
		const key = `${view.w}x${view.h}|${colorA}|${colorB}|${Math.floor(hour * 12)}`;
		if (key === skyKey) return;
		skyKey = key;
		drawSky(skyPainter, { sky: skyAt(colorA, colorB, hour), stars });
```
Replace with:
```tsx
	// The sky changes slowly: redrawn when the size, the mood colours or the five-minute slot changes, and while the
	// stars are out, on each slow tick for the ones that twinkle (none under reduced motion).
	const paintSky = (hour: number) => {
		const { colorA, colorB } = live.current;
		const sky = skyAt(colorA, colorB, hour);
		const tick = !reduced && sky.stars > 0 ? Math.floor(Date.now() / SLOW_MS) : undefined;
		const key = `${view.w}x${view.h}|${colorA}|${colorB}|${Math.floor(hour * 12)}|${tick ?? ""}`;
		if (key === skyKey) return;
		skyKey = key;
		drawSky(skyPainter, { sky, stars, tick });
```
- [ ] **W7** `components/osmo/world.tsx`. Find:
```tsx
		if (shouldDraw(reduced, drawn, key)) {
			drawn = key;
			const face = bearing(live.current.agent, Date.now(), hour).face;
			const sky = skyAt(live.current.colorA, live.current.colorB, hour);
			drawWorld(painter, {
				camera, view, now, clock: now, ground, laid: v ? laidBlocks(v) : [], ghost: v ? nextBlock(v) : null, outline: v ? outlineBlocks(v) : [],
				him: { x: actor.x, look: look(actor, now, face) }, sky, dark,
			});
```
Replace with:
```tsx
		// The life in the world this frame (polish pass, life.ts): none under reduced motion.
		const laid = v ? laidBlocks(v) : [];
		const life = lifeAt({
			wallMs: Date.now(), now, view, scale: zoomAt(camera, now), day: daylight(hour) >= 1, night: dark >= 0.5, chimney: chimneyLaid(laid),
			landing, motion: !reduced, force: live.current.fixed?.life,
		});
		if (shouldDraw(reduced, drawn, key)) {
			drawn = key;
			const face = bearing(live.current.agent, Date.now(), hour).face;
			const sky = skyAt(live.current.colorA, live.current.colorB, hour);
			drawWorld(painter, {
				camera, view, now, clock: now, ground, laid, ghost: v ? nextBlock(v) : null, outline: v ? outlineBlocks(v) : [],
				him: { x: actor.x, look: look(actor, now, face, !reduced) }, sky, dark, life,
			});
```
- [ ] **W8** `components/osmo/world.tsx`. Find:
```tsx
		schedule(nextTickIn({ actor, now, easing: moving, hasWork: workBlock() !== null && place() === "yard", reducedMotion: reduced }));
```
Replace with:
```tsx
		const wants = lifeWants(life);
		schedule(
			nextTickIn({
				actor, now, easing: moving, hasWork: workBlock() !== null && place() === "yard", reducedMotion: reduced,
				lookIn: nextLookIn(actor, now, !reduced), ambient: wants === "frames" ? FRAME_MS : wants === "ambient" ? AMBIENT_MS : null,
			}),
		);
```
- [ ] **W9** `components/osmo/world.tsx`. Find:
```tsx
		const v = shown();
		const laid = v ? laidCount(v) : 0;
		const key: DrawKey = { laid, kind: actor.kind, phase: phaseOf(hour), zoom: zoomAt(camera, now), tx: Math.floor(actor.x / TILE) };
```
Replace with:
```tsx
		const v = shown();
		const key: DrawKey = { laid: v ? laidCount(v) : 0, kind: actor.kind, phase: phaseOf(hour), zoom: zoomAt(camera, now), tx: Math.floor(actor.x / TILE) };
```
- [ ] **W10** `components/osmo/world.tsx`. Find:
```tsx
	}, [fixed?.hour, pins, fixed?.pose, fixed?.hits, colorA, colorB, at, hits, panelOpen, lines]);
```
Replace with:
```tsx
	}, [fixed?.hour, pins, fixed?.pose, fixed?.hits, fixed?.life, colorA, colorB, at, hits, panelOpen, lines]);
```

- [ ] **Step 2: Run the checks.**
Run: `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run`.
Expected: all pass.

- [ ] **Step 3: Say what to look at.** The dev server and the browser preview are the main agent's; list these for it to check on `/dev/world` in the gate (and check any you can reach yourself): Live by day: he builds, and each block pops with a little dust; he breathes when he stands; Message: he turns (the zoom eases in, no steps), blinks every few seconds while facing you, and the camera glides back when he turns to work; Night: stars twinkle, snow falls (in a spell, or with Task 12's "All life now" once it lands), windows, bookcases and dome glow, pools of light at the doors; the workshop smokes once its chimney is built. With prefers-reduced-motion emulated: none of the life, no blink, the zoom and glide jump. Hide the tab (switch tabs) and come back: nothing jumps or piles up.

- [ ] **Step 4: Commit.**
```bash
git add components/osmo/world.tsx
git commit -m "feat(world): the loop draws the life, keeps the last landing, wakes for breaths and blinks and keeps the life's pace" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---
### Task 12: `/dev/world`: the life row
**Model:** Sonnet. **Waits for:** Task 11.
**Files:** Modify `app/dev/world/page.tsx`.

**Interfaces:**
- Consumes: `WorldFixed.life` (Task 11).
- Produces: a toolbar row "Life by the clock", "All life now", "No life", and the note brought up to date. The page still returns 404 in production (its first line is unchanged).

- [ ] **Step 1: Apply the edits.**
- [ ] **D1** `app/dev/world/page.tsx`. Find:
```tsx
// A dev-only view of the village: every state he can be in, every hour of the sky, each room locked or at 0, 50 and
// 100 percent (the faint outlines show at 0 and 50), the castle building live, the room hit areas, walking to each
// panel's room, each mood, and the phone camera. Nothing is read or saved. Not served in production.
```
Replace with:
```tsx
// A dev-only view of the village: every state he can be in, every hour of the sky, each room locked or at 0, 50 and
// 100 percent (the faint outlines show at 0 and 50), the castle building live, the room hit areas, walking to each
// panel's room, each mood, the phone camera, and (polish pass) the life in the world: snow, smoke and birds by the
// clock, all of it now, or none. Nothing is read or saved. Not served in production.
```
- [ ] **D2** `app/dev/world/page.tsx`. Find:
```tsx
const SAID = "Good evening, Gur. I have laid the east wall of the hall.";
```
Replace with:
```tsx
const SAID = "Good evening, Gur. I have laid the east wall of the hall.";
type LifeMode = "clock" | "all" | "none";
const LIFE: { label: string; mode: LifeMode }[] = [
	{ label: "Life by the clock", mode: "clock" },
	{ label: "All life now", mode: "all" },
	{ label: "No life", mode: "none" },
];
```
- [ ] **D3** `app/dev/world/page.tsx`. Find:
```tsx
	const [lines, setLines] = useState(0);
```
Replace with:
```tsx
	const [lines, setLines] = useState(0);
	const [life, setLife] = useState<LifeMode>("clock");
```
- [ ] **D4** `app/dev/world/page.tsx`. Find:
```tsx
			fixed={{ hour: hour ?? undefined, rooms: pins ? roomsFrom(pins) : undefined, pose: poseKind === "live" ? undefined : poseKind, hits }}
```
Replace with:
```tsx
			fixed={{
				hour: hour ?? undefined, rooms: pins ? roomsFrom(pins) : undefined, pose: poseKind === "live" ? undefined : poseKind, hits,
				life: life === "clock" ? undefined : life,
			}}
```
- [ ] **D5** `app/dev/world/page.tsx`. Find:
```tsx
					{button("Phone", phone, () => setPhone((v) => !v))}
				</div>
```
Replace with:
```tsx
					{button("Phone", phone, () => setPhone((v) => !v))}
				</div>
				<div className={dev.toolbar}>{LIFE.map((l) => button(l.label, life === l.mode, () => setLife(l.mode)))}</div>
```
- [ ] **D6** `app/dev/world/page.tsx`. Find:
```tsx
					prefers-reduced-motion in devtools for still frames. The world is drawn at pixel scale 1 from 900 px wide and 2 below;
					the Phone box (375 by 700) shows scale 2, coming in to 3 and 4 when he turns.
```
Replace with:
```tsx
					prefers-reduced-motion in devtools for still frames (no life, no blinks). The world is drawn at pixel scale 1 from 900
					px wide and 2 below; the Phone box (375 by 700) shows scale 2, easing in to 4 when he turns. Life by the clock: snow
					at night in spells (45 s in every two minutes), smoke from the chimney of the workshop once it is built (9 s in every 30),
					a flight of birds by day about every 80 s; All life now keeps them all going; with Message he faces you, breathes and
					blinks every 3 to 6 s.
```

- [ ] **Step 2: Run the checks.**
Run: `npx tsc --noEmit -p .`, `npm run lint` (JSX text must not hold a bare apostrophe: the note avoids them), `npx vitest run`.
Expected: all pass.

- [ ] **Step 3: Say what to look at.** For the main agent's check on `/dev/world` in the gate: Night with "All life now" shows snow, smoke (with the workshop built: the "Whole castle" preset) and birds; "No life" stops them; "Life by the clock" follows the spells.

- [ ] **Step 4: Commit.**
```bash
git add app/dev/world/page.tsx
git commit -m "feat(world): /dev/world shows the life by the clock, all at once, or none" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---
### Task 13: The gate
**Model:** the main agent (it owns the dev server, the preview tools, the brain desk and pushes).

- [ ] **Step 1: The whole branch.** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`; `npx next build --webpack` with both switches unset, then with `NEXT_PUBLIC_OSMO_SHELL2=on` and `NEXT_PUBLIC_OSMO_WORLD=on` set for that command only. `git status` lists no `zz-*.test.ts`. Every commit ends with the Fable co-author line. `git diff 68350b7 --stat -- app/assistant.tsx lib/world/blueprints docs/migrations` is empty.
- [ ] **Step 2: The art, with Gur.** Show Gur the PNGs Tasks 4, 7, 8, 9 and 10 listed. His word decides; a "not yet" goes back to that task's agent with his words.
- [ ] **Step 3: `/dev/world`.** The checks Tasks 5, 11 and 12 listed: the subtitle and the halo; Live (the pop and dust, breathing, the eased zoom, the blink, the glide back); Night (twinkle, snow, lit glass, pools, smoke); the life row; reduced motion; hiding the tab and coming back.
- [ ] **Step 3b: The room, both switches on** (the dev server with both set for it), at 1200 by 800, 1920 by 1080 and a 375 by 812 phone:
  - The glass band sits behind the column and the composer, the world shows through blurred, its sides fade; the rooms behind the empty column are still clickable (phase 2's B2); the log still scrolls by wheel, scrollbar and touch.
  - His line over his head reads in the room's type over sky, snow and castle, by day and at night; Gur's heard line under it.
  - A panel (Library, Settings) slides in its whole width on the rail's curve; with reduced motion it fades.
  - The sun has its halo by day and none when it is down.
  - The zoom eases in and out with no steps when he turns; the camera glides back; the room's buttons follow the castle while it eases (no button left behind).
- [ ] **Step 4: Battery, with the Performance panel.** At night on the Talk page with nothing to build: between snow spells the loop ticks every 3 s; in a spell about 15 a second; never more than 30; nothing while the tab is hidden. By day with nothing to build: a wake-up only for his breaths and blinks (a few a second at most while facing).
- [ ] **Step 5: Reduced motion** (emulated): no snow, smoke, birds, dust, pop, blink, breath or twinkle; the zoom and glide jump; still frames as before.
- [ ] **Step 6: Switches off.** With either switch off the room is exactly as at `68350b7` (look at the room and a panel: no band, no slide change, the heart in the middle).
- [ ] **Step 7: The brain.** Update `brain/desks/main.md` (Now and Just landed: the commits, the hash re-pins, that `app/assistant.tsx` was not touched), commit it by path with the main agent's co-author line, and push the brain. Ask Gur before pushing `main`.

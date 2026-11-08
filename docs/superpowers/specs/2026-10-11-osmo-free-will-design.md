# Osmo's free will, the big world and the build grammar: design

**Status:** approved section by section by Gur on 2026-10-11; this written spec awaits his review. Owner: Language (the world lane since 2026-10-11, handoff `brain/handoffs/2026-10-11-osmo-free-will.md`). Builds on the village spec (`2026-10-09-osmo-village-design.md`, phases 1 and 2 and the polish pass, all live behind `NEXT_PUBLIC_OSMO_WORLD`); this project replaces that spec's phase 3.

## 1. What Gur asked for

His words (2026-10-11): "can we give osmo like free will and maybe make it so i can zoom out into the world and in and its like he has much more land to build with whatever he wants we give him like 100 of terrarias style builds aka 2d that he learns from and chooses what he wants".

Agreed with main the same day ("looks good"): a much larger world of several islands that Gur can zoom and pan; Osmo decides on his own what to build, where and when, from a wide vocabulary of 2D builds in a Terraria-like style; the vocabulary is a grammar of parts with seed recipes, his own builds become recipes, and he leans toward what he has used; code plans, the model picks one of three candidates and says why; mood feeds the choice. No Terraria builds or art: style reference only, all art ours.

Gur's answers while brainstorming (2026-10-11):
1. **Phases ship world first:** (1) the big world and the camera, (2) parts, recipes and builds with code choosing, (3) his will with the model's pick.
2. **While Gur is away, Osmo catches up on return** (no server work while the app is closed).
3. **Travel: a balloon first, then rope bridges** he chooses to build.
4. **His choices show only as a bubble in the world** above him. No conversation mention, no tap-a-build card, no journal page. The reason is still saved with each build.
5. **The world fills in about three months:** a daily work budget of about one medium build (150 blocks), whether Gur is there or not.

**Success:** Gur opens Osmo after a few days and finds things he did not ask for, in places Osmo chose, and sees why in a bubble when Osmo starts each one. He can zoom out to the whole world and back to Osmo in one gesture. Nothing in the world is copied from another game. With the switches off, the room is exactly today's village.

## 2. What carries over (binding)

- **Art:** every picture is a letter grid in code (`readonly string[]`, "." transparent); tiles 16x16, Osmo's frames 16x32. The tile list is append-only (71 tiles today), and the optional `public/village/tiles.png` override must match the sheet's size exactly. Kenney Tiny Town (CC0) stays allowed and credited in `lib/world/tiles.ts`. No Terraria assets, no traced or copied community builds.
- **Pixels:** whole-number scales at rest, nearest-neighbour; light from the top left; the per-cell variants (`variantOf`, `keepRing`) and lit variants (`litOf`) apply to every new part.
- **Pace of the page:** 30 fps cap, 15 fps for ambient particles, a 3 s idle tick, nothing while the tab is hidden. Under reduced motion: still frames, no particles, the camera jumps.
- **The model never writes a building and never moves him.** It only picks one of three code-made candidates and writes one line.
- **Register:** his lines use full forms, no exclamation marks, no slang, no emoji, and he never says he will remember.
- **He never teleports:** he walks, or rides the balloon.
- **Files:** ASCII, no BOM. No new npm dependency. The world loads after first paint through `next/dynamic`.
- **Lanes:** migrations are SQL files under `docs/migrations/` with an Ask to main; main applies them with Gur's OK and pushes `main` with Gur's OK. Main keeps the room's parts of `app/assistant.tsx` and the shell.

## 3. Phase 1: the big world and the camera

Switch: `NEXT_PUBLIC_OSMO_BIGWORLD=on`, read only inside `WORLD` (`lib/shell/flag.ts`). Off means today's 64-tile village exactly.

### 3.1 The world

- **Size:** 1,024 tiles wide and 160 tiles tall (16,384 by 2,560 world pixels).
- **Islands float in the sky,** in the style of today's island: a flat top (snow and turf), a rock body that narrows downward, hanging roots and stones.
- **The home island is today's island, unchanged,** with the castle, placed by a fixed offset: its left edge at tile 448 and its ground row at tile 86 (generator version 1). Every existing blueprint coordinate shifts by that offset; nothing else about it changes.
- **Three new islands to start,** generated from a seed: 80 to 200 tiles wide, their ground rows 12 to 30 tiles above or below home, 20 to 60 tiles of sky between neighbours. Tops are flat runs joined by steps of one or two tiles, so he can walk them and builds have level sites. Scenery (trees, rocks) is placed by the generator and may later be covered by builds, as today's rule allows.
- **A fifth island rises** at the far edge when the islands present are about 80% built (by usable surface). Generator version 1 places up to eight islands in total.
- **The generator is pure and versioned:** `generateWorld(seed, gen)` uses the hash-based noise already in `lib/world` (no `Math.random`). The saved world is the seed, the version and the number of islands risen (section 6.1). A new generator version never changes an existing world: the version is saved with it.
- **The decorative far islands** (`FAR_ISLANDS`) move behind the real world as distant backdrop; the hills stay.

### 3.2 The camera

- **Zoom steps:** 4, 3, 2, 1, 1/2, 1/4 and 1/8 screen pixels per world pixel, then one last step, "the whole world", which fits the world's width to the screen (about 1/9 on a 1920-pixel screen, about 1/44 on a phone). The camera rests only on a step and eases between steps (today's 400 ms ease).
- **Laptop:** the wheel or a trackpad pinch zooms toward the pointer; dragging the world pans; keyboard on the focused world region: `+` and `-` zoom, the arrow keys pan, `Home` goes back to Osmo.
- **Phone:** pinch to zoom, one-finger drag to pan, anywhere outside the conversation.
- **The conversation wins:** a wheel or drag that starts on the conversation column scrolls it, as today; only gestures that start on the world move the camera. The world region is focusable (`tabIndex 0`, label "Osmo's world").
- **Home:** a "Back to Osmo" button appears while he is off screen. Tapping him, pressing `Home` or sending a message glides the camera back (today's 500 ms glide) and restores following. While Gur pans or zooms, following stops.
- **Clamps:** the camera stays within the world's bounds on both axes; zooming out past the world shows sky around it.
- **The room buttons** (the castle's hit areas) move with the camera and hide below scale 1.
- **Reduced motion:** zoom and pan jump to their target.

### 3.3 Drawing at every zoom

- **Scale 1 and nearer:** tiles are stamped as today, but only for the chunks on screen. The world is cut into chunks of 32 by 32 tiles; nothing off screen is iterated.
- **Scales 1/2 and 1/4:** each visible chunk is drawn once into a bitmap at scale 1 (512 by 512 pixels) and drawn scaled down. A chunk is redrawn when a block lands in it, when the lit threshold is crossed, or at a darkness step. Bitmaps live in a small cache (at most 48 on a desktop, 16 on a phone) and are released on eviction.
- **Scale 1/8 and the whole-world step:** one silhouette bitmap of the whole world at one pixel per tile, toned from the sky as today's far islands are; finished builds show as small lights at night; Osmo is a small bright mark so he can be found. His sprite and particles are not drawn below scale 1/2.
- **Retina:** the canvas backing store uses `devicePixelRatio` (today it does not), so far views are sharp.
- **Budgets:** a 1920 by 1080 frame costs at most 8 ms at every zoom step, and each step has a draw-call budget test (today only one scene has one, 1,800 calls).
- **Input frames:** while Gur drags or pinches, frames are driven by `requestAnimationFrame` at the display's rate; otherwise the existing 33/66 ms and 3 s pacing applies.

### 3.4 Osmo in the big world

- **He gains a height and an island:** `Actor` keeps x and adds the island he is on; his y follows that island's surface (steps included). The single `GROUND_Y` assumption is replaced by a surface function in the six files that use it.
- **Phase 1 keeps him on the home island:** nothing on other islands needs him yet. The balloon (section 4.6) arrives in phase 2.

## 4. Phase 2: parts, recipes and builds (code chooses)

Switch: `NEXT_PUBLIC_OSMO_BUILDS=on`, read only inside `BIGWORLD`.

### 4.1 Parts

About 40 parts, each a small letter grid with named joints (where it sits on the ground, where a roof or a wing attaches, where decor hangs):

| Group | Parts |
|---|---|
| Structure | wall bays (repeatable, in wood, stone and brick), floors, back walls, doors, windows, shutters |
| Tops | gabled, flat, domed and spired roofs; tower shafts and crowns; chimneys |
| Additions | arches, balconies, stairs, banners, lanterns, bells, signs |
| Around | garden beds, hedges, fences, trees, ponds, wells, statues, benches, paths |
| Travel | rope-bridge spans and anchors, the balloon dock |

A back wall is the Terraria-style wall behind a room's interior, which makes a building read as having rooms; it is a layer drawn before walls.

### 4.2 Recipes

- **A recipe is a short rule set,** for example: a base 5 to 9 bays wide; 1 to 3 storeys; a roof from a list; up to two additions; a garden or a fence around it; materials from a list.
- **The compiler** turns a recipe, its chosen variation, a site and a seed into a footprint (map, decor, legend: the same shape as today's blueprints) and then into `Block[]`, laid in today's order (layer, then bottom row first, then left to right).
- **Twenty seed recipes:** cottage, tower, lantern walk, garden, well, rope bridge, windmill, bell tower, greenhouse, market stall, shrine, pond with dock, watchtower, stone stair, arch gate, statue, small lighthouse, workshop shed, belvedere, orchard. Forty parts across twenty recipes with their variations give several hundred distinct builds, the "hundred builds" Gur asked for.
- **The castle's six rooms are fixed recipes** (`castle:hall`, `castle:library` and so on), their footprints taken from today's blueprints unchanged. They stay the places behind the panels.
- **His own recipes:** every finished build is also kept as a recipe of his own: the recipe it came from plus the variation he chose. The planner may offer a variation of one ("another cottage like the one by the east cliff, with a tower").

### 4.3 The rules every build passes

Checked by the compiler and by tests over every recipe with 50 seeds:
- no block in mid-air: every block rests on ground, on a block below or beside it, or (bridges only) hangs between two anchors on island edges;
- one door, on the floor;
- decor hangs on the build's own walls;
- the build fits its site and overlaps no other build and no other island;
- at most 24 tiles tall, and within the world's bounds.

### 4.4 Learning

- **Weights, not storage:** each visit, the planner reads the finished builds and counts their recipes, parts and materials; each use adds weight.
- **Variety:** a part not used in the last five builds gets a small bonus, so he does not repeat himself.
- Nothing about taste is stored apart from the builds themselves (section 6.2).

### 4.5 Art

- Reuse today's 71 tiles where they fit.
- About 30 new tiles, drawn by hand as letter grids and judged by eye on `/dev/world`: planks, back walls, rope, bridge boards, leaves and hedge, water, flowers, glass, balloon cloth and basket, among others.
- **The palette grows** past single letters to other printable ASCII characters (about 35 more colours). `raster` and its tests accept them; letters already in use keep their colours.
- The tile atlas grows by appending only; the `tiles.png` override size follows.

### 4.6 Travel

- **The balloon dock** is part of the home island from phase 2 on (a fixed build, not chosen). The balloon carries him to any island he has no bridge to: a gentle arc at about 12 tiles a second, the camera following.
- **Rope bridges are recipes** he can choose when two islands face each other within 60 tiles. Once a bridge is finished, he walks across.

### 4.7 The work budget and catching up

- **Budget:** about 150 blocks a day accrue continuously (about 6 an hour), up to a cap of three days (450 blocks).
- **While Gur is there:** Osmo spends what has accrued at today's rhythm (one block every 3 seconds). When it runs dry he rests, walks his islands, sits by his builds or tends a garden, and lays a block whenever one accrues.
- **On return:** of the blocks accrued while Gur was away, all but 40 are laid as a time-lapse of about 10 seconds: the camera visits each site and blocks pop in quickly; the last 40 he builds live, so he is at work when Gur arrives. Under reduced motion the time-lapse is one redraw.
- **Night:** he rests at night unless Gur is present, as today; the budget still accrues.
- **The castle comes first and is outside the budget:** an unlocked, unfinished castle room is built before any free build, at today's pace while Gur is present, exactly as today. This keeps the rooms appearing as Gur's use of Osmo grows. (Spec ruling; Gur can change it.)

### 4.8 The planner (code)

- **When:** a decision is due when no build is in progress, budget has accrued, and the conversation has been quiet for two minutes. At most four decisions a day. On return, each missed decision is made, at most three.
- **Where:** candidate sites in order: free level land on the island he is on, near his last build; then the nearest island with room (by balloon or bridge). Some recipes need particular sites: lighthouses and watchtowers at cliff edges, gardens beside a house, bridges between facing island edges.
- **What:** three candidates, each a recipe (or one of his own) with a variation and a site, deliberately different:
  1. **one he leans toward** (the highest weight);
  2. **one that fits his mood** (section 5.3);
  3. **one new to him** (a recipe or part he has not used).

  Each is compiled and checked against the rules before it is offered; a candidate that fails is replaced.
- **Phase 2 picks by code:** the weighted choice, seeded so two tabs choose the same, and a line from the fallback set (section 5.4).

### 4.9 Clear the world

The Settings "Clear the village" becomes "Clear the world": every build is deleted and the islands stay. The castle starts again from the hall.

### 4.10 The dev page

`/dev/world` gains: zoom and pan; a frame timer; the recipe preview (pick a recipe and a seed, see the build and its rule checks); the time-lapse; a planner panel (see the three candidates for a chosen mood).

## 5. Phase 3: his will (the model picks)

Switch: `OSMO_WILL=on` on the server, with `OSMO_CHAT=on`. Off means phase 2's code pick.

### 5.1 The route

- `POST /api/will` (language: `app/api/will/route.ts`, logic in `lib/chat/will.ts`). Same auth as `/api/chat`: bearer token, owner only (`OSMO_OWNER_ID`), 401 or 403 otherwise. Off answers `{ source: "fallback", reason: "off" }`.
- **Body:** `{ candidates: [three of { name, place, size, parts, fresh }], mood, recent }`.
  - `name`: the recipe's plain name, up to 60 characters;
  - `place`: where, in words ("on the east island, by the cliff"), up to 80;
  - `size`: "small", "medium" or "large";
  - `parts`: up to five plain part names, each up to 30;
  - `fresh`: true when the recipe or a part is new to him;
  - `mood`: `moodWords` of his mood, up to 200;
  - `recent`: his last three builds as `{ name, reason }`, each up to 140.

  Anything outside these limits is a 400. Nothing personal of Gur's is sent.
- **Ledger:** the call books and settles in `ai_calls` through the same reserve-call-settle helper `/api/chat` uses (`spend`, in `lib/chat/handler.ts`), inside the same daily share.

### 5.2 The call

- **Model:** the conversation's main model (`gpt-5.4-mini`), strict JSON: `{ pick: 0 | 1 | 2, line: string }`, no reasoning effort, low verbosity, a small output cap (80 tokens).
- **Instructions:** his character block (`CHARACTER`), his mood in words, his last builds, the three candidates, and the rules: pick the one he most wants now; one line, first person, under 140 characters, his register, about the build and why; never about Gur.
- **The server checks the line** with `speakable` and the length limit; a line that fails, or a crisis flag in it, falls back to code's line (section 5.4) with the model's pick kept.
- **Cost:** about 1,000 tokens a pick (the earlier village probe; re-measured by this project's probe before the switch goes on). That is about 0.16% of the day's usable share (630,000); four picks a day is under 1%.

### 5.3 Mood

The mood candidate (section 4.8) comes from `AgentState.mood` and its newest cause:

| Mood | Leans toward |
|---|---|
| lonely or low | lantern walk, garden, a bench facing home |
| hopeful or happy | tower, bell tower, small lighthouse |
| tired | something small: well, statue, garden bed |
| curious | a recipe or part new to him, or a new island |
| Gur away a long time | something near the hall |

The same mood words go to the model, which may weigh them as it likes.

### 5.4 Without a model

AI off, `OSMO_WILL` off, the allowance spent or any error: code picks by weight and takes a line from a small fixed set in his voice, one per recipe kind ("I wanted somewhere to sit and watch the east island.").

### 5.5 The bubble

When he starts a chosen build, the line floats above him for about 6 seconds, in the existing `.bubble`, and the reason is saved with the build. On return with several catch-up decisions, the bubble shows the newest one's line. Nothing is said in the conversation.

## 6. Saving

All three are migrations main applies with Gur's OK; the code reads a missing table as empty and builds nothing that visit, as the village does.

### 6.1 `world`

One row per owner: `user_id` (primary key, default `auth.uid()`), `seed bigint`, `gen smallint`, `islands smallint` (how many have risen), `budget_at timestamptz` (when the budget was last spent to), `created_at`. Owner-only row-level security; select, insert and update for `authenticated`.

### 6.2 `builds` (replaces `village`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid primary key | default `gen_random_uuid()` |
| `user_id` | uuid | default `auth.uid()`, cascade on delete |
| `recipe` | text | e.g. `cottage`, `castle:hall`; at most 60 characters |
| `params` | jsonb | the chosen variation; at most 2 KB |
| `island` | smallint | |
| `x`, `y` | int | the footprint's top-left tile in world coordinates |
| `footprint` | jsonb | map, decor and legend as compiled; at most 16 KB |
| `total` | int | blocks in the footprint |
| `laid` | int | 0 to `total`; a trigger never moves it backwards |
| `reason` | text | his line, at most 200 characters; null for castle rooms |
| `started_at` | timestamptz | frozen by the trigger |
| `finished_at` | timestamptz | set once, never cleared |

- **The footprint is saved, not recomputed,** so a later change to a part or the compiler never scrambles a half-built build.
- **One unfinished build at a time:** a unique index on `user_id` where `finished_at is null`. If two tabs choose at once, the second insert fails and that tab adopts the first one's build.
- **Owner-only row-level security,** as `village`.

### 6.3 Moving the castle

- The six `village` rows become six `builds` rows (`castle:<room>`, footprint from today's blueprints, `laid` and the times copied), in the same migration.
- The rooms code reads them by recipe name, so the panels behave as today.
- `village` stays read-only for one release, then main drops it (with Gur's OK).

## 7. Switches, in one place

| Switch | Where | Turns on |
|---|---|---|
| `NEXT_PUBLIC_OSMO_BIGWORLD` | Vercel, inside `WORLD` | phase 1: the big world and the camera |
| `NEXT_PUBLIC_OSMO_BUILDS` | Vercel, inside `BIGWORLD` | phase 2: parts, recipes, builds, the code's pick |
| `OSMO_WILL` | Vercel, server | phase 3: the model's pick and his line |

Each is read by its full literal name and is on only when exactly `on`.

## 8. Testing

- **Pure code first:** every module in `lib/world` has its tests (vitest collects `lib/**/*.test.ts`).
- **The generator:** the same seed and version give the same world; islands never overlap; every top is walkable; home sits at its offset.
- **Drawing:** pixel-hash tests at each zoom step; a draw-call budget and a frame-cost check per step; chunk cache eviction releases bitmaps.
- **The camera:** zoom about a point, clamps, home, following suspended while panning, reduced motion.
- **The grammar:** every recipe with 50 seeds compiles and passes every rule; the castle recipes give today's block counts exactly (180, 84, 101, 61, 69, 149).
- **The planner:** sites, three distinct candidates, the mood mapping, the budget and catch-up maths across midnight, a sleeping laptop and a clock change, two tabs choosing at once, one decision at most per due moment.
- **`/api/will`:** the handler with a fake OpenAI (the `/api/chat` rig): limits, auth, off, the ledger rows, a bad line, a crisis flag, the fallback.
- **Hand checks on `/dev/world`:** zoom and pan on a laptop and a phone, the time-lapse, the recipe preview, every new tile by eye.

## 9. Size, cost and effort

- **Bytes:** about 40 to 60 KB more art and grammar data, loaded after first paint as today.
- **Tokens at run time:** about 1,000 a pick, at most four picks a day (section 5.2).
- **Building it:** each phase about 2 to 3 million agent tokens, like the village phases; Sonnet for pure modules, Opus for art and anything judged by eye, no Haiku.

## 10. Lanes

- **Language:** everything above in `lib/world/**`, `components/osmo/world.tsx`, `world.module.css`, `app/dev/world/**`, `app/api/will/**` and `lib/chat/will.ts`.
- **Main:** the migrations (`world`, `builds` with the castle move, dropping `village` later); the Settings "Clear the world" wording if `village-clear.tsx` stays main's; any change to how `app/assistant.tsx` mounts `WorldStage` (none expected: mood already reaches it); pushes.

## 11. Order of work

1. **Phase 1:** the generator and the `world` row; chunks and the levels of detail; the camera and input; Osmo's height. Gate, then main pushes with Gur's OK; Gur turns `NEXT_PUBLIC_OSMO_BIGWORLD` on.
2. **Phase 2:** the palette and the new tiles; parts, recipes, the compiler and the rules; the `builds` table and the castle move; taste, sites and the planner; the budget and the time-lapse; the balloon and bridges; Clear the world; the dev page. Gate, push, `NEXT_PUBLIC_OSMO_BUILDS` on.
3. **Phase 3:** `/api/will` and its probe (Gur's go for the paid calls); the client and the bubble; the fallback lines. Gate, push, `OSMO_WILL` on.

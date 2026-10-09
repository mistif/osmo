# Osmo's village: design

Date: 2026-10-09. Owner: Gur. Lane: main (world, renderer, rail wiring), with one `TurnFacts` field and one context line from the language lane.

## 1. What this is

Osmo becomes a person in the website. The Talk page turns into his world: a floating island under a sky whose sun is his heart, and on it a castle he builds block by block while Gur is there. Each room of the castle is a place where something of his lives (the library holds memory and notes, the workshop the things he made, the study ideas and goals, the gate what arrives, the observatory settings). When Gur speaks, he stops, turns and looks straight out of the screen at Gur, and the view comes in on him. The rooms are the navigation, drawn.

Inspiration is the look of Terraria's built castles and town characters (side view, pixel art, strong glow). All art is our own, authored as pixel data in code; nothing is lifted from any game.

Direction decisions taken with Gur on 2026-10-09:
- He is a small walking figure, not the heart. The heart becomes the sun.
- One Osmo, one conversation: a room sets the subject, it does not open a separate thread.
- No portraits and no outside art. He is one code-authored pixel character, 16 wide by 32 tall (a square 16 by 16 chibi is the alternative if Gur asks for it). The fourth-wall moment is the camera zooming to him and his turn to face the viewer.
- Buildings are blueprints in code, laid from a tileset. The model never writes blueprints and never drives movement.
- Scope is the castle-as-shell, built in three phases that each stand alone.

## 2. The world and how it is drawn

One `<canvas>` fills the Talk page behind the conversation. Pixel scale is 2 (a 16 px tile is 32 px on screen) and 3 on viewports wider than 1400 px; `image-rendering: pixelated`. Layers, back to front:

1. **Sky.** A vertical gradient from the mood theme's two aura colours, shifted by Gur's real clock through dawn, day, dusk and night. Night keeps the mood colours and drops their lightness; stars appear. The clock is the browser's local time.
2. **The sun is his heart.** The heart drawing (`components/osmo/figure.tsx`) moves into the sky at a position set by the hour (rises at 06:00, sets at 20:00; below the horizon it shows as a dim heart low behind the castle). It keeps the shared `--pulse` breathing and the `[data-speaking]` motion: when he speaks, it brightens as the heart does today.
3. **Clouds.** Two layers of pixel clouds drifting at different speeds (parallax), drawn from cloud tiles.
4. **The island.** A floating slab of stone with snow on top and roots below, from the tileset. Width about 48 tiles; the world is 64 tiles wide with sky on both sides.
5. **The castle.** Every block laid so far, stamped from the atlas; the piece in progress shows as a faint outline; a room not yet unlocked is not drawn at all.
6. **Him** and, above his head, the subtitle of what he is saying.

**Tiles** are 16 by 16 grids of palette indices authored in `lib/world/tiles.ts` (about forty: stone, stone-dark, brick, plank, beam, glass, roof-left, roof-right, roof-flat, door, window, lantern, banner, snow, snow-edge, cloud pieces, root, grass). The palette lives in `lib/world/palette.ts` with the light-from-top-left rule written down. The tiles are drawn once to an off-screen atlas canvas at the current scale and stamped from there. An optional `public/village/tiles.png` in the same cell order replaces the atlas if present and the right size; otherwise the console says why and the authored atlas stays.

**Camera.** Follows him with a dead zone, clamps at the world's edges, tighter on a phone (shows 12 tiles across at 375 px). When he turns to face Gur, the camera eases in two scale steps on him over 400 ms and eases back when the conversation rests.

**Redraw rules.** 30 frames a second only while he moves or builds or the camera eases; otherwise a tick every 3 s for clouds and the sky; nothing while the tab is hidden; with `prefers-reduced-motion` a still frame that redraws only when a block lands or the mode changes.

## 3. Him

One sprite, 16 by 32 px, authored as frames in `lib/world/osmo-sprite.ts`: idle 1-2, walk 1-6, kneel-build 1-4, turn 1-3 (profile to facing the viewer), facing idle 1-2, sit 1 (night). The face is a few pixels: two eyes and a mouth line, with three readable variants (looking at you, busy, tired). An optional `public/village/osmo-sheet.png` (17 frames of 16 by 32 in a row, 272 by 32) replaces the authored frames if present and the right size.

**Actor states** (`lib/world/actor.ts`, pure): `idle`, `walking` (to a target tile), `building` (kneeling at the next block; one block per animation loop), `turning`, `facing`, `resting` (night: sits by the lantern; building stops unless Gur is present). He never teleports.

**Events in:** `message` (typed or spoken, or the wake word, or the composer gaining focus), `reply` (he speaks), `rest` (the conversation's follow-up window has closed; the same window the voice machine uses), `tick`, `hour`, `blockLaid`, `visible`/`hidden`.

**What he does on his own.** With the page open and nobody talking, he builds: walk to the next block's position, kneel, lay it, every 3 s. A small hall of about 180 blocks takes about ten minutes of presence. Nothing happens while the tab is closed; on return a line can say what he was working on (section 5).

**When Gur speaks.** He stops mid-block, stands, turns to face the viewer, the camera comes in, and his reply shows above his head with the speech motion on the sun. His pupils look at the viewer while Gur types or holds the mic, and slightly off and back while he speaks. When the conversation rests, the camera eases out and he turns back to the work.

**Mood on him.** Expression variant and walking speed come from the emotion numbers already kept in `AgentState.mood`: high joy or love gives the warm face, fear or sadness in Gur's reading gives the attentive face, his boredom or the late hour gives the tired face and a slower walk. No model calls.

## 4. Building and what is saved

**Blueprints are code.** One file per room in `lib/world/blueprints/`: a tile map and the laying order (floor, walls up, roof, then windows, door, lanterns and banners). Phase 1 ships `island` (pre-built, never laid) and `hall`. Phase 2 adds `library`, `workshop`, `study`, `gate`, `observatory`. A room is a rectangle anchored on the island; the anchors are chosen so the finished castle reads as one building with the hall in the middle, towers at the ends, the observatory highest.

**Unlocking.** The hall starts on day one. The library starts when memory has its first fact or the first note exists. The workshop when the first artifact exists. The study when the first idea or goal exists (phase B of the shell). The gate when the first reminder is set. The observatory when Settings is first opened in the new shell. Rooms are built one at a time in the order they unlock; the rule is pure code in `lib/world/unlock.ts`.

**Saved in Supabase.** Table `village`: `user_id uuid` (owner), `room text`, `laid int` (blocks laid so far), `started_at timestamptz`, `finished_at timestamptz null`, primary key `(user_id, room)`, row-level security owner-only like every other table, `authenticated` granted select, insert, update, delete. Migration `docs/migrations/village-phase-1.sql`, applied by main with Gur's OK before the code that reads it is pushed. He saves every eight blocks and on `hidden`; load is one query per visit. The in-page count is the truth between saves; a save never moves `laid` backwards.

**Reset.** Settings, Observatory page: one line "Clear the village" with a confirm, which deletes the rows; he starts the hall again.

**Lines he says.** A room starting or finishing sets `TurnFacts.village` (`{ room, event: "started" | "finished" }`) on the next turn so the model says it in his own words, the way milestones already work; the fact is marked said in the session so it is said once. With the AI off, a code line in his register: "The hall is finished. I have begun the library." A return after a long absence may mention the room in progress through the existing welcome line, never with guilt.

## 5. Rooms as places and the rail

- The rail stays the map and the keyboard route. Talk is the yard where he stands; Library is the library; Feed is the gate; Ideas and Goals are the study; Search is the observatory's glass; Settings is the observatory.
- Clicking a rail item opens its panel as today and he walks to that room behind it. Clicking a finished room in the world does the same (`pointer` on hover, a focusable hit area for the keyboard). A room not yet built is a faint outline that opens nothing.
- One context line from the language lane while a panel is open: "Gur is in the library with you; in front of you are 14 memories and 3 notes." Counts only, never contents.
- Panels keep their width and slide over the canvas, which keeps drawing at the slow tick behind them. On a phone the panel covers the world and the bar stays.

## 6. Cost, limits and the switch

- **Tokens.** None for drawing, walking, building or expressions. One short field per room start or finish and one context line while in a room: under 0.1% of the daily mini pool.
- **Bytes.** Tiles, frames and blueprints are code, about 25 KB; the canvas component about 10 KB; no new npm dependency. The world module loads after first paint through a dynamic import, so the room appears no later than today.
- **Battery.** The redraw rules in section 2.
- **Switch.** `NEXT_PUBLIC_OSMO_WORLD` (off by default), inside the shell switch: the world only renders when both are on. Off, the heart stays in the middle of the room exactly as today.
- **Accessibility.** The canvas is `aria-hidden`; the subtitle is live text in the DOM as now; rooms have keyboard hit areas with labels; reduced motion gives still frames; the rail's contrast test extends to the sky's lightest hour.

## 7. Phases

- **Phase 1, the world and him:** palette, tiles, atlas, sky and sun, clouds, island, the hall blueprint, the actor machine, block-by-block building, the `village` table and progress, the camera and the fourth-wall turn, speech moved from the heart to him, `/dev/world`. Behind both switches.
- **Phase 2, rooms as places:** five room blueprints, unlock rules, walking to a room on panel open, clicking rooms, the context line, "Clear the village".
- **Phase 3, life:** weather from the connector in the sky, a visitor sprite when a guest talks, lanterns lit at night, a Village page on the rail that shows the whole castle, pieces tied to days.

## 8. Testing

Unit tests for every pure module: the actor machine (every transition, including a message mid-block and `hidden` while walking), blueprint order (floor before walls, each block laid exactly once, counts match), unlock rules, progress (resume at the right block, never beyond the end, never backwards), camera (dead zone, clamps, zoom in and out timings), sky (hour to colours, sun position), tiles (every tile 16 by 16, every index in the palette). The renderer gets one test drawing a known blueprint to an off-screen canvas in jsdom with a hash of the pixels. `/dev/world` shows every actor state, every hour of the sky, every room at 0, 50 and 100 percent, and the phone camera; it returns 404 in production.

## 9. Which Claude model builds it, and the usage

Measured on this project: a Sonnet implementer task on a well-specified brief costs about 100k tokens; a read-only audit about 165k; a plan-writing agent about 150k. Haiku is not used (it broke encoding and git history here twice). The main (Fable) session orchestrating costs roughly 300k per phase on top.

| Work | Model | Why | Estimate |
|---|---|---|---|
| Plan for phase 1 | Opus | task decomposition and interfaces | 150k |
| Palette, tiles, sprite frames (pixel data) | Opus | visual judgement, consistency across forty tiles | 3 tasks, 450k |
| Pure modules: actor, blueprints, unlock, progress, camera, sky | Sonnet | complete specs, tests pin behaviour | 6 tasks, 600k |
| Renderer, canvas component, wiring into the room, `/dev/world` | Sonnet, Opus for the renderer | multi-file, integration | 4 tasks, 500k |
| Reviews (per task, scoped) | Sonnet | small diffs | 14 x 40k, 560k |
| Final branch review | Opus | the catch-all | 150k |
| Main orchestration | Fable | briefs, rulings, migration, push | 300k |
| **Phase 1 total** | | | **about 2.7M tokens** |
| Phase 2 | Sonnet mostly | five blueprints (Opus), rules and wiring | about 1.5M |
| Phase 3 | Sonnet | | about 1.2M |

The cheapest model that can do each job is used; Sonnet does most of it, Opus only the art data, the renderer and the final review.

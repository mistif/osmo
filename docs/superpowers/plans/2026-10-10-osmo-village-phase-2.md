# Osmo's village, phase 2: rooms as places

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `NEXT_PUBLIC_OSMO_SHELL2=on` and `NEXT_PUBLIC_OSMO_WORLD=on`, the castle grows past the hall: five more rooms (library, workshop, study, gate, observatory) unlock from what Gur keeps in Osmo, are built one at a time, show as faint outlines until they are, open their panel when clicked, and Osmo walks to the room whose panel is open. Settings' About page gets "Clear the village". Either switch off: the room is exactly as today.

**Architecture:** Every rule is a pure module in `lib/world/` with a vitest test: the room blueprints and their registry (`blueprints/*.ts`, `castle.ts`), the unlock rules (`unlock.ts`), progress across rooms (`village.ts`), places, routes, hit areas and the context line (`rooms.ts`), and two small extensions to phase 1's actor and renderer (visits, outlines). The network stays in thin readers (`village-data.ts`, `village-counts.ts`). The world component gains a village instead of a hall, DOM buttons over finished rooms, and two events for a clear. The room itself changes in two anchored places (B1, B2).

**Tech Stack:** Next.js 16.4.0 (App Router; `NEXT_PUBLIC_*` inlined at build), React 19.2, TypeScript 5.9 strict, vitest 5 (node environment, `lib/**/*.test.ts` only; `vi.mock` of `../supabase` works for files that import it relatively), Supabase JS, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-09-osmo-village-design.md`, owner-approved and binding: sections 4 (the five blueprints, unlocking, "Clear the village"), 5 (rooms as places and the rail) and 7 (the phase 2 list). Phase 1 is built and pushed (`7bb8ae4`, release 0.2.3); its plan `docs/superpowers/plans/2026-10-09-osmo-village-phase-1.md` holds the 18 rulings this plan builds on. Read the spec, `AGENTS.md`, and your own task before you start.

## Global Constraints
- **Lanes.** Everything in this plan is main's lane (`lib/world/`, `lib/shell/`, `components/osmo/`, `app/dev/`, `app/assistant.module.css`, main's parts of `app/assistant.tsx`). `app/assistant.tsx` is shared with language: Task 13 makes one edit (B1) inside the `<WorldStage>` element only, and never touches `sendText`, `sendMessage`, `sendTextRef`, `onReplyRef`, `deliver`, `turnView` or the chain's helpers. Put `app/assistant.tsx` under Now on `brain/desks/main.md` before editing and under Just landed after; push the desk with `git -C C:/Users/Gurra/GroupProject/brain push origin brain`.
- **Not in this plan (language's lane):** wiring `TurnFacts.village` into a turn, and adding the one context line to a turn while a panel is open. This plan produces what they need (`WorldControl.takeNews()`, `WorldControl.context()`, the pure `roomContext()` and `villageLine()`), and Task 14 posts the Ask with the exact names.
- **Checks for every commit:** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`. The gate also runs `npx next build --webpack` (plain `next build` is blocked on this machine), once with both switches unset and once with both `on` (set for that command only, never written to `.env.local`).
- **Files:** UTF-8 without BOM, ASCII only (no curly quotes, no ellipsis character, no dashes other than `-`). Keep each file's line endings as they are (`app/assistant.tsx` has a few CRLF lines in the working tree; git normalizes to LF on commit).
- **No new npm dependency.** Stage by exact path (`git add <paths>`), never `git add -A` or `git add .`. Never push `main`.
- **Every commit message ends with** the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (pass it as a second `-m`).
- **Osmo's register** in any copy he says or that speaks for him: full forms ("cannot", "I have"), no exclamation marks, no slang, no emoji, and he never says he will remember.
- **Both switches gate everything.** The world renders only when `WORLD` (`lib/shell/flag.ts`) is true; the Settings line shows only when `WORLD` is true. The one thing that runs with the world off is the shell marking that Settings was opened (a per-device localStorage key, harmless and needed so the observatory unlocks later).
- **No model calls.** Nothing in this phase calls a model or spends tokens.
- **No migration.** `docs/migrations/village-phase-1.sql` (applied 2026-10-09) already allows all six room names (`check (room in ('hall', 'library', 'workshop', 'study', 'gate', 'observatory'))`), `laid` up to 10000, and grants `authenticated` select, insert, update and delete with an owner-only `for all` policy. Its trigger guards updates only; "Clear the village" is a delete, so the trigger is not in its way, and a save after a clear inserts a fresh row as on day one.
- **Saved progress.** The hall must not move or change its block count (180): saved rows count blocks. The five new rooms' counts are pinned in `blueprints.test.ts` and must not change once this phase ships.
- **Pixel art** is our own, authored as letter grids in code. Nothing is copied or traced from any game.

## Review Focus (each has a test in the task named)
1. **A clear while something is still saving:** a save already in flight, a second open tab, or a laptop that slept mid-visit must not bring an old count back after "Clear the village". Saves wait out a running clear, the clear waits out a running save, and other tabs hear of it through localStorage (Task 7: "waits for a save already on its way", "starts no save while it clears", "tells the other open tabs"; Task 10's `storage` listener; Task 14's two-tab hand check).
2. **Progress saved by phase 1:** a hall row mid-hall, or finished at 180 with `finished_at` still null (final review M7), must resume at the same block and hand over to the next room by count, not by `finished_at` (Task 2: "stands where it always stood"; Task 6: "picks up the hall where it was", "takes a phase 1 hall row as it is").
3. **Counts that fail or come back odd:** a missing table, a failed reader, NaN, negative, fractional or capped counts must never unlock a room wrongly or print a wrong number; the hall still builds (Task 5: "reads a count that is not a whole number of at least one as none"; Task 8: "reads a bad count as none"; Task 7's reader counts a failure as none).
4. **A deep link or Back/Forward straight into a panel** (`#settings/about`, `#library/things`) on load, or a panel opened before the village's read answers: he heads for that room from the first frame, the observatory unlocks on a Settings deep link, and nothing throws while the village is still null (Task 8: "puts each panel in its room" with page and item routes; Task 10 reads the place every frame and passes it to the read; Task 14 hand check).
5. **Rooms off screen, and the conversation over the castle:** on a phone, or with a room scrolled out of view, its button is hidden so the keyboard never lands on something unseen; with the log showing, the conversation still scrolls and its text can be selected while empty parts of the column let clicks through to the rooms (Task 8: "marks a room out of view as unseen"; Task 13's B2 and Task 14's hand check).

## Verified before planning (reading the tree at `6f5672f`, local main, one docs commit ahead of the pushed `7bb8ae4`)
- `lib/world/blueprints/types.ts`: `TILE 16`, `WORLD_W 64`, `WORLD_H 40`, `GROUND_Y 26`, `RoomId = "island" | "hall"`, `Blueprint = { room, x, y, map, decor, legend }`; `blocksOf` (in `index.ts`) sorts by layer, then bottom row first, then left to right. `ISLAND_LEFT 3`, `ISLAND_RIGHT 60`, `standX` clamps to x 4..59. `REST_X` was the bench at x 47, which the workshop now covers.
- The hall is 19 by 15 at x 23, y 11; its step row runs x 24..40, its walls x 25..39, door x 32, lanterns x 31 and 33 at y 23; 180 blocks, layer counts `[0, 17, 99, 52, 4, 2, 2, 4]`. Its columns x 24 and x 40 are empty above the step: the wings use them.
- The island's scenery (look pass): pines, bushes, tufts, a sign, a fence on x 5..18 and x 42..59, rising at most 5 rows (to y 21); the bench x 47, lantern post and lantern x 49. Every one of these, except the bench and the lantern post, sits behind a solid cell of a room in the layout below (the test proves it).
- `lib/world/camera.ts`: `TALLEST_TILES = GROUND_Y - min(HALL.y, ISLAND.y) = 15`, `SKY_TILES 2`; `baseZoom(375, 608)` is 2 because the hall plus two tiles of sky fits; raising `TALLEST_TILES` for a taller room would drop that phone to scale 1 and break the look pass's tests. So no room may rise above y 9 (`GROUND_Y - TALLEST_TILES - SKY_TILES`).
- `lib/world/tiles.ts`: 55 tiles (38 + the look pass's 17); `glass` is the lit pane since the art pass (unused). `lib/world/render.ts`: `GHOST_ALPHA 0.3`, `LIGHTS` for `lantern` and `window-lit`; the hashed scene (`d498b675`) sees world x 432..592 only, so island changes outside that strip leave it alone.
- `lib/world/progress.ts`: `resume`, `lay`, `needsSave`, `markSaved`, `saveRow`, `villageLine`; `resume` sets `saved = laid`, so a finished hall whose last save failed never writes `finished_at` (review M7).
- `lib/world/village-data.ts` imports `@/lib/supabase`; vitest has no `@/` alias, so it must import `../supabase` to be testable (the same module; `lib/agent/agent-state.ts` does this and its test mocks `../supabase`).
- `lib/shell/route.ts`: `SHIPPED_PANELS = ["library", "feed", "settings"]`, `LIBRARY_FILTERS` include `"things"`, Settings pages `devices, voice, may-do, place, about`. `lib/shell/rail.ts` `createSeenStore(storage, now)` keeps `osmo-seen-<id>` keys; its `get` starts a baseline on first read, so a "has it ever been opened" check needs a read that does not (`peek`). `components/osmo/use-rail-dots.ts` holds the store and a private `safeLocalStorage()`.
- `lib/shell/data.ts` readers: `readMemoryDates()` (all `memory_facts` keys), `readNotes()` (up to 100), `readThings()` (up to 200 versions; the panel shows `latestOfChains`), `readReminders()` (pending, sent, missed, up to 100). It imports `@/lib/supabase`, so the counts reader that uses it is not unit-tested.
- `components/osmo/settings-pages.tsx`: the About page (`page === "about"`, the last branch of `SettingsPage`) holds the version, "Who I am" and "Our story". That is the observatory's page for "Clear the village".
- `components/osmo/world.tsx`: the world root is the stage's first child with `z-index: -1`; its canvases have `pointer-events: none`. In the room, `main.column` (max 40rem, full height) lies over the middle of the castle, and its `.log` is `flex: 1`, so without B2 no click reaches the wings.
- **Dry run of this plan** (an isolated scratch copy of `6f5672f`, not the shared tree, with stub art for the six new tiles): every test in Tasks 2 and 5 to 9 and the edited phase 1 tests pass (144 files, 2274 tests); `npx tsc --noEmit -p .` (after `npx next typegen`) and `npm run lint` are clean with Tasks 10 to 13 applied; `npx next build --webpack` with both switches on builds `/dev/world`, keeps the art in one lazily loaded chunk and keeps it out of the room's page chunk. Every anchor in this plan (W1 to W21, R0 to R3, S1 to S3, A1 to A5, N1 to N7, P1 to P7, T1 to T3, D0, D1, B1, B2) was applied by script to the repo's own files and matched exactly once, and the results were byte-compared with the dry-run files. The draft blueprints were rendered and looked at (they read as one building).

## Spec statements the checks contradicted or left open (rulings)
1. **The layout.** West to east: gate (7 by 11 at x 4, y 15), study (5 by 13 at x 11, y 13), library (9 by 9 at x 16, y 17), the hall (unchanged), workshop (11 by 9 at x 40, y 17), observatory (9 by 17 at x 51, y 9). Hall in the middle, the library and workshop as wings against it, the gate at the west end (its turrets are that end's towers), the observatory the east end's tower and the highest point, the study a slim tower between the gate and the library. The castle covers x 4 to 59, one wall from end to end.
2. **The wings share the hall's step ends.** The library's last column and the workshop's first (x 24 and x 40) have walls but no floor, because the hall's step is there. The mid-air rule lets a wing lean on the hall: the hall is always built first (it opens on day one, so its row is the oldest).
3. **How high.** The observatory's top row is y 9, two rows above the hall's peak, inside the two tiles of sky the camera already keeps over the hall. The camera is not changed (raising `TALLEST_TILES` would move the phone to scale 1); on a short view where the hall wins, the dome's top may be cut. No room rises above y 9 (test).
4. **The island's scenery stays, behind the rooms.** The island is drawn before the castle, so a tree inside a room's rectangle is hidden as that room's walls rise; the test requires every such tree to be behind a solid cell. Until a window is laid, a tree may show through its gap (accepted). The bench, the lantern post and the island's lantern go (the workshop covers that spot); at night he sits on the hall's step at its door, between the hall's two lanterns (`REST_X = START_X`).
5. **Six new tiles, not four.** `tower-cap`, `shelf-window`, `forge`, `dome-l`, `dome`, `dome-r`, appended as cells 55 to 60 (the 55 before keep theirs). The dome gets its own glass because `glass` became the lit pane in the art pass. An optional `public/village/tiles.png` must now be 976 by 16.
6. **Building order.** Rooms already started (they have a saved row) come first, oldest `started_at` first (unreadable dates last, ties in spec order); rooms open but not started follow in spec order (hall, library, workshop, study, gate, observatory). One room at a time. A started room stays in the queue even if its rule stops being true (forgetting the last note does not take the library away). Rooms join the queue only when they open; nothing is saved for a room until a block of it is laid.
7. **"Finished" is by count** (`laid >= total`), never by `finished_at` (review M7). `finished_at` stays informative.
8. **Counts are read once per visit** with the readers Library and Feed already use, so they match what the panels show: memories (all `memory_facts` keys), notes (up to 100), things (the latest version of each of up to 200 rows), reminders (pending, sent or missed, up to 100). A reader that fails counts as none (its room waits for a later visit). Ideas and goals are 0 until the shell's phase B adds readers; that is the study's hook (`VillageCounts.ideas`, `goals`, and two lines in `readVillageCounts`).
9. **"Settings first opened in the new shell"** is the per-device seen store's key `osmo-seen-settings`, marked by the shell whenever Settings opens (also with the world off, so a later switch-on still knows), and read by the world with `peek` (no baseline). A Settings route during the visit also counts at once.
10. **Spec 2 says a locked room is "not drawn at all"; spec 5 says an unbuilt room is "a faint outline".** Both hold: a locked room is not drawn; an open room's blocks not yet laid are drawn at `OUTLINE_ALPHA` 0.12, and the next block at `GHOST_ALPHA` 0.3 as in phase 1. This applies to the room in progress too, so the hall's unbuilt part now shows faintly (a visible change, judged better than two rules).
11. **Places and routes.** Talk is the yard at the hall's door. The workshop's panel is Library's "things" page (`#library/things`), so the rail's Library is the library and its Things filter the workshop. Search is the observatory (the same spot as Settings). A click on the hall does nothing (it has no button). The study has no button until the Ideas panel ships (`routeOf` returns null). An unbuilt room has no button.
12. **Walking.** A room whose panel is open beats building and the night's rest: he stops mid-block (the block is not laid), walks there and stands. When the panel closes he goes back to work; with nothing left to build he waits in the yard. Following Gur from room to room he does not stop between.
13. **Hit areas are DOM buttons inside the world root**, so they come first in the tab order (the world root is the stage's first child); the rail stays the keyboard route the spec names. A button whose room is wholly out of view is `hidden`. In the room, the column lets the pointer through where nothing of it is drawn (B2); rooms behind a line of the conversation are not clickable there.
14. **"Clear the village"** is a section on Settings' About page, only with the world on: a button, a confirm, the result. It deletes the owner's rows (`in("room", CASTLE_ROOMS)`), blocks saves while it runs and waits for one already on its way, then tells the world (a window event) and other tabs (a localStorage key). The world drops what it holds and reads the village again: he begins the hall.
15. **News is a queue.** "The hall is finished" and "I have begun the library" can both happen between two turns, so `takeNews()` now returns the oldest unread news (up to four kept) instead of the latest one. This changes phase 1's contract for the language lane; the Ask says so.
16. **The context line** is built by the pure `roomContext(place, counts, who = "Gur")` in `lib/world/rooms.ts` ("Gur is in the library with you; in front of you are 14 memories and 3 notes."; counts only; "nothing is here yet" for none; the observatory has no counts; null in the yard). `WorldControl.context()` returns it for the open panel once the visit's counts are read. Adding it to a turn is language's.
17. **Pace.** The loop keeps frame pace for "work waiting" only when there is a next block and he is in the yard; at a room, or at night with nothing to build, it falls to the 3 s tick (this also fixes final review M3).
18. **The dev page's live mode builds the whole castle**, room by room, every room open; its pins are per room (locked, 0, 50, 100 percent).

## File structure
Create:
- `lib/world/blueprints/library.ts`, `workshop.ts`, `study.ts`, `gate.ts`, `observatory.ts`, `castle.ts` (Task 2; refined by Tasks 3 and 4)
- `lib/world/unlock.ts`, `unlock.test.ts` (Task 5)
- `lib/world/village.ts`, `village.test.ts` (Task 6)
- `lib/world/village-data.test.ts`, `lib/world/village-counts.ts` (Task 7)
- `lib/world/rooms.ts`, `rooms.test.ts` (Task 8)
- `components/osmo/village-clear.tsx` (Task 11)

Modify:
- `lib/world/tiles.ts`, `tiles.test.ts` (Task 1)
- `lib/world/blueprints/types.ts`, `index.ts`, `island.ts`, `blueprints.test.ts` (replaced), `lib/world/progress.ts`, `progress.test.ts` (Task 2)
- `lib/shell/rail.ts`, `rail.test.ts`, `components/osmo/use-rail-dots.ts` (Task 5)
- `lib/world/village-data.ts` (replaced, Task 7)
- `lib/world/actor.ts`, `actor.test.ts`, `render.ts`, `render.test.ts` (Task 9)
- `components/osmo/world.tsx`, `world.module.css`, and one line of `app/dev/world/page.tsx` (Task 10)
- `components/osmo/settings-pages.tsx` (Task 11)
- `app/dev/world/page.tsx` (replaced), `app/dev/world/dev.module.css` (Task 12)
- `app/assistant.tsx` (B1), `app/assistant.module.css` (B2) (Task 13)

Not touched: `lib/world/camera.ts`, `pace.ts`, `sky.ts`, `palette.ts`, the hall blueprint, the migration, every language file.

## Tasks and models
| # | Task | Model |
|---|---|---|
| 1 | Six new tiles (pixel data) | Opus |
| 2 | The castle frame and the five draft rooms | Sonnet |
| 3 | The wings by eye: library and workshop | Opus |
| 4 | The ends by eye: gate, study, observatory, and the whole castle | Opus |
| 5 | Unlock rules and the Settings flag | Sonnet |
| 6 | The village across rooms | Sonnet |
| 7 | The village table: clear, and the counts | Sonnet |
| 8 | Rooms as places (pure) | Sonnet |
| 9 | He walks to rooms; outlines and the forge's glow | Sonnet |
| 10 | The world component | Sonnet |
| 11 | "Clear the village" in Settings | Sonnet |
| 12 | `/dev/world` | Sonnet |
| 13 | Room wiring (B1, B2) | Sonnet |
| 14 | The gate | main agent |

**Dispatch order.** Task 1 alone (the tile ids are a prerequisite). Then Task 2 alone (the room names and drafts everything else imports). Then Task 3 followed by Task 4 (both edit `blueprints.test.ts`'s `COUNTS`, so not in parallel), and alongside them Task 5, then Tasks 6, 7, 8 and 9 in parallel (disjoint files; 7 and 8 import Task 5's `unlock.ts`; 9's forge test needs Task 3's workshop to keep its forge, which Task 3 must). Then Task 10. Then Tasks 11 and 12 in parallel (12 rewrites the line Task 10's D0 touched). Then Task 13. Then the gate. Tasks 3 and 4 must keep each room's rectangle and door column, so the pins in Tasks 6 to 9 hold whatever they redraw.

## Shared tool: the castle preview (for Tasks 1, 3 and 4; never committed)
Create this file to look at the art, run it, look at the PNGs with your image viewer (the Read tool shows PNGs), and delete it before you commit. `snapshot` writes nothing unless `WORLD_SNAPSHOT_DIR` is set. Before Task 2 has landed, only the tile contact sheet (`tiles.test.ts`) is available.

```ts
// Scratch preview for the art tasks: NEVER commit this file. Run with
//   WORLD_SNAPSHOT_DIR=<your scratchpad>/castle npx vitest run lib/world/zz-preview.test.ts
// and look at the PNGs: the whole castle by day and by night, every room half built with the outlines, and one room
// close up (PREVIEW_ROOM, default library) at scale 3.
import { it } from "vitest";
import { look, newActor } from "./actor";
import { blocksOf } from "./blueprints";
import { CASTLE, CASTLE_BLOCKS } from "./blueprints/castle";
import { ISLAND } from "./blueprints/island";
import { CASTLE_ROOMS, TILE, type Block, type CastleRoom } from "./blueprints/types";
import { newCamera } from "./camera";
import { pixelPainter } from "./pixel-painter";
import { snapshot } from "./png";
import { artFor, drawSky, drawWorld } from "./render";
import { skyAt, starField } from "./sky";

const SCARF = "hsl(172 38% 50%)";
function shot(name: string, view: { w: number; h: number }, zoom: number, centreX: number, hour: number, laid: Block[], outline: Block[]) {
	const dark = hour >= 21 || hour < 5 ? 1 : 0;
	const sky = skyAt(SCARF, "hsl(212 38% 50%)", hour);
	const back = pixelPainter(view.w, view.h, artFor(SCARF, dark));
	drawSky(back, { sky, stars: starField() });
	const front = pixelPainter(view.w, view.h, artFor(SCARF, dark));
	const him = newActor(32.5 * TILE, 0, hour);
	drawWorld(front, {
		camera: newCamera(centreX, view, zoom), view, now: 0, clock: 0, ground: blocksOf(ISLAND), laid, ghost: null, outline,
		him: { x: him.x, look: look(him, 0, "warm") }, sky, dark,
	});
	for (let i = 0; i < front.data.length; i += 4) {
		const a = front.data[i + 3] / 255;
		for (let c = 0; c < 3; c++) back.data[i + c] = Math.round(front.data[i + c] * a + back.data[i + c] * (1 - a));
	}
	snapshot(name, back);
}

it("previews the castle", () => {
	const all = CASTLE_ROOMS.flatMap((r) => CASTLE_BLOCKS[r]);
	const wide = { w: 1100, h: 600 };
	shot("castle-day", wide, 1, 32.5 * TILE, 13, all, []);
	shot("castle-night", wide, 1, 32.5 * TILE, 23, all, []);
	const half = CASTLE_ROOMS.map((r) => CASTLE_BLOCKS[r]);
	const cut = (bs: readonly Block[]) => Math.round(bs.length / 2);
	shot("castle-half", wide, 1, 32.5 * TILE, 13, half.flatMap((bs) => bs.slice(0, cut(bs))), half.flatMap((bs) => bs.slice(cut(bs))));
	const room = (process.env.PREVIEW_ROOM ?? "library") as CastleRoom;
	const bp = CASTLE[room];
	shot(`close-${room}`, { w: 900, h: 700 }, 3, (bp.x + bp.map[0].length / 2) * TILE, 13, all, []);
});
```

Run: `WORLD_SNAPSHOT_DIR=<your scratchpad>/castle PREVIEW_ROOM=library npx vitest run lib/world/zz-preview.test.ts` (in PowerShell set the two variables with `$env:NAME = "value"` first). Then `Remove-Item lib/world/zz-preview.test.ts` (or `rm`) and make sure `git status` does not list it.

---
### Task 1: Six new tiles (pixel data)
**Model:** Opus.
**Files:** Modify `lib/world/tiles.ts`, `lib/world/tiles.test.ts`.

**Interfaces:**
- Consumes: `make`, `over`, `noise`, `ramp` and the masonry helpers already in `tiles.ts`; `PALETTE` letters (`lib/world/palette.ts`, with the light rule at its top).
- Produces: `TILE_IDS` with six ids appended after `"fence"`, in this order: `"tower-cap"`, `"shelf-window"`, `"forge"`, `"dome-l"`, `"dome"`, `"dome-r"` (cells 55 to 60), and their grids in `TILES`. Task 2's drafts use all six; Task 9's renderer gives `forge` a glow at night.

**What to draw.** Each tile is 16 rows of 16 letters, built the way the art pass built the others (helpers in `tiles.ts`, a fixed hash for texture, light from the top left). Only tile letters: never Osmo's `H` to `Q` or the scarf `Z`. Look at `roof-peak`, `window`, `window-top`, `door`, `brick` and `glass` first: the new tiles sit next to them.

| # | id | What it depicts, and what it must have |
|---|---|---|
| 55 | `tower-cap` | The tip of a tall tower roof. The study's draft puts it directly above a `roof-peak`: a slim spire continuing the peak upward, about columns 6 to 9 at row 15 narrowing to a point near row 4, shingles lit on the left and shaded on the right as in `roof-left`/`roof-right`, then an iron rod to row 1 with a small teal pennant (`w`, `x`, `y`). Transparent elsewhere. Its bottom must meet the peak's point without a gap. If the peak's own finial and the spire clutter each other, say so in your report: Task 4 may change the study's top rows. |
| 56 | `shelf-window` | The library's window: the frame, arch and sill of `window` (so it sits in a `brick` wall the same way), but behind the glass, three shelves of books: boards in wood (`j`, `k`, `l`, `m`), spines 1 to 2 px wide in varied palette colours (`h`, `i`, `x`, `y`, `r`, `s`, `m`, `t`, `W`) with lit left edges, a few leaning, the glass's glint (`s`) faint over them. No transparent pixel. Two stacked (the library's draft) should read as one tall bookcase window. |
| 57 | `forge` | The workshop's hearth at the foot of the wall: `brick` bond round an arched opening (about columns 2 to 13, rows 4 to 15) with a stone arch like `window-top`'s; inside, a dark back (`a`, `b`), glowing coals across the bottom rows (`u`, `t`, `v`), two or three flames rising (`u`, `t`, a `v` core), an iron grate line (`a`). No transparent pixel. Two side by side (the workshop's draft) make one wide hearth. The renderer adds a warm glow round it at night (Task 9). |
| 58 | `dome-l` | The left curve of the observatory's glass dome: transparent above the diagonal from (column 0, row 15) to (column 15, row 0), as `roof-left`; along the diagonal a stone rim 2 px wide (`e` on top, `d`, an `a` line under it); below, the glass of `dome`. |
| 59 | `dome` | A pane of the dome filling the tile: lead cames (`a`, `b`) in a lattice, glass (`q` dark, `r` base) with a sky reflection (`s`) in the top-left panes and two or three star glints (`p`). Light from the top left. Seamless in both directions. No transparent pixel. |
| 60 | `dome-r` | Mirror of `dome-l` on the shadow side: rim `d`, `b`, `a`; glass darker (more `q`), fewer glints. |

- [ ] **Step 1: Write the failing test.** Apply these edits to `lib/world/tiles.test.ts`:

- [ ] **T1** Find:
```ts
	"pine-small", "pine-l", "pine-c", "pine-r", "bush", "tuft", "path", "sign", "fence",
];
// Tiles with no transparent pixel.
```
Replace with:
```ts
	"pine-small", "pine-l", "pine-c", "pine-r", "bush", "tuft", "path", "sign", "fence",
];
// Appended for the rooms (village phase 2), after the 55, so every earlier cell keeps its place.
const ROOMS = ["tower-cap", "shelf-window", "forge", "dome-l", "dome", "dome-r"];
// Tiles with no transparent pixel.
```
- [ ] **T2** Find:
```ts
	"door", "door-top", "roof-flat", "step", "pillar",
];
```
Replace with:
```ts
	"door", "door-top", "roof-flat", "step", "pillar", "shelf-window", "forge", "dome",
];
```
- [ ] **T3** Find:
```ts
	it("are the 38 tiles in the fixed cell order, then the look pass's, appended", () => {
		expect([...TILE_IDS]).toEqual([...ORDER, ...ADDED]);
		expect(Object.keys(TILES).sort()).toEqual([...ORDER, ...ADDED].sort());
```
Replace with:
```ts
	it("are the 38 tiles in the fixed cell order, then the look pass's, then the rooms', appended", () => {
		expect([...TILE_IDS]).toEqual([...ORDER, ...ADDED, ...ROOMS]);
		expect(Object.keys(TILES).sort()).toEqual([...ORDER, ...ADDED, ...ROOMS].sort());
		expect(tileIndex("fence")).toBe(54);
		expect(tileIndex("tower-cap")).toBe(55);
		expect(tileIndex("dome-r")).toBe(60);
```

- [ ] **Step 2: Run it to see it fail.** `npx vitest run lib/world/tiles.test.ts`. Expected: FAIL in "are the 38 tiles in the fixed cell order, then the look pass's, then the rooms', appended" (the six ids are missing).
- [ ] **Step 3: Append the ids.** In `lib/world/tiles.ts`, replace the closing lines of `TILE_IDS`:
```ts
	"pine-small", "pine-l", "pine-c", "pine-r", "bush", "tuft", "path", "sign", "fence",
] as const;
```
with:
```ts
	"pine-small", "pine-l", "pine-c", "pine-r", "bush", "tuft", "path", "sign", "fence",
	// Appended for the rooms (village phase 2); the 55 above keep their cells.
	"tower-cap", "shelf-window", "forge", "dome-l", "dome", "dome-r",
] as const;
```
- [ ] **Step 4: Draw the six tiles** and add them to `TILES` after `fence: FENCE,` (TypeScript will not compile until all six are there). Keep any helper you write in `tiles.ts`.
- [ ] **Step 5: Run the tests.** `npx vitest run lib/world/tiles.test.ts lib/world/render.test.ts`. Expected: PASS (the render hash `d498b675` does not change: no new tile is in that scene).
- [ ] **Step 6: Look.** Run `WORLD_SNAPSHOT_DIR=<scratchpad>/tiles npx vitest run lib/world/tiles.test.ts` and look at `tiles.png` (the contact sheet at 4x): the six new cells beside `roof-peak`, `window`, `door` and `glass`. Redraw until they belong with the art pass's tiles. Put the PNG's path in your report.
- [ ] **Step 7: Checks and commit.** `npx vitest run && npx tsc --noEmit -p . && npm run lint`, then:
```bash
git add lib/world/tiles.ts lib/world/tiles.test.ts
git commit -m "art(world): six tiles for the rooms - tower cap, bookshelf window, forge, glass dome" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 2: The castle frame and the five draft rooms
**Model:** Sonnet.
**Files:** Modify `lib/world/blueprints/types.ts`, `index.ts`, `island.ts`; replace `lib/world/blueprints/blueprints.test.ts`; create `lib/world/blueprints/gate.ts`, `study.ts`, `library.ts`, `workshop.ts`, `observatory.ts`, `castle.ts`; modify `lib/world/progress.ts`, `progress.test.ts`.

**Interfaces:**
- Consumes: the six tile ids (Task 1); `blocksOf`, `Blueprint`, `Block` (phase 1); `TALLEST_TILES`, `SKY_TILES` (`camera.ts`).
- Produces (everything later imports these):
  - `types.ts`: `CASTLE_ROOMS = ["hall", "library", "workshop", "study", "gate", "observatory"] as const`, `type CastleRoom`, `type RoomId = "island" | CastleRoom`.
  - `castle.ts`: `CASTLE: Readonly<Record<CastleRoom, Blueprint>>`, `CASTLE_BLOCKS: Readonly<Record<CastleRoom, readonly Block[]>>` (laying order), `DOOR_X: Readonly<Record<CastleRoom, number>>` (tile column of each room's one `door` block: hall 32, library 21, workshop 44, study 13, gate 7, observatory 55).
  - `index.ts`: `REST_X = START_X` (he rests on the hall's step).
  - `progress.ts`: `villageLine` names every room.

The drafts below are complete and pass every test; Tasks 3 and 4 refine them by eye inside the same rectangles. Copy them exactly.

- [ ] **Step 1: Write the failing test.** Replace `lib/world/blueprints/blueprints.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { SKY_TILES, TALLEST_TILES } from "../camera";
import { TILE_IDS, TILES } from "../tiles";
import { CASTLE, CASTLE_BLOCKS, DOOR_X } from "./castle";
import { HALL } from "./hall";
import { blocksOf, ISLAND_LEFT, ISLAND_RIGHT, REST_X, standX, START_X } from "./index";
import { ISLAND } from "./island";
import { CASTLE_ROOMS, GROUND_Y, LAYER_ORDER, TILE, WORLD_H, WORLD_W, type Blueprint, type CastleRoom } from "./types";

const ROOMS = CASTLE_ROOMS.filter((r) => r !== "hall");
const decor = (b: { layer: string }) => b.layer === "lanterns" || b.layer === "banners";
const key = (x: number, y: number) => `${x},${y}`;
const width = (bp: Blueprint) => bp.map[0].length;
// True when the room's map cell at world (x, y) is a tile with no transparent pixel.
const opaque = (bp: Blueprint, x: number, y: number): boolean => {
	const ch = bp.map[y - bp.y]?.[x - bp.x];
	const entry = ch && ch !== "." ? bp.legend[ch] : undefined;
	return entry !== undefined && !TILES[entry.tile].join("").includes(".");
};

describe.each([ISLAND, ...CASTLE_ROOMS.map((r) => CASTLE[r])])("the $room blueprint", (bp: Blueprint) => {
	it("is a rectangle, its decor the same size or empty, every letter in the legend", () => {
		const w = bp.map[0].length;
		for (const row of bp.map) expect(row.length).toBe(w);
		if (bp.decor.length > 0) {
			expect(bp.decor.length).toBe(bp.map.length);
			for (const row of bp.decor) expect(row.length).toBe(w);
		}
		for (const ch of [...bp.map.join(""), ...bp.decor.join("")]) if (ch !== ".") expect(bp.legend[ch], ch).toBeDefined();
		for (const entry of Object.values(bp.legend)) expect(TILE_IDS).toContain(entry.tile);
	});
	it("fits inside the world", () => {
		for (const b of blocksOf(bp)) {
			expect(b.x).toBeGreaterThanOrEqual(0);
			expect(b.x).toBeLessThan(WORLD_W);
			expect(b.y).toBeGreaterThanOrEqual(0);
			expect(b.y).toBeLessThan(WORLD_H);
		}
	});
});

describe("the hall", () => {
	const blocks = blocksOf(HALL);
	it("has 180 blocks, each laid exactly once", () => {
		expect(blocks).toHaveLength(180);
		expect(new Set(blocks.map((b) => `${b.x},${b.y},${decor(b) ? "decor" : "map"}`)).size).toBe(180);
	});
	it("counts each layer", () => {
		expect(LAYER_ORDER.map((l) => blocks.filter((b) => b.layer === l).length)).toEqual([0, 17, 99, 52, 4, 2, 2, 4]);
	});
	it("lays the floor, the walls upward, the roof, then windows, door, lanterns and banners", () => {
		const rank = blocks.map((b) => LAYER_ORDER.indexOf(b.layer));
		for (let i = 1; i < rank.length; i++) expect(rank[i]).toBeGreaterThanOrEqual(rank[i - 1]);
		for (const layer of LAYER_ORDER) {
			const ys = blocks.filter((b) => b.layer === layer).map((b) => b.y);
			for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThanOrEqual(ys[i - 1]);
		}
	});
	it("never lays a block in mid-air", () => {
		const placed = new Set<string>();
		for (const b of blocks) {
			if (!decor(b)) {
				const held = b.y + 1 === GROUND_Y || placed.has(key(b.x, b.y + 1)) || placed.has(key(b.x - 1, b.y)) || placed.has(key(b.x + 1, b.y));
				expect(held, `${b.tile} at ${b.x},${b.y}`).toBe(true);
				placed.add(key(b.x, b.y));
			}
		}
	});
	it("stands where it always stood, with its door at the centre (saved progress counts its blocks)", () => {
		expect([HALL.x, HALL.y, width(HALL), HALL.map.length]).toEqual([23, 11, 19, 15]);
		expect(blocks.filter((b) => b.layer === "floor").every((b) => b.y + 1 === GROUND_Y)).toBe(true);
		expect(blocks.find((b) => b.tile === "door")?.x).toBe(32);
		expect(START_X).toBe(32.5 * TILE);
	});
});

// The five rooms of phase 2. Their block counts are pinned, because saved progress counts blocks: change a room's map
// only before it ships, and re-pin here when you do.
const COUNTS: Readonly<Record<Exclude<CastleRoom, "hall">, number>> = {
	library: 85,
	workshop: 101,
	study: 57,
	gate: 67,
	observatory: 147,
};

describe.each(ROOMS)("the %s", (room) => {
	const bp = CASTLE[room];
	const blocks = CASTLE_BLOCKS[room];
	it("has its pinned number of blocks, each laid exactly once", () => {
		expect(blocks).toHaveLength(COUNTS[room]);
		expect(new Set(blocks.map((b) => `${b.x},${b.y},${decor(b) ? "decor" : "map"}`)).size).toBe(blocks.length);
	});
	it("lays the floor first, then the walls, the roof, windows, door, lanterns and banners", () => {
		const rank = blocks.map((b) => LAYER_ORDER.indexOf(b.layer));
		for (let i = 1; i < rank.length; i++) expect(rank[i]).toBeGreaterThanOrEqual(rank[i - 1]);
		expect(blocks[0].layer).toBe("floor");
		for (const layer of ["walls", "roof"] as const) expect(blocks.some((b) => b.layer === layer), layer).toBe(true);
		expect(blocks.some((b) => b.layer === "ground")).toBe(false);
	});
	it("never lays a block in mid-air (a wing may lean on the hall, which is always built first)", () => {
		const placed = new Set(CASTLE_BLOCKS.hall.filter((b) => !decor(b)).map((b) => key(b.x, b.y)));
		for (const b of blocks) {
			if (decor(b)) continue;
			const held = b.y + 1 === GROUND_Y || placed.has(key(b.x, b.y + 1)) || placed.has(key(b.x - 1, b.y)) || placed.has(key(b.x + 1, b.y));
			expect(held, `${b.tile} at ${b.x},${b.y}`).toBe(true);
			placed.add(key(b.x, b.y));
		}
	});
	it("hangs its lanterns and banners on its own walls", () => {
		const own = new Set(blocks.filter((b) => !decor(b)).map((b) => key(b.x, b.y)));
		for (const b of blocks.filter(decor)) expect(own.has(key(b.x, b.y)), `${b.tile} at ${b.x},${b.y}`).toBe(true);
	});
	it("stands on the island's snow, inside its ends, with one door on its floor", () => {
		expect(bp.y + bp.map.length).toBe(GROUND_Y);
		for (const b of blocks.filter((x) => x.layer === "floor")) expect(b.y + 1).toBe(GROUND_Y);
		for (const b of blocks) {
			expect(b.x).toBeGreaterThan(ISLAND_LEFT);
			expect(b.x).toBeLessThan(ISLAND_RIGHT);
		}
		const doors = blocks.filter((b) => b.tile === "door");
		expect(doors).toHaveLength(1);
		expect(doors[0].y).toBe(GROUND_Y - 2);
	});
	it("stays inside the sky the camera keeps over the hall", () => {
		expect(bp.y).toBeGreaterThanOrEqual(GROUND_Y - TALLEST_TILES - SKY_TILES);
	});
});

describe("the castle", () => {
	const all = CASTLE_ROOMS.flatMap((room) => CASTLE_BLOCKS[room]);
	it("never puts two rooms in one cell", () => {
		const cells = all.map((b) => `${b.x},${b.y},${decor(b) ? "decor" : "map"}`);
		expect(new Set(cells).size).toBe(cells.length);
	});
	it("runs gate, study, library, hall, workshop, observatory from west to east, with the doors where he stands", () => {
		const order = [...CASTLE_ROOMS].sort((a, b) => CASTLE[a].x - CASTLE[b].x);
		expect(order).toEqual(["gate", "study", "library", "hall", "workshop", "observatory"]);
		expect(DOOR_X).toEqual({ hall: 32, library: 21, workshop: 44, study: 13, gate: 7, observatory: 55 });
	});
	it("reads as one building: the row above the floor is wall from x 4 to x 59", () => {
		const row = new Set(all.filter((b) => b.y === GROUND_Y - 2 && !decor(b)).map((b) => b.x));
		for (let x = ISLAND_LEFT + 1; x < ISLAND_RIGHT; x++) expect(row.has(x), `x ${x}`).toBe(true);
	});
	it("has the observatory highest, and every other new room lower than the hall's peak", () => {
		const top = (room: CastleRoom) => Math.min(...CASTLE_BLOCKS[room].map((b) => b.y));
		for (const room of CASTLE_ROOMS) if (room !== "observatory") expect(top("observatory")).toBeLessThan(top(room));
		for (const room of ROOMS) if (room !== "observatory") expect(top(room)).toBeGreaterThan(top("hall"));
	});
});

describe("the island", () => {
	const ground = blocksOf(ISLAND);
	it("has snow along its whole top row, 58 wide since the look pass, with a flagstone path in it", () => {
		const top = ground.filter((b) => b.y === GROUND_Y);
		expect(top).toHaveLength(58);
		expect(top.every((b) => b.tile.startsWith("snow") || b.tile === "path")).toBe(true);
		expect(top.filter((b) => b.tile === "path").every((b) => b.x < HALL.x + 1)).toBe(true);
		expect(top.find((b) => b.x === ISLAND_LEFT)?.tile).toBe("snow-edge-l");
		expect(top.find((b) => b.x === ISLAND_RIGHT)?.tile).toBe("snow-edge-r");
	});
	it("has no bench or lantern post any more: he rests on the hall's step, between its two lanterns", () => {
		expect(ground.some((b) => b.tile === "bench" || b.tile === "lantern-post" || b.tile === "lantern")).toBe(false);
		expect(REST_X).toBe(START_X);
		const lanterns = CASTLE_BLOCKS.hall.filter((b) => b.tile === "lantern").map((b) => b.x);
		expect(Math.min(...lanterns)).toBeLessThan(REST_X / TILE);
		expect(Math.max(...lanterns)).toBeGreaterThan(REST_X / TILE);
	});
	it("is wider than the hall by a good margin on both sides, and tapers below", () => {
		expect(HALL.x - ISLAND_LEFT).toBeGreaterThanOrEqual(15);
		expect(ISLAND_RIGHT - (HALL.x + HALL.map[0].length - 1)).toBeGreaterThanOrEqual(15);
		const widthAt = (y: number) => ground.filter((b) => b.y === y && b.layer === "ground" && !b.tile.startsWith("root")).length;
		expect(widthAt(GROUND_Y + 1)).toBeGreaterThan(widthAt(GROUND_Y + 5));
		expect(widthAt(GROUND_Y + 5)).toBeGreaterThan(widthAt(GROUND_Y + 9));
	});
	it("keeps the scenery off the hall, and behind solid cells where another room will stand", () => {
		const scenery = ground.filter((b) => b.y < GROUND_Y);
		expect(scenery.length).toBeGreaterThan(20);
		for (const b of scenery) {
			expect(b.x < HALL.x || b.x >= HALL.x + width(HALL), `${b.tile} at ${b.x}`).toBe(true);
			for (const room of ROOMS) {
				const bp = CASTLE[room];
				const inside = b.x >= bp.x && b.x < bp.x + width(bp) && b.y >= bp.y && b.y < bp.y + bp.map.length;
				if (inside) expect(opaque(bp, b.x, b.y), `${b.tile} at ${b.x},${b.y} behind the ${room}`).toBe(true);
			}
		}
	});
	it("lets him stand only on the island", () => {
		expect(standX({ x: 0, y: 20, tile: "brick", layer: "walls" })).toBe((ISLAND_LEFT + 1.5) * TILE);
		expect(standX({ x: 99, y: 20, tile: "brick", layer: "walls" })).toBe((ISLAND_RIGHT - 0.5) * TILE);
		expect(standX({ x: 30, y: 20, tile: "brick", layer: "walls" })).toBe(30.5 * TILE);
	});
});
```

- [ ] **Step 2: Run it to see it fail.** `npx vitest run lib/world/blueprints`. Expected: FAIL to import `./castle` (and `CASTLE_ROOMS`).
- [ ] **Step 3: Widen the room names.** In `lib/world/blueprints/types.ts`:

- [ ] **P1** Find:
```ts
export type RoomId = "island" | "hall";
```
Replace with:
```ts
// The castle's rooms in the order spec 4 lists them: the order unlocked rooms wait in when several open at once.
export const CASTLE_ROOMS = ["hall", "library", "workshop", "study", "gate", "observatory"] as const;
export type CastleRoom = (typeof CASTLE_ROOMS)[number];
export type RoomId = "island" | CastleRoom;
```

- [ ] **Step 4: The five drafts.** Create `lib/world/blueprints/gate.ts`:

```ts
// The gate (spec 4 and 5): where what arrives comes in, and the Feed's place. The castle's west end: a gatehouse 7 by 11
// tiles at x 4, y 15, with a turret at each corner and the gate door at x 7. Draft from the phase 2 plan; Task 4 refines it.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(7);

export const GATE: Blueprint = {
	room: "gate",
	x: 4,
	y: 15,
	map: [
		"T.....T",
		"I.....I",
		"I.TTT.I",
		"IhhhhhI",
		"IBBBBBI",
		"IvBBBvI",
		"IwBBBwI",
		"IBBBBBI",
		"IBBaBBI",
		"IBBdBBI",
		"SSSSSSS",
	],
	decor: [BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, "..l.l..", BLANK, BLANK],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		T: { tile: "battlement", layer: "roof" },
		v: { tile: "window-top", layer: "windows" },
		w: { tile: "window", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
	},
};
```

Create `lib/world/blueprints/study.ts`:

```ts
// The study (spec 4 and 5): ideas and goals. A slim tower 5 by 13 tiles at x 11, y 13, between the gate and the
// library, with a pointed roof, a tower cap and its door at x 13. Draft from the phase 2 plan; Task 4 refines it.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(5);

export const STUDY: Blueprint = {
	room: "study",
	x: 11,
	y: 13,
	map: [
		"..c..",
		"..^..",
		".<=>.",
		"<===>",
		"hhhhh",
		"IBBBI",
		"IBvBI",
		"IBwBI",
		"IkBBI",
		"IBBBI",
		"IBaBI",
		"IBdBI",
		"SSSSS",
	],
	decor: [BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, ".l.l.", BLANK, BLANK],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		"<": { tile: "roof-left", layer: "roof" },
		">": { tile: "roof-right", layer: "roof" },
		"=": { tile: "roof-flat", layer: "roof" },
		"^": { tile: "roof-peak", layer: "roof" },
		c: { tile: "tower-cap", layer: "roof" },
		v: { tile: "window-top", layer: "windows" },
		w: { tile: "window", layer: "windows" },
		k: { tile: "shelf-window", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
	},
};
```

Create `lib/world/blueprints/library.ts`:

```ts
// The library (spec 4 and 5): memory and notes. The west wing, 9 by 9 tiles at x 16, y 17, against the hall: its last
// column (x 24) is the hall's step end, so that column has walls but no floor. Bookshelf windows; door at x 21.
// Draft from the phase 2 plan; Task 3 refines it.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(9);

export const LIBRARY: Blueprint = {
	room: "library",
	x: 16,
	y: 17,
	map: [
		".<=======",
		"<========",
		"hhhhhhhhh",
		"IBBBBBBBB",
		"IBkkBBBkB",
		"IBkkBBBkB",
		"IBBBBaBBB",
		"IBBBBdBBB",
		"SSSSSSSS.",
	],
	decor: [BLANK, BLANK, BLANK, ".b....b..", ".e....e..", BLANK, "....l.l..", BLANK, BLANK],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		"<": { tile: "roof-left", layer: "roof" },
		"=": { tile: "roof-flat", layer: "roof" },
		k: { tile: "shelf-window", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
		b: { tile: "banner", layer: "banners" },
		e: { tile: "banner-end", layer: "banners" },
	},
};
```

Create `lib/world/blueprints/workshop.ts`:

```ts
// The workshop (spec 4 and 5): the things he made. The east wing, 11 by 9 tiles at x 40, y 17, against the hall: its
// first column (x 40) is the hall's step end, so that column has walls but no floor. A chimney with a battlement cap,
// a forge at its hearth and the door at x 44. Draft from the phase 2 plan; Task 3 refines it.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(11);

export const WORKSHOP: Blueprint = {
	room: "workshop",
	x: 40,
	y: 17,
	map: [
		"=======>.T.",
		"========>C.",
		"hhhhhhhhhhh",
		"BBBBBBBBBBI",
		"BBvBBBBBvBI",
		"BBwBBBBBwBI",
		"BBBBaBBBBBI",
		"BBBBdBffBBI",
		".SSSSSSSSSS",
	],
	decor: [BLANK, BLANK, BLANK, ".b.......b.", ".e.......e.", BLANK, "...l.l.....", BLANK, BLANK],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		">": { tile: "roof-right", layer: "roof" },
		"=": { tile: "roof-flat", layer: "roof" },
		C: { tile: "brick", layer: "roof" }, // the chimney, laid with the roof it stands on
		T: { tile: "battlement", layer: "roof" },
		v: { tile: "window-top", layer: "windows" },
		w: { tile: "window", layer: "windows" },
		f: { tile: "forge", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
		b: { tile: "banner", layer: "banners" },
		e: { tile: "banner-end", layer: "banners" },
	},
};
```

Create `lib/world/blueprints/observatory.ts`:

```ts
// The observatory (spec 4 and 5): Settings, and Search's glass. The castle's east end and its highest point: a tower
// 9 by 17 tiles at x 51, y 9, with a glass dome, a string course halfway up and the door at x 55. Its top row (y 9) is
// two rows above the hall's peak, inside the two tiles of sky the camera keeps over the hall. Draft from the phase 2
// plan; Task 4 refines it.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(9);

export const OBSERVATORY: Blueprint = {
	room: "observatory",
	x: 51,
	y: 9,
	map: [
		"...(g)...",
		"..(ggg)..",
		".(ggggg).",
		"ThhhhhhhT",
		"IBBBBBBBI",
		"IBBvBvBBI",
		"IBBwBwBBI",
		"IBBBBBBBI",
		"hhhhhhhhh",
		"IBBBBBBBI",
		"IBvBBBvBI",
		"IBwBBBwBI",
		"IBBBBBBBI",
		"IBBBBBBBI",
		"IBBBaBBBI",
		"IBBBdBBBI",
		"SSSSSSSSS",
	],
	decor: [BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, ".b.....b.", ".e.....e.", BLANK, BLANK, BLANK, "...l.l...", BLANK, BLANK],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		T: { tile: "battlement", layer: "roof" },
		"(": { tile: "dome-l", layer: "roof" },
		")": { tile: "dome-r", layer: "roof" },
		g: { tile: "dome", layer: "roof" },
		v: { tile: "window-top", layer: "windows" },
		w: { tile: "window", layer: "windows" },
		a: { tile: "door-top", layer: "door" },
		d: { tile: "door", layer: "door" },
		l: { tile: "lantern", layer: "lanterns" },
		b: { tile: "banner", layer: "banners" },
		e: { tile: "banner-end", layer: "banners" },
	},
};
```

- [ ] **Step 5: The registry.** Create `lib/world/blueprints/castle.ts`:

```ts
// The castle (spec 4): the six rooms by name, each room's blocks in laying order, and where each room's door is.
// Left to right on the island: gate (x 4), study (11), library (16), hall (23), workshop (40), observatory (51).
import { GATE } from "./gate";
import { HALL } from "./hall";
import { blocksOf } from "./index";
import { LIBRARY } from "./library";
import { OBSERVATORY } from "./observatory";
import { STUDY } from "./study";
import { CASTLE_ROOMS, type Block, type Blueprint, type CastleRoom } from "./types";
import { WORKSHOP } from "./workshop";

export const CASTLE: Readonly<Record<CastleRoom, Blueprint>> = {
	hall: HALL,
	library: LIBRARY,
	workshop: WORKSHOP,
	study: STUDY,
	gate: GATE,
	observatory: OBSERVATORY,
};
const byRoom = <T>(f: (room: CastleRoom) => T): Readonly<Record<CastleRoom, T>> =>
	Object.fromEntries(CASTLE_ROOMS.map((room) => [room, f(room)])) as Record<CastleRoom, T>;
export const CASTLE_BLOCKS: Readonly<Record<CastleRoom, readonly Block[]>> = byRoom((room) => blocksOf(CASTLE[room]));
// The tile column of each room's door (its one "door" block): where he stands when he visits it.
export const DOOR_X: Readonly<Record<CastleRoom, number>> = byRoom((room) => CASTLE_BLOCKS[room].find((b) => b.tile === "door")?.x ?? CASTLE[room].x);
```

- [ ] **Step 6: The rest spot and the island.** In `lib/world/blueprints/index.ts`:

- [ ] **P2** Find:
```ts
export const REST_X = (47 + 0.5) * TILE; // the bench by the lantern (island.ts)
export const START_X = (32 + 0.5) * TILE; // the hall's door
```
Replace with:
```ts
export const START_X = (32 + 0.5) * TILE; // the hall's door, and the yard in front of it (Talk's place)
// At night he sits on the hall's step at its door, between its two lanterns (phase 2 moved him off the old bench,
// which the workshop now covers).
export const REST_X = START_X;
```

In `lib/world/blueprints/island.ts` (P4 and P5 delete the lines; replace them with nothing):

- [ ] **P3** Find:
```ts
// scenery above the snow (pines, bushes, tufts, a signpost, a fence, the bench and the lantern where he rests), the snow
```
Replace with:
```ts
// scenery above the snow (pines, bushes, tufts, a signpost, a fence; phase 2 took out the bench and the lantern post), the snow
```
- [ ] **P4** Find:
```ts
	[44, 1, "b"],
	[46, 1, "p"],
	[46, 2, "L"],
```
Replace with:
```ts
```
- [ ] **P5** Find:
```ts
		b: { tile: "bench", layer: "ground" },
		p: { tile: "lantern-post", layer: "ground" },
		L: { tile: "lantern", layer: "ground" },
```
Replace with:
```ts
```

- [ ] **Step 7: Name every room in his AI-off line.** In `lib/world/progress.ts`:

- [ ] **P6** Find:
```ts
const NAMES: Readonly<Record<RoomId, string>> = { island: "island", hall: "hall" };
```
Replace with:
```ts
const NAMES: Readonly<Record<RoomId, string>> = {
	island: "island", hall: "hall", library: "library", workshop: "workshop", study: "study", gate: "gate", observatory: "observatory",
};
```

and in `lib/world/progress.test.ts`:

- [ ] **P7** Find:
```ts
		for (const event of ["started", "finished"] as const) {
			const line = villageLine({ room: "hall", event });
```
Replace with:
```ts
		expect(villageLine({ room: "library", event: "started" })).toBe("I have begun the library.");
		expect(villageLine({ room: "observatory", event: "finished" })).toBe("The observatory is finished.");
		for (const event of ["started", "finished"] as const) {
			const line = villageLine({ room: "gate", event });
```

- [ ] **Step 8: Run the tests.** `npx vitest run lib/world`. Expected: PASS, including the unchanged render hash `d498b675` and the actor tests (they pass their own `restX`).
- [ ] **Step 9: Checks and commit.** `npx vitest run && npx tsc --noEmit -p . && npm run lint`, then:
```bash
git add lib/world/blueprints/types.ts lib/world/blueprints/index.ts lib/world/blueprints/island.ts lib/world/blueprints/blueprints.test.ts lib/world/blueprints/gate.ts lib/world/blueprints/study.ts lib/world/blueprints/library.ts lib/world/blueprints/workshop.ts lib/world/blueprints/observatory.ts lib/world/blueprints/castle.ts lib/world/progress.ts lib/world/progress.test.ts
git commit -m "feat(world): the castle's five rooms as drafts, their registry, and the rest spot on the hall's step" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 3: The wings by eye: library and workshop
**Model:** Opus.
**Files:** Modify `lib/world/blueprints/library.ts`, `lib/world/blueprints/workshop.ts`, and only the `library` and `workshop` lines of `COUNTS` in `lib/world/blueprints/blueprints.test.ts`.

**Interfaces:**
- Consumes: Task 1's tiles, Task 2's drafts and tests, the preview tool above.
- Produces: the two wings' final maps and pinned counts. Must keep, because later tasks pin them: each room's `x`, `y`, width and height (library 9 by 9 at x 16, y 17; workshop 11 by 9 at x 40, y 17), the door column (library 21, workshop 44), the library's last column and the workshop's first without a floor cell, and at least one `forge` tile on the workshop's bottom wall row (y 24) with a wall cell directly to its left (Task 9's glow test reads the wall there).

**What to judge.** The wings must read as part of the hall: roof lines and eaves that meet the hall's beam and roof without a gap or a clash, the same wall and beam rhythm, windows on the hall's rows where they fit. The library should say "books" from across the island (the bookshelf windows, banners), the workshop "making" (the forge, the chimney with its cap). Use only legend letters for existing tiles; you may add legend entries (for example `brick-dark`, `plank`, `beam`) and decor (lanterns, banners) as long as every test in `blueprints.test.ts` passes: layer order, never in mid-air (a wing may lean on the hall), decor on the room's own cells, one door on the floor, trees behind solid cells.

- [ ] **Step 1: Look at the drafts.** Create the preview tool, run it with `PREVIEW_ROOM=library`, then `PREVIEW_ROOM=workshop`; look at `castle-day.png`, `castle-night.png`, `castle-half.png` and `close-<room>.png`.
- [ ] **Step 2: Redraw** the two maps (and decor) in rounds; after each round run `npx vitest run lib/world/blueprints` and the preview. The pinned counts will fail as soon as a count changes: that is expected until Step 3.
- [ ] **Step 3: Pin the counts.** Set `COUNTS.library` and `COUNTS.workshop` in `blueprints.test.ts` to the new totals (the failing test prints them). Update each file's top comment if what it says changed.
- [ ] **Step 4: Run all checks.** `npx vitest run && npx tsc --noEmit -p . && npm run lint`. Delete the preview tool. Put the final PNG paths in your report.
- [ ] **Step 5: Commit.**
```bash
git add lib/world/blueprints/library.ts lib/world/blueprints/workshop.ts lib/world/blueprints/blueprints.test.ts
git commit -m "art(world): the library and the workshop, drawn against the hall" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 4: The ends by eye: gate, study, observatory, and the whole castle
**Model:** Opus. Starts after Task 3 has committed.
**Files:** Modify `lib/world/blueprints/gate.ts`, `study.ts`, `observatory.ts`, and only the `gate`, `study` and `observatory` lines of `COUNTS` in `lib/world/blueprints/blueprints.test.ts`.

**Interfaces:**
- Consumes: Tasks 1 to 3, the preview tool above.
- Produces: the three end rooms' final maps and pinned counts. Must keep: each room's rectangle (gate 7 by 11 at x 4, y 15; study 5 by 13 at x 11, y 13; observatory 9 by 17 at x 51, y 9, top row y 9), the door columns (gate 7, study 13, observatory 55), the observatory as the highest room, and every other new room below the hall's peak (tests).

**What to judge.** The castle as one building from end to end: towers at the ends (the gate's turrets in the west, the observatory in the east), the skyline rising and falling (gate 11, study 13, library 9, hall 15, workshop 9, observatory 17 rows), the observatory's glass dome reading as glass and as the top of the whole castle, by day and by night. If Task 1 reported that `tower-cap` and `roof-peak` clutter each other, change the study's top rows (keeping its rectangle). Look at the night preview: the lanterns and lit windows should be spread along the whole castle, not bunched.

- [ ] **Step 1: Look** with the preview tool (`PREVIEW_ROOM=gate`, `study`, `observatory`).
- [ ] **Step 2: Redraw** in rounds; after each, `npx vitest run lib/world/blueprints` and the preview.
- [ ] **Step 3: Pin the counts** (`COUNTS.gate`, `COUNTS.study`, `COUNTS.observatory`) and update the files' top comments if needed.
- [ ] **Step 4: Run all checks.** `npx vitest run && npx tsc --noEmit -p . && npm run lint`. Delete the preview tool. Put the final PNG paths (the whole castle by day and by night) in your report: main shows them to Gur.
- [ ] **Step 5: Commit.**
```bash
git add lib/world/blueprints/gate.ts lib/world/blueprints/study.ts lib/world/blueprints/observatory.ts lib/world/blueprints/blueprints.test.ts
git commit -m "art(world): the gate, the study and the observatory, and the castle as one building" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 5: Unlock rules and the Settings flag
**Model:** Sonnet.
**Files:** Create `lib/world/unlock.ts`, `lib/world/unlock.test.ts`; modify `lib/shell/rail.ts`, `lib/shell/rail.test.ts`, `components/osmo/use-rail-dots.ts`.

**Interfaces:**
- Consumes: `CASTLE_ROOMS`, `CastleRoom` (Task 2); `createSeenStore` (phase A of the shell).
- Produces:
  - `type VillageCounts = { memories; notes; things; reminders; ideas; goals }` (all `number`), `NO_COUNTS`, `cleanCounts(raw): VillageCounts`, `type UnlockInput = { counts: VillageCounts; settingsOpened: boolean }`, `openRooms(i: UnlockInput): CastleRoom[]` (spec order), `SETTINGS_SEEN = "settings"`.
  - `createSeenStore(...).peek(id): string | null` (no baseline).
  - `safeLocalStorage()` exported from `components/osmo/use-rail-dots.ts`; the shell marks `SETTINGS_SEEN` whenever the Settings panel is open.

- [ ] **Step 1: Write the failing tests.** Create `lib/world/unlock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cleanCounts, NO_COUNTS, openRooms, type VillageCounts } from "./unlock";

const open = (counts: Partial<VillageCounts>, settingsOpened = false) => openRooms({ counts: { ...NO_COUNTS, ...counts }, settingsOpened });

describe("unlocking", () => {
	it("opens only the hall on day one", () => {
		expect(open({})).toEqual(["hall"]);
	});
	it("opens the library for the first fact or the first note", () => {
		expect(open({ memories: 1 })).toEqual(["hall", "library"]);
		expect(open({ notes: 1 })).toEqual(["hall", "library"]);
	});
	it("opens the workshop for the first thing he made, the gate for the first reminder", () => {
		expect(open({ things: 1 })).toEqual(["hall", "workshop"]);
		expect(open({ reminders: 2 })).toEqual(["hall", "gate"]);
	});
	it("opens the study for the first idea or goal, which nothing counts until the shell's phase B", () => {
		expect(open({ ideas: 1 })).toEqual(["hall", "study"]);
		expect(open({ goals: 1 })).toEqual(["hall", "study"]);
	});
	it("opens the observatory once Settings has been opened in the new shell", () => {
		expect(open({}, true)).toEqual(["hall", "observatory"]);
	});
	it("lists every open room in spec order, however they opened", () => {
		expect(open({ reminders: 1, things: 3, memories: 9, goals: 1 }, true)).toEqual(["hall", "library", "workshop", "study", "gate", "observatory"]);
	});
	it("reads a count that is not a whole number of at least one as none", () => {
		expect(cleanCounts({ memories: Number.NaN, notes: -3, things: "4", reminders: Infinity, ideas: 2.9, goals: undefined })).toEqual({
			memories: 0, notes: 0, things: 0, reminders: 0, ideas: 2, goals: 0,
		});
		expect(open({ memories: Number.NaN, notes: -1, things: 0.5 })).toEqual(["hall"]);
	});
});
```

and add to `lib/shell/rail.test.ts`:

- [ ] **R0t** Find:
```ts
	it("survives missing or throwing storage", () => {
```
Replace with:
```ts
	it("peeks without starting a baseline, and sees what was marked", () => {
		const s = createSeenStore(mem(), () => "2026-10-01T00:00:00Z");
		expect(s.peek("settings")).toBeNull();
		expect(s.peek("settings")).toBeNull();
		s.mark("settings");
		expect(s.peek("settings")).toBe("2026-10-01T00:00:00Z");
	});
	it("survives missing or throwing storage", () => {
```
- [ ] **R0u** Find:
```ts
			expect(() => s.mark("library")).not.toThrow();
```
Replace with:
```ts
			expect(() => s.mark("library")).not.toThrow();
			expect(s.peek("settings")).toBeNull();
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run lib/world/unlock.test.ts lib/shell/rail.test.ts`. Expected: FAIL (no `./unlock`; `s.peek is not a function`).
- [ ] **Step 3: Implement.** Create `lib/world/unlock.ts`:

```ts
// When each room may start (spec 4, "Unlocking"), pure. The hall starts on day one; the library when memory has its
// first fact or the first note exists; the workshop when the first thing he made exists; the study when the first
// idea or goal exists; the gate when the first reminder is set; the observatory when Settings has been opened in the
// new shell on this device. The counts are read once per visit (village-counts.ts); a room that has started stays in
// the queue whatever the counts say later (village.ts), so forgetting the last note never takes the library away.
import { CASTLE_ROOMS, type CastleRoom } from "./blueprints/types";

export type VillageCounts = { memories: number; notes: number; things: number; reminders: number; ideas: number; goals: number };
export const NO_COUNTS: VillageCounts = { memories: 0, notes: 0, things: 0, reminders: 0, ideas: 0, goals: 0 };
export type UnlockInput = { counts: VillageCounts; settingsOpened: boolean };
// The id under which the shell's per-device seen store keeps "Settings has been opened" (lib/shell/rail.ts).
export const SETTINGS_SEEN = "settings";

// A count as a whole number of at least 0: anything else (NaN, negative, a string) counts as none.
const whole = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
export function cleanCounts(raw: Partial<Record<keyof VillageCounts, unknown>>): VillageCounts {
	return {
		memories: whole(raw.memories),
		notes: whole(raw.notes),
		things: whole(raw.things),
		reminders: whole(raw.reminders),
		ideas: whole(raw.ideas),
		goals: whole(raw.goals),
	};
}

const RULES: Readonly<Record<CastleRoom, (i: UnlockInput) => boolean>> = {
	hall: () => true,
	library: (i) => i.counts.memories > 0 || i.counts.notes > 0,
	workshop: (i) => i.counts.things > 0,
	// Ideas and Goals are the shell's phase B, not built yet: their counts are 0 until a reader for them exists, and
	// then this rule needs no change.
	study: (i) => i.counts.ideas > 0 || i.counts.goals > 0,
	gate: (i) => i.counts.reminders > 0,
	observatory: (i) => i.settingsOpened,
};

// The rooms that may be built, in spec order.
export function openRooms(i: UnlockInput): CastleRoom[] {
	const counts = cleanCounts(i.counts);
	return CASTLE_ROOMS.filter((room) => RULES[room]({ counts, settingsOpened: i.settingsOpened === true }));
}
```

In `lib/shell/rail.ts`:

- [ ] **R0** Find:
```ts
		mark(id: string): void {
```
Replace with:
```ts
		// What was stored for this id, without starting a baseline: null when nothing was, or storage fails.
		peek(id: string): string | null {
			try {
				return storage?.getItem(key(id)) ?? null;
			} catch {
				return null;
			}
		},
		mark(id: string): void {
```

- [ ] **Step 4: Run the tests.** Same command. Expected: PASS.
- [ ] **Step 5: The shell marks Settings.** In `components/osmo/use-rail-dots.ts`:

- [ ] **R1** Find:
```ts
// Storage can be missing or throw (private windows, blocked site data): then there is no dot.
function safeLocalStorage(): KeyValue | null {
```
Replace with:
```ts
// Storage can be missing or throw (private windows, blocked site data): then there is no dot. The village reads the
// same store (components/osmo/world.tsx).
export function safeLocalStorage(): KeyValue | null {
```
- [ ] **R2** Find:
```ts
import { createSeenStore, hasNew, type KeyValue } from "@/lib/shell/rail";
```
Replace with:
```ts
import { createSeenStore, hasNew, type KeyValue } from "@/lib/shell/rail";
import { SETTINGS_SEEN } from "@/lib/world/unlock";
```
- [ ] **R3** Find:
```ts
	return { library };
```
Replace with:
```ts
	// Settings opened in the new shell, kept per device: the village's observatory unlocks on it (lib/world/unlock.ts).
	useEffect(() => {
		if (enabled && ready && panel === "settings") store().mark(SETTINGS_SEEN);
	}, [enabled, ready, panel, store]);

	return { library };
```

- [ ] **Step 6: Checks and commit.** `npx vitest run && npx tsc --noEmit -p . && npm run lint`, then:
```bash
git add lib/world/unlock.ts lib/world/unlock.test.ts lib/shell/rail.ts lib/shell/rail.test.ts components/osmo/use-rail-dots.ts
git commit -m "feat(world): the rooms' unlock rules, and the shell keeps that Settings was opened" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 6: The village across rooms
**Model:** Sonnet.
**Files:** Create `lib/world/village.ts`, `lib/world/village.test.ts`.

**Interfaces:**
- Consumes: `CASTLE_BLOCKS` (Task 2), `CASTLE_ROOMS`, `CastleRoom`, `RoomId`, `Block`; `lay`, `markSaved`, `needsSave`, `resume`, `RoomProgress`, `VillageNews`, `VillageRow` (phase 1 `progress.ts`).
- Produces: `type Village = { queue: readonly CastleRoom[]; rooms: Readonly<Partial<Record<CastleRoom, RoomProgress>>> }`; `queueOf(rows, open): CastleRoom[]`; `resumeVillage(rows, open, nowIso): Village`; `admit(v, open, nowIso): Village`; `current(v): CastleRoom | null`; `nextBlock(v): Block | null`; `layNext(v, nowIso): { village; news: VillageNews | null; laid: RoomProgress | null }`; `laidBlocks(v): Block[]`; `laidCount(v): number`; `outlineBlocks(v): Block[]`; `finishedRooms(v): CastleRoom[]`; `dueSaves(v, reason: "block" | "hidden"): RoomProgress[]`; `markRoomSaved(v, room: RoomId, laid): Village`; `pinnedVillage(laid: Partial<Record<CastleRoom, number>>, nowIso): Village`. Task 10 uses all of them.

- [ ] **Step 1: Write the failing test.** Create `lib/world/village.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { CASTLE_ROOMS, type CastleRoom } from "./blueprints/types";
import type { VillageRow } from "./progress";
import {
	admit, current, dueSaves, finishedRooms, laidBlocks, laidCount, layNext, markRoomSaved, nextBlock, outlineBlocks, pinnedVillage,
	queueOf, resumeVillage, type Village,
} from "./village";

const NOW = "2026-10-10T12:00:00.000Z";
const total = (room: CastleRoom) => CASTLE_BLOCKS[room].length;
const row = (room: CastleRoom, laid: number, started_at = "2026-10-01T09:00:00.000Z"): VillageRow => ({ room, laid, started_at, finished_at: null });
const layMany = (v: Village, n: number) => {
	const news = [];
	for (let i = 0; i < n; i++) {
		const r = layNext(v, NOW);
		v = r.village;
		if (r.news) news.push(r.news);
	}
	return { v, news };
};

describe("the building order", () => {
	it("is the hall alone on day one", () => {
		expect(queueOf([], ["hall"])).toEqual(["hall"]);
	});
	it("keeps started rooms first, oldest first, then the open ones in spec order", () => {
		const rows = [row("gate", 3, "2026-10-05T00:00:00Z"), row("hall", 180, "2026-10-01T00:00:00Z")];
		expect(queueOf(rows, ["hall", "library", "workshop", "gate", "observatory"])).toEqual(["hall", "gate", "library", "workshop", "observatory"]);
	});
	it("keeps a started room whose rule is no longer true, and puts an unreadable start last among the started", () => {
		const rows = [row("library", 5, "junk"), row("hall", 180, "2026-10-01T00:00:00Z")];
		expect(queueOf(rows, ["hall"])).toEqual(["hall", "library"]);
	});
	it("ignores rows for rooms it does not know", () => {
		expect(queueOf([{ room: "moat", laid: 4, started_at: NOW, finished_at: null }], ["hall"])).toEqual(["hall"]);
	});
});

describe("building room after room", () => {
	it("picks up the hall where it was, and the library only once the hall is done", () => {
		const v = resumeVillage([row("hall", 90)], ["hall", "library"], NOW);
		expect(current(v)).toBe("hall");
		expect(nextBlock(v)).toBe(CASTLE_BLOCKS.hall[90]);
		const done = layMany(v, 90);
		expect(done.news).toEqual([{ room: "hall", event: "finished" }]);
		expect(current(done.v)).toBe("library");
		expect(nextBlock(done.v)).toBe(CASTLE_BLOCKS.library[0]);
		const begun = layNext(done.v, NOW);
		expect(begun.news).toEqual({ room: "library", event: "started" });
		expect(begun.laid).toMatchObject({ room: "library", laid: 1 });
	});
	it("takes a phase 1 hall row as it is: finished by its count even when finished_at never reached the table", () => {
		const v = resumeVillage([row("hall", 180)], ["hall", "library"], NOW);
		expect(v.rooms.hall).toMatchObject({ laid: 180, saved: 180 });
		expect(current(v)).toBe("library");
	});
	it("stops when every open room is finished, and never lays past the end", () => {
		const v = resumeVillage([row("hall", 180)], ["hall"], NOW);
		expect(current(v)).toBeNull();
		expect(nextBlock(v)).toBeNull();
		expect(layNext(v, NOW)).toEqual({ village: v, news: null, laid: null });
		expect(laidCount(resumeVillage([row("hall", 9999)], ["hall"], NOW))).toBe(180);
	});
	it("admits a room that opens during the visit at the end of the queue, once", () => {
		const v = resumeVillage([], ["hall", "gate"], NOW);
		const w = admit(v, ["hall", "gate", "observatory"], NOW);
		expect(w.queue).toEqual(["hall", "gate", "observatory"]);
		expect(w.rooms.observatory).toMatchObject({ laid: 0, total: total("observatory") });
		expect(admit(w, ["observatory"], NOW)).toBe(w);
	});
});

describe("what is drawn", () => {
	const v = resumeVillage([row("hall", 180), row("library", 10)], ["hall", "library", "gate"], NOW);
	it("draws the laid blocks solid, room by room", () => {
		expect(laidBlocks(v)).toEqual([...CASTLE_BLOCKS.hall, ...CASTLE_BLOCKS.library.slice(0, 10)]);
		expect(laidCount(v)).toBe(190);
	});
	it("outlines the rest of every open room except the next block, and nothing of a locked room", () => {
		const outline = outlineBlocks(v);
		expect(outline).toHaveLength(total("library") - 11 + total("gate"));
		expect(outline).not.toContain(nextBlock(v));
		expect(outline.some((b) => CASTLE_BLOCKS.workshop.includes(b))).toBe(false);
	});
	it("lists the finished rooms", () => {
		expect(finishedRooms(v)).toEqual(["hall"]);
	});
});

describe("saving", () => {
	it("saves a room every eight blocks, the room just finished, and everything ahead when hidden", () => {
		let v = resumeVillage([row("hall", 170)], ["hall", "library"], NOW);
		v = layMany(v, 8).v;
		expect(dueSaves(v, "block").map((p) => p.room)).toEqual(["hall"]);
		v = markRoomSaved(v, "hall", 178);
		v = layMany(v, 2).v; // the hall finishes at 180
		expect(dueSaves(v, "block").map((p) => p.room)).toEqual(["hall"]);
		v = markRoomSaved(v, "hall", 180);
		v = layMany(v, 3).v; // three blocks of the library
		expect(dueSaves(v, "block")).toEqual([]);
		expect(dueSaves(v, "hidden").map((p) => [p.room, p.laid])).toEqual([["library", 3]]);
	});
	it("never moves a saved count backwards, and ignores a room it does not hold", () => {
		const v = resumeVillage([row("hall", 40)], ["hall"], NOW);
		expect(markRoomSaved(v, "hall", 12).rooms.hall?.saved).toBe(40);
		expect(markRoomSaved(v, "gate", 12)).toBe(v);
	});
});

describe("the dev page's fixed village", () => {
	it("opens only the rooms it is given, clamped to whole blocks inside each room", () => {
		const v = pinnedVillage({ hall: 9999, gate: -4, observatory: Number.NaN, library: 12.6 }, NOW);
		expect(v.queue).toEqual(["hall", "library", "gate", "observatory"]);
		expect(CASTLE_ROOMS.map((r) => v.rooms[r]?.laid ?? null)).toEqual([180, 12, null, null, 0, 0]);
	});
});
```

- [ ] **Step 2: Run it to see it fail.** `npx vitest run lib/world/village.test.ts`. Expected: FAIL (no `./village`).
- [ ] **Step 3: Implement.** Create `lib/world/village.ts`:

```ts
// The castle's progress across its rooms (spec 4), pure. Rooms are built one at a time, in the order they unlock:
// a room that has started (it has a saved row) keeps its place, oldest first, and rooms open but not started follow in
// spec order. Each room's own count is progress.ts's RoomProgress, so resume, lay and save work per room as in phase 1.
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { CASTLE_ROOMS, type Block, type CastleRoom, type RoomId } from "./blueprints/types";
import { lay, markSaved, needsSave, resume, type RoomProgress, type VillageNews, type VillageRow } from "./progress";

export type Village = { queue: readonly CastleRoom[]; rooms: Readonly<Partial<Record<CastleRoom, RoomProgress>>> };

const total = (room: CastleRoom): number => CASTLE_BLOCKS[room].length;
const laidIn = (v: Village, room: CastleRoom): number => v.rooms[room]?.laid ?? 0;
const time = (iso: string | undefined): number => {
	const t = iso === undefined ? Number.NaN : Date.parse(iso);
	return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

// The building order: started rooms by when they started (an unreadable date goes last; ties keep spec order), then
// the open rooms not started yet, in spec order. A started room stays even if its unlock rule is no longer true.
export function queueOf(rows: readonly VillageRow[], open: readonly CastleRoom[]): CastleRoom[] {
	const startOf = (room: CastleRoom) => time(rows.find((r) => r.room === room)?.started_at);
	const started = CASTLE_ROOMS.filter((room) => rows.some((r) => r.room === room)).sort((a, b) => {
		const d = startOf(a) - startOf(b);
		return Number.isNaN(d) ? 0 : d;
	});
	return [...started, ...CASTLE_ROOMS.filter((room) => open.includes(room) && !started.includes(room))];
}

export function resumeVillage(rows: readonly VillageRow[], open: readonly CastleRoom[], nowIso: string): Village {
	const queue = queueOf(rows, open);
	const rooms: Partial<Record<CastleRoom, RoomProgress>> = {};
	for (const room of queue) rooms[room] = resume(rows, room, total(room), nowIso);
	return { queue, rooms };
}

// Rooms that opened during the visit (Settings opened for the first time) join the end of the queue.
export function admit(v: Village, open: readonly CastleRoom[], nowIso: string): Village {
	const add = CASTLE_ROOMS.filter((room) => open.includes(room) && !v.queue.includes(room));
	if (add.length === 0) return v;
	const rooms: Partial<Record<CastleRoom, RoomProgress>> = { ...v.rooms };
	for (const room of add) rooms[room] = resume([], room, total(room), nowIso);
	return { queue: [...v.queue, ...add], rooms };
}

// The room he works on: the first in the queue that is not finished. Null when every open room is done.
export function current(v: Village): CastleRoom | null {
	return v.queue.find((room) => laidIn(v, room) < total(room)) ?? null;
}
export function nextBlock(v: Village): Block | null {
	const room = current(v);
	return room === null ? null : (CASTLE_BLOCKS[room][laidIn(v, room)] ?? null);
}

// One more block of the room he works on. `laid` is that room's progress afterwards (save it when needsSave says so).
export function layNext(v: Village, nowIso: string): { village: Village; news: VillageNews | null; laid: RoomProgress | null } {
	const room = current(v);
	const p = room === null ? undefined : v.rooms[room];
	if (room === null || !p) return { village: v, news: null, laid: null };
	const r = lay(p, nowIso);
	return { village: { ...v, rooms: { ...v.rooms, [room]: r.progress } }, news: r.news, laid: r.progress };
}

// Every block laid so far, room by room in queue order: what the renderer draws solid.
export const laidBlocks = (v: Village): Block[] => v.queue.flatMap((room) => CASTLE_BLOCKS[room].slice(0, laidIn(v, room)));
export const laidCount = (v: Village): number => v.queue.reduce((n, room) => n + laidIn(v, room), 0);
// What is still to come in every open room, drawn as a faint outline (spec 5): a locked room is not in the queue, so
// it is not drawn at all (spec 2). The next block is left out; it is drawn on its own, a little stronger.
export function outlineBlocks(v: Village): Block[] {
	const next = nextBlock(v);
	return v.queue.flatMap((room) => CASTLE_BLOCKS[room].slice(laidIn(v, room))).filter((b) => b !== next);
}
// The rooms that are finished, in queue order: a click on one of these opens its panel.
export const finishedRooms = (v: Village): CastleRoom[] => v.queue.filter((room) => laidIn(v, room) >= total(room));

// The rooms to save now: any room ahead of its last save by the rule in progress.ts (needsSave).
export const dueSaves = (v: Village, reason: "block" | "hidden"): RoomProgress[] =>
	v.queue.map((room) => v.rooms[room]).filter((p): p is RoomProgress => p !== undefined && needsSave(p, reason));
// After a save of a room (by its RoomProgress.room): the saved count, never backwards. A room not in the queue is ignored.
export function markRoomSaved(v: Village, room: RoomId, laid: number): Village {
	const key = v.queue.find((r) => r === room);
	const p = key === undefined ? undefined : v.rooms[key];
	return key !== undefined && p ? { ...v, rooms: { ...v.rooms, [key]: markSaved(p, laid) } } : v;
}

// A fixed village for /dev/world: each listed room open with that many blocks (a whole number from 0 to its total),
// every other room locked. Nothing in it is ever laid or saved.
export function pinnedVillage(laid: Partial<Record<CastleRoom, number>>, nowIso: string): Village {
	const queue = CASTLE_ROOMS.filter((room) => laid[room] !== undefined);
	const rows: VillageRow[] = queue.map((room) => {
		const n = laid[room] ?? 0;
		return { room, laid: Number.isFinite(n) ? n : 0, started_at: nowIso, finished_at: null };
	});
	return resumeVillage(rows, [], nowIso);
}
```

- [ ] **Step 4: Run the test.** Expected: PASS (14 tests).
- [ ] **Step 5: Checks and commit.** `npx vitest run && npx tsc --noEmit -p . && npm run lint`, then:
```bash
git add lib/world/village.ts lib/world/village.test.ts
git commit -m "feat(world): the village's progress across its rooms, one at a time in the order they open" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 7: The village table: clear, and the counts
**Model:** Sonnet.
**Files:** Replace `lib/world/village-data.ts`; create `lib/world/village-data.test.ts`, `lib/world/village-counts.ts`.

**Interfaces:**
- Consumes: `CASTLE_ROOMS` (Task 2), `cleanCounts`, `VillageCounts` (Task 5), `isVillageRow`, `saveRow` (phase 1), the readers in `lib/shell/data.ts`, `latestOfChains` (`lib/artifacts/things.ts`).
- Produces: `loadVillage()` and `saveRoom(p)` as before (same signatures; `saveRoom` returns false while a clear runs); `clearVillage(): Promise<boolean>`; `VILLAGE_CLEARED = "osmo:village-cleared"` (a window event); `CLEARED_KEY = "osmo-village-cleared"` (a localStorage key other tabs hear); `readVillageCounts(): Promise<VillageCounts>` (never rejects). Tasks 10 and 11 use them.

`village-data.ts` now imports `../supabase` (the same module as `@/lib/supabase`) so the test can stand in for the client; `village-counts.ts` imports `lib/shell/data.ts`, which uses `@/`, so it is not unit-tested.

- [ ] **Step 1: Write the failing test.** Create `lib/world/village-data.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What reached the table, in order, and a way to hold an upsert open or make the delete fail.
const log: string[] = [];
let holdUpsert: Promise<void> | null = null;
let deleteError: { message: string } | null = null;
let deleted: { column: string; values: string[] } | null = null;

vi.mock("../supabase", () => ({
	supabase: {
		from: (table: string) => ({
			upsert: async (row: { room: string; laid: number }) => {
				if (holdUpsert) await holdUpsert;
				log.push(`upsert ${table} ${row.room} ${row.laid}`);
				return { error: null };
			},
			delete: () => ({
				in: async (column: string, values: string[]) => {
					deleted = { column, values };
					log.push(`delete ${table}`);
					return { error: deleteError };
				},
			}),
		}),
	},
}));

import { CASTLE_ROOMS } from "./blueprints/types";
import { resume } from "./progress";
import { CLEARED_KEY, clearVillage, saveRoom, VILLAGE_CLEARED } from "./village-data";

const NOW = "2026-10-10T12:00:00.000Z";
const hall = (laid: number) => ({ ...resume([], "hall", 180, NOW), laid });

beforeEach(() => {
	log.length = 0;
	holdUpsert = null;
	deleteError = null;
	deleted = null;
	const win = new EventTarget();
	win.addEventListener(VILLAGE_CLEARED, () => log.push("cleared"));
	vi.stubGlobal("window", win);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("clearing the village", () => {
	it("deletes every room of the owner's village, then tells the world", async () => {
		expect(await clearVillage()).toBe(true);
		expect(deleted).toEqual({ column: "room", values: [...CASTLE_ROOMS] });
		expect(log).toEqual(["delete village", "cleared"]);
	});
	it("waits for a save already on its way, so an old count never lands after the delete", async () => {
		let release = () => {};
		holdUpsert = new Promise<void>((r) => (release = r));
		const saving = saveRoom(hall(40));
		const clearing = clearVillage();
		await Promise.resolve();
		expect(log).toEqual([]);
		release();
		expect(await saving).toBe(true);
		expect(await clearing).toBe(true);
		expect(log).toEqual(["upsert village hall 40", "delete village", "cleared"]);
	});
	it("starts no save while it clears, and saves again afterwards", async () => {
		let release = () => {};
		holdUpsert = new Promise<void>((r) => (release = r));
		const first = saveRoom(hall(8));
		const clearing = clearVillage();
		expect(await saveRoom(hall(16))).toBe(false);
		release();
		await first;
		await clearing;
		holdUpsert = null;
		expect(await saveRoom(hall(1))).toBe(true);
		expect(log).toEqual(["upsert village hall 8", "delete village", "cleared", "upsert village hall 1"]);
	});
	it("tells the other open tabs through localStorage, and does without it", async () => {
		const stored = new Map<string, string>();
		const win = Object.assign(new EventTarget(), { localStorage: { setItem: (k: string, v: string) => void stored.set(k, v) } });
		vi.stubGlobal("window", win);
		expect(await clearVillage()).toBe(true);
		expect(stored.get(CLEARED_KEY)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: { setItem: () => { throw new Error("blocked"); } } }));
		expect(await clearVillage()).toBe(true);
	});
	it("says false and tells nobody when the delete fails", async () => {
		deleteError = { message: "offline" };
		expect(await clearVillage()).toBe(false);
		expect(log).toEqual(["delete village"]);
		expect(await saveRoom(hall(3))).toBe(true);
	});
});
```

- [ ] **Step 2: Run it to see it fail.** `npx vitest run lib/world/village-data.test.ts`. Expected: FAIL (`clearVillage` is not exported; with the old `@/lib/supabase` import the module may fail to resolve first).
- [ ] **Step 3: Implement.** Replace `lib/world/village-data.ts` with:

```ts
// The village table (spec 4): one read per visit, an upsert per save, and Settings' "Clear the village". Rows are the
// owner's only (RLS). The import is relative so the test can stand in for the client.
import { supabase } from "../supabase";
import { CASTLE_ROOMS } from "./blueprints/types";
import { isVillageRow, saveRow, type RoomProgress, type VillageRow } from "./progress";

// Sent on window once the rows are gone; the world drops what it holds and reads the village again. Other open tabs
// hear it through localStorage (a "storage" event for CLEARED_KEY), so they stop saving their old counts too.
export const VILLAGE_CLEARED = "osmo:village-cleared";
export const CLEARED_KEY = "osmo-village-cleared";
// While a clear runs no save starts, and the clear first waits for a save already on its way, so an old count can never
// land after the rows are deleted. (The table's trigger guards updates only; a clear is a delete, so nothing stops it.)
let clearing = false;
let inFlight: Promise<unknown> = Promise.resolve();

// ok is false when it could not be read (a network error, or the table is not migrated yet): then he does not build
// and nothing is saved this visit, rather than building on a count that may be wrong.
export async function loadVillage(): Promise<{ rows: VillageRow[]; ok: boolean }> {
	const r = await supabase.from("village").select("room,laid,started_at,finished_at");
	if (r.error) return { rows: [], ok: false };
	return { rows: ((r.data ?? []) as unknown[]).filter(isVillageRow), ok: true };
}

// user_id comes from the column default (auth.uid()), as the room's other upserts do. True when it was saved; false
// when it failed or a clear is running.
export async function saveRoom(p: RoomProgress): Promise<boolean> {
	if (clearing) return false;
	const run = Promise.resolve(supabase.from("village").upsert(saveRow(p), { onConflict: "user_id,room" }));
	inFlight = run.catch(() => undefined);
	const { error } = await run;
	if (error) console.error("Could not save the village", error);
	return !error;
}

// Deletes every room of Gur's village. True when the rows are gone (also when there were none).
export async function clearVillage(): Promise<boolean> {
	if (clearing) return false;
	clearing = true;
	try {
		await inFlight;
		const { error } = await supabase.from("village").delete().in("room", [...CASTLE_ROOMS]);
		if (error) {
			console.error("Could not clear the village", error);
			return false;
		}
		// Before `clearing` ends, so the world has dropped its counts before any save can start again.
		if (typeof window !== "undefined") {
			window.dispatchEvent(new Event(VILLAGE_CLEARED));
			try {
				window.localStorage.setItem(CLEARED_KEY, new Date().toISOString());
			} catch {
				/* no storage: other tabs learn of it on their next visit */
			}
		}
		return true;
	} catch (err) {
		console.error("Could not clear the village", err);
		return false;
	} finally {
		clearing = false;
	}
}
```

Create `lib/world/village-counts.ts`:

```ts
// What the unlock rules and the context line count (spec 4 and 5), read once per visit with the readers Library and
// Feed already use, so the counts match what their panels show (notes up to 100, things up to 200 versions, reminders
// up to 100). A reader that fails counts as none: its room simply waits for the next visit. Not unit-tested (network);
// the rules it feeds are (unlock.ts).
import { latestOfChains } from "@/lib/artifacts/things";
import { readMemoryDates, readNotes, readReminders, readThings } from "@/lib/shell/data";
import { cleanCounts, type VillageCounts } from "./unlock";

export async function readVillageCounts(): Promise<VillageCounts> {
	const [dates, notes, things, reminders] = await Promise.all([
		readMemoryDates().catch(() => ({})),
		readNotes().catch(() => null),
		readThings().catch(() => null),
		readReminders().catch(() => null),
	]);
	return cleanCounts({
		memories: Object.keys(dates).length,
		notes: notes?.rows.length ?? 0,
		things: things ? latestOfChains(things.rows).length : 0,
		reminders: reminders?.rows.length ?? 0,
		// Ideas and Goals (the shell's phase B) are not built yet: when they are, their readers fill these two.
		ideas: 0,
		goals: 0,
	});
}
```

- [ ] **Step 4: Run the test.** Expected: PASS (5 tests).
- [ ] **Step 5: Checks and commit.** `npx vitest run && npx tsc --noEmit -p . && npm run lint`, then:
```bash
git add lib/world/village-data.ts lib/world/village-data.test.ts lib/world/village-counts.ts
git commit -m "feat(world): clearing the village safely, and the counts the rooms open on" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 8: Rooms as places (pure)
**Model:** Sonnet.
**Files:** Create `lib/world/rooms.ts`, `lib/world/rooms.test.ts`.

**Interfaces:**
- Consumes: `SHIPPED_PANELS`, `PanelId`, `Route` (`lib/shell/route.ts`); `START_X` (`blueprints/index.ts`); `CASTLE_BLOCKS`, `DOOR_X` (Task 2); `toScreen`, `zoomAt`, `Camera`, `View` (`camera.ts`); `VillageCounts` (Task 5).
- Produces: `type Place = "yard" | Exclude<CastleRoom, "hall">`; `placeOf(route): Place`; `routeOf(room, shipped?): Route | null`; `clickable(finished, shipped?): CastleRoom[]`; `spotX(place): number` (world px); `ROOM_LABELS`; `type Box`, `ROOM_BOXES`; `type Hit = Box & { room; seen }`, `hitAreas(rooms, camera, view, now): Hit[]`; `roomContext(place, counts, who = "Gur"): string | null`. Task 10 uses all of them; `roomContext` is for the language lane.

- [ ] **Step 1: Write the failing test.** Create `lib/world/rooms.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { START_X } from "./blueprints";
import { CASTLE_ROOMS, TILE } from "./blueprints/types";
import { newCamera } from "./camera";
import { clickable, hitAreas, placeOf, ROOM_BOXES, ROOM_LABELS, roomContext, routeOf, spotX } from "./rooms";
import { NO_COUNTS } from "./unlock";

describe("places", () => {
	it("puts each panel in its room, and Talk in the yard", () => {
		expect(placeOf({ panel: null })).toBe("yard");
		expect(placeOf({ panel: "library" })).toBe("library");
		expect(placeOf({ panel: "library", page: "memory" })).toBe("library");
		expect(placeOf({ panel: "library", page: "things" })).toBe("workshop");
		expect(placeOf({ panel: "library", page: "things", item: "abc" })).toBe("workshop");
		expect(placeOf({ panel: "feed" })).toBe("gate");
		expect(placeOf({ panel: "ideas" })).toBe("study");
		expect(placeOf({ panel: "goals", item: "x" })).toBe("study");
		expect(placeOf({ panel: "search" })).toBe("observatory");
		expect(placeOf({ panel: "settings", page: "about" })).toBe("observatory");
	});
	it("stands him before each room's door, and at the hall's door in the yard", () => {
		expect(spotX("yard")).toBe(START_X);
		expect(spotX("library")).toBe(21.5 * TILE);
		expect(spotX("workshop")).toBe(44.5 * TILE);
		expect(spotX("gate")).toBe(7.5 * TILE);
		expect(spotX("study")).toBe(13.5 * TILE);
		expect(spotX("observatory")).toBe(55.5 * TILE);
	});
});

describe("clicking a room", () => {
	it("opens the room's panel, and the room's panel puts him back in that room", () => {
		for (const room of clickable([...CASTLE_ROOMS])) {
			const to = routeOf(room);
			expect(to, room).not.toBeNull();
			if (to) expect(placeOf(to)).toBe(room);
		}
		expect(routeOf("library")).toEqual({ panel: "library" });
		expect(routeOf("workshop")).toEqual({ panel: "library", page: "things" });
		expect(routeOf("gate")).toEqual({ panel: "feed" });
		expect(routeOf("observatory")).toEqual({ panel: "settings" });
	});
	it("gives the hall and a room whose panel has not shipped no hit area", () => {
		expect(routeOf("hall")).toBeNull();
		expect(routeOf("study")).toBeNull();
		expect(routeOf("study", ["ideas", "library"])).toEqual({ panel: "ideas" });
		expect(clickable([...CASTLE_ROOMS])).toEqual(["library", "workshop", "gate", "observatory"]);
		expect(clickable(["observatory", "hall", "gate"])).toEqual(["gate", "observatory"]);
		expect(clickable([])).toEqual([]);
	});
	it("labels every hit area for the keyboard", () => {
		for (const room of CASTLE_ROOMS) expect(ROOM_LABELS[room].length).toBeGreaterThan(3);
	});
});

describe("hit areas", () => {
	it("boxes each room round its blocks", () => {
		expect(ROOM_BOXES.hall).toEqual({ x: 24 * TILE, y: 11 * TILE, w: 17 * TILE, h: 15 * TILE });
		expect(ROOM_BOXES.observatory.y).toBe(9 * TILE);
	});
	it("puts the boxes where the camera draws them, scaled", () => {
		const view = { w: 1200, h: 800 };
		const camera = newCamera(START_X, view, 1);
		const [library] = hitAreas(["library"], camera, view, 0);
		expect(library).toEqual({ room: "library", x: Math.round(16 * TILE - camera.x + 600), y: Math.round(17 * TILE - camera.y + 400), w: 9 * TILE, h: 9 * TILE, seen: true });
		const near = hitAreas(["library"], { ...camera, from: 2, to: 2 }, view, 0)[0];
		expect([near.w, near.h]).toEqual([18 * TILE, 18 * TILE]);
	});
	it("marks a room out of view as unseen, so its button is hidden", () => {
		const phone = { w: 375, h: 700 };
		const hits = hitAreas(["hall", "observatory"], newCamera(START_X, phone, 2), phone, 0);
		expect(hits.map((h) => [h.room, h.seen])).toEqual([["hall", true], ["observatory", false]]);
		expect(hitAreas(["hall"], newCamera(START_X, { w: 0, h: 0 }, 1), { w: 0, h: 0 }, 0)[0].seen).toBe(false);
	});
});

describe("the context line", () => {
	it("says where Gur is and what is in front of Osmo, in counts only", () => {
		expect(roomContext("library", { ...NO_COUNTS, memories: 14, notes: 3 })).toBe("Gur is in the library with you; in front of you are 14 memories and 3 notes.");
		expect(roomContext("library", { ...NO_COUNTS, memories: 1 })).toBe("Gur is in the library with you; in front of you is 1 memory.");
		expect(roomContext("workshop", { ...NO_COUNTS, things: 2 })).toBe("Gur is in the workshop with you; in front of you are 2 things you made.");
		expect(roomContext("gate", { ...NO_COUNTS, reminders: 1, notes: 9 })).toBe("Gur is at the gate with you; in front of you is 1 reminder.");
		expect(roomContext("study", { ...NO_COUNTS, ideas: 1, goals: 1 })).toBe("Gur is in the study with you; in front of you are 1 idea and 1 goal.");
		expect(roomContext("observatory", NO_COUNTS)).toBe("Gur is in the observatory with you, where your settings are.");
	});
	it("says so when a room is empty, reads a bad count as none, and says nothing in the yard", () => {
		expect(roomContext("study", NO_COUNTS)).toBe("Gur is in the study with you; nothing is here yet.");
		expect(roomContext("library", { ...NO_COUNTS, memories: Number.NaN, notes: -2 })).toBe("Gur is in the library with you; nothing is here yet.");
		expect(roomContext("yard", { ...NO_COUNTS, memories: 4 })).toBeNull();
		expect(roomContext("gate", { ...NO_COUNTS, reminders: 2 }, "Sam")).toBe("Sam is at the gate with you; in front of you are 2 reminders.");
	});
	it("keeps to plain speakable text", () => {
		for (const place of ["library", "workshop", "study", "gate", "observatory"] as const) {
			const line = roomContext(place, { memories: 2, notes: 2, things: 2, reminders: 2, ideas: 2, goals: 2 }) ?? "";
			expect(line).toMatch(/^[A-Za-z0-9 ,;.]+$/);
		}
	});
});
```

- [ ] **Step 2: Run it to see it fail.** `npx vitest run lib/world/rooms.test.ts`. Expected: FAIL (no `./rooms`).
- [ ] **Step 3: Implement.** Create `lib/world/rooms.ts`:

```ts
// Rooms as places (spec 5), pure. The rail stays the map: each panel has a place in the world, he walks there when it
// opens, and a finished room opens its panel when clicked. Talk is the yard in front of the hall.
// Library is the library (its "things" page is the workshop), Feed the gate, Ideas and Goals the study, Search the
// observatory's glass and Settings the observatory.
import { SHIPPED_PANELS, type PanelId, type Route } from "../shell/route";
import { START_X } from "./blueprints";
import { CASTLE_BLOCKS, DOOR_X } from "./blueprints/castle";
import { CASTLE_ROOMS, TILE, type CastleRoom } from "./blueprints/types";
import { toScreen, zoomAt, type Camera, type View } from "./camera";
import type { VillageCounts } from "./unlock";

export type Place = "yard" | Exclude<CastleRoom, "hall">;

// Where the open panel puts him.
export function placeOf(route: Route): Place {
	switch (route.panel) {
		case "library":
			return route.page === "things" ? "workshop" : "library";
		case "feed":
			return "gate";
		case "ideas":
		case "goals":
			return "study";
		case "search":
		case "settings":
			return "observatory";
		default:
			return "yard";
	}
}

const PANEL: Readonly<Record<Exclude<CastleRoom, "hall">, Route>> = {
	library: { panel: "library" },
	workshop: { panel: "library", page: "things" },
	gate: { panel: "feed" },
	study: { panel: "ideas" },
	observatory: { panel: "settings" },
};
// What a click on a room opens; null for the hall (Talk is already where he stands) and for a room whose panel has not
// shipped yet (the study, until Ideas exists), so such a room has no hit area.
export function routeOf(room: CastleRoom, shipped: readonly PanelId[] = SHIPPED_PANELS): Route | null {
	if (room === "hall") return null;
	const to = PANEL[room];
	return to.panel !== null && shipped.includes(to.panel) ? to : null;
}
// The rooms a click can open: finished ones whose panel exists, west to east.
export const clickable = (finished: readonly CastleRoom[], shipped: readonly PanelId[] = SHIPPED_PANELS): CastleRoom[] =>
	CASTLE_ROOMS.filter((room) => finished.includes(room) && routeOf(room, shipped) !== null);

// Where he stands for a place (world px): before the room's door, or the yard at the hall's door.
export const spotX = (place: Place): number => (place === "yard" ? START_X : (DOOR_X[place] + 0.5) * TILE);

// The label a room's hit area reads out.
export const ROOM_LABELS: Readonly<Record<CastleRoom, string>> = {
	hall: "The hall",
	library: "Open the library: memory and notes",
	workshop: "Open the workshop: the things I made",
	study: "Open the study: ideas and goals",
	gate: "Open the gate: the feed",
	observatory: "Open the observatory: settings",
};

export type Box = { x: number; y: number; w: number; h: number };
// Each room's footprint in world px: the box round its blocks.
export const ROOM_BOXES: Readonly<Record<CastleRoom, Box>> = Object.fromEntries(
	CASTLE_ROOMS.map((room) => {
		const bs = CASTLE_BLOCKS[room];
		const x0 = Math.min(...bs.map((b) => b.x));
		const y0 = Math.min(...bs.map((b) => b.y));
		const x1 = Math.max(...bs.map((b) => b.x)) + 1;
		const y1 = Math.max(...bs.map((b) => b.y)) + 1;
		return [room, { x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE }];
	}),
) as Record<CastleRoom, Box>;

export type Hit = Box & { room: CastleRoom; seen: boolean };
// The rooms' hit areas on the canvas (canvas px), for the DOM buttons laid over it. seen is false when none of the
// box is in view: that button is hidden, so the keyboard never lands on something off screen.
export function hitAreas(rooms: readonly CastleRoom[], camera: Camera, view: View, now: number): Hit[] {
	const z = zoomAt(camera, now);
	return rooms.map((room) => {
		const b = ROOM_BOXES[room];
		const at = toScreen(camera, view, now, b.x, b.y);
		const w = b.w * z;
		const h = b.h * z;
		return { room, x: at.x, y: at.y, w, h, seen: at.x + w > 0 && at.y + h > 0 && at.x < view.w && at.y < view.h };
	});
}

// The one line the language lane adds to a turn while a panel is open (spec 5): where Gur is, and counts only, never
// contents. Null in the yard (Talk). `who` is the name the prompt uses for him.
const WHERE: Readonly<Record<Exclude<Place, "yard">, string>> = {
	library: "in the library",
	workshop: "in the workshop",
	study: "in the study",
	gate: "at the gate",
	observatory: "in the observatory",
};
type Part = readonly [n: number, one: string, many: string];
const PARTS: Readonly<Record<Exclude<Place, "yard" | "observatory">, (c: VillageCounts) => Part[]>> = {
	library: (c) => [[c.memories, "memory", "memories"], [c.notes, "note", "notes"]],
	workshop: (c) => [[c.things, "thing you made", "things you made"]],
	study: (c) => [[c.ideas, "idea", "ideas"], [c.goals, "goal", "goals"]],
	gate: (c) => [[c.reminders, "reminder", "reminders"]],
};
export function roomContext(place: Place, counts: VillageCounts, who = "Gur"): string | null {
	if (place === "yard") return null;
	const here = `${who} is ${WHERE[place]} with you`;
	if (place === "observatory") return `${here}, where your settings are.`;
	const parts = PARTS[place](counts)
		.map(([n, one, many]) => [Number.isFinite(n) && n > 0 ? Math.floor(n) : 0, one, many] as const)
		.filter(([n]) => n > 0);
	if (parts.length === 0) return `${here}; nothing is here yet.`;
	const words = parts.map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
	const verb = parts.length === 1 && parts[0][0] === 1 ? "is" : "are";
	return `${here}; in front of you ${verb} ${words.join(" and ")}.`;
}
```

- [ ] **Step 4: Run the test.** Expected: PASS (11 tests).
- [ ] **Step 5: Checks and commit.** `npx vitest run && npx tsc --noEmit -p . && npm run lint`, then:
```bash
git add lib/world/rooms.ts lib/world/rooms.test.ts
git commit -m "feat(world): rooms as places - where each panel puts him, what a room opens, its hit area, and the context line" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 9: He walks to rooms; outlines and the forge's glow
**Model:** Sonnet.
**Files:** Modify `lib/world/actor.ts`, `lib/world/actor.test.ts`, `lib/world/render.ts`, `lib/world/render.test.ts`.

**Interfaces:**
- Consumes: phase 1's actor and renderer; `CASTLE_BLOCKS` (Task 2) and a `forge` tile in the workshop (Tasks 1 to 3).
- Produces: `ActorWorld.visit?: number | null` (the open room's spot; he goes there and stands, even at night, and a block in progress is dropped) and `ActorWorld.yard?: number | null` (where he waits with nothing to build); `WorldScene.outline?: readonly Block[]` drawn at `OUTLINE_ALPHA = 0.12` before the ghost; a night glow for `forge`. With neither new field set, phase 1's behaviour and the render hash are unchanged.

- [ ] **Step 1: Write the failing tests.** In `lib/world/actor.test.ts`:

- [ ] **A5** Find:
```ts
describe("how he looks", () => {
```
Replace with:
```ts
describe("rooms as places (phase 2)", () => {
	it("walks to the room Gur opened and waits there, laying nothing", () => {
		const r = run(newActor(200, 0, 12), 0, 6000, { ...W, visit: 400 });
		expect(r.a.kind).toBe("idle");
		expect(r.a.x).toBe(400);
		expect(r.laid).toBe(0);
		expect(run(r.a, 6000, 9000, { ...W, visit: 400 }).a).toEqual(r.a);
	});
	it("leaves a block unfinished to go, and goes back to work when the panel closes", () => {
		const kneeling = run(newActor(200, 0, 12), 0, 100).a;
		expect(kneeling.kind).toBe("building");
		const away = run(kneeling, 100, 2400, { ...W, visit: 300 });
		expect(away.laid).toBe(0);
		expect(away.a.x).toBe(300);
		const back = run(away.a, 2400, 8000);
		expect(back.a.x).toBe(200);
		expect(back.laid).toBeGreaterThan(0);
	});
	it("goes to the room even at night, and to the bench once the panel closes", () => {
		const there = run(newActor(700, 0, 23), 0, 3000, { ...W, visit: 650 });
		expect([there.a.kind, there.a.x]).toEqual(["idle", 650]);
		const rest = run(there.a, 3000, 6000);
		expect([rest.a.kind, rest.a.x]).toEqual(["resting", 760]);
		expect(run(rest.a, 6000, 6100, { ...W, visit: 650 }).a.kind).not.toBe("resting");
	});
	it("follows Gur from room to room without stopping", () => {
		const walking = run(newActor(200, 0, 12), 0, 500, { ...W, visit: 600 }).a;
		expect(walking.kind).toBe("walking");
		const turned = step(walking, tick(550), { ...W, visit: 100 }).actor;
		expect(turned.kind).toBe("walking");
		expect(turned.dir).toBe(-1);
	});
	it("waits in the yard when nothing is left to build, and builds when there is", () => {
		const yard = run(newActor(100, 0, 12), 0, 12_000, { ...W, next: null, yard: 520 });
		expect([yard.a.kind, yard.a.x]).toEqual(["idle", 520]);
		expect(run(yard.a, 12_000, 30_000, { ...W, yard: 520 }).laid).toBeGreaterThan(0);
	});
	it("after a talk at a room, stands at the room again", () => {
		const at = run(newActor(300, 0, 12), 0, 100, { ...W, visit: 300 }).a;
		const facing = run(send(at, { type: "message", now: 200 }, { ...W, visit: 300 }), 200, 600, { ...W, visit: 300 }).a;
		expect(facing.kind).toBe("facing");
		const after = run(facing, 600, 600 + FOLLOW_UP_MS + TURN_MS + 500, { ...W, visit: 300 }).a;
		expect([after.kind, after.x]).toEqual(["idle", 300]);
	});
});

describe("how he looks", () => {
```

In `lib/world/render.test.ts`:

- [ ] **N5** Find:
```ts
import { blocksOf } from "./blueprints";
```
Replace with:
```ts
import { blocksOf } from "./blueprints";
import { CASTLE_BLOCKS } from "./blueprints/castle";
```
- [ ] **N6** Find:
```ts
import { artFor, drawSky, drawWorld, sheetBitmap, type WorldScene } from "./render";
```
Replace with:
```ts
import { artFor, drawSky, drawWorld, GHOST_ALPHA, OUTLINE_ALPHA, sheetBitmap, type WorldScene } from "./render";
```
- [ ] **N7** Find:
```ts
	it("copes with a canvas of no size", () => {
```
Replace with:
```ts
	it("draws the outline of what is still to come fainter than the next block, only in its own cells (phase 2)", () => {
		const s = scene(40);
		const rest = hall.slice(41);
		const base = paint(s).data;
		const outlined = paint({ ...s, outline: rest }).data;
		const cells = rest.map((b) => toScreen(s.camera, VIEW, 0, b.x * TILE, b.y * TILE));
		let changed = 0;
		for (let y = 0; y < VIEW.h; y++) {
			for (let x = 0; x < VIEW.w; x++) {
				if (px(outlined, x, y).join() === px(base, x, y).join()) continue;
				changed++;
				expect(cells.some((c) => x >= c.x && x < c.x + 2 * TILE && y >= c.y && y < c.y + 2 * TILE), `${x},${y}`).toBe(true);
			}
		}
		expect(changed).toBeGreaterThan(0);
		// One cell alone: as the outline it adds less than as the next block.
		const cell = hall[50]; // world (30, 22), in view
		const at = toScreen(s.camera, VIEW, 0, cell.x * TILE, cell.y * TILE);
		const alphaIn = (d: Uint8ClampedArray) => {
			let sum = 0;
			for (let y = at.y; y < at.y + 2 * TILE; y++) for (let x = at.x; x < at.x + 2 * TILE; x++) sum += px(d, x, y)[3];
			return sum;
		};
		const none = alphaIn(paint({ ...s, ghost: null }).data);
		const asOutline = alphaIn(paint({ ...s, ghost: null, outline: [cell] }).data) - none;
		const asGhost = alphaIn(paint({ ...s, ghost: cell }).data) - none;
		expect(asOutline).toBeGreaterThan(0);
		expect(asOutline).toBeLessThan(asGhost);
		expect(OUTLINE_ALPHA).toBeLessThan(GHOST_ALPHA);
	});
	it("lays the forge's warm glow on the workshop wall after dark (phase 2)", () => {
		const shop = CASTLE_BLOCKS.workshop.filter((b) => b.tile !== "lantern");
		const forge = shop.find((b) => b.tile === "forge");
		expect(forge).toBeDefined();
		if (!forge) return;
		const s = { ...scene(0), laid: shop, ghost: null, camera: newCamera(forge.x * TILE, VIEW, 2) };
		const c = toScreen(s.camera, VIEW, 0, forge.x * TILE + 8, forge.y * TILE + 11);
		const near = { x: c.x - 30, y: c.y - 4 };
		const bright = (d: Uint8ClampedArray) => px(d, near.x, near.y).slice(0, 3).reduce((a, b) => a + b, 0);
		const night = pixelPainter(VIEW.w, VIEW.h, artFor("hsl(172 38% 50%)", 1));
		drawWorld(night, { ...s, dark: 1 });
		const unlit = pixelPainter(VIEW.w, VIEW.h, artFor("hsl(172 38% 50%)", 1));
		drawWorld(unlit, { ...s, dark: 0 });
		expect(bright(night.data)).toBeGreaterThan(bright(unlit.data) + 20);
	});
	it("copes with a canvas of no size", () => {
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run lib/world/actor.test.ts lib/world/render.test.ts`. Expected: FAIL in "rooms as places (phase 2)" (he builds instead of visiting) and in the outline test (`OUTLINE_ALPHA` is not exported).
- [ ] **Step 3: The actor.** In `lib/world/actor.ts`:

- [ ] **A1** Find:
```ts
type Purpose = "build" | "rest";
```
Replace with:
```ts
type Purpose = "build" | "rest" | "visit";
```
- [ ] **A2** Find:
```ts
	restX: number; // the bench by the lantern
	speed: number; // world px per second (face.ts)
	held: boolean; // the conversation is still open: the voice is in conversation, he is thinking, or speaking
};
```
Replace with:
```ts
	restX: number; // where he sits at night (the hall's step, since phase 2)
	speed: number; // world px per second (face.ts)
	held: boolean; // the conversation is still open: the voice is in conversation, he is thinking, or speaking
	visit?: number | null; // phase 2: the room whose panel is open (world px); he goes there and waits, even at night
	yard?: number | null; // phase 2: where he waits when nothing is left to build (the yard before the hall)
};
```
- [ ] **A3** Find:
```ts
function tick(a: Actor, now: number, dt: number, w: ActorWorld): Step {
	const to = (actor: Actor, laid = false): Step => ({ actor, laid });
	const idle = (x: Actor): Actor => ({ ...x, kind: "idle", since: now, target: null, purpose: null, toward: "work" });
	const restWanted = a.night && !present(a, now);
```
Replace with:
```ts
// Where he wants to be and why, in this order: the room Gur opened, the bench at night, the next block (once the gap
// after the last one has passed, unless he is already on his way), or the yard when nothing is left to build.
function want(a: Actor, now: number, w: ActorWorld, onTheWay: boolean): { goal: number; purpose: Purpose } | null {
	if (w.visit != null) return { goal: w.visit, purpose: "visit" };
	if (a.night && !present(a, now)) return { goal: w.restX, purpose: "rest" };
	if (w.next !== null) return onTheWay || now >= a.nextAt ? { goal: w.next, purpose: "build" } : null;
	return w.yard != null ? { goal: w.yard, purpose: "visit" } : null;
}

function tick(a: Actor, now: number, dt: number, w: ActorWorld): Step {
	const to = (actor: Actor, laid = false): Step => ({ actor, laid });
	const idle = (x: Actor): Actor => ({ ...x, kind: "idle", since: now, target: null, purpose: null, toward: "work" });
	const restWanted = a.night && !present(a, now);
	const visiting = w.visit != null;
	// Arriving: kneel at a block, sit at the bench, or just stand at a room or in the yard.
	const arrive = (x: Actor, goal: number, purpose: Purpose): Actor =>
		purpose === "visit" ? { ...idle(x), x: goal } : { ...x, x: goal, kind: purpose === "rest" ? "resting" : "building", since: now, target: null, purpose: null };
```
- [ ] **A4** Find:
```ts
		case "resting":
			return to(restWanted ? a : idle(a));
		case "idle": {
			const goal = restWanted ? w.restX : now >= a.nextAt ? w.next : null;
			if (goal === null) return to(a);
			const purpose: Purpose = restWanted ? "rest" : "build";
			if (Math.abs(goal - a.x) < 0.5) return to({ ...a, x: goal, kind: purpose === "rest" ? "resting" : "building", since: now, target: null, purpose: null });
			return to({ ...a, kind: "walking", since: now, target: goal, purpose, dir: goal > a.x ? 1 : -1 });
		}
		case "walking": {
			// The goal may change under him (the next block, nightfall): follow it, or stop where he is.
			const goal = a.purpose === "rest" ? (restWanted ? w.restX : null) : restWanted ? null : w.next;
			if (goal === null) return to(idle(a));
			const stride = (w.speed * dt) / 1000;
			const gap = goal - a.x;
			if (Math.abs(gap) <= stride) return to({ ...a, x: goal, kind: a.purpose === "rest" ? "resting" : "building", since: now, target: null, purpose: null });
			return to({ ...a, x: a.x + Math.sign(gap) * stride, target: goal, dir: gap > 0 ? 1 : -1 });
		}
		case "building":
			if (restWanted || w.next === null || Math.abs(w.next - a.x) >= 0.5) return to(idle(a));
```
Replace with:
```ts
		case "resting":
			return to(restWanted && !visiting ? a : idle(a));
		case "idle": {
			const g = want(a, now, w, false);
			if (g === null) return to(a);
			if (Math.abs(g.goal - a.x) < 0.5) return to(g.purpose === "visit" ? a : arrive(a, g.goal, g.purpose));
			return to({ ...a, kind: "walking", since: now, target: g.goal, purpose: g.purpose, dir: g.goal > a.x ? 1 : -1 });
		}
		case "walking": {
			// The goal may change under him (the next block, another room, nightfall): follow it while the reason is the
			// same, or stop where he is and choose again on the next tick.
			const g = want(a, now, w, true);
			if (g === null || g.purpose !== a.purpose) return to(idle(a));
			const stride = (w.speed * dt) / 1000;
			const gap = g.goal - a.x;
			if (Math.abs(gap) <= stride) return to(arrive(a, g.goal, g.purpose));
			return to({ ...a, x: a.x + Math.sign(gap) * stride, target: g.goal, dir: gap > 0 ? 1 : -1 });
		}
		case "building":
			if (visiting || restWanted || w.next === null || Math.abs(w.next - a.x) >= 0.5) return to(idle(a));
```

- [ ] **Step 4: The renderer.** In `lib/world/render.ts`:

- [ ] **N1** Find:
```ts
	ghost: Block | null; // the next block, drawn faint
```
Replace with:
```ts
	ghost: Block | null; // the next block, drawn faint
	outline?: readonly Block[]; // phase 2: the rest of every open room, drawn fainter still (spec 5)
```
- [ ] **N2** Find:
```ts
export const GHOST_ALPHA = 0.3;
```
Replace with:
```ts
export const GHOST_ALPHA = 0.3;
export const OUTLINE_ALPHA = 0.12;
```
- [ ] **N3** Find:
```ts
	"window-lit": { x: 8, y: 2, r: 30, strength: 0.3 },
};
```
Replace with:
```ts
	"window-lit": { x: 8, y: 2, r: 30, strength: 0.3 },
	forge: { x: 8, y: 11, r: 44, strength: 0.5 },
};
```
- [ ] **N4** Find:
```ts
	// 3. the island, 4. the castle so far (its windows lit after dark), 5. the next block, faint
	const lit = (id: TileId) => (dark >= LIT_FROM ? (LIT[id] ?? id) : id);
	for (const b of s.ground) tile(b.tile, b.x * TILE, b.y * TILE, 1);
	for (const b of s.laid) tile(lit(b.tile), b.x * TILE, b.y * TILE, 1);
```
Replace with:
```ts
	// 3. the island, 4. the castle so far (its windows lit after dark), 5. the outline of what is still to come in each
	// open room, then the next block, both faint
	const lit = (id: TileId) => (dark >= LIT_FROM ? (LIT[id] ?? id) : id);
	for (const b of s.ground) tile(b.tile, b.x * TILE, b.y * TILE, 1);
	for (const b of s.laid) tile(lit(b.tile), b.x * TILE, b.y * TILE, 1);
	for (const b of s.outline ?? []) tile(b.tile, b.x * TILE, b.y * TILE, OUTLINE_ALPHA);
```

- [ ] **Step 5: Run the tests.** Same command. Expected: PASS, with the world-40 hash still `d498b675` (no outline in that scene).
- [ ] **Step 6: Checks and commit.** `npx vitest run && npx tsc --noEmit -p . && npm run lint`, then:
```bash
git add lib/world/actor.ts lib/world/actor.test.ts lib/world/render.ts lib/world/render.test.ts
git commit -m "feat(world): he walks to the open panel's room and waits in the yard; faint outlines of open rooms; the forge glows at night" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 10: The world component
**Model:** Sonnet.
**Files:** Modify `components/osmo/world.tsx` (W1 to W21), `components/osmo/world.module.css` (append), `app/dev/world/page.tsx` (one line, D0, so this commit compiles; Task 12 replaces the page).

**Interfaces:**
- Consumes: Tasks 5 to 9 (`openRooms`, `SETTINGS_SEEN`, `VillageCounts`, `safeLocalStorage`, `createSeenStore().peek`; the village functions; `loadVillage`, `saveRoom`, `VILLAGE_CLEARED`, `CLEARED_KEY`, `readVillageCounts`; `placeOf`, `spotX`, `clickable`, `hitAreas`, `routeOf`, `ROOM_LABELS`, `roomContext`; `ActorWorld.visit`/`yard`; `WorldScene.outline`).
- Produces:
  - `WorldProps.route?: Route` and `WorldProps.onOpen?(to: Route): void` (Task 13 passes `shell.route` and `shell.go`).
  - `WorldFixed = { hour?; rooms?: Partial<Record<CastleRoom, number>>; pose?; hits?: boolean }` (`laid` is gone; Task 12 uses `rooms` and `hits`).
  - `WorldControl = { attend(): void; takeNews(): VillageNews | null; context(): string | null }`. `takeNews` returns the oldest unread news (a queue of up to four). `context` returns `roomContext` for the open panel's place, or null in Talk or before the counts are read.
  - A button per finished, clickable room (`data-hit="<room>"`, `aria-label` from `ROOM_LABELS`), placed over the canvas by the loop, `hidden` when out of view; the root gets `data-show-hits` while `fixed.hits` is true.

What changes in the loop, in short: a `village` (all rooms) replaces the hall's `progress`; the visit's one read also reads the counts (`load`), and opens rooms with `openRooms`; a Settings route during the visit admits the observatory; saves go through `dueSaves` one room at a time and stop if a clear happens (`gen`); a clear (window event, or another tab's `storage` event) drops everything and reads again; the scene gets `outline`; `placeHits` reports the clickable rooms to React (only when the list changes) and places their buttons; the pace has work only in the yard.

- [ ] **Step 1: Apply the edits.** Each anchor is text in `components/osmo/world.tsx` at `6f5672f` and occurs exactly once; find it by its text, not by line number.

- [ ] **W1** Find:
```tsx
import { type RefObject, useEffect, useRef } from "react";
```
Replace with:
```tsx
import { type RefObject, useEffect, useRef, useState } from "react";
```
- [ ] **W2** Find:
```tsx
import { HALL } from "@/lib/world/blueprints/hall";
import { ISLAND } from "@/lib/world/blueprints/island";
import { GROUND_Y, TILE } from "@/lib/world/blueprints/types";
```
Replace with:
```tsx
import { ISLAND } from "@/lib/world/blueprints/island";
import { CASTLE_ROOMS, GROUND_Y, TILE, type CastleRoom } from "@/lib/world/blueprints/types";
import { createSeenStore } from "@/lib/shell/rail";
import { TALK, type Route } from "@/lib/shell/route";
import { safeLocalStorage } from "@/components/osmo/use-rail-dots";
```
- [ ] **W3** Find:
```tsx
import { lay, markSaved, needsSave, nextIndex, resume, type RoomProgress, type VillageNews } from "@/lib/world/progress";
import { artFor, drawSky, drawWorld } from "@/lib/world/render";
```
Replace with:
```tsx
import type { VillageNews } from "@/lib/world/progress";
import { artFor, drawSky, drawWorld } from "@/lib/world/render";
import { clickable, hitAreas, placeOf, ROOM_LABELS, roomContext, routeOf, spotX } from "@/lib/world/rooms";
```
- [ ] **W4** Find:
```tsx
import { loadVillage, saveRoom } from "@/lib/world/village-data";
```
Replace with:
```tsx
import { openRooms, SETTINGS_SEEN, type VillageCounts } from "@/lib/world/unlock";
import {
	admit, dueSaves, finishedRooms, laidBlocks, laidCount, layNext, markRoomSaved, nextBlock, outlineBlocks, pinnedVillage, resumeVillage,
	type Village,
} from "@/lib/world/village";
import { readVillageCounts } from "@/lib/world/village-counts";
import { CLEARED_KEY, loadVillage, saveRoom, VILLAGE_CLEARED } from "@/lib/world/village-data";
```
- [ ] **W5** Find:
```tsx
export type WorldControl = { attend(): void; takeNews(): VillageNews | null };
export type WorldFixed = { hour?: number; laid?: number; pose?: ActorKind };
```
Replace with:
```tsx
// attend: Gur is typing or focused the composer. takeNews: the oldest room started or finished since the last call (for
// TurnFacts.village). context: the line for the open panel's room (lib/world/rooms.ts roomContext), null in Talk or
// before the visit's counts are read. The last two are the language lane's to call.
export type WorldControl = { attend(): void; takeNews(): VillageNews | null; context(): string | null };
// The dev page's pins: the hour, each room's laid blocks (a room left out is locked), his pose, and the hit areas drawn.
export type WorldFixed = { hour?: number; rooms?: Partial<Record<CastleRoom, number>>; pose?: ActorKind; hits?: boolean };
```
- [ ] **W6** Find:
```tsx
	persist?: boolean;
	fixed?: WorldFixed;
};
type Engine = { send(e: ActorEvent): void; refresh(): void; takeNews(): VillageNews | null; dispose(): void };
```
Replace with:
```tsx
	persist?: boolean;
	fixed?: WorldFixed;
	route?: Route; // the open panel (shell v2); he walks to its room
	onOpen?(to: Route): void; // a finished room was clicked
};
type Engine = { send(e: ActorEvent): void; refresh(): void; takeNews(): VillageNews | null; context(): string | null; dispose(): void };
// How the loop tells React which rooms have a hit area now.
type Hooks = { finished(rooms: CastleRoom[]): void };
```
- [ ] **W7** Find:
```tsx
function startWorld(root: HTMLDivElement, skyCanvas: HTMLCanvasElement, canvas: HTMLCanvasElement, live: { current: WorldProps }): Engine | null {
	const g: Guard = { dead: false, undo: [] };
	try {
		return buildWorld(root, skyCanvas, canvas, live, g);
```
Replace with:
```tsx
function startWorld(root: HTMLDivElement, skyCanvas: HTMLCanvasElement, canvas: HTMLCanvasElement, live: { current: WorldProps }, hooks: Hooks): Engine | null {
	const g: Guard = { dead: false, undo: [] };
	try {
		return buildWorld(root, skyCanvas, canvas, live, hooks, g);
```
- [ ] **W8** Find:
```tsx
function buildWorld(root: HTMLDivElement, skyCanvas: HTMLCanvasElement, canvas: HTMLCanvasElement, live: { current: WorldProps }, g: Guard): Engine | null {
```
Replace with:
```tsx
function buildWorld(root: HTMLDivElement, skyCanvas: HTMLCanvasElement, canvas: HTMLCanvasElement, live: { current: WorldProps }, hooks: Hooks, g: Guard): Engine | null {
```
- [ ] **W9** Find:
```tsx
	const ground = blocksOf(ISLAND);
	const hall = blocksOf(HALL);
	const stars = starField();
	const clock = () => performance.now();
	const hourNow = () => live.current.fixed?.hour ?? hourOf(new Date());
	const fixedLaid = () => live.current.fixed?.laid;

```
Replace with:
```tsx
	const ground = blocksOf(ISLAND);
	const stars = starField();
	const clock = () => performance.now();
	const iso = () => new Date().toISOString();
	const hourNow = () => live.current.fixed?.hour ?? hourOf(new Date());
	const pinned = () => live.current.fixed?.rooms;
	const place = () => placeOf(live.current.route ?? TALK);

```
- [ ] **W10** Find:
```tsx
	// The room: unknown until the one read of the visit answers. The dev page: a local hall from nothing.
	let progress: RoomProgress | null = persist ? null : resume([], "hall", hall.length, new Date().toISOString());
	let canSave = false;
	let saving = false;
	let news: VillageNews | null = null;
```
Replace with:
```tsx
	// The room: unknown until the one read of the visit answers. The dev page: the whole castle from nothing, room by room.
	let village: Village | null = persist ? null : resumeVillage([], CASTLE_ROOMS, iso());
	let counts: VillageCounts | null = null; // read once per visit, with the village
	// Settings opened in the new shell on this device (the shell marks it, use-rail-dots.ts), or during this visit.
	let settingsOpened = createSeenStore(safeLocalStorage(), iso).peek(SETTINGS_SEEN) !== null;
	let gen = 0; // a clear bumps it: a read or a save begun before the clear is dropped
	let canSave = false;
	let saving = false;
	let news: VillageNews[] = [];
	let hitKey = "";
```
- [ ] **W11** Find:
```tsx
	const laidCount = () => fixedLaid() ?? progress?.laid ?? 0;
	// The block he works on next: none while the count is pinned, before the read answers, or once the hall is done.
	const nextBlock = () => {
		if (fixedLaid() !== undefined || !progress) return null;
		const i = nextIndex(progress);
		return i === null ? null : hall[i];
	};
	const world = (): ActorWorld => {
		const sig = live.current.signals;
		const next = nextBlock();
		return {
			next: next ? standX(next) : null,
			restX: REST_X,
			speed: bearing(live.current.agent, Date.now(), hourNow()).speed,
			held: sig.inTalk || sig.thinking || sig.speaking,
		};
	};
	const save = async () => {
		if (!progress || !canSave || saving) return;
		saving = true;
		const snap = progress;
		try {
			const ok = await saveRoom(snap);
			if (ok && progress) progress = markSaved(progress, snap.laid);
		} finally {
			saving = false;
		}
	};
	const onLaid = () => {
		if (!progress || fixedLaid() !== undefined) return;
		const r = lay(progress, new Date().toISOString());
		progress = r.progress;
		if (r.news) news = r.news;
		if (needsSave(progress, "block")) void save();
	};
```
Replace with:
```tsx
	// The village drawn: the dev page's pinned one, or the real one (null until the visit's read answers).
	const shown = (): Village | null => {
		const pin = pinned();
		return pin ? pinnedVillage(pin, iso()) : village;
	};
	// The block he works on next: none while the dev page pins the rooms, before the read answers, or when all is done.
	const workBlock = () => (pinned() || !village ? null : nextBlock(village));
	const world = (): ActorWorld => {
		const sig = live.current.signals;
		const next = workBlock();
		const at = place();
		return {
			next: next ? standX(next) : null,
			restX: REST_X,
			speed: bearing(live.current.agent, Date.now(), hourNow()).speed,
			held: sig.inTalk || sig.thinking || sig.speaking,
			visit: at === "yard" ? null : spotX(at),
			yard: START_X,
		};
	};
	// Saves every room that is due, one at a time; a clear in between stops it.
	const save = async (reason: "block" | "hidden") => {
		if (!village || !canSave || saving) return;
		saving = true;
		const mine = gen;
		try {
			for (const p of dueSaves(village, reason)) {
				if (gen !== mine) break;
				const ok = await saveRoom(p);
				if (ok && village && gen === mine) village = markRoomSaved(village, p.room, p.laid);
			}
		} finally {
			saving = false;
		}
	};
	const saveSoon = (reason: "block" | "hidden") => {
		void save(reason).catch((err: unknown) => console.warn("[village] Could not save the village.", err));
	};
	const onLaid = () => {
		if (!village || pinned()) return;
		const r = layNext(village, iso());
		village = r.village;
		if (r.news) news = [...news, r.news].slice(-4);
		saveSoon("block");
	};
	// The visit's one read: the rows and, the first time, the counts the unlock rules and the context line use.
	const load = () => {
		const mine = gen;
		void Promise.all([loadVillage(), counts ? Promise.resolve(counts) : readVillageCounts()])
			.then(([{ rows, ok }, c]) => {
				if (g.dead || mine !== gen) return;
				counts = c;
				if (!ok) {
					console.warn("[village] Could not read the village, so he will not build this visit.");
					return;
				}
				village = resumeVillage(rows, openRooms({ counts: c, settingsOpened: settingsOpened || place() === "observatory" }), iso());
				canSave = true;
				schedule(0);
			})
			.catch((err: unknown) => console.warn("[village] Could not read the village, so he will not build this visit.", err));
	};
	// The finished rooms get a button each (React draws them, from hooks.finished); the loop places them over the canvas.
	const placeHits = (v: Village | null, now: number) => {
		const rooms = v ? clickable(finishedRooms(v)) : [];
		const names = rooms.join(",");
		if (names !== hitKey) {
			hitKey = names;
			hooks.finished(rooms);
		}
		for (const hit of hitAreas(rooms, camera, view, now)) {
			const el = root.querySelector<HTMLElement>(`[data-hit="${hit.room}"]`);
			if (!el) continue;
			el.style.left = `${hit.x}px`;
			el.style.top = `${hit.y}px`;
			el.style.width = `${hit.w}px`;
			el.style.height = `${hit.h}px`;
			el.hidden = !hit.seen;
		}
	};
```
- [ ] **W12** Find:
```tsx
		if (live.current.colorA !== scarf || darkAt(hour) !== dark) {
```
Replace with:
```tsx
		// Settings opened during the visit: the observatory joins the queue (spec 4).
		if (!settingsOpened && place() === "observatory") {
			settingsOpened = true;
			if (village && counts) village = admit(village, openRooms({ counts, settingsOpened }), iso());
		}
		if (live.current.colorA !== scarf || darkAt(hour) !== dark) {
```
- [ ] **W13** Find:
```tsx
		paintSky(hour);
		const laid = laidCount();
		const next = nextBlock();
		const ghost = fixedLaid() !== undefined ? (hall[laid] ?? null) : next;
		const key: DrawKey = { laid, kind: actor.kind, phase: phaseOf(hour), zoom: zoomAt(camera, now), tx: Math.floor(actor.x / TILE) };
		if (shouldDraw(reduced, drawn, key)) {
			drawn = key;
			const face = bearing(live.current.agent, Date.now(), hour).face;
			const sky = skyAt(live.current.colorA, live.current.colorB, hour);
			drawWorld(painter, { camera, view, now, clock: now, ground, laid: hall.slice(0, laid), ghost, him: { x: actor.x, look: look(actor, now, face) }, sky, dark });
			const head = toScreen(camera, view, now, actor.x, GROUND_Y * TILE - FRAME_H);
			root.style.setProperty("--him-x", `${head.x}px`);
			root.style.setProperty("--him-y", `${head.y}px`);
		}
		const moving = easing(camera, now) || settling(camera, actor.x, view, now, close);
		schedule(nextTickIn({ actor, now, easing: moving, hasWork: next !== null || actor.night, reducedMotion: reduced }));
```
Replace with:
```tsx
		paintSky(hour);
		const v = shown();
		const laid = v ? laidCount(v) : 0;
		const key: DrawKey = { laid, kind: actor.kind, phase: phaseOf(hour), zoom: zoomAt(camera, now), tx: Math.floor(actor.x / TILE) };
		root.toggleAttribute("data-show-hits", live.current.fixed?.hits === true);
		if (shouldDraw(reduced, drawn, key)) {
			drawn = key;
			const face = bearing(live.current.agent, Date.now(), hour).face;
			const sky = skyAt(live.current.colorA, live.current.colorB, hour);
			drawWorld(painter, {
				camera, view, now, clock: now, ground, laid: v ? laidBlocks(v) : [], ghost: v ? nextBlock(v) : null, outline: v ? outlineBlocks(v) : [],
				him: { x: actor.x, look: look(actor, now, face) }, sky, dark,
			});
			const head = toScreen(camera, view, now, actor.x, GROUND_Y * TILE - FRAME_H);
			root.style.setProperty("--him-x", `${head.x}px`);
			root.style.setProperty("--him-y", `${head.y}px`);
			placeHits(v, now);
		}
		const moving = easing(camera, now) || settling(camera, actor.x, view, now, close);
		// Work waits only in the yard: at a room he stands, so the loop slows to its 3 s tick (and at night with nothing
		// left to build, too: review M3).
		schedule(nextTickIn({ actor, now, easing: moving, hasWork: workBlock() !== null && place() === "yard", reducedMotion: reduced }));
```
- [ ] **W14** Find:
```tsx
			apply({ type: "hidden", now });
			if (progress && needsSave(progress, "hidden")) void save();
			schedule(null);
```
Replace with:
```tsx
			apply({ type: "hidden", now });
			saveSoon("hidden");
			schedule(null);
```
- [ ] **W15** Find:
```tsx
	if (persist) {
		void loadVillage().then(({ rows, ok }) => {
			if (g.dead) return;
			if (!ok) {
				console.warn("[village] Could not read the village, so he will not build this visit.");
				return;
			}
			progress = resume(rows, "hall", hall.length, new Date().toISOString());
			canSave = true;
			schedule(0);
		});
	}
```
Replace with:
```tsx
	if (persist) {
		load();
		// Settings cleared the village (village-data.ts): drop everything held, read it again, and he begins the hall.
		const onCleared = guarded(() => {
			gen++;
			village = null;
			canSave = false;
			news = [];
			drawn = null;
			load();
			schedule(0);
		});
		// Another tab cleared it: the same (village-data.ts writes CLEARED_KEY, which fires "storage" in every other tab).
		const onStorage = (e: StorageEvent) => {
			if (e.key === CLEARED_KEY) onCleared();
		};
		window.addEventListener(VILLAGE_CLEARED, onCleared);
		window.addEventListener("storage", onStorage);
		g.undo.push(() => {
			window.removeEventListener(VILLAGE_CLEARED, onCleared);
			window.removeEventListener("storage", onStorage);
		});
	}
```
- [ ] **W16** Find:
```tsx
		takeNews() {
			const n = news;
			news = null;
			return n;
		},
		dispose() {
			g.dead = true;
			schedule(null);
			for (const u of g.undo) u();
			if (progress && needsSave(progress, "hidden")) void save();
		},
```
Replace with:
```tsx
		takeNews() {
			const n = news[0] ?? null;
			news = news.slice(1);
			return n;
		},
		context: () => (counts === null ? null : roomContext(place(), counts)),
		dispose() {
			g.dead = true;
			schedule(null);
			for (const u of g.undo) u();
			saveSoon("hidden");
		},
```
- [ ] **W17** Find:
```tsx
	const prevSignals = useRef<RoomSignals | null>(null);
	useEffect(() => {
		live.current = props;
	});
```
Replace with:
```tsx
	const prevSignals = useRef<RoomSignals | null>(null);
	// The finished rooms that have a hit area, as the loop last reported them.
	const [hits, setHits] = useState<CastleRoom[]>([]);
	useEffect(() => {
		live.current = props;
	});
```
- [ ] **W18** Find:
```tsx
		const e = startWorld(root, sky, canvas, live);
```
Replace with:
```tsx
		const e = startWorld(root, sky, canvas, live, { finished: setHits });
```
- [ ] **W19** Find:
```tsx
			takeNews: () => engine.current?.takeNews() ?? null,
		};
```
Replace with:
```tsx
			takeNews: () => engine.current?.takeNews() ?? null,
			context: () => engine.current?.context() ?? null,
		};
```
- [ ] **W20** Find:
```tsx
	const { fixed, colorA, colorB } = props;
	useEffect(() => {
		engine.current?.refresh();
	}, [fixed?.hour, fixed?.laid, fixed?.pose, colorA, colorB]);
```
Replace with:
```tsx
	const { fixed, colorA, colorB } = props;
	const pins = JSON.stringify(fixed?.rooms ?? null);
	const at = placeOf(props.route ?? TALK);
	// A new pin, a new place (he sets off at once, even from the 3 s tick) or new buttons to place: draw now.
	useEffect(() => {
		engine.current?.refresh();
	}, [fixed?.hour, pins, fixed?.pose, fixed?.hits, colorA, colorB, at, hits]);
	const { onOpen } = props;
```
- [ ] **W21** Find:
```tsx
			<canvas ref={canvasRef} className={s.layer} aria-hidden="true" />
			<div className={s.bubble}>
```
Replace with:
```tsx
			<canvas ref={canvasRef} className={s.layer} aria-hidden="true" />
			<div className={s.hits}>
				{hits.map((room) => (
					<button
						key={room}
						type="button"
						className={s.hit}
						data-hit={room}
						aria-label={ROOM_LABELS[room]}
						hidden
						onClick={() => {
							const to = routeOf(room);
							if (to) onOpen?.(to);
						}}
					/>
				))}
			</div>
			<div className={s.bubble}>
```

- [ ] **Step 2: The buttons' styles.** Append to `components/osmo/world.module.css`:
```css
/* Phase 2: a button over each finished room, placed by the loop (canvas px); the keyboard reaches it, the pointer shows
   a hand. The dev page's "Hit areas" outlines them. */
.hits {
	position: absolute;
	inset: 0;
	pointer-events: none;
}
.hit {
	position: absolute;
	padding: 0;
	border: 0;
	border-radius: 0.25rem;
	background: none;
	cursor: pointer;
	pointer-events: auto;
}
.hit:focus-visible {
	outline: 2px solid var(--bone);
	outline-offset: 2px;
}
.world[data-show-hits] .hit {
	outline: 1px dashed color-mix(in oklab, var(--bone) 70%, transparent);
}
```
- [ ] **Step 3: Keep the dev page compiling (D0).** `fixed.laid` is gone, so in `app/dev/world/page.tsx` find:
```tsx
laid: FILLS[fill].laid, pose:
```
and replace it with:
```tsx
rooms: FILLS[fill].laid === undefined ? undefined : { hall: FILLS[fill].laid }, pose:
```
("Building live" now builds the whole castle; the hall buttons pin the hall alone. Task 12 replaces the page.)
- [ ] **Step 4: Check the result.** `npx tsc --noEmit -p .` and `npx eslint components/osmo/world.tsx app/dev/world/page.tsx` are clean. `git diff components/osmo/world.tsx` shows only W1 to W21.
- [ ] **Step 5: Run** `npx vitest run && npm run lint`.
- [ ] **Step 6: Commit.**
```bash
git add components/osmo/world.tsx components/osmo/world.module.css app/dev/world/page.tsx
git commit -m "feat(world): the whole castle in the world - unlocked rooms built in order, outlines, buttons over finished rooms, walking to the open panel's room, clearing" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 11: "Clear the village" in Settings
**Model:** Sonnet.
**Files:** Create `components/osmo/village-clear.tsx`; modify `components/osmo/settings-pages.tsx` (S1 to S3).

**Interfaces:**
- Consumes: `clearVillage` (Task 7), `WORLD` (`lib/shell/flag.ts`), `panels.module.css` classes (`section`, `sectionTitle`, `note`, `actions`, `action`, `error`).
- Produces: a section "The village" at the end of the About page when the world is on: "Clear the village", then a confirm line with "Clear the village" and "Keep it", then "The village is cleared. I have started the hall again." or an error line.

- [ ] **Step 1: The component.** Create `components/osmo/village-clear.tsx`:

```tsx
"use client";

import { useState } from "react";
import { clearVillage } from "@/lib/world/village-data";
import panel from "./panels.module.css";

// "Clear the village" (spec 4, Reset), on Settings' About page, which is the observatory's: one line, a confirm, then
// the owner's village rows are deleted and the world, told by VILLAGE_CLEARED, starts the hall again.
export function VillageClear() {
	const [state, setState] = useState<"idle" | "asking" | "clearing" | "done" | "failed">("idle");
	const clear = async () => {
		setState("clearing");
		setState((await clearVillage()) ? "done" : "failed");
	};
	return (
		<section className={panel.section}>
			<h3 className={panel.sectionTitle}>The village</h3>
			{(state === "asking" || state === "clearing") && <p className={panel.note}>Clear everything I have built on the island? It cannot be undone, and I start the hall again.</p>}
			<div className={panel.actions}>
				{state === "asking" || state === "clearing" ? (
					<>
						<button type="button" className={panel.action} autoFocus disabled={state === "clearing"} onClick={() => void clear()}>
							Clear the village
						</button>
						<button type="button" className={panel.action} disabled={state === "clearing"} onClick={() => setState("idle")}>
							Keep it
						</button>
					</>
				) : (
					<button type="button" className={panel.action} onClick={() => setState("asking")}>
						Clear the village
					</button>
				)}
			</div>
			{state === "done" && (
				<p className={panel.note} role="status">
					The village is cleared. I have started the hall again.
				</p>
			)}
			{state === "failed" && (
				<p className={panel.error} role="alert">
					I could not clear the village just now. Please try again in a moment.
				</p>
			)}
		</section>
	);
}
```

- [ ] **Step 2: Put it on the About page.** In `components/osmo/settings-pages.tsx`:

- [ ] **S1** Find:
```tsx
import { OSMO_BUILD, OSMO_BUILT_AT, OSMO_VERSION, versionLine } from "@/lib/shell/version";
```
Replace with:
```tsx
import { WORLD } from "@/lib/shell/flag";
import { OSMO_BUILD, OSMO_BUILT_AT, OSMO_VERSION, versionLine } from "@/lib/shell/version";
```
- [ ] **S2** Find:
```tsx
import { CONNECTORS, ConnectorsSettings } from "./connectors-settings";
```
Replace with:
```tsx
import { CONNECTORS, ConnectorsSettings } from "./connectors-settings";
import { VillageClear } from "./village-clear";
```
- [ ] **S3** Find:
```tsx
					</ol>
				)}
			</section>
		</>
	);
}
```
Replace with:
```tsx
					</ol>
				)}
			</section>

			{WORLD && <VillageClear />}
		</>
	);
}
```

- [ ] **Step 3: Check.** `npx tsc --noEmit -p .`, `npx eslint components/osmo/village-clear.tsx components/osmo/settings-pages.tsx`, `npx vitest run`. With `WORLD` false the About page renders exactly as before.
- [ ] **Step 4: Commit.**
```bash
git add components/osmo/village-clear.tsx components/osmo/settings-pages.tsx
git commit -m "feat(world): Clear the village, on Settings' About page, behind the world switch" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 12: `/dev/world`
**Model:** Sonnet.
**Files:** Replace `app/dev/world/page.tsx`; modify `app/dev/world/dev.module.css` (D1).

**Interfaces:**
- Consumes: `WorldStage` with `fixed.rooms`, `fixed.hits`, `route`, `onOpen` (Task 10); `CASTLE_BLOCKS`, `CASTLE_ROOMS` (Task 2); `placeOf` (Task 8); `routeHash` (`lib/shell/route.ts`).
- Produces: presets (Building live, Hall only, Outlines, Half built, Whole castle), a row per room (Locked, 0%, 50%, 100%), a Hit areas toggle, a row of places (Talk, Library, Things, Feed, Ideas, Settings) that walks him there, and the phase 1 rows (poses, hours, moods, Message, Speaking, Phone). Still 404 in production.

- [ ] **Step 1: Replace** `app/dev/world/page.tsx` with:

```tsx
"use client";

// A dev-only view of the village: every state he can be in, every hour of the sky, each room locked or at 0, 50 and
// 100 percent (the faint outlines show at 0 and 50), the castle building live, the room hit areas, walking to each
// panel's room, each mood, and the phone camera. Nothing is read or saved. Not served in production.
import { type CSSProperties, useState } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { notFound } from "next/navigation";
import styles from "../../assistant.module.css";
import dev from "./dev.module.css";
import { WorldStage } from "@/components/osmo/world";
import { moodTheme } from "@/lib/agent/mood-theme";
import { BASELINE, type Activations, type Emotion } from "@/lib/agent/state";
import { routeHash, type Route } from "@/lib/shell/route";
import type { ActorKind } from "@/lib/world/actor";
import { CASTLE_BLOCKS } from "@/lib/world/blueprints/castle";
import { CASTLE_ROOMS, type CastleRoom } from "@/lib/world/blueprints/types";
import { placeOf } from "@/lib/world/rooms";

const font = Bricolage_Grotesque({ subsets: ["latin"] });
const MOODS: (Emotion | "calm")[] = ["calm", "joy", "sadness", "fear", "anger", "love", "loneliness", "hope", "boredom"];
const POSES: (ActorKind | "live")[] = ["live", "idle", "walking", "building", "turning", "facing", "resting"];
type Fill = "locked" | 0 | 0.5 | 1;
const FILLS: { label: string; fill: Fill }[] = [
	{ label: "Locked", fill: "locked" },
	{ label: "0%", fill: 0 },
	{ label: "50%", fill: 0.5 },
	{ label: "100%", fill: 1 },
];
type Pins = Record<CastleRoom, Fill>;
const pinsOf = (hall: Fill, rest: Fill): Pins =>
	Object.fromEntries(CASTLE_ROOMS.map((room) => [room, room === "hall" ? hall : rest])) as Pins;
const PRESETS: { label: string; pins: Pins | null }[] = [
	{ label: "Building live", pins: null },
	{ label: "Hall only", pins: pinsOf(1, "locked") },
	{ label: "Outlines", pins: pinsOf(1, 0) },
	{ label: "Half built", pins: pinsOf(1, 0.5) },
	{ label: "Whole castle", pins: pinsOf(1, 1) },
];
// Each room's laid blocks for the world's pins; a locked room is left out.
const roomsFrom = (pins: Pins): Partial<Record<CastleRoom, number>> =>
	Object.fromEntries(
		CASTLE_ROOMS.filter((room) => pins[room] !== "locked").map((room) => [room, Math.round(Number(pins[room]) * CASTLE_BLOCKS[room].length)]),
	);
const PLACES: { label: string; route: Route }[] = [
	{ label: "Talk", route: { panel: null } },
	{ label: "Library", route: { panel: "library" } },
	{ label: "Things", route: { panel: "library", page: "things" } },
	{ label: "Feed", route: { panel: "feed" } },
	{ label: "Ideas", route: { panel: "ideas" } },
	{ label: "Settings", route: { panel: "settings" } },
];
const HOURS: { label: string; hour: number }[] = [
	{ label: "Night", hour: 0 },
	{ label: "Dawn", hour: 6 },
	{ label: "Day", hour: 13 },
	{ label: "Dusk", hour: 20 },
];
const SAID = "Good evening, Gur. I have laid the east wall of the hall.";

function feeling(mood: Emotion | "calm"): Activations {
	const a = { ...BASELINE };
	if (mood !== "calm") a[mood] = Math.min(1, BASELINE[mood] + 0.6);
	return a;
}

export default function WorldPage() {
	if (process.env.NODE_ENV === "production") notFound();
	const [mood, setMood] = useState<Emotion | "calm">("calm");
	const [hour, setHour] = useState<number | null>(13); // null: the real clock
	const [poseKind, setPoseKind] = useState<ActorKind | "live">("live");
	const [pins, setPins] = useState<Pins | null>(null); // null: building live
	const [route, setRoute] = useState<Route>({ panel: null });
	const [opened, setOpened] = useState<string | null>(null);
	const [hits, setHits] = useState(false);
	const [phone, setPhone] = useState(false);
	const [speaking, setSpeaking] = useState(false);
	const [lines, setLines] = useState(0);
	const activations = feeling(mood);
	const theme = moodTheme(activations);
	const stageStyle = {
		"--aura-a": theme.colorA,
		"--aura-b": theme.colorB,
		"--base": theme.base,
		"--pulse": `${theme.pulseSeconds.toFixed(2)}s`,
		"--strength": theme.strength.toFixed(2),
	} as CSSProperties;
	const button = (label: string, pressed: boolean, onClick: () => void) => (
		<button key={label} type="button" className={`${styles.mic} ${dev.btn}`} aria-pressed={pressed} onClick={onClick}>
			{label}
		</button>
	);
	const world = (
		<WorldStage
			agent={{ activations, mood: null }}
			colorA={theme.colorA}
			colorB={theme.colorB}
			signals={{ lines, inTalk: false, speaking, thinking: false }}
			said={speaking ? SAID : null}
			heard={null}
			persist={false}
			fixed={{ hour: hour ?? undefined, rooms: pins ? roomsFrom(pins) : undefined, pose: poseKind === "live" ? undefined : poseKind, hits }}
			route={route}
			onOpen={(to) => {
				setRoute(to);
				setOpened(routeHash(to));
			}}
		/>
	);
	return (
		<div className={`${styles.stage} ${font.className}`} style={stageStyle} data-tone={theme.tone} data-speaking={speaking ? "" : undefined}>
			<div className={dev.scroller}>
				<div className={dev.toolbar}>{POSES.map((p) => button(p, poseKind === p, () => setPoseKind(p)))}</div>
				<div className={dev.toolbar}>
					{PRESETS.map((p) => button(p.label, JSON.stringify(pins) === JSON.stringify(p.pins), () => setPins(p.pins)))}
					{button("Hit areas", hits, () => setHits((v) => !v))}
				</div>
				{CASTLE_ROOMS.map((room) => (
					<div key={room} className={dev.toolbar}>
						<span className={dev.room}>{room}</span>
						{FILLS.map((f) =>
							button(`${room} ${f.label}`, pins?.[room] === f.fill, () => setPins({ ...(pins ?? pinsOf(1, "locked")), [room]: f.fill })),
						)}
					</div>
				))}
				<div className={dev.toolbar}>
					{PLACES.map((p) => button(p.label, routeHash(p.route) === routeHash(route), () => setRoute(p.route)))}
					<span>
						he goes to: {placeOf(route)}
						{opened !== null && `; last opened by a click: ${opened || "Talk"}`}
					</span>
				</div>
				<div className={dev.toolbar}>
					{HOURS.map((h) => button(h.label, hour === h.hour, () => setHour(h.hour)))}
					{button("Real clock", hour === null, () => setHour(null))}
					<input
						className={dev.range}
						type="range"
						min={0}
						max={23.75}
						step={0.25}
						value={hour ?? 12}
						aria-label="Hour of the day"
						onChange={(e) => setHour(Number(e.target.value))}
					/>
					<span>{hour === null ? "real clock" : `${Math.floor(hour)}:${String((hour % 1) * 60).padStart(2, "0")}`}</span>
				</div>
				<div className={dev.toolbar}>
					{MOODS.map((m) => button(m, mood === m, () => setMood(m)))}
					{button("Message", false, () => setLines((n) => n + 1))}
					{button("Speaking", speaking, () => setSpeaking((v) => !v))}
					{button("Phone", phone, () => setPhone((v) => !v))}
				</div>
				<p className={dev.note}>
					Live: he builds the whole castle from nothing, room by room (nothing is saved). The room rows pin each room locked or
					at 0, 50 or 100 percent; an open room that is not finished shows as a faint outline, a locked one not at all. A
					finished room with a panel (library, workshop, gate, observatory) is a button: click it, or Tab to it, and he walks
					there. Message and Speaking turn him to you; he turns back six seconds after Speaking is off. Set
					prefers-reduced-motion in devtools for still frames. The world is drawn at pixel scale 1 from 900 px wide and 2 below;
					the Phone box (375 by 700) shows scale 2, coming in to 3 and 4 when he turns.
				</p>
				{phone && <div className={dev.phone}>{world}</div>}
			</div>
			{!phone && world}
		</div>
	);
}
```

- [ ] **Step 2: Let clicks through to the rooms.** In `app/dev/world/dev.module.css`:

- [ ] **D1** Find:
```css
.scroller { height: 100svh; overflow: auto; padding-bottom: 3rem; }
```
Replace with:
```css
.scroller { height: 100svh; overflow: auto; padding-bottom: 3rem; pointer-events: none; }
/* The scroller lets clicks through to the world behind it (the room hit areas); its own controls take them. */
.toolbar, .note, .phone { pointer-events: auto; }
.room { width: 6.5rem; font-size: 0.85rem; }
```

- [ ] **Step 3: Check.** `npx tsc --noEmit -p .`, `npx eslint app/dev/world`, `npx vitest run`.
- [ ] **Step 4: Look** (the one dev server on port 3000, from `.claude/launch.json`; do not start a second one): open `/dev/world` in the browser pane with both switches on in the build the server runs. Check: "Outlines" shows the hall built and five faint rooms; "Whole castle" with "Hit areas" shows dashed boxes over library, workshop, gate and observatory (not the hall or the study); clicking one walks him there and prints the route; Tab reaches the buttons and Enter opens; the room rows pin each room. Report what you saw (screenshots if you can).
- [ ] **Step 5: Commit.**
```bash
git add app/dev/world/page.tsx app/dev/world/dev.module.css
git commit -m "feat(world): /dev/world pins each room, shows the outlines and hit areas, and walks him to each panel's room" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 13: Room wiring (B1, B2)
**Model:** Sonnet.
**Files:** Modify `app/assistant.tsx` (B1 only), `app/assistant.module.css` (B2).

**Interfaces:**
- Consumes: `WorldStage`'s `route` and `onOpen` (Task 10); `shell.route` and `shell.go` (already in the room).
- Produces: in the room, he walks to the open panel's room, and a click on a finished room opens its panel; the column lets clicks through to the rooms.

Before editing, put `app/assistant.tsx` under Now on `brain/desks/main.md` and push the desk. Each anchor occurs exactly once at `6f5672f` (checked); find it by its text.

- [ ] **B1** In `app/assistant.tsx`, inside the `<WorldStage ... />` element:

- [ ] **B1** Find:
```tsx
						controlRef={worldRef}
```
Replace with:
```tsx
						controlRef={worldRef}
						route={shell.route}
						onOpen={(to) => shell.go(to)}
```

- [ ] **B2** In `app/assistant.module.css`:

- [ ] **B2** Find:
```css
.stage[data-world] .head {
	text-shadow: 0 1px 3px rgb(0 0 0 / 0.55);
}
```
Replace with:
```css
.stage[data-world] .head {
	text-shadow: 0 1px 3px rgb(0 0 0 / 0.55);
}
/* Phase 2: the rooms behind the conversation take clicks (components/osmo/world.tsx, .hit). The column lets the
   pointer through where nothing of it is drawn; its parts, and each line of the log, still take it. */
.stage[data-world] .column,
.stage[data-world] .log {
	pointer-events: none;
}
.stage[data-world] .column > :not(.log),
.stage[data-world] .log > li {
	pointer-events: auto;
}
```

- [ ] **Check the diff.** `git diff app/assistant.tsx` shows two added lines inside `<WorldStage>`, nothing else. With `WORLD` false the element is not rendered and `data-world` is absent, so B2's rules never apply.
- [ ] **Run** `npx vitest run && npx tsc --noEmit -p . && npm run lint`.
- [ ] **Commit**, then move `app/assistant.tsx` to Just landed on the main desk and push the desk.
```bash
git add app/assistant.tsx app/assistant.module.css
git commit -m "feat(world): the room's panels are places in the village - he walks to them, and finished rooms open them" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 14: The gate
**Model:** main agent (no implementer); a Sonnet reviewer may run the checks.
**Files:** the brain (`desks/main.md`, `project.md`), nothing in the app.

- [ ] **Checks.** `npx vitest run` (all green), `npx tsc --noEmit -p .`, `npm run lint`, `npx next build --webpack` with both switches unset, and again with `NEXT_PUBLIC_OSMO_SHELL2=on NEXT_PUBLIC_OSMO_WORLD=on` set for that command only.
- [ ] **First load stays light.** After the switched-on build: `grep -l "stone-bottom" .next/static/chunks/app/page-*.js` finds nothing; `grep -rl "stone-bottom" .next/static/chunks` finds one chunk (the world's, lazily loaded). Note its size against phase 1's.
- [ ] **No migration.** Confirm read-only that the table allows the five names: `select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.village'::regclass and contype = 'c'` lists all six rooms; `select privilege_type from information_schema.role_table_grants where table_name = 'village' and grantee = 'authenticated'` includes DELETE.
- [ ] **Switch matrix** (Gur sets the values in `.env.local`; ask him, never type them; restart the one dev server after each change and note it under Now): both unset (the room as today); `SHELL2` only (the v2 shell, no world, About has no village section); both on.
- [ ] **Hand check in the room, both on.** Read-only rules for Gur's signed-in session apply: do not send Osmo messages, click the mic, Lock, Forget, or edit memory; ask Gur to do the interactive parts and report.
  - His saved hall resumes at the same block (Review Focus 2). Unbuilt open rooms show faintly; locked rooms not at all. Which rooms open matches what Gur has (facts or notes, things, reminders, Settings opened).
  - Opening Library, Things, Feed and Settings from the rail: he walks to the library, workshop, gate and observatory; closing the panel sends him back to work or the yard. A deep link (`#settings/about`) on load: he heads for the observatory (Review Focus 4).
  - A finished room: the pointer is a hand over it, a click opens its panel, Tab reaches its button with a visible focus ring; a room off screen on a phone width is not reachable by Tab (Review Focus 5). With the conversation showing, the log still scrolls with the wheel over its lines and text can be selected; the composer and header work (B2).
  - Clear the village (Gur clicks, with two tabs open): both tabs drop to an empty island with the hall's outline and he begins the hall; a read-only `select room, laid from village` afterwards shows only what was laid since (Review Focus 1).
  - Reduced motion: still frames; walking to a room jumps between tiles as in phase 1.
- [ ] **Production check.** `/dev/world` returns 404 from a production build (`npx next start` or the next preview deploy).
- [ ] **Brain.** On `desks/main.md`: Just landed (the commits, both switches still off in Vercel, "not ready to ship" until Gur has seen the castle). In `project.md` under Interfaces: `WorldControl.takeNews(): VillageNews | null` (now a queue, oldest first), `WorldControl.context(): string | null`, `lib/world/rooms.ts` `roomContext(place, counts, who)`, `lib/world/progress.ts` `villageLine(news)`. Post the Ask to language:
  > Village phase 2 is on local main. Two things are yours. (1) `TurnFacts.village`: when the room delivers a reply, call `worldRef.current?.takeNews()` until it returns null (it is now a queue, oldest first, up to four kept); each `{ room, event }` is one fact for the model, said once per session, or `villageLine(news)` from `lib/world/progress.ts` when the AI is off. Rooms are now `hall`, `library`, `workshop`, `study`, `gate`, `observatory`. (2) The context line while a panel is open: `worldRef.current?.context()` returns the line, for example "Gur is in the library with you; in front of you are 14 memories and 3 notes.", or null in Talk, with the world off, or before the visit's counts are read. It is built by the pure `roomContext(place, counts, who = "Gur")` in `lib/world/rooms.ts` (counts only, never contents); pass your own name for Gur as `who` if the prompt uses one. Both are main's code; only the wiring into a turn is yours.
  Commit the brain by path and push it.
- [ ] **Never push `main`.** Pushing is the main agent's, with Gur's OK for that push.

# Osmo's village, phase 1: the world and him

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind `NEXT_PUBLIC_OSMO_SHELL2=on` and `NEXT_PUBLIC_OSMO_WORLD=on`, the Talk page becomes Osmo's world: a pixel-art sky whose sun is his heart, a floating island, and a hall he builds block by block while Gur is there; when Gur speaks he turns to face the screen and the camera comes in on him. Either switch off: the room is exactly as today.

**Architecture:** Everything with logic is a pure module in `lib/world/` with a vitest test (vitest runs `lib/**/*.test.ts` in node only): palette and raster, tiles and sprite as letter grids, blueprints, sky, actor machine, mood bearing, room signals, camera, redraw pace, progress, renderer. The renderer draws onto a small `Painter` interface, implemented once for the canvas (browser) and once for plain pixels (tests, hashed). One client component, `components/osmo/world.tsx`, owns the loop, the two canvases and the DOM sun (the existing heart `Figure`), and is loaded with `next/dynamic` after first paint. The room gets seven small edits (A1 to A7) and the progress lives in a new `village` table.

**Tech Stack:** Next.js 16.4.0 (App Router, `next/dynamic` with `ssr: false` in a client component; `NEXT_PUBLIC_*` is inlined at build, so each switch is read by its full literal name), React 19.2, TypeScript 5.9 strict (`ImageData` wants `Uint8ClampedArray<ArrayBuffer>`), vitest 5 (node environment; jsdom is not installed), Supabase JS, Node 24 (`node:zlib` for the test-only PNG writer).

**Spec:** `docs/superpowers/specs/2026-10-09-osmo-village-design.md`, owner-approved and binding. This plan builds its Phase 1 (section 7) with what sections 2, 3, 4, 6 and 8 say about those pieces. Phase 2 (room blueprints, unlock rules, walking to rooms, clicking rooms, the context line, "Clear the village") and phase 3 are out. Read the spec and `AGENTS.md` before your task.

## Global Constraints
- Lanes: all of this is main's lane. `app/assistant.tsx` is shared with language: Task 13 edits only main's parts (the room's markup: imports for it, the stage attributes, the aura block, the composer input) as A1 to A7, and never touches `sendText`, `sendMessage`, `sendTextRef`, `onReplyRef`, `deliver`, `turnView` or the chain's helpers. Put `app/assistant.tsx` under Now on `brain/desks/main.md` before editing and under Just landed after; push the desk with `git -C C:/Users/Gurra/GroupProject/brain push origin brain`.
- Checks for every commit: `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`. The gate also runs `npx next build --webpack` (plain `next build` is blocked on this machine).
- New files: UTF-8 without BOM, ASCII only (no curly quotes, no ellipsis character, no dashes other than `-`).
- No new npm dependency. Stage by exact path (`git add <paths>`), never `git add -A` or `git add .`. Never push `main`.
- Every commit message ends with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (use a second `-m`).
- Osmo's register in any copy he says or that speaks for him: full forms ("cannot", "I have"), no exclamation marks, no slang, no emoji, and he never says he will remember.
- The world renders only when both `NEXT_PUBLIC_OSMO_SHELL2` and `NEXT_PUBLIC_OSMO_WORLD` are `on` (`WORLD` in `lib/shell/flag.ts`). With either off, the room's markup, styles and behaviour are unchanged.
- The migration `docs/migrations/village-phase-1.sql` is written by Task 9 and applied only by the main agent with Gur's OK, before any code that reads the table is pushed. No implementer applies it.
- Tokens: nothing in this phase calls a model.
- Pixel art: all art is our own, authored as letter grids in code. Nothing is copied or traced from any game.

## Review Focus (each has a test in the task named)
1. The laptop sleeps mid-walk and wakes hours later with no `visibilitychange`: he must not jump, teleport or lay a burst of blocks; one tick moves him at most a quarter second of walking (Task 6, "never moves further than a quarter second").
2. The saved row is missing, malformed, negative, fractional or beyond the end of the blueprint, or the table does not exist yet: resume at a sane block, never past the end, and a failed read means no building and no saving this visit rather than a wrong count (Task 9 `resume`/`isVillageRow` tests; Task 14 hand check with the migration not yet applied).
3. Two tabs build at once, or an old tab saves after a newer one: the saved count never goes backwards (Task 9 `markSaved` test; the table trigger; Task 14 two-tab hand check).
4. Clock edges: 23:59 to 00:00, a daylight-saving jump, an hour of 24, -0.5 or 36: sky, sun, night and stars stay defined and wrap (Task 5, "wraps hours outside 0 to 24").
5. A zero-size or phone-size view, and `prefers-reduced-motion`: no division by zero, a tighter dead zone on a phone, zoom that jumps instead of stepping, still frames that redraw only on a new block or mode (Task 8 camera and pace tests; Task 10 zero-size painter test).

## Verified before planning (reading the tree at `6951fe7`)
- `vitest.config.mts`: `include: ["lib/**/*.test.ts"], environment: "node"`. No `jsdom`, `happy-dom` or `canvas` package in `node_modules`, and no new dependency is allowed, so the renderer's hash test draws to an in-memory pixel painter, not a jsdom canvas.
- TypeScript 5.9.3: `lib.dom.d.ts` has `type ImageDataArray = Uint8ClampedArray<ArrayBuffer>`, so bitmaps are typed `Uint8ClampedArray<ArrayBuffer>`.
- `lib/shell/flag.ts`: `export const SHELL2 = process.env.NEXT_PUBLIC_OSMO_SHELL2 === "on";`.
- `lib/voice/machine.ts`: `export const FOLLOW_UP_MS = 6000;`; modes `off | paused | sleeping | awake | thinking | speaking | followup`; `inConversation` is awake, thinking, speaking or followup.
- `lib/agent/state.ts`: `AgentState.activations: Activations` (12 emotions) and `AgentState.mood: Mood | null` with `Mood = { pad, at, causes: Cause[] }`, `Cause = { tone: Emotion; because; at }`. `lib/agent/feelings.ts` prepends new causes, so `causes[0]` is the newest; `at` is `Date.now()` time. `CHARACTER.baseline` (`lib/agent/baseline.ts`): joy 0.5, sadness 0.1, fear 0.08, love 0.2, boredom 0.1.
- `lib/agent/mood-theme.ts` writes `colorA`/`colorB` as `hsl(H S% L%)` (L 25 to 78, S up to 95) and `base` as `hsl(H 30% L%)`.
- `lib/shell/contrast.ts` has `hslToRgb`, `mixOklab`, `contrastRatio`; `lib/shell/contrast.test.ts` pins the rail's contrast. The rail itself is opaque (`background: var(--rail-ground)`), so the sky only meets text in the header and the rail's hover label.
- `app/assistant.tsx`: the aura block (`<div className={styles.aura} aria-hidden="true">` with two orbs and `<Figure className={styles.figure} said={said} heard={heard} />`) is the first child of the stage; `.aura` is `position: absolute; inset: 0; z-index: -1` inside an isolated `.stage`. `said` and `heard` are computed just before `return`. `speaking` is non-null while a reply is typed out; `thinking` is true while a model reply or lookup is pending; `messages` grows by one line per message and reply. The stage already carries `data-shell`. The voice exposes `voice.mode`.
- `components/osmo/figure.tsx` reads `--aura-a/-b`, `--pulse`, `--voice`, `--open`, `--flow`, `--r1..3`, `data-speaking` from an ancestor; `--figure` sets its size. Rendering it inside the stage keeps the speech motion on the heart with no new code.
- Supabase upserts in the room omit `user_id` and rely on `default auth.uid()` (`memory_facts`, `onConflict: "user_id,key"`). `docs/migrations/artifacts-phase-1.sql` is the doc pattern (header with spec, STATUS line, RLS with `(select auth.uid())`, revoke then grant).
- Dev pages (`app/dev/figure`, `app/dev/rail`): `"use client"`, `if (process.env.NODE_ENV === "production") notFound();` as the component's first line, `Bricolage_Grotesque`, `styles` from `../../assistant.module.css` for `.stage`, buttons as `${styles.mic} ${dev.btn}`.
- `public/village/` does not exist. Node is 24.19.
- **Dry run of this plan** (an isolated scratch copy of `6951fe7`, not the shared tree, with stub art in the exact grid format): every test in Tasks 1 and 4 to 10 and the contrast extension passes (the tile lighting test failed only on the deliberately crude stub art); `npx tsc --noEmit -p .` and `npx eslint` are clean on every new file and on the room after A1 to A7 (each anchor matched exactly once); `npx next build --webpack` with both switches on builds `/dev/world` and puts the world code in one chunk the room loads lazily.

## Spec statements the checks contradicted or left open (rulings)
1. **17 or 18 frames.** Spec 3 lists idle 2, walk 6, kneel-build 4, turn 3, facing idle 2, sit 1 = 18, but says the optional sheet is "17 frames ... 272 by 32". The list is the specific statement: 18 frames, and `public/village/osmo-sheet.png` must be 288 by 32.
2. **The jsdom hash test.** jsdom is not installed and no dependency may be added. The renderer draws to a `Painter`; the test uses `pixelPainter` (plain RGBA in node) and an FNV-1a hash pinned with `toMatchInlineSnapshot`. The browser uses `canvasPainter` with the same drawing code.
3. **`blockLaid` is listed as an event in.** Here it is the actor's output: `step()` returns `{ actor, laid }` and the loop advances the progress. An input event would add a round trip with no gain.
4. **`reply` has an end.** Timing the rest after he finishes speaking needs it, so there is `reply` (he starts) and `replyDone` (he stops).
5. **"Unless Gur is present" at night** means Gur sent a message, spoke, focused or typed in the composer within the last 10 minutes (`PRESENT_MS`). Night is 21:00 to 05:00.
6. **"Faint outline" of the piece in progress** is the next block's own tile at 30% opacity (`GHOST_ALPHA`).
7. **The sun.** It is the existing DOM `Figure` between two canvases (sky behind, world in front), so `--pulse` and `[data-speaking]` keep driving it; it is placed in screen space (the sky does not scroll). Below the horizon it sits at 50% across, 62% down, dimmed, where the island and castle cover it.
8. **Sky brightness.** "Shifted by the clock" is capped so the room's Bone text keeps 4.5:1 at the lightest hour on every hue (top lightness 6% at night to 26% by day, saturation at most 55%). The rail contrast test is extended to prove it (Task 5).
9. **Face variants.** Spec 3 names them "looking at you, busy, tired" and later "warm, attentive, tired". Facing frames get one of three face patches, `warm`, `attentive`, `tired`; "busy" is the profile frames' own eye. Attentive is also the neutral face.
10. **"Two scale steps over 400 ms"** means whole-number pixel scales: base, base + 1 at 200 ms, base + 2 at 400 ms, and back the same way. An atlas is kept per scale, as spec 2 says ("at the current scale").
11. **Redraw rule detail.** Speaking counts as moving (his gaze moves), so it runs at frame pace. The gap between two blocks waits on one timer, not on frames.
12. **Lines he says** (`TurnFacts.village`, the welcome line) are the language lane's. Phase 1 produces the news (`lay()` returns it, the world's control exposes `takeNews()`) and the AI-off line (`villageLine`); wiring them into a turn is an Ask to language in Task 14.
13. **A failed read of the village** (network error, or the table not yet migrated) means he does not build and nothing is saved that visit; one console warning says so.
14. **The world mounts when the room is ready**, so the history load is not read as a new message.
15. **Base pixel scale** is chosen from the world's own width (2, or 3 above 1400 px), so the dev page's 375 px phone box behaves like a phone.
16. **Canvas backing store** is CSS pixels with `image-rendering: pixelated` (no devicePixelRatio scaling).
17. **Unlock rules** appear in spec 8's test list but section 7 puts unlocking in phase 2; phase 1 has only the hall, which starts on day one.
18. **The island blueprint** places the bench (x 47) and lantern post (x 49) where he rests at night; phase 2 may move them when the towers are anchored.

## File structure
Create:
- `lib/world/palette.ts`, `raster.ts`, `raster.test.ts`, `png.ts` (Task 1)
- `lib/world/tiles.ts`, `tiles.test.ts` (Task 2)
- `lib/world/osmo-sprite.ts`, `osmo-sprite.test.ts` (Task 3)
- `lib/world/blueprints/types.ts`, `index.ts`, `island.ts`, `hall.ts`, `blueprints.test.ts` (Task 4)
- `lib/world/sky.ts`, `sky.test.ts` (Task 5)
- `lib/world/actor.ts`, `actor.test.ts` (Task 6)
- `lib/world/face.ts`, `face.test.ts`, `signals.ts`, `signals.test.ts` (Task 7)
- `lib/world/camera.ts`, `camera.test.ts`, `pace.ts`, `pace.test.ts` (Task 8)
- `lib/world/progress.ts`, `progress.test.ts`, `village-data.ts`, `docs/migrations/village-phase-1.sql` (Task 9)
- `lib/world/render.ts`, `pixel-painter.ts`, `canvas-painter.ts`, `render.test.ts` (Task 10)
- `components/osmo/world.tsx`, `components/osmo/world.module.css` (Task 11)
- `app/dev/world/page.tsx`, `app/dev/world/dev.module.css` (Task 12)

Modify: `lib/shell/flag.ts` (Task 1), `lib/shell/contrast.test.ts` (Task 5), `app/assistant.tsx` and `app/assistant.module.css` (Task 13).

## Tasks and models
| # | Task | Model |
|---|---|---|
| 1 | Switch, palette, raster, PNG helper | Sonnet |
| 2 | Tiles (pixel data) | Opus |
| 3 | His sprite and faces (pixel data) | Opus |
| 4 | Blueprints: island and hall | Sonnet |
| 5 | Sky, sun, clouds, stars; contrast test | Sonnet |
| 6 | The actor machine | Sonnet |
| 7 | Bearing (face and pace from mood) and room signals | Sonnet |
| 8 | Camera and redraw pace | Sonnet |
| 9 | Progress, the `village` table and its readers | Sonnet |
| 10 | Renderer and its two painters | Opus |
| 11 | The world component | Sonnet |
| 12 | `/dev/world` | Sonnet |
| 13 | Room wiring (A1 to A7) | Sonnet |
| 14 | The gate | main agent |

---
### Task 1: Switch, palette, raster, PNG helper
**Model:** Sonnet.
**Files:** Modify `lib/shell/flag.ts`. Create `lib/world/palette.ts`, `lib/world/raster.ts`, `lib/world/png.ts`, `lib/world/raster.test.ts`.

**Interfaces:**
- Consumes: `hslToRgb(h, s, l): [number, number, number]` from `lib/shell/contrast.ts` (floats 0 to 255).
- Produces: `WORLD: boolean`; `PALETTE` (letter to `#rrggbb`), `Letter`, `TRANSPARENT = "."`, `SCARF = "Z"`; `Rgba`, `Bitmap = { w; h; data: Uint8ClampedArray<ArrayBuffer> }`, `Grid = readonly string[]`, `Colours`, `parseHsl(css): [number, number, number] | null`, `parseColor(css): Rgba | null`, `colours(overrides?): Colours`, `rasterize(grids, cellW, cellH, scale, colours): Bitmap`, `gridProblems(grid, w, h): string[]`, `sheetProblem(w, h, wantW, wantH): string | null`; `encodePng(w, h, rgba): Buffer`, `snapshot(name, img)`.

The **data format used everywhere in this plan**: a picture (tile, frame, face) is a `readonly string[]`, one string per pixel row, one palette letter per pixel, `"."` transparent. Tiles are 16 rows of 16; frames 32 rows of 16; faces 4 rows of 8. Grids are laid side by side in a strip in a fixed order (the "cell order"), so cell `i` of a sheet starts at x = `i * cellWidth * scale`.

- [ ] **Step 1: the switch.** Append to `lib/shell/flag.ts`:
```ts
// Osmo's village (spec 2026-10-09-osmo-village-design.md section 6): off unless the build says so, and only
// inside the v2 shell. Read by its full literal name for the same reason as SHELL2.
export const WORLD = SHELL2 && process.env.NEXT_PUBLIC_OSMO_WORLD === "on";
```

- [ ] **Step 2: write the failing test** `lib/world/raster.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { PALETTE } from "./palette";
import { encodePng } from "./png";
import { colours, gridProblems, parseColor, parseHsl, rasterize, sheetProblem } from "./raster";

describe("the palette", () => {
	it("has single-letter ASCII keys, six-digit hex values, and no dot", () => {
		for (const [k, v] of Object.entries(PALETTE)) {
			expect(k).toMatch(/^[a-zA-Z]$/);
			expect(v).toMatch(/^#[0-9a-f]{6}$/);
		}
		expect(Object.keys(PALETTE)).not.toContain(".");
	});
	it("never gives two letters the same colour", () => {
		const values = Object.values(PALETTE);
		expect(new Set(values).size).toBe(values.length);
	});
});

describe("reading colours", () => {
	it("reads hex and the hsl moodTheme writes", () => {
		expect(parseColor("#ff8000")).toEqual([255, 128, 0, 255]);
		expect(parseColor("hsl(0 100% 50%)")).toEqual([255, 0, 0, 255]);
		expect(parseColor("hsl(172 38% 50%)")).toEqual([79, 176, 163, 255]);
		expect(parseColor("blue")).toBeNull();
	});
	it("parses hsl with or without commas and wraps the hue", () => {
		expect(parseHsl("hsl(42 95% 58%)")).toEqual([42, 95, 58]);
		expect(parseHsl("hsl(42, 95%, 58%)")).toEqual([42, 95, 58]);
		expect(parseHsl("hsl(-30 50% 40%)")).toEqual([330, 50, 40]);
		expect(parseHsl("#ffffff")).toBeNull();
	});
});

describe("rasterize", () => {
	const cols = colours();
	it("lays cells side by side at the scale, and leaves dots transparent", () => {
		const bmp = rasterize([["a.", ".p"], ["pp", "pp"]], 2, 2, 2, cols);
		expect([bmp.w, bmp.h]).toEqual([8, 4]);
		const px = (x: number, y: number) => Array.from(bmp.data.slice((y * bmp.w + x) * 4, (y * bmp.w + x) * 4 + 4));
		expect(px(0, 0)).toEqual([...cols.a]);
		expect(px(1, 1)).toEqual([...cols.a]);
		expect(px(2, 0)).toEqual([0, 0, 0, 0]);
		expect(px(3, 3)).toEqual([...cols.p]);
		expect(px(4, 0)).toEqual([...cols.p]);
	});
	it("takes an override for the scarf, and ignores one it cannot read", () => {
		expect(colours({ Z: "hsl(0 100% 50%)" }).Z).toEqual([255, 0, 0, 255]);
		expect(colours({ Z: "nope" }).Z).toEqual(parseColor(PALETTE.Z));
	});
});

describe("checks", () => {
	it("names what is wrong with a grid", () => {
		expect(gridProblems(["ab", "pp"], 2, 2)).toEqual([]);
		expect(gridProblems(["ab"], 2, 2)).toEqual(["has 1 rows, not 2"]);
		expect(gridProblems(["abc", "p#"], 2, 2)).toEqual(["row 0 is 3 wide, not 2", "row 1 has unknown letter #"]);
	});
	it("says why a sheet cannot replace the drawn one", () => {
		expect(sheetProblem(608, 16, 608, 16)).toBeNull();
		expect(sheetProblem(600, 16, 608, 16)).toBe("is 600 by 16; it must be 608 by 16");
	});
	it("writes a PNG with the right signature and size", () => {
		const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]));
		expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
		expect(png.readUInt32BE(16)).toBe(2);
		expect(png.readUInt32BE(20)).toBe(1);
	});
});
```

- [ ] **Step 3: run it.** `npx vitest run lib/world/raster.test.ts`. Expected: FAIL, modules not found.

- [ ] **Step 4: implement** `lib/world/palette.ts`
```ts
// The village palette (spec 2026-10-09-osmo-village-design.md section 2). Every tile, frame and face is a grid of
// these letters, one letter per pixel, and "." is transparent. Each ramp below runs from darkest to lightest.
//
// The light rule. Light comes from the top left, on every tile and every frame:
// - the top row and the left column of a lit surface take the ramp's light or highlight step;
// - the bottom row and the right column take its shadow step, and the ramp's darkest step outlines the bottom and
//   right edges of each separate object (a stone, a brick, a plank, a shingle row, his body);
// - the base step fills the rest; at most one small highlight cluster per surface, left of and above its centre;
// - nothing is lit from the right or from below, and cast shadows fall down and to the right.
export const PALETTE = {
	// stone, for the island and the castle: outline, shadow, base, light, highlight
	a: "#23262f",
	b: "#3d4250",
	c: "#5d6475",
	d: "#868ea0",
	e: "#b9c0cd",
	// roof, terracotta: outline, shadow, base, highlight
	f: "#4a2320",
	g: "#7c3a2c",
	h: "#a9533a",
	i: "#d27a52",
	// wood: outline, shadow, base, highlight
	j: "#2e1d14",
	k: "#55361f",
	l: "#7d5530",
	m: "#a8794a",
	// snow: shadow, base, highlight (p is also the stars)
	n: "#93a7bd",
	o: "#d3dee9",
	p: "#f7fbff",
	// glass: dark, base, glint
	q: "#16243a",
	r: "#2f5683",
	s: "#86b8e0",
	// lamp light: warm light, flame, core
	t: "#ffcf6e",
	u: "#f08a3c",
	v: "#fff4cc",
	// banner cloth, deep teal: shadow, base, highlight
	w: "#1f4d4a",
	x: "#2f7a72",
	y: "#6fbfae",
	// roots and earth: outline, base, highlight
	z: "#1c120c",
	A: "#3e2a1c",
	B: "#6a4a30",
	// grass: shadow, base, highlight
	C: "#234a2a",
	D: "#3f7a3c",
	E: "#79b85a",
	// cloud: shadow, base (its highlight is p)
	F: "#9aa6bf",
	G: "#d6dcea",
	// Osmo: outline and hair, skin, skin shadow, coat base, coat light, coat shadow, shirt and eye whites (Bone),
	// hair highlight, pupils, boots
	H: "#1a1726",
	I: "#f0c7a0",
	J: "#c9926c",
	K: "#2c3f66",
	L: "#4462a0",
	M: "#1b2744",
	N: "#f3efe8",
	O: "#3b3350",
	P: "#0d0b14",
	Q: "#8a5a3c",
	// his scarf: at runtime it takes the mood's first aura colour (raster overrides); this is its dev colour
	Z: "#3aa597",
} as const;

export type Letter = keyof typeof PALETTE;
export const TRANSPARENT = ".";
export const SCARF: Letter = "Z";
```

`lib/world/raster.ts`
```ts
// Letter grids to pixels (spec 2): the atlas the renderer stamps from, at any whole-number scale. Pure and free of
// the DOM, so the tests and the browser share it.
import { hslToRgb } from "../shell/contrast";
import { PALETTE, TRANSPARENT } from "./palette";

export type Rgba = readonly [number, number, number, number];
export type Bitmap = { w: number; h: number; data: Uint8ClampedArray<ArrayBuffer> };
// One picture: one string per pixel row, one palette letter per pixel, "." transparent.
export type Grid = readonly string[];
export type Colours = Readonly<Record<string, Rgba>>;

const HEX = /^#([0-9a-f]{6})$/i;
const HSL = /^hsl\(\s*(-?[\d.]+)(?:deg)?\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%\s*\)$/i;

// The "hsl(h s% l%)" moodTheme writes, as [hue 0..360, saturation %, lightness %]; null for anything else.
export function parseHsl(css: string): [number, number, number] | null {
	const m = HSL.exec(css.trim());
	if (!m) return null;
	return [((Number(m[1]) % 360) + 360) % 360, Number(m[2]), Number(m[3])];
}

// "#rrggbb" or "hsl(...)"; null for anything else.
export function parseColor(css: string): Rgba | null {
	const hex = HEX.exec(css.trim());
	if (hex) {
		const n = parseInt(hex[1], 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
	}
	const hsl = parseHsl(css);
	if (!hsl) return null;
	const [r, g, b] = hslToRgb(hsl[0], hsl[1], hsl[2]);
	return [Math.round(r), Math.round(g), Math.round(b), 255];
}

// The palette as RGBA, with overrides (the scarf); an override that cannot be read keeps the palette's colour.
export function colours(overrides: Readonly<Record<string, string>> = {}): Colours {
	const out: Record<string, Rgba> = {};
	for (const [k, v] of Object.entries(PALETTE)) {
		const c = parseColor(v);
		if (c) out[k] = c;
	}
	for (const [k, v] of Object.entries(overrides)) {
		const c = parseColor(v);
		if (c) out[k] = c;
	}
	return out;
}

// Grids side by side in one strip: cell i starts at x = i * cellW * scale; each letter is scale by scale pixels.
export function rasterize(grids: readonly Grid[], cellW: number, cellH: number, scale: number, cols: Colours): Bitmap {
	const w = grids.length * cellW * scale;
	const h = cellH * scale;
	const data = new Uint8ClampedArray(w * h * 4);
	grids.forEach((grid, i) => {
		for (let y = 0; y < cellH; y++) {
			const row = grid[y] ?? "";
			for (let x = 0; x < cellW; x++) {
				const ch = row[x] ?? TRANSPARENT;
				if (ch === TRANSPARENT) continue;
				const c = cols[ch];
				if (!c) continue;
				for (let dy = 0; dy < scale; dy++) {
					for (let dx = 0; dx < scale; dx++) {
						const o = ((y * scale + dy) * w + (i * cellW + x) * scale + dx) * 4;
						data[o] = c[0];
						data[o + 1] = c[1];
						data[o + 2] = c[2];
						data[o + 3] = c[3];
					}
				}
			}
		}
	});
	return { w, h, data };
}

const KNOWN = new Set<string>([...Object.keys(PALETTE), TRANSPARENT]);

// What is wrong with a grid, for the art tests: the row count, each row's width, the first unknown letter per row.
export function gridProblems(grid: Grid, w: number, h: number): string[] {
	const out: string[] = [];
	if (grid.length !== h) out.push(`has ${grid.length} rows, not ${h}`);
	grid.forEach((row, y) => {
		if (row.length !== w) out.push(`row ${y} is ${row.length} wide, not ${w}`);
		const bad = [...row].find((c) => !KNOWN.has(c));
		if (bad !== undefined) out.push(`row ${y} has unknown letter ${bad}`);
	});
	return out;
}

// Why an optional PNG sheet cannot replace the drawn one, or null when it can (spec 2 and 3).
export function sheetProblem(w: number, h: number, wantW: number, wantH: number): string | null {
	return w === wantW && h === wantH ? null : `is ${w} by ${h}; it must be ${wantW} by ${wantH}`;
}
```

`lib/world/png.ts`
```ts
// A tiny PNG writer so the art can be looked at while it is drawn. Tests only: the app never imports this file.
// Set WORLD_SNAPSHOT_DIR to a scratch folder and run a world test; it writes <name>.png there.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, body: Buffer): Buffer {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(body.length, 0);
	head.write(type, 4, "ascii");
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
	return Buffer.concat([head, body, crc]);
}

export function encodePng(w: number, h: number, rgba: Uint8Array | Uint8ClampedArray): Buffer {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	const stride = w * 4;
	const raw = Buffer.alloc((stride + 1) * h);
	for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export function snapshot(name: string, img: { w: number; h: number; data: Uint8Array | Uint8ClampedArray }): void {
	const dir = process.env.WORLD_SNAPSHOT_DIR;
	if (dir) writeFileSync(join(dir, `${name}.png`), encodePng(img.w, img.h, img.data));
}
```

- [ ] **Step 5: run it.** `npx vitest run lib/world/raster.test.ts` passes; `npx tsc --noEmit -p .` and `npm run lint` are clean.

- [ ] **Step 6: commit.**
```bash
git add lib/shell/flag.ts lib/world/palette.ts lib/world/raster.ts lib/world/png.ts lib/world/raster.test.ts
git commit -m "feat(world): the village switch, palette and raster" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 2: Tiles (pixel data)
**Model:** Opus.
**Files:** Create `lib/world/tiles.ts`, `lib/world/tiles.test.ts`.

**Interfaces:**
- Consumes: `Grid`, `gridProblems`, `colours`, `rasterize` (Task 1), `PALETTE`, `snapshot` (Task 1).
- Produces: `TILE_IDS` (the 38 ids in cell order), `TileId`, `TILES: Readonly<Record<TileId, Grid>>`, `tileIndex(id): number`. The cell order is fixed: `public/village/tiles.png` uses it (608 by 16 at scale 1).

**What to draw.** Each tile is 16 rows of 16 letters. Tiles use only these letters: `a` to `z`, `A` to `G`, and `.` (never Osmo's letters `H` to `Q` or `Z`). Follow the light rule written in `palette.ts`. Tiles marked *seamless* must join their own copy on the left and right without a visible seam (and top and bottom where stated). You may build grids in `tiles.ts` with small helper functions (as the `step` example does), as long as every value in `TILES` is a 16-string array; keep helpers in the same file.

| # | id | What it depicts, and what it must have |
|---|---|---|
| 0 | `snow` | The island's top. Rows 0 to 5 snow: row 0 `p` with a few `o`, rows 1 to 4 `o`, row 5 `n`, its lower edge wavy, dipping to row 6 in two or three places. Below, island stone as in `stone`. Seamless left and right. |
| 1 | `snow-edge-l` | The left end of the snow cap: as `snow`, but the top-left corner is rounded off (transparent quarter circle of radius 4 in rows 0 to 3), and an `a` outline runs down the left edge of the stone below. |
| 2 | `snow-edge-r` | The right end: mirror of `snow-edge-l`, with the outline on the right edge and more `n` and `b` (it is the shadow side). |
| 3 | `stone` | The island's body: irregular stones 4 to 7 pixels across, each with an `e` or `d` top-left, `c` body, `b` lower right and an `a` outline on its bottom and right. Seamless in both directions. |
| 4 | `stone-dark` | Deeper body: the same kind of pattern laid differently, mostly `b` and `c`, sparse `d`, no `e`. Seamless in both directions. |
| 5 | `stone-edge-l` | The left flank of the body: a diagonal cut from column 0 at row 0 to column 6 at row 15; transparent left of the cut, `a` along the cut, `stone-dark` pattern to its right. |
| 6 | `stone-edge-r` | Mirror of `stone-edge-l`: cut from column 15 at row 0 to column 9 at row 15. |
| 7 | `stone-bottom` | The underside: rows 0 to 9 `stone-dark`; rows 10 to 15 three or four jagged hanging points, 2 to 4 pixels wide, ending at different rows between 11 and 15, transparent between them, `a` on their lower edges. |
| 8 | `root` | A hanging root section: transparent background, two root strands 2 to 3 pixels wide (`z` outline right, `A` body, `B` on their left side), wavy, entering at row 0 and leaving at row 15 in the same columns, so `root` stacks on `root`. |
| 9 | `root-end` | Root tips: the same two strands entering at row 0 in the same columns as `root`, tapering to 1-pixel points between rows 9 and 13. |
| 10 | `grass` | Tufts that sit on the snow: transparent except three tufts of blades (`C` back blades, `D` front, `E` tips), rising from row 15, 3 to 6 pixels tall. |
| 11 | `brick` | The castle wall: grey stone bricks 8 by 4 in running bond (each course offset by 4 pixels from the one above), `b` mortar, faces `c` with a `d` top row and an `e` top-left pixel, `b` along the bottom of each face. Seamless in both directions. |
| 12 | `brick-dark` | The castle's inner back wall: the same bond in `a` and `b`, at most a `c` top row. Seamless. (Phase 2 uses it.) |
| 13 | `plank` | Floor boards: horizontal planks 4 pixels tall (`m` top row, `l` body, `k` bottom row, `j` gaps), board ends staggered, two `a` nail pixels per board. Seamless left and right. (Phase 2.) |
| 14 | `beam` | A vertical wooden post in columns 5 to 10, transparent outside: `m` left column, `l` body, `k` right column, `j` outline right, an `a` grain line. (Phase 2.) |
| 15 | `beam-h` | The lintel under the roof, filling the tile: wood `l`, rows 0 to 1 `m`, rows 13 to 14 `k`, row 15 `j`, two iron bolts (`a` with a `d` glint) at columns 3 and 12. Seamless left and right. |
| 16 | `glass` | A plain pane filling the tile: `r` glass, `q` along the bottom and right, two short diagonal `s` glints in the top-left quarter. (Phase 2.) |
| 17 | `window` | Lower half of an arched window set in `brick` bond: glass opening in columns 4 to 11, rows 0 to 12, `q` inner frame on the bottom and right of the opening, `r` glass, an `s` glint top-left; a stone sill in rows 13 to 15 across columns 2 to 13 (`e`/`d` top, `b` bottom, `a` outline). Brick bond outside the opening matches `brick` so it sits in the wall without a seam. |
| 18 | `window-top` | Upper half: brick around; the opening (columns 4 to 11) rises from row 15 to row 6, then narrows to a rounded top (rows 3 to 5, columns 6 to 9); a two-pixel `e`/`d` keystone above the arch. Joins `window` below without a seam. |
| 19 | `door` | Lower door: brick margins in columns 0 to 1 and 14 to 15, a wooden door in columns 2 to 13 (vertical planks `l`, `k` seams, `m` on the left plank's left column), `a` iron bands at rows 3 and 11, a `d` ring handle at column 10, row 7; row 15 a `d` threshold. |
| 20 | `door-top` | Upper door: brick around, the door wood (as `door`) from row 15 up to row 6, its top rounded across rows 2 to 6, an `e` keystone at the top centre. Joins `door` below without a seam. |
| 21 | `roof-left` | The left slope: transparent above the diagonal from (column 0, row 15) to (column 15, row 0); below it, terracotta shingles in rows of 4 pixels (`i` top row of each, `h` body, `g` bottom, `f` gaps), and an `f` edge along the diagonal. |
| 22 | `roof-right` | The right slope: transparent above the diagonal from (0, 0) to (15, 15); the same shingles, but this is the shadow side: more `g`, fewer `i`, the `f` edge along the diagonal. |
| 23 | `roof-flat` | A full tile of shingles: rows of 4 pixels, half-shingle stagger between rows, `i` top row, `h` body, `g` bottom, `f` gap lines. Seamless in both directions; joins `roof-left` and `roof-right` at the same shingle rows. |
| 24 | `roof-peak` | The apex: transparent outside a triangle whose point is at columns 7 to 8, row 0 and whose base spans the full width at row 15; shingles as `roof-flat` inside; a 2 by 3 `e`/`d` finial at the point. |
| 25 | `battlement` | The chimney cap: two small merlons (columns 1 to 6 and 9 to 14, rows 4 to 15) in `brick` bond, transparent between and above, `e` top-left highlights. |
| 26 | `lantern` | A hanging iron lantern: transparent background; an `a` bracket from the left edge at row 2; the body in columns 5 to 10, rows 4 to 13: `a` frame, `d` cap at the top, `t` glass with a `v` core and a `u` flame at the bottom of the core. |
| 27 | `lantern-post` | A standing iron post: transparent background; the post in columns 7 to 8 from row 0 to row 13 (`d` left column, `a` right); a base plate in rows 13 to 15, columns 5 to 10 (`d` top, `b`, `a` bottom). The `lantern` tile sits on top of it. |
| 28 | `banner` | Top half of a hanging banner: a wooden rod across rows 0 to 1, columns 1 to 14 (`m` top, `l`, `j` ends); cloth in columns 3 to 12 from row 2 to row 15 (`y` left column, `x` body, `w` right column); a small heart emblem in `t`, 4 wide by 3 tall, at rows 8 to 10, centred. |
| 29 | `banner-end` | Lower half: the cloth (as `banner`) from row 0, ending in a swallowtail: a notch at columns 7 to 8 from row 9 down, the two points ending at row 13; `w` along the bottom edges. |
| 30 | `step` | The foundation: given in full below as the worked example. |
| 31 | `pillar` | A corner column filling the tile: columns 0 to 1 `e`, 2 to 4 `d`, 5 to 10 `c`, 11 to 13 `b`, 14 to 15 `a`; an `a` joint across the full width at rows 7 and 15. Seamless top and bottom. |
| 32 | `bench` | A wooden bench: transparent background; the seat in rows 8 to 10, columns 1 to 14 (`m` top, `l`, `k` bottom); legs in columns 2 to 3 and 12 to 13, rows 11 to 15 (`k`, `j` right column). He sits on it at night. |
| 33 | `cloud-l` | Left end of a one-tile-tall cloud: transparent background; the body fills from column 4 at rows 6 to 15, bulging up to row 3 over columns 8 to 15; `G` body, `p` rim on the upper-left edge of each puff, `F` along the bottom two rows; open on the right (it continues). |
| 34 | `cloud-m` | Middle: body across all columns, rows 4 to 15, one puff rising to row 1 over columns 4 to 11; `p` rim on top, `F` bottom two rows. Joins `cloud-l`, itself and `cloud-r`. |
| 35 | `cloud-r` | Right end: the body ends rounded by column 11; light still from the top left (so not a pure mirror of `cloud-l`: the rim stays on top, the right edge is `F`). |
| 36 | `cloud-top` | A puff that sits on top of a `cloud-m`: a rounded bump in columns 2 to 13 from row 6 to row 15, open at the bottom so it merges with the tile below; `p` rim top-left. |
| 37 | `cloud-small` | A small free-standing cloud: body in columns 2 to 13, rows 6 to 12, `F` bottom row, `p` rim top-left, transparent elsewhere. |

The worked example, `step` (two courses of 8 by 8 blocks; the lower course offset by 4, built from the same block rows):
```ts
const BLOCK = ["edddddda", "dcccccca", "dcccccca", "dcccccca", "dcccccca", "dcccccba", "dbbbbbba", "aaaaaaaa"];
const course = (rows: readonly string[], offset: number) =>
	rows.map((r) => (offset === 0 ? r + r : r.slice(offset) + r + r.slice(0, offset)));
const step: Grid = [...course(BLOCK, 0), ...course(BLOCK, 4)];
// step[0]  === "eddddddaedddddda"
// step[8]  === "dddaeddddddaeddd"
// step[15] === "aaaaaaaaaaaaaaaa"
```

- [ ] **Step 1: write the failing test** `lib/world/tiles.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { snapshot } from "./png";
import { colours, gridProblems, rasterize } from "./raster";
import { TILE_IDS, TILES, tileIndex, type TileId } from "./tiles";

const ORDER = [
	"snow", "snow-edge-l", "snow-edge-r", "stone", "stone-dark", "stone-edge-l", "stone-edge-r", "stone-bottom",
	"root", "root-end", "grass", "brick", "brick-dark", "plank", "beam", "beam-h", "glass", "window", "window-top",
	"door", "door-top", "roof-left", "roof-right", "roof-flat", "roof-peak", "battlement", "lantern", "lantern-post",
	"banner", "banner-end", "step", "pillar", "bench", "cloud-l", "cloud-m", "cloud-r", "cloud-top", "cloud-small",
];
// Tiles with no transparent pixel.
const FILLED: TileId[] = [
	"snow", "stone", "stone-dark", "brick", "brick-dark", "plank", "beam-h", "glass", "window", "window-top",
	"door", "door-top", "roof-flat", "step", "pillar",
];
// Tiles whose whole surface must read as lit from the top left.
const LIT: TileId[] = ["snow", "stone", "stone-dark", "brick", "brick-dark", "plank", "beam-h", "roof-flat", "step", "pillar"];

const cols = colours();
const lum = (ch: string): number | null => {
	const c = cols[ch];
	return ch === "." || !c ? null : 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const mean = (chars: string[]) => {
	const v = chars.map(lum).filter((x): x is number => x !== null);
	return v.reduce((a, b) => a + b, 0) / v.length;
};

describe("the tiles", () => {
	it("are the 38 tiles in the fixed cell order", () => {
		expect([...TILE_IDS]).toEqual(ORDER);
		expect(Object.keys(TILES).sort()).toEqual([...ORDER].sort());
		expect(tileIndex("snow")).toBe(0);
		expect(tileIndex("step")).toBe(30);
		expect(tileIndex("cloud-small")).toBe(37);
	});
	it.each([...TILE_IDS])("%s is 16 by 16 in palette letters", (id) => {
		expect(gridProblems(TILES[id], 16, 16)).toEqual([]);
	});
	it("keeps Osmo's letters and the scarf out of the tiles, and draws something in each", () => {
		for (const id of TILE_IDS) {
			expect(TILES[id].join("")).toMatch(/^[a-zA-G.]+$/);
			expect(TILES[id].join("").replace(/\./g, "").length).toBeGreaterThan(20);
		}
	});
	it.each(FILLED)("%s has no transparent pixel", (id) => {
		expect(TILES[id].join("")).not.toContain(".");
	});
	it.each(LIT)("%s is lit from the top left", (id) => {
		const g = TILES[id];
		expect(mean([...g[0]])).toBeGreaterThanOrEqual(mean([...g[15]]));
		expect(mean(g.map((r) => r[0]))).toBeGreaterThanOrEqual(mean(g.map((r) => r[15])) - 2);
	});
	it("keeps the worked example exactly", () => {
		expect(TILES.step[0]).toBe("eddddddaedddddda");
		expect(TILES.step[8]).toBe("dddaeddddddaeddd");
		expect(TILES.step[15]).toBe("aaaaaaaaaaaaaaaa");
	});
	it("writes a contact sheet when WORLD_SNAPSHOT_DIR is set", () => {
		const bmp = rasterize(TILE_IDS.map((id) => TILES[id]), 16, 16, 4, cols);
		snapshot("tiles", bmp);
		expect(bmp.w).toBe(38 * 64);
	});
});
```

- [ ] **Step 2: run it.** `npx vitest run lib/world/tiles.test.ts`. Expected: FAIL, `./tiles` not found.

- [ ] **Step 3: implement** `lib/world/tiles.ts` with this frame, and every tile drawn per the table:
```ts
// The village tiles (spec 2): 16 by 16 grids of palette letters, light from the top left (see palette.ts).
// TILE_IDS is the cell order of the atlas and of the optional public/village/tiles.png (608 by 16).
import type { Grid } from "./raster";

export const TILE_IDS = [
	"snow", "snow-edge-l", "snow-edge-r", "stone", "stone-dark", "stone-edge-l", "stone-edge-r", "stone-bottom",
	"root", "root-end", "grass", "brick", "brick-dark", "plank", "beam", "beam-h", "glass", "window", "window-top",
	"door", "door-top", "roof-left", "roof-right", "roof-flat", "roof-peak", "battlement", "lantern", "lantern-post",
	"banner", "banner-end", "step", "pillar", "bench", "cloud-l", "cloud-m", "cloud-r", "cloud-top", "cloud-small",
] as const;
export type TileId = (typeof TILE_IDS)[number];

const BLOCK = ["edddddda", "dcccccca", "dcccccca", "dcccccca", "dcccccca", "dcccccba", "dbbbbbba", "aaaaaaaa"];
const course = (rows: readonly string[], offset: number) =>
	rows.map((r) => (offset === 0 ? r + r : r.slice(offset) + r + r.slice(0, offset)));

export const TILES: Readonly<Record<TileId, Grid>> = {
	// ... every tile in the table, as 16 strings of 16 letters ...
	step: [...course(BLOCK, 0), ...course(BLOCK, 4)],
};

const INDEX = new Map<TileId, number>(TILE_IDS.map((id, i) => [id, i]));
export const tileIndex = (id: TileId): number => INDEX.get(id) ?? 0;
```

- [ ] **Step 4: look at it.** `WORLD_SNAPSHOT_DIR=<your scratch folder> npx vitest run lib/world/tiles.test.ts` (in PowerShell: `$env:WORLD_SNAPSHOT_DIR="<folder>"; npx vitest run lib/world/tiles.test.ts`), then open `<folder>/tiles.png` with the Read tool. Check: each tile reads as what the table says at a glance, light from the top left everywhere, the seamless tiles join themselves (render a 3 by 2 repeat in a quick scratch script if unsure), shingle rows of the three roof tiles line up, `window` sits in `brick` without a seam. Redraw what fails, then run the test again.

- [ ] **Step 5: run it.** The test passes; `npx tsc --noEmit -p .` and `npm run lint` are clean.

- [ ] **Step 6: commit.**
```bash
git add lib/world/tiles.ts lib/world/tiles.test.ts
git commit -m "feat(world): the village tiles, 38 grids lit from the top left" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 3: His sprite and faces (pixel data)
**Model:** Opus.
**Files:** Create `lib/world/osmo-sprite.ts`, `lib/world/osmo-sprite.test.ts`.

**Interfaces:**
- Consumes: `Grid`, `gridProblems`, `colours`, `rasterize` (Task 1), `snapshot` (Task 1).
- Produces: `FRAME_W = 16`, `FRAME_H = 32`, `FRAME_NAMES` (18, cell order), `FrameName`, `FRAMES: Readonly<Record<FrameName, Grid>>`, `frameIndex(name)`, `FACE_IDS = ["warm", "attentive", "tired"]`, `FaceId`, `FACE_W = 8`, `FACE_H = 4`, `FACE_AT = { x: 4, y: 7 }`, `FACES`, `Gaze = -1 | 0 | 1`, `withGaze(face, gaze): Grid`, `faceCell(face, gaze): number`, `FACE_CELLS: readonly Grid[]` (9 cells: for each face in `FACE_IDS` order, gaze -1, 0, 1). The optional `public/village/osmo-sheet.png` is the 18 frames in `FRAME_NAMES` order, 288 by 32.

**Who he is.** A small person, chibi proportions, 16 wide by 32 tall, his own design (not any game's character). Letters: `H` outline and hair, `O` hair highlight, `I` skin, `J` skin shadow, `K` coat, `L` coat light, `M` coat shadow and trousers, `N` shirt and eye whites, `P` pupils, `Q` boots, `Z` scarf (runtime aura colour), and `a`, `d`, `e` only for the stone block in his hand in the build frames. A 1-pixel `H` outline closes the whole figure. Light from the top left: `L` on the coat's left and top edges, `M` on its right and bottom, `J` on the right side of the face and under the hair.
- Head: rows 1 to 12, about 10 pixels wide (columns 3 to 12); hair rows 1 to 5 with a short swept fringe; the head never moves between `face-1` and `face-2`.
- Scarf `Z`: rows 12 to 14 around the neck, in every frame; in profile frames one end trails behind him (to the left when he faces right) and moves with the walk.
- Coat rows 14 to 25; in facing frames a 2-pixel `N` shirt strip down the centre. Legs rows 25 to 29 in `M`; boots `Q` rows 29 to 31.
- Every frame's lowest opaque row is row 31 (his feet on the ground line), including `sit-1` (his feet), and including the kneeling frames (the knee on the ground).
- Profile frames (idle, walk, build, `turn-1`) face right: one eye (`N` with a `P` pupil on its right) at about column 10 to 11, row 8, and a 1-pixel `H` mouth at row 10. This is the "busy" face.

| Frames | What each shows |
|---|---|
| `idle-1`, `idle-2` | Standing in profile facing right, arms at his sides. `idle-2` breathes: shoulders and chest 1 pixel higher, the scarf tail moved 1 pixel. |
| `walk-1` to `walk-6` | A six-frame walk to the right: contact, down, passing, up, contact with the other leg, passing. Arms swing opposite the legs; the head dips 1 pixel on the down frame; a foot reaches row 31 in every frame. |
| `build-1` to `build-4` | Kneeling facing right, one knee on the ground, the body lowered so the top of his head is at row 6 or 7, laying a stone: `build-1` arm back holding a small stone block (`e` top-left, `d`, `a` outline; 3 by 3) at about columns 12 to 15, rows 18 to 22; `build-2` arm raised; `build-3` the block pressed down in front of him; `build-4` the hand open, the block set, the arm coming back. |
| `turn-1` to `turn-3` | From profile to facing the viewer: `turn-1` three-quarter view to the right (one eye and the edge of the other); `turn-2` three-quarter toward the viewer (both eyes, the far one narrower); `turn-3` fully facing, with the face box blank (see below). |
| `face-1`, `face-2` | Facing the viewer, standing, arms at his sides, the face box blank. `face-2` breathes (shoulders and chest 1 pixel up); the head stays still. |
| `sit-1` | Sitting facing right on the bench (the bench is a tile; his seat at row 24), legs bent forward, feet at row 31, head tilted down a little, the eye a closed `H` line. |

**The face box.** In `turn-3`, `face-1` and `face-2`, the 8 by 4 rectangle at columns 4 to 11, rows 7 to 10 is plain skin `I`, nothing else; the renderer stamps a face patch there (`FACE_AT`). The three face patches are given here and are not to be redrawn ("." keeps the sprite's skin; eyes are 3 pixels wide at columns 0 to 2 and 5 to 7 with the pupil in the middle at gaze 0):
```ts
export const FACES: Readonly<Record<FaceId, Grid>> = {
	warm: ["........", "NPN..NPN", "..H..H..", "...HH..."],
	attentive: [".HH..HH.", "NPN..NPN", "........", "...HH..."],
	tired: ["........", "HHH..HHH", "NPN..NPN", "..HHHH.."],
};
```

- [ ] **Step 1: write the failing test** `lib/world/osmo-sprite.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
	FACE_AT, FACE_CELLS, FACE_H, FACE_IDS, FACE_W, FACES, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex, withGaze,
} from "./osmo-sprite";
import { snapshot } from "./png";
import { colours, gridProblems, rasterize } from "./raster";

const NAMES = [
	"idle-1", "idle-2", "walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6", "build-1", "build-2", "build-3",
	"build-4", "turn-1", "turn-2", "turn-3", "face-1", "face-2", "sit-1",
];

describe("his frames", () => {
	it("are the 18 frames in the fixed cell order", () => {
		expect([...FRAME_NAMES]).toEqual(NAMES);
		expect(Object.keys(FRAMES).sort()).toEqual([...NAMES].sort());
		expect(frameIndex("idle-1")).toBe(0);
		expect(frameIndex("sit-1")).toBe(17);
	});
	it.each([...FRAME_NAMES])("%s is 16 by 32 in his letters, wears the scarf, and stands on row 31", (name) => {
		const f = FRAMES[name];
		expect(gridProblems(f, FRAME_W, FRAME_H)).toEqual([]);
		expect(f.join("")).toMatch(/^[HIJKLMNOPQZade.]+$/);
		expect(f.join("")).toContain("Z");
		expect(f[31].replace(/\./g, "").length).toBeGreaterThan(0);
	});
	it("never repeats a frame", () => {
		const all = FRAME_NAMES.map((n) => FRAMES[n].join("\n"));
		expect(new Set(all).size).toBe(all.length);
	});
	it("leaves the face box plain skin where a face is stamped", () => {
		for (const name of ["turn-3", "face-1", "face-2"] as const) {
			for (let y = FACE_AT.y; y < FACE_AT.y + FACE_H; y++) {
				expect(FRAMES[name][y].slice(FACE_AT.x, FACE_AT.x + FACE_W)).toBe("I".repeat(FACE_W));
			}
		}
	});
	it("writes a contact sheet when WORLD_SNAPSHOT_DIR is set", () => {
		const bmp = rasterize(FRAME_NAMES.map((n) => FRAMES[n]), FRAME_W, FRAME_H, 6, colours({ Z: "hsl(172 38% 50%)" }));
		snapshot("osmo-frames", bmp);
		expect(bmp.w).toBe(18 * 96);
	});
});

describe("his faces", () => {
	it("are 8 by 4 with exactly two pupils", () => {
		for (const id of FACE_IDS) {
			expect(gridProblems(FACES[id], FACE_W, FACE_H)).toEqual([]);
			expect(FACES[id].join("")).toMatch(/^[HJNP.]+$/);
			expect(FACES[id].join("").split("P")).toHaveLength(3);
		}
	});
	it("moves both pupils with his gaze and nothing else", () => {
		expect(withGaze(["NPN..NPN"], -1)).toEqual(["PNN..PNN"]);
		expect(withGaze(["NPN..NPN"], 0)).toEqual(["NPN..NPN"]);
		expect(withGaze(["NPN..NPN"], 1)).toEqual(["NNP..NNP"]);
		expect(withGaze(["HHH..HHH", "NPN..NPN"], 1)).toEqual(["HHH..HHH", "NNP..NNP"]);
	});
	it("lays out the face cells three gazes per face", () => {
		expect(FACE_CELLS).toHaveLength(9);
		expect(faceCell("warm", -1)).toBe(0);
		expect(faceCell("warm", 0)).toBe(1);
		expect(faceCell("tired", 1)).toBe(8);
		expect(FACE_CELLS[faceCell("attentive", -1)]).toEqual(withGaze(FACES.attentive, -1));
	});
});
```

- [ ] **Step 2: run it.** `npx vitest run lib/world/osmo-sprite.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: implement** `lib/world/osmo-sprite.ts`:
```ts
// Osmo in the village (spec 3): one sprite, 16 by 32, 18 frames, and three face patches stamped over the facing
// frames. Light from the top left (see palette.ts). FRAME_NAMES is the cell order of the atlas and of the optional
// public/village/osmo-sheet.png (288 by 32).
import type { Grid } from "./raster";

export const FRAME_W = 16;
export const FRAME_H = 32;
export const FRAME_NAMES = [
	"idle-1", "idle-2", "walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6", "build-1", "build-2", "build-3",
	"build-4", "turn-1", "turn-2", "turn-3", "face-1", "face-2", "sit-1",
] as const;
export type FrameName = (typeof FRAME_NAMES)[number];

export const FRAMES: Readonly<Record<FrameName, Grid>> = {
	// ... the 18 frames per the table, 32 strings of 16 letters each ...
};
const FRAME_INDEX = new Map<FrameName, number>(FRAME_NAMES.map((n, i) => [n, i]));
export const frameIndex = (name: FrameName): number => FRAME_INDEX.get(name) ?? 0;

export const FACE_IDS = ["warm", "attentive", "tired"] as const;
export type FaceId = (typeof FACE_IDS)[number];
export type Gaze = -1 | 0 | 1;
export const FACE_W = 8;
export const FACE_H = 4;
// Where a face patch goes in a facing frame, in sprite pixels.
export const FACE_AT = { x: 4, y: 7 } as const;
export const FACES: Readonly<Record<FaceId, Grid>> = {
	warm: ["........", "NPN..NPN", "..H..H..", "...HH..."],
	attentive: [".HH..HH.", "NPN..NPN", "........", "...HH..."],
	tired: ["........", "HHH..HHH", "NPN..NPN", "..HHHH.."],
};

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
Draw the 18 frames per the table. Start from `face-1` (the most constrained), derive `face-2`, then the profile `idle-1`, the walk cycle from it, then build, turn and sit, so the proportions stay one character.

- [ ] **Step 4: look at it.** Run with `WORLD_SNAPSHOT_DIR` set (as in Task 2) and open `osmo-frames.png`. Check: one consistent character in every frame, readable at 1x and at 6x; the walk loops (frame 6 flows into frame 1); the turn reads as a turn; the face box in `turn-3`/`face-1`/`face-2` is clean skin; light from the top left. Then compose a quick check in a scratch script (not committed) that stamps each face patch with each gaze onto `face-1` at `FACE_AT` and writes it with `snapshot`, to see the three faces on him. Redraw until it reads well.

- [ ] **Step 5: run it.** The test passes; `npx tsc --noEmit -p .` and `npm run lint` are clean.

- [ ] **Step 6: commit.**
```bash
git add lib/world/osmo-sprite.ts lib/world/osmo-sprite.test.ts
git commit -m "feat(world): Osmo's sprite, 18 frames and three faces" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 4: Blueprints: island and hall
**Model:** Sonnet.
**Files:** Create `lib/world/blueprints/types.ts`, `lib/world/blueprints/index.ts`, `lib/world/blueprints/island.ts`, `lib/world/blueprints/hall.ts`, `lib/world/blueprints/blueprints.test.ts`.

**Interfaces:**
- Consumes: `TileId`, `TILE_IDS` (Task 2).
- Produces: `TILE = 16`, `WORLD_W = 64`, `WORLD_H = 40`, `GROUND_Y = 26`, `RoomId = "island" | "hall"`, `Layer`, `LAYER_ORDER`, `Legend`, `Blueprint`, `Block = { x; y; tile: TileId; layer: Layer }` (x, y in tiles); `blocksOf(bp): Block[]` (laying order), `ISLAND_LEFT = 8`, `ISLAND_RIGHT = 55`, `standX(b): number` (world px), `REST_X`, `START_X` (world px); `ISLAND`, `HALL`.

The world is 64 tiles wide and 40 tall (1024 by 640 world pixels). The island's snow row is y 26; he stands on its top edge (world y 416). The hall is 19 by 15 at x 23, y 11, its foundation on row 25 and its door at x 32, the island's centre.

- [ ] **Step 1: write the failing test** `lib/world/blueprints/blueprints.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { TILE_IDS } from "../tiles";
import { HALL } from "./hall";
import { blocksOf, ISLAND_LEFT, ISLAND_RIGHT, REST_X, standX, START_X } from "./index";
import { ISLAND } from "./island";
import { GROUND_Y, LAYER_ORDER, TILE, WORLD_H, WORLD_W, type Blueprint } from "./types";

describe.each([ISLAND, HALL])("the $room blueprint", (bp: Blueprint) => {
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
	const decor = (b: { layer: string }) => b.layer === "lanterns" || b.layer === "banners";
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
		const key = (x: number, y: number) => `${x},${y}`;
		for (const b of blocks) {
			if (!decor(b)) {
				const held = b.y + 1 === GROUND_Y || placed.has(key(b.x, b.y + 1)) || placed.has(key(b.x - 1, b.y)) || placed.has(key(b.x + 1, b.y));
				expect(held, `${b.tile} at ${b.x},${b.y}`).toBe(true);
				placed.add(key(b.x, b.y));
			}
		}
	});
	it("stands on the island with its door at the centre", () => {
		expect(blocks.filter((b) => b.layer === "floor").every((b) => b.y + 1 === GROUND_Y)).toBe(true);
		expect(blocks.find((b) => b.tile === "door")?.x).toBe(32);
		expect(START_X).toBe(32.5 * TILE);
	});
});

describe("the island", () => {
	const ground = blocksOf(ISLAND);
	it("has snow along its whole top row", () => {
		const top = ground.filter((b) => b.y === GROUND_Y);
		expect(top).toHaveLength(48);
		expect(top.find((b) => b.x === ISLAND_LEFT)?.tile).toBe("snow-edge-l");
		expect(top.find((b) => b.x === ISLAND_RIGHT)?.tile).toBe("snow-edge-r");
	});
	it("has the bench and the lantern where he rests", () => {
		expect(ground.find((b) => b.tile === "bench")).toMatchObject({ x: 47, y: 25 });
		expect(ground.find((b) => b.tile === "lantern-post")).toMatchObject({ x: 49, y: 25 });
		expect(ground.find((b) => b.tile === "lantern")).toMatchObject({ x: 49, y: 24 });
		expect(REST_X).toBe(47.5 * TILE);
	});
	it("lets him stand only on the island", () => {
		expect(standX({ x: 0, y: 20, tile: "brick", layer: "walls" })).toBe((ISLAND_LEFT + 1.5) * TILE);
		expect(standX({ x: 99, y: 20, tile: "brick", layer: "walls" })).toBe((ISLAND_RIGHT - 0.5) * TILE);
		expect(standX({ x: 30, y: 20, tile: "brick", layer: "walls" })).toBe(30.5 * TILE);
	});
});
```

- [ ] **Step 2: run it.** `npx vitest run lib/world/blueprints`. Expected: FAIL.

- [ ] **Step 3: implement.** `lib/world/blueprints/types.ts`
```ts
// Blueprints (spec 4): rooms as tile maps with a laying order. Coordinates are in tiles unless a name says px.
import type { TileId } from "../tiles";

export const TILE = 16; // world pixels per tile
export const WORLD_W = 64; // tiles
export const WORLD_H = 40;
export const GROUND_Y = 26; // the island's snow row; his feet stand on its top edge
export type RoomId = "island" | "hall";
// "ground" is the island's, never laid. The rest is the order a room is built in (spec 4).
export type Layer = "ground" | "floor" | "walls" | "roof" | "windows" | "door" | "lanterns" | "banners";
export const LAYER_ORDER: readonly Layer[] = ["ground", "floor", "walls", "roof", "windows", "door", "lanterns", "banners"];
export type Legend = Readonly<Record<string, { tile: TileId; layer: Layer }>>;
// map: the structure, one letter per tile; decor: things that hang on it (lanterns, banners), same size or empty.
export type Blueprint = { room: RoomId; x: number; y: number; map: readonly string[]; decor: readonly string[]; legend: Legend };
export type Block = { x: number; y: number; tile: TileId; layer: Layer };
```
`lib/world/blueprints/index.ts`
```ts
import { LAYER_ORDER, TILE, type Block, type Blueprint, type Layer } from "./types";

// Every block of a blueprint in laying order: by layer, then bottom row first, then left to right.
export function blocksOf(bp: Blueprint): Block[] {
	const cells: Block[] = [];
	for (const grid of [bp.map, bp.decor]) {
		grid.forEach((row, y) => {
			[...row].forEach((ch, x) => {
				if (ch === ".") return;
				const entry = bp.legend[ch];
				if (!entry) throw new Error(`${bp.room}: no legend entry for "${ch}" at ${x},${y}`);
				cells.push({ x: bp.x + x, y: bp.y + y, tile: entry.tile, layer: entry.layer });
			});
		});
	}
	const rank = (l: Layer) => LAYER_ORDER.indexOf(l);
	return cells.sort((a, b) => rank(a.layer) - rank(b.layer) || b.y - a.y || a.x - b.x);
}

export const ISLAND_LEFT = 8; // tile columns of the island's two ends
export const ISLAND_RIGHT = 55;
// Where he stands to lay a block (world px): under it, but never off the island's ends.
export const standX = (b: Block): number => (Math.min(ISLAND_RIGHT - 1, Math.max(ISLAND_LEFT + 1, b.x)) + 0.5) * TILE;
export const REST_X = (47 + 0.5) * TILE; // the bench by the lantern (island.ts)
export const START_X = (32 + 0.5) * TILE; // the hall's door
```
`lib/world/blueprints/island.ts`
```ts
// The island (spec 2 and 4): pre-built, never laid. 48 tiles wide from x 8, rows 24 to 34: the lantern and the
// bench above the snow, the snow cap, the stone body tapering down, and roots hanging below.
import type { Blueprint } from "./types";

const W = 48;
const at = (marks: Readonly<Record<number, string>>) => Array.from({ length: W }, (_, i) => marks[i] ?? ".").join("");
const band = (inset: number, left: string, fill: string, right: string) =>
	".".repeat(inset) + left + fill.repeat(W - 2 * inset - 2) + right + ".".repeat(inset);

export const ISLAND: Blueprint = {
	room: "island",
	x: 8,
	y: 24,
	map: [
		at({ 41: "L" }),
		at({ 4: "g", 9: "g", 35: "g", 39: "b", 41: "p", 45: "g" }),
		band(0, "[", "n", "]"),
		band(0, "{", "s", "}"),
		band(1, "{", "s", "}"),
		band(3, "{", "k", "}"),
		band(6, "{", "k", "}"),
		".".repeat(10) + "u".repeat(28) + ".".repeat(10),
		at({ 12: "r", 15: "r", 19: "r", 24: "r", 28: "r", 33: "r", 36: "r" }),
		at({ 12: "t", 15: "r", 19: "t", 24: "r", 28: "t", 33: "r", 36: "t" }),
		at({ 15: "t", 24: "t", 33: "t" }),
	],
	decor: [],
	legend: {
		"[": { tile: "snow-edge-l", layer: "ground" },
		n: { tile: "snow", layer: "ground" },
		"]": { tile: "snow-edge-r", layer: "ground" },
		s: { tile: "stone", layer: "ground" },
		k: { tile: "stone-dark", layer: "ground" },
		"{": { tile: "stone-edge-l", layer: "ground" },
		"}": { tile: "stone-edge-r", layer: "ground" },
		u: { tile: "stone-bottom", layer: "ground" },
		r: { tile: "root", layer: "ground" },
		t: { tile: "root-end", layer: "ground" },
		g: { tile: "grass", layer: "ground" },
		b: { tile: "bench", layer: "ground" },
		p: { tile: "lantern-post", layer: "ground" },
		L: { tile: "lantern", layer: "ground" },
	},
};
```
`lib/world/blueprints/hall.ts`
```ts
// The hall (spec 4): the first room, started on day one. 19 by 15 tiles at x 23, y 11; its foundation sits on the
// island's snow and its door is at x 32. 180 blocks: 174 in the map and 6 in the decor.
import type { Blueprint } from "./types";

const BLANK = ".".repeat(19);

export const HALL: Blueprint = {
	room: "hall",
	x: 23,
	y: 11,
	map: [
		".........^.........",
		"........<=>..T.....",
		".......<===>.C.....",
		"......<=====>C.....",
		".....<=======>.....",
		"....<=========>....",
		"...<===========>...",
		"..hhhhhhhhhhhhhhh..",
		"..IBBBBBBBBBBBBBI..",
		"..IBBvBBBBBBBvBBI..",
		"..IBBwBBBBBBBwBBI..",
		"..IBBBBBBBBBBBBBI..",
		"..IBBBBBBaBBBBBBI..",
		"..IBBBBBBdBBBBBBI..",
		".SSSSSSSSSSSSSSSSS.",
	],
	decor: [
		BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK,
		".......b...b.......",
		".......e...e.......",
		BLANK, BLANK,
		"........l.l........",
		BLANK, BLANK,
	],
	legend: {
		S: { tile: "step", layer: "floor" },
		I: { tile: "pillar", layer: "walls" },
		B: { tile: "brick", layer: "walls" },
		h: { tile: "beam-h", layer: "walls" },
		"<": { tile: "roof-left", layer: "roof" },
		">": { tile: "roof-right", layer: "roof" },
		"=": { tile: "roof-flat", layer: "roof" },
		"^": { tile: "roof-peak", layer: "roof" },
		C: { tile: "brick", layer: "roof" }, // the chimney, laid with the roof it stands on
		T: { tile: "battlement", layer: "roof" },
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
Every map and decor row is exactly 19 characters; the test catches a miscount.

- [ ] **Step 4: run it.** `npx vitest run lib/world/blueprints` passes; tsc and lint clean.

- [ ] **Step 5: commit.**
```bash
git add lib/world/blueprints/types.ts lib/world/blueprints/index.ts lib/world/blueprints/island.ts lib/world/blueprints/hall.ts lib/world/blueprints/blueprints.test.ts
git commit -m "feat(world): island and hall blueprints with their laying order" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 5: Sky, sun, clouds, stars; the contrast test
**Model:** Sonnet.
**Files:** Create `lib/world/sky.ts`, `lib/world/sky.test.ts`. Modify `lib/shell/contrast.test.ts` (append one `describe`).

**Interfaces:**
- Consumes: `parseHsl` (Task 1), `TILE`, `WORLD_W` (Task 4), `TileId` (Task 2).
- Produces: `Hsl`, `hourOf(date): number` (fractional local hour), `isNight(hour)`, `SkyPhase`, `phaseOf(hour)`, `daylight(hour)`, `warmth(hour)`, `SKY_TOP_L`, `SKY_BOTTOM_L`, `Sky = { top: Hsl; bottom: Hsl; stars: number }`, `skyAt(colorA, colorB, hour): Sky`, `hslCss(hsl)`, `Sun = { fx; fy; up }`, `sunAt(hour): Sun`, `Star`, `starField(count?, seed?)`, `Cloud`, `CLOUDS`, `CLOUD_SPEED`, `PARALLAX`, `cloudWidth(c)`, `cloudX(c, clockMs, span): number`.

- [ ] **Step 1: write the failing test** `lib/world/sky.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
	CLOUD_SPEED, CLOUDS, cloudWidth, cloudX, daylight, hourOf, hslCss, isNight, phaseOf, skyAt, starField, sunAt,
} from "./sky";

describe("the clock", () => {
	it("is dark at night, light by day, half way at sunrise and sunset", () => {
		expect([0, 4.9, 6, 12, 20, 21, 23.5].map(daylight)).toEqual([0, 0, 0.5, 1, 0.5, 0, 0]);
	});
	it("wraps hours outside 0 to 24 (midnight, a daylight-saving jump)", () => {
		expect(daylight(24)).toBe(daylight(0));
		expect(daylight(-0.5)).toBe(daylight(23.5));
		expect(daylight(36)).toBe(daylight(12));
		expect(phaseOf(24)).toBe("night");
		expect(phaseOf(-1)).toBe("night");
		expect(sunAt(30)).toEqual(sunAt(6));
	});
	it("names the phases", () => {
		expect([5, 6.9, 7, 18.9, 19, 20.9, 21, 2].map(phaseOf)).toEqual(["dawn", "dawn", "day", "day", "dusk", "dusk", "night", "night"]);
	});
	it("calls 21:00 to 05:00 night", () => {
		expect([20.9, 21, 4.9, 5].map(isNight)).toEqual([false, true, true, false]);
		expect(isNight(24.5)).toBe(true);
	});
	it("reads the hour from a date", () => {
		expect(hourOf(new Date(2026, 9, 9, 13, 30))).toBe(13.5);
	});
});

describe("the sky", () => {
	const A = "hsl(42 95% 58%)";
	const B = "hsl(82 95% 58%)";
	it("keeps the mood's hues at night and drops their lightness", () => {
		const night = skyAt(A, B, 1);
		const day = skyAt(A, B, 12);
		expect(night.top[0]).toBe(42);
		expect(night.bottom[0]).toBe(82);
		expect(night.top[2]).toBeLessThan(day.top[2]);
		expect(night.bottom[2]).toBeLessThan(day.bottom[2]);
		expect(day.top[1]).toBeLessThanOrEqual(55);
	});
	it("shows the stars at night only", () => {
		expect(skyAt(A, B, 0).stars).toBe(1);
		expect(skyAt(A, B, 12).stars).toBe(0);
	});
	it("warms the horizon at sunset", () => {
		expect(Math.abs(skyAt(A, B, 20).bottom[0] - 24)).toBeLessThan(Math.abs(82 - 24));
	});
	it("falls back to calm for a colour it cannot read", () => {
		expect(skyAt("#123456", "nope", 12).top[0]).toBe(172);
	});
	it("writes css", () => {
		expect(hslCss([172, 38, 26])).toBe("hsl(172 38% 26%)");
	});
});

describe("the sun", () => {
	it("rises at 06:00 on the left, is highest at 13:00, and sets at 20:00 on the right", () => {
		expect(sunAt(6)).toEqual({ fx: 0.12, fy: 0.6, up: true });
		expect(sunAt(13).fx).toBeCloseTo(0.5);
		expect(sunAt(13).fy).toBeCloseTo(0.15);
		expect(sunAt(20).fx).toBeCloseTo(0.88);
	});
	it("is a dim heart low behind the castle when it is down", () => {
		expect(sunAt(22)).toEqual({ fx: 0.5, fy: 0.62, up: false });
		expect(sunAt(5)).toEqual({ fx: 0.5, fy: 0.62, up: false });
	});
});

describe("clouds and stars", () => {
	it("starts each cloud where it is placed and drifts it right, the near layer faster", () => {
		for (const c of CLOUDS) expect(cloudX(c, 0, 1024)).toBe(c.x);
		const [far] = CLOUDS.filter((c) => c.layer === 0);
		expect(cloudX(far, 1000, 1024) - far.x).toBeCloseTo(CLOUD_SPEED[0]);
		expect(CLOUD_SPEED[1]).toBeGreaterThan(CLOUD_SPEED[0]);
	});
	it("wraps round the world", () => {
		for (const c of CLOUDS) {
			const x = cloudX(c, 10 * 3_600_000, 1024);
			expect(x).toBeGreaterThanOrEqual(-cloudWidth(c));
			expect(x).toBeLessThan(1024);
		}
	});
	it("uses only cloud tiles", () => {
		expect(CLOUDS.flatMap((c) => c.parts).every((p) => p.tile.startsWith("cloud-"))).toBe(true);
	});
	it("places the same stars every time, in the upper sky", () => {
		expect(starField(20, 3)).toEqual(starField(20, 3));
		for (const s of starField()) {
			expect(s.fx).toBeGreaterThanOrEqual(0);
			expect(s.fx).toBeLessThan(1);
			expect(s.fy).toBeLessThan(0.55);
		}
	});
});
```

- [ ] **Step 2: run it.** `npx vitest run lib/world/sky.test.ts`. Expected: FAIL.

- [ ] **Step 3: implement** `lib/world/sky.ts`
```ts
// The sky (spec 2): a gradient from the mood's two aura colours, shifted by Gur's clock through dawn, day, dusk and
// night; the sun (his heart) by the hour; stars at night; two layers of drifting clouds. Pure.
import { TILE } from "./blueprints/types";
import { parseHsl } from "./raster";
import type { TileId } from "./tiles";

export type Hsl = [number, number, number];
export type SkyPhase = "dawn" | "day" | "dusk" | "night";

const wrap = (hour: number) => ((hour % 24) + 24) % 24;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const hourOf = (d: Date): number => d.getHours() + d.getMinutes() / 60;
export const isNight = (hour: number): boolean => wrap(hour) >= 21 || wrap(hour) < 5;
export function phaseOf(hour: number): SkyPhase {
	const h = wrap(hour);
	if (h >= 5 && h < 7) return "dawn";
	if (h >= 7 && h < 19) return "day";
	if (h >= 19 && h < 21) return "dusk";
	return "night";
}
// 0 at night, 1 by day, ramping 05:00 to 07:00 and 19:00 to 21:00.
export function daylight(hour: number): number {
	const h = wrap(hour);
	if (h < 5 || h >= 21) return 0;
	if (h < 7) return (h - 5) / 2;
	if (h < 19) return 1;
	return (21 - h) / 2;
}
// 1 at sunrise (06:00) and sunset (20:00), 0 an hour and a half away.
export function warmth(hour: number): number {
	const h = wrap(hour);
	return clamp01(1 - Math.min(Math.abs(h - 6), Math.abs(h - 20)) / 1.5);
}

// Lightness, in %, at night and by day. The top stays dark enough for the room's Bone text at the lightest hour
// (lib/shell/contrast.test.ts proves it); lower SKY_TOP_L.day if that test ever fails, never below 20.
export const SKY_TOP_L = { night: 6, day: 26 };
export const SKY_BOTTOM_L = { night: 10, day: 40 };
const MAX_SAT = 55;
const DUSK_HUE = 24;
const CALM_A: Hsl = [172, 38, 50];
const CALM_B: Hsl = [212, 38, 50];

const mixHue = (from: number, to: number, t: number) => {
	const diff = ((to - from + 540) % 360) - 180;
	return (from + diff * t + 360) % 360;
};

export type Sky = { top: Hsl; bottom: Hsl; stars: number };
export function skyAt(colorA: string, colorB: string, hour: number): Sky {
	const a = parseHsl(colorA) ?? CALM_A;
	const b = parseHsl(colorB) ?? CALM_B;
	const d = daylight(hour);
	const w = warmth(hour);
	return {
		top: [Math.round(a[0]), Math.round(Math.min(a[1], MAX_SAT)), Math.round(lerp(SKY_TOP_L.night, SKY_TOP_L.day, d))],
		bottom: [Math.round(mixHue(b[0], DUSK_HUE, w * 0.6)), Math.round(Math.min(b[1], MAX_SAT)), Math.round(lerp(SKY_BOTTOM_L.night, SKY_BOTTOM_L.day, d) + w * 4)],
		stars: clamp01((0.35 - d) / 0.35),
	};
}
export const hslCss = ([h, s, l]: Hsl): string => `hsl(${h} ${s}% ${l}%)`;

// Fractions of the sky's width and height. Up from 06:00 to 20:00 on an arc, highest at 13:00; otherwise a dim
// heart low in the middle, behind the island and the castle.
export type Sun = { fx: number; fy: number; up: boolean };
export function sunAt(hour: number): Sun {
	const t = (wrap(hour) - 6) / 14;
	if (t < 0 || t > 1) return { fx: 0.5, fy: 0.62, up: false };
	return { fx: 0.12 + 0.76 * t, fy: 0.6 - 0.45 * Math.sin(Math.PI * t), up: true };
}

export type Star = { fx: number; fy: number; big: boolean };
// The same stars every night: a small fixed random sequence.
export function starField(count = 48, seed = 7): Star[] {
	let s = seed >>> 0;
	const next = () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
	return Array.from({ length: count }, () => ({ fx: next(), fy: next() * 0.55, big: next() < 0.15 }));
}

type Part = { tile: TileId; dx: number; dy: number };
// x, y in world px of the cloud's left cell; layer 0 is far (slow, little parallax), 1 is near.
export type Cloud = { parts: readonly Part[]; x: number; y: number; layer: 0 | 1 };
export const CLOUD_SPEED = [3, 7] as const; // world px per second
export const PARALLAX = [0.3, 0.6] as const;
const long = (middles: number, top = 0): Part[] => {
	const parts: Part[] = [{ tile: "cloud-l", dx: 0, dy: 0 }];
	for (let i = 1; i <= middles; i++) parts.push({ tile: "cloud-m", dx: i * TILE, dy: 0 });
	parts.push({ tile: "cloud-r", dx: (middles + 1) * TILE, dy: 0 });
	if (top >= 1 && top <= middles) parts.push({ tile: "cloud-top", dx: top * TILE, dy: -TILE });
	return parts;
};
const small: Part[] = [{ tile: "cloud-small", dx: 0, dy: 0 }];
export const CLOUDS: readonly Cloud[] = [
	{ parts: long(2, 1), x: 40, y: 80, layer: 0 },
	{ parts: small, x: 400, y: 48, layer: 0 },
	{ parts: long(1), x: 700, y: 112, layer: 0 },
	{ parts: long(3, 2), x: 150, y: 144, layer: 1 },
	{ parts: long(2), x: 560, y: 64, layer: 1 },
	{ parts: small, x: 900, y: 168, layer: 1 },
];
export const cloudWidth = (c: Cloud): number => Math.max(...c.parts.map((p) => p.dx)) + TILE;
// Drifting right, wrapping round the world's width plus the cloud's own.
export function cloudX(c: Cloud, clockMs: number, span: number): number {
	const w = cloudWidth(c);
	const loop = span + w;
	const moved = c.x + w + (CLOUD_SPEED[c.layer] * clockMs) / 1000;
	return (((moved % loop) + loop) % loop) - w;
}
```

- [ ] **Step 4: extend the rail's contrast test.** Append to `lib/shell/contrast.test.ts` (and add `import { skyAt } from "../world/sky";` to its imports):
```ts
// The village (spec 6): the sky sits behind the header and the rail's hover label. At the lightest hour of the day,
// on every hue, Bone text must still read at 4.5:1 on the sky's top, and on the label over it.
describe("the village sky keeps the room's text readable", () => {
	const hours = Array.from({ length: 96 }, (_, i) => i / 4);
	it.each(Array.from({ length: 24 }, (_, i) => i * 15))("hue %i at the lightest hour", (h) => {
		const mood = `hsl(${h} 95% 78%)`;
		const lightest = hours.map((hr) => skyAt(mood, mood, hr)).reduce((a, b) => (b.top[2] > a.top[2] ? b : a));
		const top = hslToRgb(lightest.top[0], lightest.top[1], lightest.top[2]);
		expect(contrastRatio(BONE, top)).toBeGreaterThanOrEqual(4.5);
		const rail = mixOklab(INK, hslToRgb(h, 30, 15), 0.38);
		expect(contrastRatio(BONE, mixOklab(rail, top, 0.92))).toBeGreaterThanOrEqual(4.5);
	});
});
```

- [ ] **Step 5: run it.** `npx vitest run lib/world/sky.test.ts lib/shell/contrast.test.ts` passes; tsc and lint clean.

- [ ] **Step 6: commit.**
```bash
git add lib/world/sky.ts lib/world/sky.test.ts lib/shell/contrast.test.ts
git commit -m "feat(world): the sky by the clock, the sun, stars and clouds; contrast holds at the lightest hour" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 6: The actor machine
**Model:** Sonnet.
**Files:** Create `lib/world/actor.ts`, `lib/world/actor.test.ts`.

**Interfaces:**
- Consumes: `FOLLOW_UP_MS` from `lib/voice/machine.ts`; `isNight` (Task 5); `FaceId`, `FrameName`, `Gaze` (Task 3).
- Produces: `ActorKind`, `Talk`, `Actor`, `ActorEvent`, `ActorWorld = { next: number | null; restX: number; speed: number; held: boolean }`, `Step = { actor; laid }`, constants `TURN_MS = 300`, `LAY_MS = 1200`, `BLOCK_GAP_MS = 1800`, `PRESENT_MS = 600000`, `MAX_DT = 250`, `FOLLOW_UP_MS` (re-exported); `newActor(x, now, hour)`, `step(a, e, w): Step`, `facingViewer(a)`, `Look = { frame; flip; face: FaceId | null; gaze }`, `look(a, now, face): Look`, `pose(kind, x, now, hour?)`.

Times are milliseconds on one clock (the world uses `performance.now()`); x is world pixels (his feet's centre). One block every 3 s when he stands at it: `LAY_MS + BLOCK_GAP_MS = 3000`.

- [ ] **Step 1: write the failing test** `lib/world/actor.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
	BLOCK_GAP_MS, FOLLOW_UP_MS, LAY_MS, MAX_DT, PRESENT_MS, TURN_MS,
	facingViewer, look, newActor, pose, step,
	type Actor, type ActorEvent, type ActorWorld,
} from "./actor";

const W: ActorWorld = { next: 200, restX: 760, speed: 48, held: false };
const tick = (now: number, dt = 50): ActorEvent => ({ type: "tick", now, dt });
// Ticks every dt ms after `from`, up to and including `to`.
function run(a: Actor, from: number, to: number, w: ActorWorld = W, dt = 50) {
	let laid = 0;
	let maxMove = 0;
	for (let t = from + dt; t <= to; t += dt) {
		const s = step(a, tick(t, dt), w);
		maxMove = Math.max(maxMove, Math.abs(s.actor.x - a.x));
		a = s.actor;
		if (s.laid) laid++;
	}
	return { a, laid, maxMove };
}
const send = (a: Actor, e: ActorEvent, w: ActorWorld = W) => step(a, e, w).actor;

describe("building on his own", () => {
	it("walks to the next block, kneels, and lays it once", () => {
		const walking = run(newActor(100, 0, 12), 0, 50).a;
		expect(walking.kind).toBe("walking");
		expect(walking.dir).toBe(1);
		const there = run(walking, 50, 2300).a; // 100 px at 48 px/s: he arrives at 2150
		expect(there.kind).toBe("building");
		expect(there.x).toBe(200);
		const done = run(there, 2300, 2300 + LAY_MS + 100);
		expect(done.laid).toBe(1);
		expect(done.a.kind).toBe("idle");
	});
	it("lays one block every three seconds when he stands at it", () => {
		// kneels at 50, lays at 1250, waits until 3050, lays at 4250, then 7250: three by 10 s
		expect(run(newActor(200, 0, 12), 0, 10_000).laid).toBe(3);
		expect(LAY_MS + BLOCK_GAP_MS).toBe(3000);
	});
	it("waits when there is nothing to build", () => {
		expect(run(newActor(100, 0, 12), 0, 5000, { ...W, next: null }).a.kind).toBe("idle");
	});
});

describe("when Gur speaks", () => {
	it("stops mid-block without laying it, faces him, and starts the block again afterwards", () => {
		const building = run(newActor(200, 0, 12), 0, 650).a; // kneeling since 50
		expect(building.kind).toBe("building");
		const turned = send(building, { type: "message", now: 700 });
		expect(turned.kind).toBe("turning");
		expect(turned.toward).toBe("viewer");
		const faced = run(turned, 700, 700 + TURN_MS);
		expect(faced.a.kind).toBe("facing");
		expect(faced.laid).toBe(0);
		const back = run(faced.a, 700 + TURN_MS, 700 + FOLLOW_UP_MS + 50); // quiet for the window: turns back at 6700
		expect(back.a.kind).toBe("turning");
		expect(back.a.toward).toBe("work");
		expect(back.laid).toBe(0);
		const from = 700 + FOLLOW_UP_MS + TURN_MS + 100; // idle at 7000, kneels at 7050
		const kneel = run(back.a, 700 + FOLLOW_UP_MS + 50, from);
		expect(kneel.a.kind).toBe("building");
		expect(run(kneel.a, from, kneel.a.since + LAY_MS - 50).laid).toBe(0);
		expect(run(kneel.a, from, kneel.a.since + LAY_MS).laid).toBe(1);
	});
	it("keeps facing while he speaks, while the conversation is held, and inside the follow-up window", () => {
		const facing = run(send(newActor(200, 0, 12), { type: "message", now: 0 }), 0, TURN_MS).a;
		expect(facing.kind).toBe("facing");
		const speaking = send(facing, { type: "reply", now: 400 });
		expect(run(speaking, 400, 400 + 3 * FOLLOW_UP_MS).a.kind).toBe("facing");
		const quiet = send(speaking, { type: "replyDone", now: 500 });
		expect(run(quiet, 500, 500 + 3 * FOLLOW_UP_MS, { ...W, held: true }).a.kind).toBe("facing");
		expect(run(quiet, 500, 500 + FOLLOW_UP_MS - 50).a.kind).toBe("facing");
		expect(run(quiet, 500, 500 + FOLLOW_UP_MS).a.kind).toBe("turning");
	});
	it("turns to face a reply that comes without a message", () => {
		const r = send(newActor(200, 0, 12), { type: "reply", now: 10 });
		expect(r.kind).toBe("turning");
		expect(r.talk).toBe("speaking");
	});
	it("ends the conversation at once on rest, unless he is speaking or it is held", () => {
		const facing = run(send(newActor(200, 0, 12), { type: "message", now: 0 }), 0, TURN_MS).a;
		expect(facingViewer(facing)).toBe(true);
		expect(send(facing, { type: "rest", now: 400 }).kind).toBe("turning");
		expect(send(send(facing, { type: "reply", now: 350 }), { type: "rest", now: 400 }).kind).toBe("facing");
		expect(send(facing, { type: "rest", now: 400 }, { ...W, held: true }).kind).toBe("facing");
	});
});

describe("the tab and the clock", () => {
	it("stops where he is when the tab is hidden mid-walk, ignores time while hidden, and goes on from there", () => {
		const walking = run(newActor(100, 0, 12), 0, 1000).a;
		expect(walking.kind).toBe("walking");
		const hidden = send(walking, { type: "hidden", now: 1000 });
		expect(hidden.kind).toBe("idle");
		expect(hidden.x).toBe(walking.x);
		expect(run(hidden, 1000, 60_000).a).toEqual(hidden);
		const back = send(hidden, { type: "visible", now: 60_000 });
		expect(back.hidden).toBe(false);
		expect(back.x).toBe(walking.x);
		const r = run(back, 60_000, 60_000 + BLOCK_GAP_MS + 100);
		expect(r.a.kind).toBe("walking");
		expect(r.maxMove).toBeLessThanOrEqual((48 * 50) / 1000 + 1e-9);
	});
	it("never moves further than a quarter second of walking in one tick, however long the tick", () => {
		const walking = run(newActor(100, 0, 12), 0, 100).a;
		const after = step(walking, { type: "tick", now: 5 * 3_600_000, dt: 5 * 3_600_000 }, W).actor;
		expect(Math.abs(after.x - walking.x)).toBeLessThanOrEqual((48 * MAX_DT) / 1000);
		expect(step(walking, { type: "tick", now: 5 * 3_600_000, dt: 5 * 3_600_000 }, W).laid).toBe(false);
	});
});

describe("night", () => {
	it("walks to the bench and rests when nobody has spoken", () => {
		const night = newActor(700, 0, 23);
		expect(night.night).toBe(true);
		const r = run(night, 0, 3000);
		expect(r.a.kind).toBe("resting");
		expect(r.a.x).toBe(760);
		expect(r.laid).toBe(0);
	});
	it("keeps building at night while Gur is there, and rests once he has been quiet for PRESENT_MS", () => {
		expect(run({ ...newActor(200, 0, 23), lastMessage: 0 }, 0, 2000).laid).toBe(1);
		const later = { ...newActor(200, PRESENT_MS, 23), lastMessage: 0 };
		const r = run(later, PRESENT_MS, PRESENT_MS + 3000, { ...W, restX: 260 });
		expect(r.a.kind).toBe("resting");
		expect(r.laid).toBe(0);
	});
	it("stands up when the day comes", () => {
		const resting: Actor = { ...newActor(760, 0, 23), kind: "resting" };
		const day = send(resting, { type: "hour", now: 100, hour: 7 });
		expect(day.night).toBe(false);
		expect(run(day, 100, 200).a.kind).not.toBe("resting");
	});
});

describe("how he looks", () => {
	it("walks in six frames, facing the way he goes", () => {
		const left = run(newActor(300, 0, 12), 0, 50).a; // the next block is to his left
		expect(left.dir).toBe(-1);
		const frames = new Set(Array.from({ length: 12 }, (_, i) => look(left, left.since + i * 50, "warm").frame));
		expect([...frames].sort()).toEqual(["walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6"]);
		expect(look(left, left.since, "warm").flip).toBe(true);
		expect(look(left, left.since, "warm").face).toBeNull();
	});
	it("shows his face only toward the viewer: pupils on Gur while listening, wandering while he speaks", () => {
		const speaking = pose("facing", 200, 0);
		const listening: Actor = { ...speaking, talk: "listening" };
		expect(new Set(Array.from({ length: 40 }, (_, i) => look(listening, i * 100, "tired").gaze))).toEqual(new Set([0]));
		expect(new Set(Array.from({ length: 40 }, (_, i) => look(speaking, i * 100, "tired").gaze))).toEqual(new Set([0, 1]));
		expect(look(speaking, 0, "tired").face).toBe("tired");
		expect(look(pose("building", 200, 0), 0, "warm").face).toBeNull();
	});
	it("turns through three frames and sits at night", () => {
		const t = pose("turning", 200, 0);
		expect([0, 100, 200].map((ms) => look(t, ms, "warm").frame)).toEqual(["turn-1", "turn-2", "turn-3"]);
		expect(look(t, 200, "warm").face).toBe("warm");
		expect(look({ ...t, toward: "work" }, 0, "warm").frame).toBe("turn-3");
		expect(look(pose("resting", 760, 0), 0, "warm").frame).toBe("sit-1");
	});
	it("poses every state for the dev page", () => {
		for (const k of ["idle", "walking", "building", "turning", "facing", "resting"] as const) expect(pose(k, 10, 0).kind).toBe(k);
	});
});
```

- [ ] **Step 2: run it.** `npx vitest run lib/world/actor.test.ts`. Expected: FAIL.

- [ ] **Step 3: implement** `lib/world/actor.ts`
```ts
// Him (spec 3), pure. The world feeds him events and ticks and tells him where the next block is; he answers with
// what he is doing and whether he laid a block this step. He never teleports: one tick moves him at most MAX_DT of
// walking, and a hidden tab freezes him where he is.
import { FOLLOW_UP_MS } from "../voice/machine";
import type { FaceId, FrameName, Gaze } from "./osmo-sprite";
import { isNight } from "./sky";

export { FOLLOW_UP_MS };
export type ActorKind = "idle" | "walking" | "building" | "turning" | "facing" | "resting";
export type Talk = "quiet" | "listening" | "speaking";
type Purpose = "build" | "rest";
export type Actor = {
	kind: ActorKind;
	x: number; // his feet's centre, world px
	dir: 1 | -1; // the way his profile faces
	since: number; // when this kind began (ms); drives the animation
	target: number | null;
	purpose: Purpose | null;
	toward: "viewer" | "work"; // which way a turn goes; "viewer" also while facing
	talk: Talk;
	quietSince: number; // the last message, or the end of his last reply
	lastMessage: number | null;
	nextAt: number; // the earliest he may start the next block
	night: boolean;
	hidden: boolean;
};
export type ActorEvent =
	| { type: "message"; now: number }
	| { type: "reply"; now: number }
	| { type: "replyDone"; now: number }
	| { type: "rest"; now: number }
	| { type: "tick"; now: number; dt: number }
	| { type: "hour"; now: number; hour: number }
	| { type: "visible"; now: number }
	| { type: "hidden"; now: number };
// What the world tells him on each step.
export type ActorWorld = {
	next: number | null; // where he stands to lay the next block (world px); null when nothing is left to build
	restX: number; // the bench by the lantern
	speed: number; // world px per second (face.ts)
	held: boolean; // the conversation is still open: the voice is in conversation, he is thinking, or speaking
};
export type Step = { actor: Actor; laid: boolean };

export const TURN_MS = 300;
export const LAY_MS = 1200;
export const BLOCK_GAP_MS = 1800;
export const PRESENT_MS = 10 * 60_000;
export const MAX_DT = 250;

export function newActor(x: number, now: number, hour: number): Actor {
	return {
		kind: "idle", x, dir: 1, since: now, target: null, purpose: null, toward: "work", talk: "quiet",
		quietSince: now, lastMessage: null, nextAt: now, night: isNight(hour), hidden: false,
	};
}

export const facingViewer = (a: Actor): boolean => a.kind === "facing" || (a.kind === "turning" && a.toward === "viewer");
const present = (a: Actor, now: number) => a.lastMessage !== null && now - a.lastMessage < PRESENT_MS;
const turn = (a: Actor, toward: "viewer" | "work", now: number): Actor => ({ ...a, kind: "turning", toward, since: now, target: null, purpose: null });

export function step(a: Actor, e: ActorEvent, w: ActorWorld): Step {
	const to = (actor: Actor): Step => ({ actor, laid: false });
	if (e.type === "hour") return to({ ...a, night: isNight(e.hour) });
	if (e.type === "visible") return to({ ...a, hidden: false, since: e.now, nextAt: e.now + BLOCK_GAP_MS, quietSince: e.now });
	if (a.hidden) return to(a);
	switch (e.type) {
		case "hidden":
			return to({ ...a, kind: a.kind === "resting" ? "resting" : "idle", hidden: true, since: e.now, target: null, purpose: null, toward: "work", talk: "quiet" });
		case "message": {
			const talk: Talk = a.talk === "speaking" ? "speaking" : "listening";
			const heard: Actor = { ...a, talk, quietSince: e.now, lastMessage: e.now };
			return to(facingViewer(a) ? heard : turn(heard, "viewer", e.now));
		}
		case "reply": {
			const speaking: Actor = { ...a, talk: "speaking", quietSince: e.now };
			return to(facingViewer(a) ? speaking : turn(speaking, "viewer", e.now));
		}
		case "replyDone":
			return to({ ...a, talk: "quiet", quietSince: e.now });
		case "rest":
			return to(facingViewer(a) && a.talk !== "speaking" && !w.held ? turn({ ...a, talk: "quiet" }, "work", e.now) : a);
		case "tick":
			return tick(a, e.now, Math.min(MAX_DT, Math.max(0, e.dt)), w);
	}
}

function tick(a: Actor, now: number, dt: number, w: ActorWorld): Step {
	const to = (actor: Actor, laid = false): Step => ({ actor, laid });
	const idle = (x: Actor): Actor => ({ ...x, kind: "idle", since: now, target: null, purpose: null, toward: "work" });
	const restWanted = a.night && !present(a, now);
	switch (a.kind) {
		case "turning":
			if (now - a.since < TURN_MS) return to(a);
			return to(a.toward === "viewer" ? { ...a, kind: "facing", since: now } : { ...idle(a), nextAt: now });
		case "facing":
			if (a.talk === "speaking" || w.held || now - a.quietSince < FOLLOW_UP_MS) return to(a);
			return to(turn({ ...a, talk: "quiet" }, "work", now));
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
			if (now - a.since < LAY_MS) return to(a);
			return to({ ...idle(a), nextAt: now + BLOCK_GAP_MS }, true);
	}
}

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

// A still pose of any state, for /dev/world.
export function pose(kind: ActorKind, x: number, now: number, hour = 12): Actor {
	const a = newActor(x, now, hour);
	if (kind === "walking") return { ...a, kind, target: x + 64, purpose: "build" };
	if (kind === "turning") return { ...a, kind, toward: "viewer" };
	if (kind === "facing") return { ...a, kind, toward: "viewer", talk: "speaking" };
	return { ...a, kind };
}
```

- [ ] **Step 4: run it.** `npx vitest run lib/world/actor.test.ts` passes; tsc and lint clean.

- [ ] **Step 5: commit.**
```bash
git add lib/world/actor.ts lib/world/actor.test.ts
git commit -m "feat(world): the actor machine: building, turning to Gur, resting at night" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 7: Bearing (face and pace from mood) and room signals
**Model:** Sonnet.
**Files:** Create `lib/world/face.ts`, `lib/world/face.test.ts`, `lib/world/signals.ts`, `lib/world/signals.test.ts`.

**Interfaces:**
- Consumes: `CHARACTER` (`lib/agent/character.ts`), `AgentState`, `Activations` (`lib/agent/state.ts`), `FaceId` (Task 3), `ActorEvent` (Task 6).
- Produces: `WALK_SPEED = 48`, `TIRED_SPEED = 32`, `Bearing = { face: FaceId; speed: number }`, `bearing(state, nowMs, hour, baseline?)`; `RoomSignals = { lines: number; inTalk: boolean; speaking: boolean; thinking: boolean }`, `roomEvents(prev, next, now): ActorEvent[]`.

- [ ] **Step 1: write the failing tests.** `lib/world/face.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { CHARACTER } from "../agent/character";
import type { Activations, Emotion, Mood } from "../agent/state";
import { bearing, TIRED_SPEED, WALK_SPEED } from "./face";

const base = CHARACTER.baseline;
const feel = (d: Partial<Activations> = {}, mood: Mood | null = null) => ({ activations: { ...base, ...d }, mood });
const cause = (tone: Emotion, at: number): Mood => ({ pad: [0, 0, 0], at, causes: [{ tone, because: "x", at }] });
const NOW = 1_800_000_000_000;

describe("his face and pace", () => {
	it("is attentive at rest, warm when glad, at the normal pace", () => {
		expect(bearing(feel(), NOW, 12)).toEqual({ face: "attentive", speed: WALK_SPEED });
		expect(bearing(feel({ joy: base.joy + 0.2 }), NOW, 12).face).toBe("warm");
		expect(bearing(feel({ love: base.love + 0.3 }), NOW, 12).face).toBe("warm");
	});
	it("puts Gur first: fear or sadness gives the attentive face even when glad", () => {
		expect(bearing(feel({ joy: base.joy + 0.3, fear: base.fear + 0.2 }), NOW, 12).face).toBe("attentive");
		expect(bearing(feel({ joy: base.joy + 0.3, sadness: base.sadness + 0.2 }), NOW, 12).face).toBe("attentive");
	});
	it("is tired and slower when bored or late", () => {
		expect(bearing(feel({ boredom: base.boredom + 0.3 }), NOW, 12)).toEqual({ face: "tired", speed: TIRED_SPEED });
		expect(bearing(feel(), NOW, 23.5)).toEqual({ face: "tired", speed: TIRED_SPEED });
		expect(bearing(feel(), NOW, 4.9).face).toBe("tired");
		expect(bearing(feel(), NOW, 5).face).toBe("attentive");
	});
	it("reads a fresh fear or sadness in the newest cause, and ignores an old one", () => {
		expect(bearing(feel({ joy: base.joy + 0.2 }, cause("sadness", NOW - 60_000)), NOW, 12).face).toBe("attentive");
		expect(bearing(feel({ joy: base.joy + 0.2 }, cause("sadness", NOW - 2 * 3_600_000)), NOW, 12).face).toBe("warm");
	});
});
```
`lib/world/signals.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { roomEvents, type RoomSignals } from "./signals";

const S: RoomSignals = { lines: 3, inTalk: false, speaking: false, thinking: false };
describe("room signals", () => {
	it("says nothing on the first look", () => {
		expect(roomEvents(null, S, 5)).toEqual([]);
	});
	it("hears a new line or the wake word as a message", () => {
		expect(roomEvents(S, { ...S, lines: 4 }, 5)).toEqual([{ type: "message", now: 5 }]);
		expect(roomEvents(S, { ...S, inTalk: true }, 5)).toEqual([{ type: "message", now: 5 }]);
		expect(roomEvents(S, { ...S, lines: 4, inTalk: true }, 5)).toEqual([{ type: "message", now: 5 }]);
	});
	it("follows his speech", () => {
		expect(roomEvents(S, { ...S, speaking: true }, 5)).toEqual([{ type: "reply", now: 5 }]);
		expect(roomEvents({ ...S, speaking: true }, S, 5)).toEqual([{ type: "replyDone", now: 5 }]);
	});
	it("rests when the voice conversation closes and he is not speaking", () => {
		expect(roomEvents({ ...S, inTalk: true }, S, 5)).toEqual([{ type: "rest", now: 5 }]);
		expect(roomEvents({ ...S, inTalk: true, speaking: true }, { ...S, speaking: true }, 5)).toEqual([]);
	});
	it("ignores thinking on its own and a shorter log", () => {
		expect(roomEvents(S, { ...S, thinking: true }, 5)).toEqual([]);
		expect(roomEvents(S, { ...S, lines: 2 }, 5)).toEqual([]);
	});
	it("puts the message before the reply when both arrive at once", () => {
		expect(roomEvents(S, { ...S, lines: 5, speaking: true }, 5).map((e) => e.type)).toEqual(["message", "reply"]);
	});
});
```

- [ ] **Step 2: run them.** `npx vitest run lib/world/face.test.ts lib/world/signals.test.ts`. Expected: FAIL.

- [ ] **Step 3: implement.** `lib/world/face.ts`
```ts
// Mood on him (spec 3): his face and walking pace from the numbers he already keeps. No model calls.
import { CHARACTER } from "../agent/character";
import type { Activations, AgentState, Emotion } from "../agent/state";
import type { FaceId } from "./osmo-sprite";

export const WALK_SPEED = 48; // world px per second: three tiles
export const TIRED_SPEED = 32;
const CAUSE_FRESH_MS = 60 * 60_000;

export type Bearing = { face: FaceId; speed: number };
// Fear or sadness (his own, or in his newest reading of Gur) comes first: he looks at Gur attentively. Then boredom or
// the late hour (23:00 to 05:00): tired, and slower. Then joy or love: warm. Otherwise attentive.
export function bearing(state: Pick<AgentState, "activations" | "mood">, nowMs: number, hour: number, baseline: Activations = CHARACTER.baseline): Bearing {
	const over = (e: Emotion) => state.activations[e] - baseline[e];
	const newest = state.mood?.causes[0];
	const fresh = newest && nowMs - newest.at <= CAUSE_FRESH_MS ? newest.tone : null;
	const worried = over("fear") >= 0.15 || over("sadness") >= 0.15 || fresh === "fear" || fresh === "sadness";
	const h = ((hour % 24) + 24) % 24;
	const tired = over("boredom") >= 0.25 || h >= 23 || h < 5;
	const glad = over("joy") >= 0.1 || over("love") >= 0.2;
	const face: FaceId = worried ? "attentive" : tired ? "tired" : glad ? "warm" : "attentive";
	return { face, speed: tired ? TIRED_SPEED : WALK_SPEED };
}
```
`lib/world/signals.ts`
```ts
// What changed in the room since the last render, as events for him (spec 3, "Events in"). The room passes its
// line count, whether the voice is in a conversation (awake, thinking, speaking or follow-up), whether he is
// speaking (a reply being typed out) and whether he is thinking. Typing and composer focus reach him directly
// through the world's control (attend), not through here.
import type { ActorEvent } from "./actor";

export type RoomSignals = { lines: number; inTalk: boolean; speaking: boolean; thinking: boolean };

export function roomEvents(prev: RoomSignals | null, next: RoomSignals, now: number): ActorEvent[] {
	if (!prev) return [];
	const out: ActorEvent[] = [];
	if (next.lines > prev.lines || (next.inTalk && !prev.inTalk)) out.push({ type: "message", now });
	if (next.speaking && !prev.speaking) out.push({ type: "reply", now });
	if (!next.speaking && prev.speaking) out.push({ type: "replyDone", now });
	if (prev.inTalk && !next.inTalk && !next.speaking) out.push({ type: "rest", now });
	return out;
}
```

- [ ] **Step 4: run them.** Both pass; tsc and lint clean.

- [ ] **Step 5: commit.**
```bash
git add lib/world/face.ts lib/world/face.test.ts lib/world/signals.ts lib/world/signals.test.ts
git commit -m "feat(world): his face and pace from his mood, and the room's signals as events" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 8: Camera and redraw pace
**Model:** Sonnet.
**Files:** Create `lib/world/camera.ts`, `lib/world/camera.test.ts`, `lib/world/pace.ts`, `lib/world/pace.test.ts`.

**Interfaces:**
- Consumes: `GROUND_Y`, `TILE`, `WORLD_W`, `WORLD_H` (Task 4); `Actor`, `FOLLOW_UP_MS` (Task 6).
- Produces: `View = { w; h }` (canvas px), `Camera = { x; y; from; to; at }` (centre in world px; zoom stepping from `from` to `to` since `at`), `STEP_MS = 200`, `ZOOM_IN = 2`, `GROUND_AT = 0.22`, `baseZoom(width)`, `isPhone(view)`, `newCamera(heX, view, zoom)`, `zoomAt(c, now)`, `easing(c, now)`, `zoomTo(c, level, now, instant?)`, `follow(c, heX, view, now, dt, close)`, `toScreen(c, view, now, wx, wy, parallax?)`; `FRAME_MS = 33`, `CALM_FRAME_MS = 250`, `SLOW_MS = 3000`, `PaceInput`, `nextTickIn(p): number | null`, `DrawKey`, `shouldDraw(reduced, prev, next)`.

- [ ] **Step 1: write the failing tests.** `lib/world/camera.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { GROUND_Y, TILE, WORLD_W } from "./blueprints/types";
import { baseZoom, easing, follow, newCamera, toScreen, zoomAt, zoomTo } from "./camera";

const V = { w: 960, h: 600 }; // a desktop view: 480 by 300 world px at zoom 2
const GROUND = GROUND_Y * TILE;
const settle = (c: ReturnType<typeof newCamera>, heX: number, v = V, close = false) => {
	for (let t = 0; t < 3000; t += 33) c = follow(c, heX, v, t, 33, close);
	return c;
};

describe("following him", () => {
	it("starts on him with the ground at 72% of the height", () => {
		const c = newCamera(512, V, 2);
		expect(c.x).toBe(512);
		expect(c.y).toBeCloseTo(GROUND - 0.22 * 300);
		expect(toScreen(c, V, 0, 512, GROUND)).toEqual({ x: 480, y: 432 });
	});
	it("does not move while he stays inside the dead zone", () => {
		expect(settle(newCamera(512, V, 2), 512 + 60).x).toBe(512); // half-width 0.15 * 480 = 72
	});
	it("follows once he leaves it, keeping him at its edge", () => {
		expect(settle(newCamera(512, V, 2), 700).x).toBeCloseTo(700 - 72, 1);
	});
	it("keeps a tighter dead zone on a phone, showing about 12 tiles across", () => {
		const P = { w: 375, h: 700 };
		expect(P.w / 2 / TILE).toBeCloseTo(11.7, 1);
		expect(settle(newCamera(512, P, 2), 560, P).x).toBeCloseTo(560 - 0.06 * 187.5, 1);
	});
	it("stops at the world's edges", () => {
		expect(newCamera(0, V, 2).x).toBe(240);
		expect(settle(newCamera(0, V, 2), WORLD_W * TILE).x).toBeCloseTo(WORLD_W * TILE - 240, 5);
	});
	it("copes with a view of no size", () => {
		const zero = { w: 0, h: 0 };
		const c = follow(newCamera(512, zero, 2), 600, zero, 0, 33, false);
		expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
	});
});

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
	it("jumps at once under reduced motion", () => {
		expect(zoomAt(zoomTo(newCamera(512, V, 2), 4, 0, true), 0)).toBe(4);
	});
	it("centres on him when close", () => {
		expect(settle(zoomTo(newCamera(512, V, 2), 4, 0), 540, V, true).x).toBeCloseTo(540, 1);
	});
	it("uses scale 3 only above 1400 px", () => {
		expect(baseZoom(1400)).toBe(2);
		expect(baseZoom(1401)).toBe(3);
	});
});
```
`lib/world/pace.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { newActor, type Actor } from "./actor";
import { CALM_FRAME_MS, FRAME_MS, nextTickIn, shouldDraw, SLOW_MS } from "./pace";

const a = newActor(200, 0, 12);
const input = (actor: Actor, over: Partial<{ now: number; easing: boolean; hasWork: boolean; reducedMotion: boolean }> = {}) =>
	({ actor, now: 0, easing: false, hasWork: true, reducedMotion: false, ...over });

describe("the redraw pace", () => {
	it("ticks every frame while he walks, builds or turns, or the camera eases", () => {
		for (const kind of ["walking", "building", "turning"] as const) expect(nextTickIn(input({ ...a, kind }))).toBe(FRAME_MS);
		expect(nextTickIn(input(a, { easing: true, hasWork: false }))).toBe(FRAME_MS);
	});
	it("waits for the next block on one timer, not on frames", () => {
		expect(nextTickIn(input({ ...a, nextAt: 1800 }))).toBe(1800);
		expect(nextTickIn(input({ ...a, nextAt: 9000 }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, nextAt: 10 }))).toBe(FRAME_MS);
	});
	it("ticks every 3 s with nothing to do, and not at all while hidden", () => {
		expect(nextTickIn(input(a, { hasWork: false }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, kind: "resting" }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, hidden: true, kind: "walking" }))).toBeNull();
	});
	it("runs frames while he speaks to Gur, and waits for the window to close when quiet", () => {
		expect(nextTickIn(input({ ...a, kind: "facing", talk: "speaking" }))).toBe(FRAME_MS);
		expect(nextTickIn(input({ ...a, kind: "facing", quietSince: 0 }, { now: 1000 }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, kind: "facing", quietSince: 0 }, { now: 5500 }))).toBe(500);
	});
	it("slows the frames under reduced motion", () => {
		expect(nextTickIn(input({ ...a, kind: "walking" }, { reducedMotion: true }))).toBe(CALM_FRAME_MS);
	});
	it("redraws a still frame only on a new block, mode, sky phase or zoom", () => {
		const k = { laid: 3, kind: "idle", phase: "day", zoom: 2 };
		expect(shouldDraw(true, null, k)).toBe(true);
		expect(shouldDraw(true, k, { ...k })).toBe(false);
		expect(shouldDraw(true, k, { ...k, laid: 4 })).toBe(true);
		expect(shouldDraw(true, k, { ...k, kind: "facing" })).toBe(true);
		expect(shouldDraw(true, k, { ...k, phase: "dusk" })).toBe(true);
		expect(shouldDraw(true, k, { ...k, zoom: 4 })).toBe(true);
		expect(shouldDraw(false, k, { ...k })).toBe(true);
	});
});
```

- [ ] **Step 2: run them.** Expected: FAIL.

- [ ] **Step 3: implement.** `lib/world/camera.ts`
```ts
// The camera (spec 2): follows him with a dead zone, clamps at the world's edges, tighter on a phone, and comes in on
// him in two whole-number scale steps when he turns to Gur. Pure; times in ms, positions in world px.
import { GROUND_Y, TILE, WORLD_H, WORLD_W } from "./blueprints/types";

export type View = { w: number; h: number }; // canvas px
export type Camera = { x: number; y: number; from: number; to: number; at: number };
export const STEP_MS = 200;
export const ZOOM_IN = 2; // steps
export const GROUND_AT = 0.22; // the ground sits this share of the visible height below the centre (72% down)
const DEAD = { desk: 0.15, phone: 0.06 }; // dead zone half-width, as a share of the visible width
const SMOOTH_MS = 120;
const GROUND_PX = GROUND_Y * TILE;
const HEAD_PX = 20; // when close, the centre sits this far above his feet

export const baseZoom = (width: number): number => (width > 1400 ? 3 : 2);
export const isPhone = (v: View): boolean => v.w <= 640;
const clampAxis = (centre: number, visible: number, size: number) =>
	visible >= size ? size / 2 : Math.min(size - visible / 2, Math.max(visible / 2, centre));

export function newCamera(heX: number, v: View, zoom: number): Camera {
	const vw = v.w / zoom;
	const vh = v.h / zoom;
	return { x: clampAxis(heX, vw, WORLD_W * TILE), y: clampAxis(GROUND_PX - vh * GROUND_AT, vh, WORLD_H * TILE), from: zoom, to: zoom, at: 0 };
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

// One step of following. close: he faces Gur, so the camera centres on him instead of using the dead zone.
export function follow(c: Camera, heX: number, v: View, now: number, dt: number, close: boolean): Camera {
	const z = zoomAt(c, now);
	const vw = v.w / z;
	const vh = v.h / z;
	const half = (isPhone(v) ? DEAD.phone : DEAD.desk) * vw;
	let tx = c.x;
	if (close) tx = heX;
	else if (heX > c.x + half) tx = heX - half;
	else if (heX < c.x - half) tx = heX + half;
	const ty = close ? GROUND_PX - HEAD_PX : GROUND_PX - vh * GROUND_AT;
	const k = 1 - Math.exp(-Math.max(0, dt) / SMOOTH_MS);
	return { ...c, x: clampAxis(c.x + (tx - c.x) * k, vw, WORLD_W * TILE), y: clampAxis(c.y + (ty - c.y) * k, vh, WORLD_H * TILE) };
}

// World px to canvas px, rounded so the pixels stay crisp. parallax < 1 for the cloud layers.
export function toScreen(c: Camera, v: View, now: number, wx: number, wy: number, parallax = 1): { x: number; y: number } {
	const z = zoomAt(c, now);
	return { x: Math.round((wx - c.x * parallax) * z + v.w / 2), y: Math.round((wy - c.y) * z + v.h / 2) };
}
```
`lib/world/pace.ts`
```ts
// The redraw rules (spec 2): frames only while he moves, builds or speaks or the camera eases; one timer for the gap
// between blocks or the end of the follow-up window; otherwise a tick every 3 s; nothing while hidden. Under reduced
// motion he still works, the ticks are slower, and the picture is redrawn only on a new block or mode.
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

export type DrawKey = { laid: number; kind: string; phase: string; zoom: number };
export function shouldDraw(reducedMotion: boolean, prev: DrawKey | null, next: DrawKey): boolean {
	if (!reducedMotion || !prev) return true;
	return prev.laid !== next.laid || prev.kind !== next.kind || prev.phase !== next.phase || prev.zoom !== next.zoom;
}
```

- [ ] **Step 4: run them.** `npx vitest run lib/world/camera.test.ts lib/world/pace.test.ts` passes; tsc and lint clean.

- [ ] **Step 5: commit.**
```bash
git add lib/world/camera.ts lib/world/camera.test.ts lib/world/pace.ts lib/world/pace.test.ts
git commit -m "feat(world): the camera with its dead zone and zoom steps, and the redraw pace" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 9: Progress, the `village` table and its readers
**Model:** Sonnet.
**Files:** Create `lib/world/progress.ts`, `lib/world/progress.test.ts`, `lib/world/village-data.ts`, `docs/migrations/village-phase-1.sql`.

**Interfaces:**
- Consumes: `RoomId` (Task 4), `supabase` from `@/lib/supabase`.
- Produces: `VillageRow = { room: string; laid: number; started_at: string; finished_at: string | null }`, `isVillageRow(x): x is VillageRow`, `RoomProgress = { room: RoomId; laid; total; startedAt; finishedAt; saved }`, `VillageNews = { room: RoomId; event: "started" | "finished" }`, `SAVE_EVERY = 8`, `resume(rows, room, total, nowIso): RoomProgress`, `lay(p, nowIso): { progress; news }`, `needsSave(p, reason: "block" | "hidden"): boolean`, `markSaved(p, laid): RoomProgress`, `saveRow(p)`, `nextIndex(p): number | null`, `villageLine(news): string`; `loadVillage(): Promise<{ rows: VillageRow[]; ok: boolean }>`, `saveRoom(p: RoomProgress): Promise<boolean>`.

- [ ] **Step 1: write the failing test** `lib/world/progress.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { isVillageRow, lay, markSaved, needsSave, nextIndex, resume, SAVE_EVERY, saveRow, villageLine, type VillageRow } from "./progress";

const NOW = "2026-10-09T12:00:00.000Z";
const START = "2026-10-01T09:00:00.000Z";
const row = (laid: number, extra: Partial<VillageRow> = {}): VillageRow => ({ room: "hall", laid, started_at: START, finished_at: null, ...extra });

describe("resuming", () => {
	it("starts a new hall at the first block", () => {
		const p = resume([], "hall", 180, NOW);
		expect(p).toEqual({ room: "hall", laid: 0, total: 180, startedAt: NOW, finishedAt: null, saved: 0 });
		expect(nextIndex(p)).toBe(0);
	});
	it("picks up at the right block", () => {
		const p = resume([row(37)], "hall", 180, NOW);
		expect(nextIndex(p)).toBe(37);
		expect(p.startedAt).toBe(START);
		expect(p.saved).toBe(37);
	});
	it("never goes beyond the end or below zero", () => {
		const over = resume([row(500)], "hall", 180, NOW);
		expect(over.laid).toBe(180);
		expect(over.finishedAt).toBe(NOW);
		expect(nextIndex(over)).toBeNull();
		expect(resume([row(-4)], "hall", 180, NOW).laid).toBe(0);
		expect(resume([row(12.7)], "hall", 180, NOW).laid).toBe(12);
	});
	it("keeps the saved finish time", () => {
		expect(resume([row(180, { finished_at: "2026-10-05T10:00:00.000Z" })], "hall", 180, NOW).finishedAt).toBe("2026-10-05T10:00:00.000Z");
	});
	it("reads only well-formed rows", () => {
		const bad = [null, "hall", { room: "hall" }, { ...row(3), laid: "3" }, { ...row(3), laid: Number.NaN }, { ...row(3), finished_at: 5 }];
		expect(isVillageRow(row(3))).toBe(true);
		expect(bad.map(isVillageRow)).toEqual([false, false, false, false, false, false]);
	});
});

describe("laying", () => {
	it("says when the hall starts and when it finishes, and nothing in between", () => {
		const first = lay(resume([], "hall", 3, NOW), NOW);
		expect(first.news).toEqual({ room: "hall", event: "started" });
		const second = lay(first.progress, NOW);
		expect(second.news).toBeNull();
		const last = lay(second.progress, NOW);
		expect(last.news).toEqual({ room: "hall", event: "finished" });
		expect(last.progress.finishedAt).toBe(NOW);
		expect(lay(last.progress, NOW)).toEqual({ progress: last.progress, news: null });
	});
});

describe("saving", () => {
	it("saves every eight blocks, when the tab is hidden, and on the last block", () => {
		let p = resume([row(10)], "hall", 180, NOW);
		expect(needsSave(p, "hidden")).toBe(false);
		for (let i = 0; i < SAVE_EVERY - 1; i++) p = lay(p, NOW).progress;
		expect(needsSave(p, "block")).toBe(false);
		expect(needsSave(p, "hidden")).toBe(true);
		p = lay(p, NOW).progress;
		expect(needsSave(p, "block")).toBe(true);
		expect(needsSave(lay(resume([row(179)], "hall", 180, NOW), NOW).progress, "block")).toBe(true);
	});
	it("never moves the saved count backwards", () => {
		const p = markSaved(resume([row(40)], "hall", 180, NOW), 32);
		expect(p.saved).toBe(40);
		expect(markSaved(p, 48).saved).toBe(48);
	});
	it("writes the row the table takes", () => {
		expect(saveRow(resume([row(37)], "hall", 180, NOW))).toEqual({ room: "hall", laid: 37, started_at: START, finished_at: null });
	});
});

describe("his line when the AI is off", () => {
	it("says it plainly, in full forms", () => {
		expect(villageLine({ room: "hall", event: "started" })).toBe("I have begun the hall.");
		expect(villageLine({ room: "hall", event: "finished" })).toBe("The hall is finished.");
		for (const event of ["started", "finished"] as const) {
			const line = villageLine({ room: "hall", event });
			expect(line).not.toMatch(/[!']/);
			expect(line).not.toMatch(/remember/i);
		}
	});
});
```

- [ ] **Step 2: run it.** Expected: FAIL.

- [ ] **Step 3: implement** `lib/world/progress.ts`
```ts
// How far he has built (spec 4), pure. The in-page count is the truth between saves; a save never moves the stored
// count backwards (the table's trigger keeps the larger, see docs/migrations/village-phase-1.sql).
import type { RoomId } from "./blueprints/types";

export type VillageRow = { room: string; laid: number; started_at: string; finished_at: string | null };
export type RoomProgress = { room: RoomId; laid: number; total: number; startedAt: string; finishedAt: string | null; saved: number };
export type VillageNews = { room: RoomId; event: "started" | "finished" };
export const SAVE_EVERY = 8;

export function isVillageRow(x: unknown): x is VillageRow {
	if (typeof x !== "object" || x === null) return false;
	const o = x as Record<string, unknown>;
	return (
		typeof o.room === "string" &&
		typeof o.laid === "number" &&
		Number.isFinite(o.laid) &&
		typeof o.started_at === "string" &&
		(o.finished_at === null || typeof o.finished_at === "string")
	);
}

// Where to pick up: the saved count, as a whole number between 0 and the blueprint's total.
export function resume(rows: readonly VillageRow[], room: RoomId, total: number, nowIso: string): RoomProgress {
	const saved = rows.find((r) => r.room === room);
	if (!saved) return { room, laid: 0, total, startedAt: nowIso, finishedAt: null, saved: 0 };
	const laid = Math.min(total, Math.max(0, Math.floor(saved.laid)));
	return { room, laid, total, startedAt: saved.started_at, finishedAt: laid >= total ? (saved.finished_at ?? nowIso) : null, saved: laid };
}

// One more block; says when the room has just started or just finished.
export function lay(p: RoomProgress, nowIso: string): { progress: RoomProgress; news: VillageNews | null } {
	if (p.laid >= p.total) return { progress: p, news: null };
	const laid = p.laid + 1;
	const finished = laid >= p.total;
	const progress: RoomProgress = { ...p, laid, finishedAt: finished ? nowIso : null };
	const news: VillageNews | null = finished ? { room: p.room, event: "finished" } : laid === 1 ? { room: p.room, event: "started" } : null;
	return { progress, news };
}

export const needsSave = (p: RoomProgress, reason: "block" | "hidden"): boolean =>
	p.laid > p.saved && (reason === "hidden" || p.laid - p.saved >= SAVE_EVERY || p.finishedAt !== null);
export const markSaved = (p: RoomProgress, laid: number): RoomProgress => ({ ...p, saved: Math.max(p.saved, laid) });
export const saveRow = (p: RoomProgress) => ({ room: p.room, laid: p.laid, started_at: p.startedAt, finished_at: p.finishedAt });
export const nextIndex = (p: RoomProgress): number | null => (p.laid < p.total ? p.laid : null);

const NAMES: Readonly<Record<RoomId, string>> = { island: "island", hall: "hall" };
// His own line for a room starting or finishing, when no model writes it (spec 4).
export function villageLine(news: VillageNews): string {
	const name = NAMES[news.room];
	return news.event === "started" ? `I have begun the ${name}.` : `The ${name} is finished.`;
}
```
`lib/world/village-data.ts` (network; not unit-tested; the pure parts it uses are)
```ts
// The village table (spec 4): one read per visit, an upsert per save. Rows are the owner's only (RLS).
import { supabase } from "@/lib/supabase";
import { isVillageRow, saveRow, type RoomProgress, type VillageRow } from "./progress";

// ok is false when it could not be read (a network error, or the table is not migrated yet): then he does not build
// and nothing is saved this visit, rather than building on a count that may be wrong.
export async function loadVillage(): Promise<{ rows: VillageRow[]; ok: boolean }> {
	const r = await supabase.from("village").select("room,laid,started_at,finished_at");
	if (r.error) return { rows: [], ok: false };
	return { rows: ((r.data ?? []) as unknown[]).filter(isVillageRow), ok: true };
}

// user_id comes from the column default (auth.uid()), as the room's other upserts do. True when it was saved.
export async function saveRoom(p: RoomProgress): Promise<boolean> {
	const { error } = await supabase.from("village").upsert(saveRow(p), { onConflict: "user_id,room" });
	if (error) console.error("Could not save the village", error);
	return !error;
}
```
`docs/migrations/village-phase-1.sql` (exactly this; do not apply it)
```sql
-- Village phase 1 (spec 2026-10-09-osmo-village-design.md section 4): how far Osmo has built each room.
-- STATUS: written, not applied. The main agent applies it as migration village_phase_1 with Gur's OK, before the
-- code that reads it is pushed.
-- One row per room. The browser reads and writes its own rows; a save never moves laid backwards and never changes
-- when a room was started or first finished (the trigger), so two tabs, or a late save from an old tab, cannot undo
-- progress. The room names for phase 2 are allowed now so phase 2 needs no migration.

create table public.village (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  room text not null check (room in ('hall', 'library', 'workshop', 'study', 'gate', 'observatory')),
  laid int not null default 0 check (laid between 0 and 10000),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (user_id, room));
create function public.village_forward() returns trigger language plpgsql set search_path = '' as $$
begin
  new.laid = greatest(old.laid, new.laid);
  new.started_at = old.started_at;
  new.finished_at = coalesce(old.finished_at, new.finished_at);
  return new;
end $$;
create trigger village_forward before update on public.village for each row execute function public.village_forward();
alter table public.village enable row level security;
create policy "own village" on public.village for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.village from anon, authenticated;
grant select, insert, update, delete on public.village to authenticated;
```

- [ ] **Step 4: run it.** `npx vitest run lib/world/progress.test.ts` passes; tsc and lint clean.

- [ ] **Step 5: commit.**
```bash
git add lib/world/progress.ts lib/world/progress.test.ts lib/world/village-data.ts docs/migrations/village-phase-1.sql
git commit -m "feat(world): village progress, its readers, and the village table SQL (not applied)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 10: Renderer and its two painters
**Model:** Opus.
**Files:** Create `lib/world/render.ts`, `lib/world/pixel-painter.ts`, `lib/world/canvas-painter.ts`, `lib/world/render.test.ts`.

**Interfaces:**
- Consumes: Tasks 1 to 8: `rasterize`, `colours`, `parseColor`, `sheetProblem`, `Bitmap`, `Colours`, `Grid`; `TILE_IDS`, `TILES`, `tileIndex`, `TileId`; `FRAME_NAMES`, `FRAMES`, `FRAME_W`, `FRAME_H`, `frameIndex`, `FACE_CELLS`, `FACE_W`, `FACE_H`, `FACE_AT`, `faceCell`; `Block`, `TILE`, `WORLD_W`, `GROUND_Y`; `CLOUDS`, `cloudX`, `PARALLAX`, `hslCss`, `Sky`, `Star`; `Look`; `Camera`, `View`, `zoomAt`, `toScreen`; `PALETTE`.
- Produces: `Sheet = "tiles" | "sprite" | "faces"`, `CELL`, `Art`, `artFor(scarf)`, `sheetBitmap(art, sheet, scale)`, `Painter`, `SkyScene`, `WorldScene`, `GHOST_ALPHA = 0.3`, `drawSky(p, s)`, `drawWorld(p, s)`; `PixelPainter`, `pixelPainter(w, h, art)`, `hashPixels(data)`; `Overrides`, `canvasPainter(ctx, art, overrides?)`, `loadSheets(): Promise<Overrides>`.

**The approach.**
- *Atlas:* each sheet (tiles 16 by 16 cells, sprite 16 by 32, faces 8 by 4) is rasterized into one horizontal strip at a whole-number scale with `rasterize`, in cell order, lazily and once per scale (zoom steps use base, base + 1, base + 2, so up to three atlases per sheet). The scarf letter `Z` takes `colorA`; a mood change rebuilds the art. In the browser the strip becomes an off-screen canvas via `putImageData`; an optional `public/village/tiles.png` (608 by 16) or `osmo-sheet.png` (288 by 32), if present and exactly that size, is drawn scaled onto the atlas canvas with smoothing off instead; otherwise the console says why and the drawn art stays.
- *Drawing order:* the sky canvas: the gradient (top to bottom colour), then stars (`p`, alpha `stars`, 2 by 2 for big ones). The sun is the DOM heart between the canvases (Task 11). The world canvas, cleared each draw: (1) clouds, far layer then near, each at its parallax; (2) the island; (3) the castle blocks laid so far, in laying order; (4) the next block at `GHOST_ALPHA`; (5) him, his feet on world y `GROUND_Y * TILE`, centred on his x, mirrored when `look.flip`; (6) his face patch, unmirrored, at `FACE_AT` times the zoom, when `look.face` is set. Everything is placed with `toScreen`, rounded to whole canvas pixels, and skipped when off screen. The line above his head is DOM (Task 11).
- *Redraw rules* live in `pace.ts` (Task 8); the renderer always draws a whole frame when asked.
- *The hash test:* jsdom is not installed, so the test draws with `pixelPainter`, an RGBA buffer in node with the same source-over blending as a canvas, and hashes the buffer with FNV-1a. The hash is pinned with `toMatchInlineSnapshot()`; the other tests check what the picture must contain, so the hash is not the only guard.

- [ ] **Step 1: write the failing test** `lib/world/render.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { look, newActor } from "./actor";
import { blocksOf } from "./blueprints";
import { HALL } from "./blueprints/hall";
import { ISLAND } from "./blueprints/island";
import { TILE } from "./blueprints/types";
import { newCamera, toScreen } from "./camera";
import { PALETTE } from "./palette";
import { hashPixels, pixelPainter } from "./pixel-painter";
import { snapshot } from "./png";
import { parseColor } from "./raster";
import { artFor, drawSky, drawWorld, sheetBitmap, type WorldScene } from "./render";
import { hslCss, skyAt, starField } from "./sky";

const art = artFor("hsl(172 38% 50%)");
const VIEW = { w: 320, h: 200 };
const hall = blocksOf(HALL);
// He stands at x 512; the camera starts on him: world x 432 to 592 and y 344 to 444 are on screen at zoom 2.
function scene(laid: number): WorldScene {
	const him = newActor(32 * TILE, 0, 12);
	return {
		camera: newCamera(him.x, VIEW, 2), view: VIEW, now: 0, clock: 0, ground: blocksOf(ISLAND),
		laid: hall.slice(0, laid), ghost: hall[laid] ?? null, him: { x: him.x, look: look(him, 0, "warm") },
	};
}
const paint = (s: WorldScene) => {
	const p = pixelPainter(VIEW.w, VIEW.h, art);
	drawWorld(p, s);
	return p;
};
const px = (data: Uint8ClampedArray, x: number, y: number) => Array.from(data.slice((y * VIEW.w + x) * 4, (y * VIEW.w + x) * 4 + 4));
const rgb = (letter: keyof typeof PALETTE) => (parseColor(PALETTE[letter]) ?? [0, 0, 0, 0]).slice(0, 3);

describe("the atlas", () => {
	it("lays each sheet out in one strip per scale", () => {
		expect([sheetBitmap(art, "tiles", 2).w, sheetBitmap(art, "tiles", 2).h]).toEqual([38 * 32, 32]);
		expect([sheetBitmap(art, "sprite", 3).w, sheetBitmap(art, "sprite", 3).h]).toEqual([18 * 48, 96]);
		expect([sheetBitmap(art, "faces", 2).w, sheetBitmap(art, "faces", 2).h]).toEqual([9 * 16, 8]);
	});
});

describe("the world", () => {
	it("draws the hall at 40 blocks to the same pixels every time", () => {
		const p = paint(scene(40));
		snapshot("world-40", p);
		expect(hashPixels(p.data)).toBe(hashPixels(paint(scene(40)).data));
		expect(hashPixels(p.data)).toMatchInlineSnapshot();
	});
	it("changes the picture when one more block is laid", () => {
		expect(hashPixels(paint(scene(40)).data)).not.toBe(hashPixels(paint(scene(41)).data));
	});
	it("draws the next block faintly, and only in its own cell", () => {
		const s = scene(40);
		const ghost = s.ghost;
		expect(ghost).not.toBeNull();
		if (!ghost) return;
		const withGhost = paint(s).data;
		const without = paint({ ...s, ghost: null }).data;
		const at = toScreen(s.camera, VIEW, 0, ghost.x * TILE, ghost.y * TILE);
		let changed = 0;
		for (let y = 0; y < VIEW.h; y++) {
			for (let x = 0; x < VIEW.w; x++) {
				if (px(withGhost, x, y).join() === px(without, x, y).join()) continue;
				changed++;
				expect(x >= at.x && x < at.x + 2 * TILE && y >= at.y && y < at.y + 2 * TILE, `${x},${y}`).toBe(true);
			}
		}
		expect(changed).toBeGreaterThan(0);
	});
	it("draws the island's snow and stone under his feet", () => {
		// world (450, 424): the snow tile at column 28, row 26, eight pixels down
		const [r, g, b, a] = px(paint(scene(40)).data, 36, 160);
		expect(a).toBe(255);
		const ground = (["a", "b", "c", "d", "e", "n", "o", "p"] as const).map((l) => rgb(l).join());
		expect(ground).toContain([r, g, b].join());
	});
	it("leaves the sky transparent where nothing is built yet", () => {
		expect(px(paint(scene(40)).data, 16, 12)[3]).toBe(0); // world (440, 350): row 21 is not laid at 40
	});
	it("draws him standing on the ground line", () => {
		const data = paint(scene(40)).data;
		let opaque = 0;
		for (let y = 80; y < 144; y++) for (let x = 144; x < 176; x++) if (px(data, x, y)[3] === 255) opaque++;
		expect(opaque).toBeGreaterThan(100);
		expect(Array.from({ length: 32 }, (_, i) => px(data, 144 + i, 143)[3]).some((a) => a === 255)).toBe(true);
	});
	it("copes with a canvas of no size", () => {
		expect(() => drawWorld(pixelPainter(0, 0, art), { ...scene(40), view: { w: 0, h: 0 } })).not.toThrow();
	});
});

describe("the sky", () => {
	it("runs from the top colour to the bottom colour", () => {
		const sky = skyAt("hsl(172 38% 50%)", "hsl(212 38% 50%)", 12);
		const p = pixelPainter(VIEW.w, VIEW.h, art);
		drawSky(p, { sky, stars: starField() });
		expect(px(p.data, 0, 0)).toEqual([...(parseColor(hslCss(sky.top)) ?? [])]);
		expect(px(p.data, 0, VIEW.h - 1)).toEqual([...(parseColor(hslCss(sky.bottom)) ?? [])]);
	});
	it("shows stars at night and none at noon", () => {
		const bright = (hour: number) => {
			const sky = skyAt("hsl(172 38% 50%)", "hsl(212 38% 50%)", hour);
			const p = pixelPainter(VIEW.w, VIEW.h, art);
			drawSky(p, { sky, stars: starField() });
			const limit = Math.max(...[px(p.data, 0, 0), px(p.data, 0, VIEW.h - 1)].map(([r, g, b]) => r + g + b)) + 90;
			let n = 0;
			for (let i = 0; i < p.data.length; i += 4) if (p.data[i] + p.data[i + 1] + p.data[i + 2] > limit) n++;
			return n;
		};
		expect(bright(0)).toBeGreaterThan(20);
		expect(bright(12)).toBe(0);
	});
});
```

- [ ] **Step 2: run it.** `npx vitest run lib/world/render.test.ts`. Expected: FAIL, modules not found.

- [ ] **Step 3: implement** `lib/world/render.ts`
```ts
// The village renderer (spec 2). It draws onto a Painter, so the same code draws to a canvas in the browser
// (canvas-painter.ts) and to plain pixels in the tests (pixel-painter.ts). Drawing order is in drawWorld.
import type { Look } from "./actor";
import { GROUND_Y, TILE, WORLD_W, type Block } from "./blueprints/types";
import { toScreen, zoomAt, type Camera, type View } from "./camera";
import { FACE_AT, FACE_CELLS, FACE_H, FACE_W, faceCell, FRAME_H, FRAME_NAMES, FRAME_W, FRAMES, frameIndex } from "./osmo-sprite";
import { PALETTE } from "./palette";
import { colours, rasterize, type Bitmap, type Colours, type Grid } from "./raster";
import { CLOUDS, cloudX, hslCss, PARALLAX, type Sky, type Star } from "./sky";
import { TILE_IDS, TILES, tileIndex, type TileId } from "./tiles";

export type Sheet = "tiles" | "sprite" | "faces";
export const CELL: Readonly<Record<Sheet, { w: number; h: number }>> = {
	tiles: { w: TILE, h: TILE },
	sprite: { w: FRAME_W, h: FRAME_H },
	faces: { w: FACE_W, h: FACE_H },
};
export type Art = { grids: Readonly<Record<Sheet, readonly Grid[]>>; colours: Colours };
// The drawn art with his scarf in the mood's first aura colour.
export function artFor(scarf: string): Art {
	return {
		grids: { tiles: TILE_IDS.map((id) => TILES[id]), sprite: FRAME_NAMES.map((n) => FRAMES[n]), faces: FACE_CELLS },
		colours: colours({ Z: scarf }),
	};
}
export const sheetBitmap = (art: Art, sheet: Sheet, scale: number): Bitmap =>
	rasterize(art.grids[sheet], CELL[sheet].w, CELL[sheet].h, scale, art.colours);

// What the renderer draws with. Coordinates are whole canvas pixels; stamp draws cell `cell` of a sheet at `scale`
// with its top-left at (x, y), mirrored left to right when flip is set.
export interface Painter {
	readonly w: number;
	readonly h: number;
	clear(): void;
	gradient(top: string, bottom: string): void;
	rect(x: number, y: number, w: number, h: number, color: string, alpha: number): void;
	stamp(sheet: Sheet, cell: number, x: number, y: number, scale: number, alpha: number, flip: boolean): void;
}

export type SkyScene = { sky: Sky; stars: readonly Star[] };
export type WorldScene = {
	camera: Camera;
	view: View;
	now: number; // the camera's clock
	clock: number; // the clouds' clock
	ground: readonly Block[]; // the island, always drawn
	laid: readonly Block[]; // the castle so far, in laying order
	ghost: Block | null; // the next block, drawn faint
	him: { x: number; look: Look };
};
export const GHOST_ALPHA = 0.3;

export function drawSky(p: Painter, s: SkyScene): void {
	p.gradient(hslCss(s.sky.top), hslCss(s.sky.bottom));
	if (s.sky.stars <= 0) return;
	for (const star of s.stars) {
		const size = star.big ? 2 : 1;
		p.rect(Math.round(star.fx * p.w), Math.round(star.fy * p.h), size, size, PALETTE.p, s.sky.stars * (star.big ? 1 : 0.7));
	}
}

export function drawWorld(p: Painter, s: WorldScene): void {
	p.clear();
	const z = zoomAt(s.camera, s.now);
	const size = TILE * z;
	const seen = (x: number, y: number, w: number, h: number) => x + w > 0 && y + h > 0 && x < p.w && y < p.h;
	const tile = (id: TileId, wx: number, wy: number, alpha: number, parallax = 1) => {
		const at = toScreen(s.camera, s.view, s.now, wx, wy, parallax);
		if (seen(at.x, at.y, size, size)) p.stamp("tiles", tileIndex(id), at.x, at.y, z, alpha, false);
	};
	// 1. clouds: the far layer, then the near one, each with its parallax
	for (const layer of [0, 1] as const) {
		for (const c of CLOUDS) {
			if (c.layer !== layer) continue;
			const x = cloudX(c, s.clock, WORLD_W * TILE);
			for (const part of c.parts) tile(part.tile, x + part.dx, c.y + part.dy, 1, PARALLAX[layer]);
		}
	}
	// 2. the island, 3. the castle so far, 4. the next block, faint
	for (const b of s.ground) tile(b.tile, b.x * TILE, b.y * TILE, 1);
	for (const b of s.laid) tile(b.tile, b.x * TILE, b.y * TILE, 1);
	if (s.ghost) tile(s.ghost.tile, s.ghost.x * TILE, s.ghost.y * TILE, GHOST_ALPHA);
	// 5. him, his feet on the island's top edge; 6. his face, never mirrored
	const at = toScreen(s.camera, s.view, s.now, s.him.x - FRAME_W / 2, GROUND_Y * TILE - FRAME_H);
	if (!seen(at.x, at.y, FRAME_W * z, FRAME_H * z)) return;
	p.stamp("sprite", frameIndex(s.him.look.frame), at.x, at.y, z, 1, s.him.look.flip);
	if (s.him.look.face) p.stamp("faces", faceCell(s.him.look.face, s.him.look.gaze), at.x + FACE_AT.x * z, at.y + FACE_AT.y * z, z, 1, false);
}
```
`lib/world/pixel-painter.ts`
```ts
// A Painter over a plain RGBA buffer, with a canvas's source-over blending. The tests draw with it (node has no
// canvas, and no package for one is added) and hash the pixels.
import { parseColor, type Bitmap } from "./raster";
import { CELL, sheetBitmap, type Art, type Painter } from "./render";

export type PixelPainter = Painter & { readonly data: Uint8ClampedArray<ArrayBuffer> };

export function pixelPainter(w: number, h: number, art: Art): PixelPainter {
	const data = new Uint8ClampedArray(w * h * 4);
	const sheets = new Map<string, Bitmap>();
	const blend = (o: number, r: number, g: number, b: number, a: number) => {
		if (a <= 0) return;
		const keep = 1 - a;
		data[o] = Math.round(r * a + data[o] * keep);
		data[o + 1] = Math.round(g * a + data[o + 1] * keep);
		data[o + 2] = Math.round(b * a + data[o + 2] * keep);
		data[o + 3] = Math.round(255 * a + data[o + 3] * keep);
	};
	return {
		w,
		h,
		data,
		clear: () => {
			data.fill(0);
		},
		gradient(top, bottom) {
			const t = parseColor(top) ?? [0, 0, 0, 255];
			const b = parseColor(bottom) ?? t;
			for (let y = 0; y < h; y++) {
				const k = h > 1 ? y / (h - 1) : 0;
				const c = [0, 1, 2].map((i) => Math.round(t[i] + (b[i] - t[i]) * k));
				for (let x = 0; x < w; x++) {
					const o = (y * w + x) * 4;
					data[o] = c[0];
					data[o + 1] = c[1];
					data[o + 2] = c[2];
					data[o + 3] = 255;
				}
			}
		},
		rect(x, y, rw, rh, color, alpha) {
			const c = parseColor(color);
			if (!c) return;
			for (let yy = Math.max(0, y); yy < Math.min(h, y + rh); yy++) {
				for (let xx = Math.max(0, x); xx < Math.min(w, x + rw); xx++) blend((yy * w + xx) * 4, c[0], c[1], c[2], alpha);
			}
		},
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
	};
}

// FNV-1a over the bytes, as 8 hex digits.
export function hashPixels(data: Uint8Array | Uint8ClampedArray): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < data.length; i++) {
		h ^= data[i];
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}
```
`lib/world/canvas-painter.ts` (browser only; checked by tsc, lint and the dev page)
```ts
// The Painter over a real canvas, and the optional PNG sheets (spec 2 and 3). Atlases are built lazily, one per
// sheet and scale, from the drawn art, or from a PNG that is present and exactly the right size.
import { TILE } from "./blueprints/types";
import { FRAME_H, FRAME_NAMES, FRAME_W } from "./osmo-sprite";
import { sheetProblem } from "./raster";
import { CELL, sheetBitmap, type Art, type Painter, type Sheet } from "./render";
import { TILE_IDS } from "./tiles";

export type Overrides = Partial<Record<"tiles" | "sprite", CanvasImageSource>>;

export function canvasPainter(ctx: CanvasRenderingContext2D, art: Art, overrides: Overrides = {}): Painter {
	const atlases = new Map<string, HTMLCanvasElement>();
	const atlas = (sheet: Sheet, scale: number): HTMLCanvasElement => {
		const key = `${sheet}@${scale}`;
		const hit = atlases.get(key);
		if (hit) return hit;
		const bmp = sheetBitmap(art, sheet, scale);
		const c = document.createElement("canvas");
		c.width = bmp.w;
		c.height = bmp.h;
		const g = c.getContext("2d");
		if (g) {
			const png = sheet === "faces" ? undefined : overrides[sheet];
			if (png) {
				g.imageSmoothingEnabled = false;
				g.drawImage(png, 0, 0, bmp.w, bmp.h);
			} else {
				g.putImageData(new ImageData(bmp.data, bmp.w, bmp.h), 0, 0);
			}
		}
		atlases.set(key, c);
		return c;
	};
	return {
		get w() {
			return ctx.canvas.width;
		},
		get h() {
			return ctx.canvas.height;
		},
		clear() {
			ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		},
		gradient(top, bottom) {
			const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
			g.addColorStop(0, top);
			g.addColorStop(1, bottom);
			ctx.globalAlpha = 1;
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		},
		rect(x, y, w, h, color, alpha) {
			ctx.globalAlpha = alpha;
			ctx.fillStyle = color;
			ctx.fillRect(x, y, w, h);
			ctx.globalAlpha = 1;
		},
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
	};
}

const SHEETS = {
	tiles: { file: "/village/tiles.png", w: TILE_IDS.length * TILE, h: TILE },
	sprite: { file: "/village/osmo-sheet.png", w: FRAME_NAMES.length * FRAME_W, h: FRAME_H },
} as const;

// The optional PNG sheets: used only when present and exactly the right size; otherwise the console says why.
export async function loadSheets(): Promise<Overrides> {
	const out: Overrides = {};
	for (const sheet of ["tiles", "sprite"] as const) {
		const { file, w, h } = SHEETS[sheet];
		const img = new Image();
		img.src = file;
		try {
			await img.decode();
		} catch {
			console.info(`[village] No ${file}; using the drawn ${sheet}.`);
			continue;
		}
		const problem = sheetProblem(img.naturalWidth, img.naturalHeight, w, h);
		if (problem) {
			console.warn(`[village] ${file} ${problem}; using the drawn ${sheet}.`);
			continue;
		}
		out[sheet] = img;
	}
	return out;
}
```

- [ ] **Step 4: pin the hash and look at the picture.** Run `npx vitest run lib/world/render.test.ts -u` once: vitest writes the hash into `toMatchInlineSnapshot(...)` in the test file. Then run it with `WORLD_SNAPSHOT_DIR` set (as in Task 2) and open `world-40.png`: the island's snow and stone across the bottom, the hall's foundation and the first wall courses, the faint next block, him standing on the snow in profile with his scarf. If anything is wrong (a gap between tiles, him floating or sunk, a mirrored face), fix the code, run with `-u` again, and look again. A later change to the art changes this hash; update it with `-u` only after looking at the new picture.

- [ ] **Step 5: run it.** `npx vitest run lib/world` passes (all world tests); `npx tsc --noEmit -p .` and `npm run lint` are clean.

- [ ] **Step 6: commit.**
```bash
git add lib/world/render.ts lib/world/pixel-painter.ts lib/world/canvas-painter.ts lib/world/render.test.ts
git commit -m "feat(world): the renderer, a pixel painter for tests and a canvas painter, with a pixel hash" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 11: The world component
**Model:** Sonnet.
**Files:** Create `components/osmo/world.tsx`, `components/osmo/world.module.css`.

**Interfaces:**
- Consumes: everything in `lib/world/` (Tasks 4 to 10), `Figure` (`components/osmo/figure.tsx`), `AgentState`.
- Produces: `WorldStage(props: WorldProps)`, `WorldProps`, `WorldFixed = { hour?; laid?; pose? }`, `WorldControl = { attend(): void; takeNews(): VillageNews | null }`.
  - `WorldProps = { agent: Pick<AgentState, "activations" | "mood">; colorA: string; colorB: string; signals: RoomSignals; said: string | null; heard: string | null; controlRef?: RefObject<WorldControl | null>; persist?: boolean; fixed?: WorldFixed }`.
  - `persist` defaults to true (one read per visit, saves). `persist={false}` (the dev page) reads and saves nothing and builds a local hall from 0. `fixed.laid` pins the count (no building), `fixed.hour` pins the clock, `fixed.pose` pins his state (not stepped).
  - `controlRef.current.attend()` is a `message` event (composer focus and typing). `takeNews()` hands over a room's start or finish once (for language's `TurnFacts.village`, Task 14 Ask).

No unit test (DOM); the pure parts it composes are tested. Checked by tsc, lint, and by eye on `/dev/world` (Task 12).

- [ ] **Step 1: write** `components/osmo/world.module.css`
```css
/* Osmo's village: the sky canvas, the sun (his heart, figure.tsx), the world canvas, and his line above his head. */
.world {
	position: absolute;
	inset: 0;
	z-index: -1;
	overflow: clip;
	background: var(--base);
}
.layer {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	image-rendering: pixelated;
	pointer-events: none;
}
/* The heart as the sun: placed by the hour (--sun-x, --sun-y), dim and low when it is down. */
.sun {
	--figure: clamp(4.5rem, 9vw, 7rem);
	position: absolute;
	left: var(--sun-x, 50%);
	top: var(--sun-y, 30%);
	translate: -50% -50%;
	pointer-events: none;
	transition: left 1s linear, top 1s linear, opacity 2s ease, filter 2s ease;
}
.world[data-sun="down"] .sun {
	opacity: 0.35;
	filter: saturate(0.6) brightness(0.7);
}
/* His line, over his head (--him-x, --him-y: the top of his sprite, in canvas px). */
.bubble {
	position: absolute;
	left: var(--him-x, 50%);
	top: var(--him-y, 50%);
	translate: -50% calc(-100% - 0.75rem);
	display: grid;
	justify-items: center;
	gap: 0.25rem;
	width: max-content;
	max-width: min(24rem, 80vw);
	pointer-events: none;
}
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
/* With the fade setting on, his words linger after the last word, then go (as under the heart today). */
:global([data-fade]:not([data-speaking])) .said {
	opacity: 0;
	transition: opacity 1.2s ease 1.4s;
}
@media (prefers-reduced-motion: reduce) {
	.sun,
	.said {
		transition: none;
	}
}
```

- [ ] **Step 2: write** `components/osmo/world.tsx`
```tsx
"use client";

// Osmo's village (spec docs/superpowers/specs/2026-10-09-osmo-village-design.md, phase 1): the sky, the sun that is
// his heart, the island, the hall he builds, and him with his line above his head. app/assistant.tsx loads it after
// first paint, and only when NEXT_PUBLIC_OSMO_SHELL2 and NEXT_PUBLIC_OSMO_WORLD are both on.
import { type RefObject, useEffect, useRef } from "react";
import { Figure } from "@/components/osmo/figure";
import type { AgentState } from "@/lib/agent/state";
import { facingViewer, look, newActor, pose, step, type Actor, type ActorEvent, type ActorKind, type ActorWorld } from "@/lib/world/actor";
import { blocksOf, REST_X, standX, START_X } from "@/lib/world/blueprints";
import { HALL } from "@/lib/world/blueprints/hall";
import { ISLAND } from "@/lib/world/blueprints/island";
import { GROUND_Y, TILE } from "@/lib/world/blueprints/types";
import { baseZoom, easing, follow, newCamera, toScreen, zoomAt, zoomTo, ZOOM_IN, type Camera, type View } from "@/lib/world/camera";
import { canvasPainter, loadSheets, type Overrides } from "@/lib/world/canvas-painter";
import { bearing } from "@/lib/world/face";
import { FRAME_H } from "@/lib/world/osmo-sprite";
import { FRAME_MS, nextTickIn, shouldDraw, type DrawKey } from "@/lib/world/pace";
import { lay, markSaved, needsSave, nextIndex, resume, type RoomProgress, type VillageNews } from "@/lib/world/progress";
import { artFor, drawSky, drawWorld } from "@/lib/world/render";
import { roomEvents, type RoomSignals } from "@/lib/world/signals";
import { hourOf, phaseOf, skyAt, starField, sunAt } from "@/lib/world/sky";
import { loadVillage, saveRoom } from "@/lib/world/village-data";
import s from "./world.module.css";

export type WorldControl = { attend(): void; takeNews(): VillageNews | null };
export type WorldFixed = { hour?: number; laid?: number; pose?: ActorKind };
export type WorldProps = {
	agent: Pick<AgentState, "activations" | "mood">;
	colorA: string;
	colorB: string;
	signals: RoomSignals;
	said: string | null;
	heard: string | null;
	controlRef?: RefObject<WorldControl | null>;
	persist?: boolean;
	fixed?: WorldFixed;
};
type Engine = { send(e: ActorEvent): void; refresh(): void; takeNews(): VillageNews | null; dispose(): void };

// The loop, outside React: it reads the latest props through `live` and writes the canvases and a few CSS variables.
function startWorld(root: HTMLDivElement, skyCanvas: HTMLCanvasElement, canvas: HTMLCanvasElement, live: { current: WorldProps }): Engine | null {
	const ctx = canvas.getContext("2d");
	const skyCtx = skyCanvas.getContext("2d");
	if (!ctx || !skyCtx) return null;
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const persist = live.current.persist !== false;
	const ground = blocksOf(ISLAND);
	const hall = blocksOf(HALL);
	const stars = starField();
	const clock = () => performance.now();
	const hourNow = () => live.current.fixed?.hour ?? hourOf(new Date());
	const fixedLaid = () => live.current.fixed?.laid;

	let alive = true;
	let view: View = { w: 0, h: 0 };
	let actor: Actor = newActor(START_X, clock(), hourNow());
	let camera: Camera = newCamera(actor.x, view, 2);
	// The room: unknown until the one read of the visit answers. The dev page: a local hall from nothing.
	let progress: RoomProgress | null = persist ? null : resume([], "hall", hall.length, new Date().toISOString());
	let canSave = false;
	let saving = false;
	let news: VillageNews | null = null;
	let overrides: Overrides = {};
	let scarf = live.current.colorA;
	let painter = canvasPainter(ctx, artFor(scarf), overrides);
	const skyPainter = canvasPainter(skyCtx, artFor(scarf));
	let skyKey = "";
	let drawn: DrawKey | null = null;
	let posed: { kind: ActorKind; since: number } | null = null;
	let lastHour = Math.floor(hourNow());
	let last = clock();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let raf: number | null = null;

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
		const ok = await saveRoom(snap);
		saving = false;
		if (ok && progress) progress = markSaved(progress, snap.laid);
	};
	const onLaid = () => {
		if (!progress || fixedLaid() !== undefined) return;
		const r = lay(progress, new Date().toISOString());
		progress = r.progress;
		if (r.news) news = r.news;
		if (needsSave(progress, "block")) void save();
	};
	const apply = (e: ActorEvent) => {
		const r = step(actor, e, world());
		actor = r.actor;
		if (r.laid) onLaid();
	};
	const schedule = (ms: number | null) => {
		if (timer !== null) clearTimeout(timer);
		if (raf !== null) cancelAnimationFrame(raf);
		timer = null;
		raf = null;
		if (!alive || ms === null) return;
		if (ms <= FRAME_MS) raf = requestAnimationFrame(frame);
		else timer = setTimeout(frame, ms);
	};
	const measure = (): boolean => {
		const box = root.getBoundingClientRect();
		const w = Math.max(0, Math.round(box.width));
		const h = Math.max(0, Math.round(box.height));
		if (w === view.w && h === view.h) return false;
		view = { w, h };
		for (const c of [canvas, skyCanvas]) {
			c.width = w;
			c.height = h;
		}
		skyKey = "";
		drawn = null;
		return true;
	};
	// The sky changes slowly: redrawn when the size, the mood colours or the five-minute slot changes.
	const paintSky = (hour: number) => {
		const { colorA, colorB } = live.current;
		const key = `${view.w}x${view.h}|${colorA}|${colorB}|${Math.floor(hour * 12)}`;
		if (key === skyKey) return;
		skyKey = key;
		drawSky(skyPainter, { sky: skyAt(colorA, colorB, hour), stars });
		const sun = sunAt(hour);
		root.style.setProperty("--sun-x", `${(sun.fx * 100).toFixed(2)}%`);
		root.style.setProperty("--sun-y", `${(sun.fy * 100).toFixed(2)}%`);
		root.dataset.sun = sun.up ? "up" : "down";
	};
	const frame = (): void => {
		timer = null;
		raf = null;
		const now = clock();
		const dt = now - last;
		last = now;
		const hour = hourNow();
		if (Math.floor(hour) !== lastHour) {
			lastHour = Math.floor(hour);
			apply({ type: "hour", now, hour });
		}
		const pinned = live.current.fixed?.pose;
		if (pinned) {
			if (posed?.kind !== pinned) posed = { kind: pinned, since: now };
			actor = pose(pinned, actor.x, posed.since, hour);
		} else {
			posed = null;
			apply({ type: "tick", now, dt });
		}
		if (live.current.colorA !== scarf) {
			scarf = live.current.colorA;
			painter = canvasPainter(ctx, artFor(scarf), overrides);
			drawn = null;
		}
		measure();
		const close = facingViewer(actor);
		const base = baseZoom(view.w);
		camera = zoomTo(camera, close ? base + ZOOM_IN : base, now, reduced);
		camera = follow(camera, actor.x, view, now, dt, close);
		paintSky(hour);
		const laid = laidCount();
		const next = nextBlock();
		const ghost = fixedLaid() !== undefined ? (hall[laid] ?? null) : next;
		const key: DrawKey = { laid, kind: actor.kind, phase: phaseOf(hour), zoom: zoomAt(camera, now) };
		if (shouldDraw(reduced, drawn, key)) {
			drawn = key;
			const face = bearing(live.current.agent, Date.now(), hour).face;
			drawWorld(painter, { camera, view, now, clock: now, ground, laid: hall.slice(0, laid), ghost, him: { x: actor.x, look: look(actor, now, face) } });
			const head = toScreen(camera, view, now, actor.x, GROUND_Y * TILE - FRAME_H);
			root.style.setProperty("--him-x", `${head.x}px`);
			root.style.setProperty("--him-y", `${head.y}px`);
		}
		schedule(nextTickIn({ actor, now, easing: easing(camera, now), hasWork: next !== null || actor.night, reducedMotion: reduced }));
	};

	const onVisibility = () => {
		const now = clock();
		if (document.hidden) {
			apply({ type: "hidden", now });
			if (progress && needsSave(progress, "hidden")) void save();
			schedule(null);
		} else {
			last = now;
			apply({ type: "visible", now });
			schedule(0);
		}
	};
	document.addEventListener("visibilitychange", onVisibility);
	const resize = new ResizeObserver(() => {
		if (measure()) schedule(0);
	});
	resize.observe(root);
	if (persist) {
		void loadVillage().then(({ rows, ok }) => {
			if (!alive) return;
			if (!ok) {
				console.warn("[village] Could not read the village, so he will not build this visit.");
				return;
			}
			progress = resume(rows, "hall", hall.length, new Date().toISOString());
			canSave = true;
			schedule(0);
		});
	}
	void loadSheets().then((found) => {
		if (!alive) return;
		overrides = found;
		painter = canvasPainter(ctx, artFor(scarf), overrides);
		drawn = null;
		schedule(0);
	});
	measure();
	camera = newCamera(actor.x, view, baseZoom(view.w));
	if (document.hidden) apply({ type: "hidden", now: clock() });
	schedule(document.hidden ? null : 0);

	return {
		send(e) {
			apply(e);
			if (!document.hidden) schedule(0);
		},
		refresh() {
			drawn = null;
			skyKey = "";
			if (!document.hidden) schedule(0);
		},
		takeNews() {
			const n = news;
			news = null;
			return n;
		},
		dispose() {
			alive = false;
			schedule(null);
			document.removeEventListener("visibilitychange", onVisibility);
			resize.disconnect();
			if (progress && needsSave(progress, "hidden")) void save();
		},
	};
}

export function WorldStage(props: WorldProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const skyRef = useRef<HTMLCanvasElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const live = useRef(props);
	const engine = useRef<Engine | null>(null);
	const prevSignals = useRef<RoomSignals | null>(null);
	useEffect(() => {
		live.current = props;
	});
	useEffect(() => {
		const root = rootRef.current;
		const sky = skyRef.current;
		const canvas = canvasRef.current;
		if (!root || !sky || !canvas) return;
		const e = startWorld(root, sky, canvas, live);
		engine.current = e;
		return () => {
			e?.dispose();
			engine.current = null;
		};
	}, []);
	const { controlRef } = props;
	useEffect(() => {
		if (!controlRef) return;
		controlRef.current = {
			attend: () => engine.current?.send({ type: "message", now: performance.now() }),
			takeNews: () => engine.current?.takeNews() ?? null,
		};
		return () => {
			controlRef.current = null;
		};
	}, [controlRef]);
	const { lines, inTalk, speaking, thinking } = props.signals;
	useEffect(() => {
		const next = { lines, inTalk, speaking, thinking };
		for (const e of roomEvents(prevSignals.current, next, performance.now())) engine.current?.send(e);
		prevSignals.current = next;
	}, [lines, inTalk, speaking, thinking]);
	const { fixed, colorA, colorB } = props;
	useEffect(() => {
		engine.current?.refresh();
	}, [fixed?.hour, fixed?.laid, fixed?.pose, colorA, colorB]);

	return (
		<div ref={rootRef} className={s.world}>
			<canvas ref={skyRef} className={s.layer} aria-hidden="true" />
			<div className={s.sun} aria-hidden="true">
				<Figure />
			</div>
			<canvas ref={canvasRef} className={s.layer} aria-hidden="true" />
			<div className={s.bubble}>
				{props.heard !== null && <p className={s.heard}>{props.heard}</p>}
				<p className={s.said} aria-live="polite">
					{props.said ?? ""}
				</p>
			</div>
		</div>
	);
}
```

- [ ] **Step 3: check.** `npx tsc --noEmit -p .` and `npm run lint` are clean (no new warnings). If the React lint rules object to a ref, keep refs named `...Ref` and write them only in effects or handlers, as above.

- [ ] **Step 4: commit.**
```bash
git add components/osmo/world.tsx components/osmo/world.module.css
git commit -m "feat(world): the world component: sky, sun, island, hall and him, behind the village switch" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 12: `/dev/world`
**Model:** Sonnet.
**Files:** Create `app/dev/world/page.tsx`, `app/dev/world/dev.module.css`.

**Interfaces:**
- Consumes: `WorldStage` (Task 11), `moodTheme`, `BASELINE`, `blocksOf`, `HALL`, `ActorKind`.
- Produces: the page at `/dev/world`: every actor state, every hour of the sky, the hall at 0, 50 and 100 percent and building live, the phone camera, each mood. 404 in production. Reads and saves nothing (`persist={false}`).

- [ ] **Step 1: write** `app/dev/world/dev.module.css`
```css
/* Dev page only: controls over the world, and a phone-sized box for the phone camera. */
.toolbar { position: relative; z-index: 1; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; padding: 1rem 0 0.5rem; }
.btn { width: auto; padding: 0 1rem; height: 2.5rem; }
.btn[aria-pressed="true"] { outline: 2px solid var(--aura-a); outline-offset: 2px; }
.range { width: 14rem; }
.phone { position: relative; isolation: isolate; width: 375px; height: 700px; margin: 1rem auto; overflow: clip; border: 1px solid color-mix(in oklab, var(--bone) 30%, transparent); border-radius: 1.5rem; }
.note { position: relative; z-index: 1; margin: 0.5rem 0; font-size: 0.85rem; color: color-mix(in oklab, var(--bone) 80%, transparent); }
```

- [ ] **Step 2: write** `app/dev/world/page.tsx`
```tsx
"use client";

// A dev-only view of the village: every state he can be in, every hour of the sky, the hall at 0, 50 and 100 percent
// or building live, each mood, and the phone camera. Nothing is read or saved. Not served in production.
import { type CSSProperties, useState } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { notFound } from "next/navigation";
import styles from "../../assistant.module.css";
import dev from "./dev.module.css";
import { WorldStage } from "@/components/osmo/world";
import { moodTheme } from "@/lib/agent/mood-theme";
import { BASELINE, type Activations, type Emotion } from "@/lib/agent/state";
import type { ActorKind } from "@/lib/world/actor";
import { blocksOf } from "@/lib/world/blueprints";
import { HALL } from "@/lib/world/blueprints/hall";

const font = Bricolage_Grotesque({ subsets: ["latin"] });
const MOODS: (Emotion | "calm")[] = ["calm", "joy", "sadness", "fear", "anger", "love", "loneliness", "hope", "boredom"];
const POSES: (ActorKind | "live")[] = ["live", "idle", "walking", "building", "turning", "facing", "resting"];
const TOTAL = blocksOf(HALL).length;
const FILLS: { label: string; laid: number | undefined }[] = [
	{ label: "Building live", laid: undefined },
	{ label: "Hall 0%", laid: 0 },
	{ label: "Hall 50%", laid: Math.round(TOTAL / 2) },
	{ label: "Hall 100%", laid: TOTAL },
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
	const [fill, setFill] = useState(0);
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
			fixed={{ hour: hour ?? undefined, laid: FILLS[fill].laid, pose: poseKind === "live" ? undefined : poseKind }}
		/>
	);
	return (
		<div className={`${styles.stage} ${font.className}`} style={stageStyle} data-tone={theme.tone} data-speaking={speaking ? "" : undefined}>
			<div className={dev.toolbar}>{POSES.map((p) => button(p, poseKind === p, () => setPoseKind(p)))}</div>
			<div className={dev.toolbar}>{FILLS.map((f, i) => button(f.label, fill === i, () => setFill(i)))}</div>
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
				Live: he builds a local hall from nothing (nothing is saved). Message and Speaking turn him to you; he turns back six
				seconds after Speaking is off. Set prefers-reduced-motion in devtools for still frames.
			</p>
			{phone ? <div className={dev.phone}>{world}</div> : world}
		</div>
	);
}
```

- [ ] **Step 3: check by eye.** Start the dev server (one only, from `.claude/launch.json`, port 3000; note a restart under Now on the main desk) and open `http://localhost:3000/dev/world`. Check: every pose draws (walking cycles, building kneels, turning ends facing with a face, facing breathes, resting sits on the bench); the Day, Dusk, Night and Dawn buttons and the slider move the sun (a dim heart at night, stars at night only); Hall 0%, 50%, 100% show the hall growing, with the faint next block; Building live lays a block about every 3 s; Message turns him and the camera steps in, and back after six quiet seconds; Speaking shows the line over his head and the heart brightens; each mood changes the sky, his scarf and his face (fear: attentive, boredom: tired and slower); Phone shows about 12 tiles across. Then check `next build` keeps it out of production in Task 14.

- [ ] **Step 4: check and commit.** `npx tsc --noEmit -p .` and `npm run lint` are clean.
```bash
git add app/dev/world/page.tsx app/dev/world/dev.module.css
git commit -m "feat(world): /dev/world shows every state, hour and stage of the hall (404 in production)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 13: Room wiring (A1 to A7)
**Model:** Sonnet.
**Files:** Modify `app/assistant.tsx` (A1 to A7 only), `app/assistant.module.css` (one block appended).

**Interfaces:**
- Consumes: `WORLD` (Task 1), `WorldStage`, `WorldControl` (Task 11).
- Produces: the world in the room behind both switches.

Before editing, put `app/assistant.tsx` under Now on `brain/desks/main.md` and push the desk. Anchors are text in the file at `6951fe7`; find each by its text, not by line number.

- [ ] **A1** Replace `import { SHELL2 } from "@/lib/shell/flag";` with:
```ts
import { SHELL2, WORLD } from "@/lib/shell/flag";
```
- [ ] **A2** After `import { useRouter } from "next/navigation";` add:
```ts
import dynamic from "next/dynamic";
```
and after `import { ShellPanels } from "@/components/osmo/shell-panels";` add:
```ts
import type { WorldControl } from "@/components/osmo/world";
```
- [ ] **A3** After the line `const font = Bricolage_Grotesque({ subsets: ["latin"], display: "swap" });` add:
```ts
// The village loads after first paint, and only behind both switches (lib/shell/flag.ts).
const WorldStage = dynamic(() => import("@/components/osmo/world").then((m) => m.WorldStage), { ssr: false });
```
- [ ] **A4** After `const shell = useShell(SHELL2, stageRef, ready);` add:
```ts
	// The village's control: the composer's focus and typing turn him to Gur (components/osmo/world.tsx).
	const worldRef = useRef<WorldControl | null>(null);
```
- [ ] **A5** In the stage `<div ref={stageRef} ...>` attributes, after `data-shell={SHELL2 ? "" : undefined}` add:
```tsx
			data-world={WORLD ? "" : undefined}
```
- [ ] **A6** Replace the aura block (the `<div className={styles.aura} aria-hidden="true">` element with its two orbs and the `Figure`, unchanged inside) with:
```tsx
			{WORLD ? (
				ready && (
					<WorldStage
						agent={agent}
						colorA={theme.colorA}
						colorB={theme.colorB}
						said={said}
						heard={heard}
						controlRef={worldRef}
						signals={{
							lines: messages.length,
							inTalk: voice.mode === "awake" || voice.mode === "thinking" || voice.mode === "speaking" || voice.mode === "followup",
							speaking: speaking !== null,
							thinking,
						}}
					/>
				)
			) : (
				<div className={styles.aura} aria-hidden="true">
					<span className={`${styles.orb} ${styles.orbA}`} />
					<span className={`${styles.orb} ${styles.orbB}`} />
					<Figure className={styles.figure} said={said} heard={heard} />
				</div>
			)}
```
- [ ] **A7** On the composer's `<input className={styles.field} ...>`: add `onFocus={() => worldRef.current?.attend()}` and change its `onChange` to:
```tsx
						onChange={(event) => {
							setInput(event.target.value);
							worldRef.current?.attend();
						}}
```
- [ ] **CSS** Append to `app/assistant.module.css`:
```css
/* ---------- The village (NEXT_PUBLIC_OSMO_WORLD, inside the v2 shell): components/osmo/world.tsx ---------- */
/* The header sits on the sky; a soft shadow keeps it crisp at the brightest hour. */
.stage[data-world] .head {
	text-shadow: 0 1px 3px rgb(0 0 0 / 0.55);
}
```
- [ ] **Check the diff.** `git diff app/assistant.tsx` shows only A1 to A7. With `WORLD` false nothing renders differently: the aura block is the same element, `data-world` is absent, and `worldRef.current` is null so `attend` is never called.
- [ ] **Run** `npx vitest run && npx tsc --noEmit -p . && npm run lint`.
- [ ] **Commit**, then move `app/assistant.tsx` to Just landed on the main desk and push the desk.
```bash
git add app/assistant.tsx app/assistant.module.css
git commit -m "feat(world): the village in the room behind NEXT_PUBLIC_OSMO_SHELL2 and NEXT_PUBLIC_OSMO_WORLD" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 14: The gate
**Model:** main agent (no implementer); a Sonnet reviewer may run the checks.
**Files:** `docs/migrations/village-phase-1.sql` (STATUS line only, after applying), the brain (`desks/main.md`, `project.md`).

- [ ] **Checks.** `npx vitest run` (all green), `npx tsc --noEmit -p .`, `npm run lint`, `npx next build --webpack`.
- [ ] **First load stays light (spec 6).** After the build, the room's own chunk must not carry the art: `grep -l "stone-bottom" .next/static/chunks/app/page-*.js` finds nothing, and `grep -rl "stone-bottom" .next/static/chunks` finds one lazily loaded chunk. Note the world chunk's size (spec 6 estimates about 35 KB of source).
- [ ] **The migration, with Gur's OK.** Ask Gur. With his yes, apply `docs/migrations/village-phase-1.sql` as migration `village_phase_1` (Supabase apply_migration), then verify read-only: `select grantee, privilege_type from information_schema.role_table_grants where table_name = 'village'` (authenticated: SELECT, INSERT, UPDATE, DELETE; anon: none), `select policyname, cmd from pg_policies where tablename = 'village'`, and that the trigger exists. Change the file's STATUS line to "applied on <date> as migration village_phase_1, with Gur's OK" and commit it by path.
- [ ] **Switch matrix (Gur sets the values in `.env.local`; ask him, never type them).** Restart the one dev server after each change and note it under Now.
  1. Both unset: the room is exactly as today (aura, heart in the middle, old header).
  2. `NEXT_PUBLIC_OSMO_SHELL2=on` only: the v2 shell as today, no world.
  3. Both on: the world fills the room behind the conversation; the rail stays on top; the header reads on the sky.
- [ ] **Hand check in the room (both on).** Read-only rules for Gur's signed-in session apply: do not send Osmo messages, click the mic, Lock, or edit memory; ask Gur to do the interactive parts and report.
  - Before the migration (if checked then): one console warning, no building, the room otherwise fine (Review Focus 2).
  - After: he builds; reload mid-hall resumes at the same block (within eight blocks of the last save, or exactly after a tab switch); hiding the tab saves.
  - Two tabs building, then the older one hidden last: the saved `laid` is the larger (Review Focus 3), checked with a read-only `select room, laid from village`.
  - Gur types: he turns, the camera steps in, his line shows over his head while the heart brightens; six quiet seconds after the reply he turns back and kneels again. Voice: the wake word turns him; he holds while the voice is in follow-up.
  - Reduced motion on: still frames that change only on a block or a turn; no zoom steps.
  - A phone width (375 px): about 12 tiles across, the bar below, the composer usable.
- [ ] **Production check.** `/dev/world` returns 404 from `npx next build --webpack` plus `npx next start` (or the next preview deploy).
- [ ] **Brain.** On `desks/main.md`: Just landed (the commits, the switch, the migration state, "not ready to ship" until Gur has seen it). In `project.md` under Interfaces: `components/osmo/world.tsx` `WorldControl.takeNews(): VillageNews | null` and `lib/world/progress.ts` `villageLine(news)`. Post the Ask to language: "Village phase 1 is on local main. For spec 4's lines: when the room delivers a reply, call `worldRef.current?.takeNews()` and, if it returns `{ room, event }`, set `TurnFacts.village` for the model (marked said for the session), or append `villageLine(news)` when the AI is off; the welcome line may mention the room in progress. The context line in a room is phase 2." Commit the brain by path and push it.
- [ ] **Never push `main`.** Pushing is the main agent's, with Gur's OK for that push, after the migration is live.

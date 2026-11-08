// The free-will look pass's pictures (I3 of docs/superpowers/plans/2026-10-11-osmo-free-will.md; spec 4.5, 4.6 and 8).
// With WORLD_SNAPSHOT_DIR set, every picture the pass judges by eye is written there as a PNG: the world's own drawWorld
// with the pixel painter, over the world's own sky (drawSky, as the sky canvas lies under the world's in the room). Each
// picture is one test that asserts only that it draws: no hashes, since the look may still change. Without
// WORLD_SNAPSHOT_DIR every picture is still drawn (about six seconds in all) and nothing is written.
import { describe, expect, it } from "vitest";
import { look, newActor, pose, type Actor } from "./actor";
import { cellsOf, START_X } from "./blueprints";
import { CASTLE_ROOMS, TILE, type Block } from "./blueprints/types";
import { CASTLE_RECIPES } from "./build/castle";
import { CASTLE_RECTS, castleAt, castleFootprint, castleRecipeId } from "./build/castle-sites";
import { compile } from "./build/compile";
import { PARTS } from "./build/parts";
import { RECIPES } from "./build/recipes";
import { checkBuild, ruleWorldOf } from "./build/rules";
import { builtRects, resumeBuilds } from "./build/state";
import type { BuildRow, Compiled, Recipe, Site } from "./build/types";
import { chooseVariation, vary } from "./build/variation";
import type { Camera, View } from "./camera";
import { drawLists } from "./engine/flow";
import { generateWorld } from "./map/generate";
import { DOCK_BLOCKS, DOCK_DECK, HOME_ISLAND, HOME_TOP, homePx, RIDE_FEET } from "./map/home";
import { columnOf, islandById, surfaceAt } from "./map/lookup";
import { uncovered } from "./map/scenery";
import { GEN, type Island, type WorldMap } from "./map/types";
import { pixelPainter } from "./pixel-painter";
import { fallbackLine, newRow, pickByCode, plan, type PlanDeps } from "./plan/planner";
import { sitesFor } from "./plan/sites";
import { snapshot } from "./png";
import { rasterize } from "./raster";
import { artFor, drawSky, drawWorld, type Art, type Painter, type WorldScene } from "./render";
import { skyAt, starField } from "./sky";
import { TILE_IDS, TILES } from "./tiles";
import { balloonPath, boardingOf, deckOf, landingOf, pathAt } from "./travel/travel";
import { BIG_BOUNDS, zoomSteps } from "./view/camera-big";

const SCARF = "hsl(172 38% 50%)"; // his scarf and the sky's first colour, as render.test.ts draws them
const SKY_B = "hsl(212 38% 50%)";
type Time = "day" | "night";
const TIMES: readonly Time[] = ["day", "night"];
const HOUR: Readonly<Record<Time, number>> = { day: 12, night: 0 };
const DARK: Readonly<Record<Time, number>> = { day: 0, night: 1 };
const ART: Readonly<Record<Time, Art>> = { day: artFor(SCARF, 0), night: artFor(SCARF, 1) };
const STARS = starField();
const SLOW = { timeout: 120_000 };

const cam = (x: number, y: number, z: number): Camera => ({ x, y, from: z, to: z, at: 0, aimX: x, aimY: y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY });
// Him standing (idle, facing east unless flip), walking, or in the balloon, his feet at (x, y) world px.
const standing = (x: number, y: number, flip = false) => ({ x, y, look: { ...look(newActor(x, 0, 12), 0, "warm"), flip } });
const walking = (x: number, y: number) => ({ x, y, look: look(pose("walking", x, 0), 0, "warm") });
const riding = (x: number, y: number) => {
	const a: Actor = { ...newActor(x, 0, 12), kind: "riding", y };
	return { x, y, look: look(a, 0, "warm") };
};

// The sky behind the world at a size and time, made once.
const SKIES = new Map<string, Uint8ClampedArray>();
function skyPixels(view: View, time: Time): Uint8ClampedArray {
	const key = `${view.w}x${view.h}|${time}`;
	const hit = SKIES.get(key);
	if (hit) return hit;
	const p = pixelPainter(view.w, view.h, ART[time]);
	drawSky(p, { sky: skyAt(SCARF, SKY_B, HOUR[time]), stars: STARS });
	SKIES.set(key, p.data);
	return p.data;
}
// Draw a scene over its sky at a time, until every chunk bitmap is baked (at most 40 frames), and write it as <name>.png.
// The painter's clear lays the sky instead of nothing, so the world blends over it as the canvases do in the room.
function shoot(name: string, scene: WorldScene, time: Time): number {
	const p = pixelPainter(scene.view.w, scene.view.h, ART[time]);
	const sky = skyPixels(scene.view, time);
	const onSky: Painter = { ...p, clear: () => p.data.set(sky) };
	const s: WorldScene = { ...scene, dark: DARK[time] };
	let r = drawWorld(onSky, s);
	for (let k = 1; k <= 40 && r.pending > 0; k++) r = drawWorld(onSky, { ...s, now: s.now + k });
	snapshot(name, { w: p.w, h: p.h, data: p.data });
	return r.pending;
}

// The flat fixture of lib/world/build/all-recipes.test.ts (and the dev page's recipe preview): island A, columns 100 to
// 299, top row 60; island B, columns 330 to 529, top row 66. Each a snow row over four rows of the generator's rock.
const FLAT = [
	{ id: 1, x0: 100, x1: 300, top: 60 },
	{ id: 2, x0: 330, x1: 530, top: 66 },
] as const;
function flatIsland(i: { id: number; x0: number; x1: number; top: number }): { island: Island; blocks: Block[] } {
	const w = i.x1 - i.x0;
	const blocks: Block[] = [];
	for (let c = 0; c < w; c++) {
		const left = c === 0;
		const right = c === w - 1;
		blocks.push({ x: i.x0 + c, y: i.top, tile: left ? "snow-edge-l" : right ? "snow-edge-r" : "snow", layer: "ground" });
		for (let r = 1; r <= 4; r++) {
			const tile =
				r === 4 ? (left ? "stone-under-l" : right ? "stone-under-r" : "stone-bottom")
				: left ? "stone-edge-l"
				: right ? "stone-edge-r"
				: r <= 2 ? "stone"
				: "stone-dark";
			blocks.push({ x: i.x0 + c, y: i.top + r, tile, layer: "ground" });
		}
	}
	return { island: { id: i.id, x0: i.x0, x1: i.x1, ground: i.top, top: Array.from({ length: w }, () => i.top), home: false }, blocks };
}
const FIXTURE: WorldMap = (() => {
	const [a, b] = FLAT.map(flatIsland);
	return { seed: 0, gen: GEN, islands: [a.island, b.island], ground: [...a.blocks, ...b.blocks] };
})();
const siteFor = (r: Recipe): Site =>
	r.site === "bridge" ? { kind: "bridge", from: 1, to: 2, a: { x: FLAT[0].x1 - 1, y: FLAT[0].top }, b: { x: FLAT[1].x0, y: FLAT[1].top } }
	: r.site === "cliff" ? { kind: "ground", island: 1, x: FLAT[0].x0 + 1, w: 60, ground: FLAT[0].top, cliff: "left" }
	: { kind: "ground", island: 1, x: FLAT[0].x0 + 20, w: 60, ground: FLAT[0].top, cliff: null };

// A view round a build at a zoom: tiles of margin on each side (left, top, right, bottom).
function around(c: Pick<Compiled, "x" | "y" | "w" | "h">, z: number, m: { l: number; t: number; r: number; b: number }): { camera: Camera; view: View } {
	const x0 = c.x - m.l;
	const y0 = c.y - m.t;
	const w = c.w + m.l + m.r;
	const h = c.h + m.t + m.b;
	return { camera: cam((x0 + w / 2) * TILE, (y0 + h / 2) * TILE, z), view: { w: w * TILE * z, h: h * TILE * z } };
}

// The castle finished, as six saved rows (as lib/world/plan/seam.test.ts and the dev page's planner panel make it).
const DONE = "2026-10-01T00:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(DONE) + minutes * 60_000).toISOString();
function castleRows(): BuildRow[] {
	return CASTLE_ROOMS.map((room) => {
		const place = castleAt(room);
		const footprint = castleFootprint(room);
		const total = cellsOf(footprint, place.x, place.y, castleRecipeId(room)).length;
		return { id: `castle-${room}`, recipe: castleRecipeId(room), params: {}, island: 0, ...place, footprint, total, laid: total, reason: null, started_at: DONE, finished_at: DONE };
	});
}
const depsFor = (map: WorldMap): PlanDeps => ({ compile, check: checkBuild, choose: chooseVariation, vary, world: (taken) => ruleWorldOf(map, taken, [DOCK_DECK]) });
// The world of a seed with four islands, the castle finished and up to `count` free builds the planner placed itself, one
// after another, code picking each (as the dev page's planner panel does, and as the engine plans: the castle's rects
// blocked, the dock's boards as land); each finished.
function plannedWorld(seed: number, count: number): { map: WorldMap; rows: BuildRow[]; picked: string[] } {
	const map = generateWorld(seed, GEN, 4);
	const deps = depsFor(map);
	const him = { island: 0, x: columnOf(homePx(START_X)) };
	const rows = castleRows();
	const picked: string[] = [];
	for (let n = 0; n < count; n++) {
		const cands = plan({ seed, n, map, rows, recipes: RECIPES, parts: PARTS, mood: "calm", him, blocked: CASTLE_RECTS }, deps);
		if (cands.length === 0) break;
		const c = cands[pickByCode(cands, seed, n)];
		const row = newRow(c, fallbackLine(c));
		rows.push({ ...row, id: `look-${n}`, laid: row.total, started_at: at(n + 1), finished_at: at(n + 1) });
		picked.push(`${c.recipe.id}@${c.site.kind === "ground" ? `${c.site.island}:${c.compiled.x}` : `${c.site.a.x}-${c.site.b.x}`}`);
	}
	return { map, rows, picked };
}
// What the room draws of a world and its rows in builds mode (lib/world/engine/big.ts): the map without the scenery under
// the builds, with the dock; every laid block; a light for each finished build.
function drawn(map: WorldMap, rows: readonly BuildRow[]): { ground: Block[]; laid: Block[]; lights: { x: number; y: number }[] } {
	const builds = resumeBuilds(rows, CASTLE_ROOMS, DONE);
	const lists = drawLists(builds);
	return { ground: [...uncovered(map, builtRects(builds)), ...DOCK_BLOCKS], laid: lists.laid, lights: lists.lights };
}
const ANCHOR = { x: homePx(START_X), groundY: HOME_TOP * TILE };

describe("the twenty seed recipes at seeds 0, 1 and 2, at zoom 3, by day and at night", () => {
	const cases = RECIPES.flatMap((r) => [0, 1, 2].flatMap((seed) => TIMES.map((time) => [r.id, seed, time, r] as const)));
	it.each(cases)("%s, seed %i, %s", (id, seed, time, r) => {
		const site = siteFor(r);
		const c = compile(r, chooseVariation(r, PARTS, seed), site, PARTS);
		const { camera, view } = around(c, 3, { l: 2, t: 2, r: 4, b: 5 });
		const feet = (site.kind === "ground" ? site.ground : FLAT[1].top) * TILE;
		const scene: WorldScene = {
			camera, view, now: 0, clock: 0, ground: FIXTURE.ground, laid: cellsOf(c.footprint, c.x, c.y, c.recipe), ghost: null, outline: [],
			him: standing((c.x + c.w + 1.5) * TILE, feet, true),
		};
		expect(() => shoot(`recipe-${id}-${seed}-${time}`, scene, time)).not.toThrow();
	}, SLOW.timeout);
});

describe("the castle's six rooms, compiled, on the home island at zoom 3", () => {
	const home = generateWorld(0, GEN, 1);
	const site: Site = { kind: "ground", island: 0, x: HOME_ISLAND.x0, w: HOME_ISLAND.x1 - HOME_ISLAND.x0, ground: HOME_TOP, cliff: null };
	it.each(CASTLE_RECIPES.map((r) => [r.id, r] as const))("%s", (id, r) => {
		const c = compile(r, chooseVariation(r, PARTS, 0), site, PARTS);
		const { camera, view } = around(c, 3, { l: 2, t: 2, r: 2, b: 5 });
		const scene: WorldScene = {
			camera, view, now: 0, clock: 0, ground: home.ground, laid: cellsOf(c.footprint, c.x, c.y, c.recipe), ghost: null, outline: [],
			him: standing(-100_000, HOME_TOP * TILE),
		};
		expect(() => shoot(`castle-${id.replace(":", "-")}`, scene, "day")).not.toThrow();
	}, SLOW.timeout);
});

describe("the big world: seed 7, four islands, the castle finished and a dozen planned builds, at 960 by 540", () => {
	const VIEW: View = { w: 960, h: 540 };
	const world = plannedWorld(7, 12);
	const lists = drawn(world.map, world.rows);
	// He stands among his builds: on the island holding the most of them, at their middle.
	const frees = world.rows.filter((r) => !r.recipe.startsWith("castle:") && r.recipe !== "rope-bridge");
	const counts = new Map<number, number>();
	for (const r of frees) counts.set(r.island, (counts.get(r.island) ?? 0) + 1);
	const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
	const mine = frees.filter((r) => r.island === busiest);
	const midCol = Math.round(mine.reduce((n, r) => n + r.x + (r.footprint.map[0]?.length ?? 0) / 2, 0) / Math.max(1, mine.length));
	const himX = (midCol + 0.5) * TILE;
	const himY = (surfaceAt(world.map, midCol) ?? HOME_TOP) * TILE;
	const scene = (z: number, x: number, y: number, feet: { x: number; y: number }, time: Time): WorldScene => ({
		camera: cam(x, y, z), view: VIEW, now: 0, clock: 0, ground: lists.ground, laid: lists.laid, ghost: null, outline: [],
		him: standing(feet.x, feet.y), sky: skyAt(SCARF, SKY_B, HOUR[time]), anchor: ANCHOR, lights: lists.lights,
		balloon: boardingOf(islandById(world.map, busiest) ?? HOME_ISLAND, HOME_ISLAND),
	});
	const steps = zoomSteps(VIEW.w, BIG_BOUNDS);
	const cases = steps.flatMap((z, i) => TIMES.map((time) => [i, z, time] as const));
	it("has builds the planner placed", () => {
		expect(world.picked.length).toBeGreaterThan(0);
	});
	it.each(cases)("step %i (zoom %f), %s, round him among his builds", (i, z, time) => {
		// The camera centres a little above his feet, clamped inside the world as the big camera clamps it.
		const half = { w: VIEW.w / 2 / z, h: VIEW.h / 2 / z };
		const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
		const x = clamp(himX, half.w, BIG_BOUNDS.w - half.w);
		const y = clamp(himY - 40, half.h, BIG_BOUNDS.h - half.h);
		expect(() => shoot(`big-${i}-${String(Math.round(z * 1000))}-${time}`, scene(z, x, y, { x: himX, y: himY }, time), time)).not.toThrow();
	}, SLOW.timeout);
	it.each(TIMES)("home at zoom 1 and 2, %s: the castle, the dock and the moored balloon", (time) => {
		const feet = { x: homePx(START_X), y: HOME_TOP * TILE };
		const home = { ...scene(1, (477 + 0.5) * TILE, HOME_TOP * TILE - 120, feet, time), balloon: boardingOf(HOME_ISLAND, HOME_ISLAND) };
		expect(() => shoot(`big-home-1-${time}`, home, time)).not.toThrow();
		const east = { ...home, camera: cam(496 * TILE, HOME_TOP * TILE - 60, 2) };
		expect(() => shoot(`big-home-2-${time}`, east, time)).not.toThrow();
	}, SLOW.timeout);
});

describe("the balloon (seed 7): at the dock, in flight and landed", () => {
	const map = generateWorld(7, GEN, 4);
	const lists = drawn(map, castleRows());
	const east = [...map.islands].filter((i) => !i.home && i.x0 > HOME_ISLAND.x1).sort((a, b) => a.x0 - b.x0)[0] ?? map.islands[1];
	const from = boardingOf(HOME_ISLAND, HOME_ISLAND);
	const to = landingOf(east, HOME_ISLAND);
	const path = balloonPath(from, to);
	const base = (x: number, y: number, z: number, view: View, time: Time = "day"): WorldScene => ({
		camera: cam(x, y, z), view, now: 0, clock: 0, ground: lists.ground, laid: lists.laid, ghost: null, outline: [],
		him: standing(-100_000, 0), sky: skyAt(SCARF, SKY_B, HOUR[time]), anchor: ANCHOR, lights: lists.lights,
	});
	const V: View = { w: 720, h: 480 };
	it.each(TIMES)("boarding at the dock, %s: he rides from the far board", (time) => {
		// While he rides, the basket's bottom is RIDE_FEET under his feet (lib/world/engine/big.ts balloonNow).
		const s = { ...base(from.x - 40, from.y - 50, 3, V, time), him: riding(from.x, from.y), balloon: { x: from.x, y: from.y - RIDE_FEET } };
		expect(() => shoot(`balloon-dock-${time}`, s, time)).not.toThrow();
	}, SLOW.timeout);
	it("moored at the dock while he stands by the castle", () => {
		const s = { ...base(from.x - 40, from.y - 50, 3, V), him: standing(from.x - 6 * TILE, from.y), balloon: from };
		expect(() => shoot("balloon-moored", s, "day")).not.toThrow();
	}, SLOW.timeout);
	it("in flight, half way, at zoom 2 and at zoom 1/2", () => {
		const p = pathAt(path, path.ms / 2);
		const s = { ...base(p.x, p.y - 40, 2, { w: 960, h: 540 }), him: riding(p.x, p.y), balloon: { x: p.x, y: p.y - RIDE_FEET } };
		expect(() => shoot("balloon-flight", s, "day")).not.toThrow();
		expect(() => shoot("balloon-flight-half", { ...s, camera: cam(p.x, p.y, 0.5) }, "day")).not.toThrow();
	}, SLOW.timeout);
	it("landed on the east island: he stands in the basket, moored at the landing spot", () => {
		const s = { ...base(to.x + 40, to.y - 50, 3, V), him: standing(to.x, to.y), balloon: boardingOf(east, HOME_ISLAND) };
		expect(() => shoot("balloon-landed", s, "day")).not.toThrow();
	}, SLOW.timeout);
});

describe("rope bridges, finished, at zoom 2", () => {
	const bridge = RECIPES.find((r) => r.id === "rope-bridge");
	type BridgeSite = Extract<Site, { kind: "bridge" }>;
	// The first bridge site the test wants in a seed's world (four islands, the castle finished), from seed 0 on.
	const find = (want: (s: BridgeSite) => boolean): { seed: number; map: WorldMap; site: BridgeSite } => {
		for (let seed = 0; bridge && seed < 200; seed++) {
			const map = generateWorld(seed, GEN, 4);
			for (const s of sitesFor(bridge, map, castleRows(), { island: 0, x: 477 }, CASTLE_RECTS)) if (s.kind === "bridge" && want(s)) return { seed, map, site: s };
		}
		throw new Error("no such bridge site");
	};
	const shot = (name: string, f: ReturnType<typeof find>, onIt: boolean, time: Time, z = 2) => {
		if (!bridge) throw new Error("no rope bridge recipe");
		const c = compile(bridge, chooseVariation(bridge, PARTS, f.seed), f.site, PARTS);
		const blocks = cellsOf(c.footprint, c.x, c.y, c.recipe);
		const lists = drawn(f.map, castleRows());
		const deck = deckOf(blocks, f.site.from, f.site.to);
		const mid = Math.floor((deck.x0 + deck.x1) / 2);
		const him = onIt ? walking((mid + 0.5) * TILE, deck.rows[mid - deck.x0] * TILE) : standing((f.site.a.x - 3 + 0.5) * TILE, f.site.a.y * TILE);
		const { camera, view } = around(c, z, { l: 6, t: 6, r: 6, b: 6 });
		const scene: WorldScene = {
			camera, view, now: 0, clock: 0, ground: lists.ground, laid: [...lists.laid, ...blocks], ghost: null, outline: [], him,
			sky: skyAt(SCARF, SKY_B, HOUR[time]), anchor: ANCHOR, lights: lists.lights,
		};
		return shoot(name, scene, time);
	};
	it.each(TIMES)("between two islands, him half way across, %s", (time) => {
		const f = find((s) => s.a.x !== 509 && s.b.x !== HOME_ISLAND.x0);
		expect(() => shot(`bridge-across-${time}`, f, true, time)).not.toThrow();
	}, SLOW.timeout);
	// The hand checks: at 1/2 (the chunk bitmaps, drawn at half scale) the handrail read as gone, the deck as a plank stair.
	it.each(TIMES)("between two islands, him half way across, at zoom 1 and 1/2, %s", (time) => {
		const f = find((s) => s.a.x !== 509 && s.b.x !== HOME_ISLAND.x0);
		expect(() => shot(`bridge-across-1-${time}`, f, true, time, 1)).not.toThrow();
		expect(() => shot(`bridge-across-half-${time}`, f, true, time, 0.5)).not.toThrow();
	}, SLOW.timeout);
	it.each(TIMES)("east of home from the dock's far board, %s", (time) => {
		const f = find((s) => s.a.x === 509);
		expect(() => shot(`bridge-dock-${time}`, f, false, time)).not.toThrow();
	}, SLOW.timeout);
});

describe("the tiles", () => {
	// Every tile at scale 4 on the sky's horizon colour, twelve to a row: today's 71 first, then the 35 new ones from a new row.
	it.each(TIMES)("a contact sheet, %s", (time) => {
		const S = 4;
		const GAP = 8;
		const COLS = 12;
		const OLD = 71;
		const cell = 16 * S + GAP;
		const oldRows = Math.ceil(OLD / COLS);
		const rows = oldRows + Math.ceil((TILE_IDS.length - OLD) / COLS);
		const w = COLS * cell + GAP;
		const h = rows * cell + GAP;
		const sky = skyPixels({ w: 4, h: 4 }, time);
		const bg = sky.slice(12 * 4, 12 * 4 + 3); // the bottom left pixel: the horizon
		const data = new Uint8ClampedArray(w * h * 4);
		for (let i = 0; i < w * h; i++) data.set([bg[0], bg[1], bg[2], 255], i * 4);
		TILE_IDS.forEach((id, n) => {
			const k = n < OLD ? n : oldRows * COLS + (n - OLD);
			const bmp = rasterize([TILES[id]], 16, 16, S, ART[time].colours);
			const ox = GAP + (k % COLS) * cell;
			const oy = GAP + Math.floor(k / COLS) * cell;
			for (let y = 0; y < bmp.h; y++) {
				for (let x = 0; x < bmp.w; x++) {
					const s = (y * bmp.w + x) * 4;
					const a = bmp.data[s + 3] / 255;
					const o = ((oy + y) * w + ox + x) * 4;
					for (let j = 0; j < 3; j++) data[o + j] = Math.round(bmp.data[s + j] * a + data[o + j] * (1 - a));
				}
			}
		});
		expect(() => snapshot(`tiles-sheet-${time}`, { w, h, data })).not.toThrow();
	}, SLOW.timeout);
});


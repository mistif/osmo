import { describe, expect, it } from "vitest";
import { look, newActor } from "./actor";
import { blocksOf, START_X } from "./blueprints";
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { HALL } from "./blueprints/hall";
import { ISLAND } from "./blueprints/island";
import { CASTLE_ROOMS, GROUND_Y, TILE, type Block } from "./blueprints/types";
import { newCamera, toScreen, zoomAt, type Camera, type View } from "./camera";
import { chunkCache } from "./chunks";
import { CHUNK_KEEP, CHUNK_PX } from "./lod";
import { BALLOON_BASKET, BALLOON_ENVELOPE, homeGround, shiftBlocks } from "./map/home";
import { PALETTE } from "./palette";
import { hashPixels, pixelPainter } from "./pixel-painter";
import { snapshot } from "./png";
import { colours, parseColor } from "./raster";
import {
	ATLAS_MAX, artFor, BAKE_BUDGET, CELL, drawSky, drawWorld, GHOST_ALPHA, HAZE, OUTLINE_ALPHA, sheetBitmap, type Painter, type Sheet, type WorldScene,
} from "./render";
import { BIRD_CELL, CLOUD_CELL, CLOUD_GRIDS, FAR_ISLANDS, HILLS } from "./backdrop";
import { hslCss, skyAt, starField, twinkle } from "./sky";
import { poolsOf, shadowed, SHADOW_ALPHA, variantOf } from "./texture";
import { TILE_IDS, TILES, tileIndex } from "./tiles";
import { birdsAt, dustAt, lifeAt, MAX_PARTICLES, NO_LIFE, smokeAt, snowAt, type Life } from "./life";
import { pose } from "./actor";
import { TRAIL_AT, TRAIL_W } from "./osmo-sprite";

const art = artFor("hsl(172 38% 50%)");
const VIEW = { w: 320, h: 200 };
const hall = blocksOf(HALL);
// He stands at x 512; the camera starts on him: world x 432 to 592 and y 324 to 424 are on screen at zoom 2.
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
		expect([sheetBitmap(art, "tiles", 2).w, sheetBitmap(art, "tiles", 2).h]).toEqual([TILE_IDS.length * 32, 32]);
		expect([sheetBitmap(art, "clouds", 1).w, sheetBitmap(art, "clouds", 1).h]).toEqual([CLOUD_GRIDS.length * CLOUD_CELL.w, CLOUD_CELL.h]);
		expect([sheetBitmap(art, "sprite", 3).w, sheetBitmap(art, "sprite", 3).h]).toEqual([18 * 48, 96]);
		expect([sheetBitmap(art, "trail", 2).w, sheetBitmap(art, "trail", 2).h]).toEqual([2 * 16, 12]);
		expect([sheetBitmap(art, "birds", 1).w, sheetBitmap(art, "birds", 1).h]).toEqual([2 * BIRD_CELL.w, BIRD_CELL.h]);
		expect([sheetBitmap(art, "faces", 2).w, sheetBitmap(art, "faces", 2).h]).toEqual([12 * 16, 8]); // nine faces, three blinks
	});
});

describe("the world", () => {
	it("draws the hall at 40 blocks to the same pixels every time", () => {
		const p = paint(scene(40));
		snapshot("world-40", p);
		expect(hashPixels(p.data)).toBe(hashPixels(paint(scene(40)).data));
		expect(hashPixels(p.data)).toMatchInlineSnapshot(`"5598240d"`);
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
	it("draws the island's snow under his feet", () => {
		// His feet stand on screen y 184, the top edge of the snow row (row 26); its first four pixel rows are snow at scale 2.
		const rows = { x0: 40, x1: 280, y0: 184, y1: 192 };
		const snow = (["n", "o", "p"] as const).map((l) => rgb(l).join());
		const withIsland = paint(scene(40)).data;
		// Since the look pass a near cloud drifts behind the island here, so rather than "nothing else paints these rows" the
		// test is that each pixel is exactly the snow tile's own pixel at that spot.
		const s = scene(40);
		const cols = colours();
		for (let y = rows.y0; y < rows.y1; y++) {
			for (let x = rows.x0; x < rows.x1; x++) {
				const wx = Math.floor((x - VIEW.w / 2) / 2 + s.camera.x);
				const block = s.ground.find((b) => b.y === GROUND_Y && b.x === Math.floor(wx / TILE));
				expect(block?.tile, `${x},${y}`).toBe("snow");
				// Since the polish pass a snow cell may show a variant (texture.ts); its top rows are snow as well.
				const letter = TILES[variantOf("snow", Math.floor(wx / TILE), GROUND_Y)][(y - rows.y0) >> 1][wx % TILE];
				expect(px(withIsland, x, y), `the island's snow at ${x},${y}`).toEqual([...cols[letter]]);
				const [r, g, b, a] = px(withIsland, x, y);
				expect(a, `${x},${y}`).toBe(255);
				expect(snow, `${x},${y}`).toContain([r, g, b].join());
			}
		}
	});
	it("leaves the sky transparent where nothing is built yet", () => {
		expect(px(paint(scene(40)).data, 16, 12)[3]).toBe(0); // world (440, 350): row 21 is not laid at 40
	});
	it("draws him standing on the ground line", { timeout: 20_000 }, () => {
		// His sprite is at screen x 144 to 175 and ends at y 183, just above the snow row at 184. His coat is navy (K, L, M),
		// a colour nothing else in the scene uses, so it shows only where he is drawn.
		const coat = (["K", "L", "M"] as const).map((l) => rgb(l).join());
		const withHim = paint(scene(40)).data;
		const s = scene(40);
		const without = paint({ ...s, him: { ...s.him, x: -1000 } }).data;
		let coats = 0;
		let lowest = -1;
		for (let y = 0; y < VIEW.h; y++) {
			for (let x = 0; x < VIEW.w; x++) {
				const [r, g, b] = px(without, x, y);
				expect(coat, `the coat colour appears without him at ${x},${y}`).not.toContain([r, g, b].join());
				if (px(withHim, x, y).join() === px(without, x, y).join()) continue;
				lowest = Math.max(lowest, y);
				const [wr, wg, wb] = px(withHim, x, y);
				if (coat.includes([wr, wg, wb].join())) coats++;
			}
		}
		expect(coats).toBeGreaterThan(100);
		expect(lowest).toBe(183);
	});
	it("after dark lights the windows and lays a warm glow round the lamps, which daylight does not", () => {
		const done = scene(hall.length);
		const lantern = done.laid.find((b) => b.tile === "lantern");
		expect(lantern).toBeDefined();
		if (!lantern) return;
		const c = toScreen(done.camera, VIEW, 0, lantern.x * TILE + 8, lantern.y * TILE + 8);
		const near = { x: c.x - 30, y: c.y - 6 }; // beside the lantern, on the wall, inside the glow
		const bright = (d: Uint8ClampedArray) => px(d, near.x, near.y).slice(0, 3).reduce((a, b) => a + b, 0);
		const night = pixelPainter(VIEW.w, VIEW.h, artFor("hsl(172 38% 50%)", 1));
		drawWorld(night, { ...done, dark: 1 });
		const unlit = pixelPainter(VIEW.w, VIEW.h, artFor("hsl(172 38% 50%)", 1));
		drawWorld(unlit, { ...done, dark: 0 });
		expect(bright(night.data)).toBeGreaterThan(bright(unlit.data) + 20);
	});
	it("draws the far islands only when given the sky, behind everything", () => {
		const s = { ...scene(40), sky: skyAt("hsl(172 38% 50%)", "hsl(212 38% 50%)", 12) };
		const wide = { w: 640, h: 400 };
		const draw = (sc: WorldScene) => {
			const p = pixelPainter(wide.w, wide.h, art);
			drawWorld(p, { ...sc, view: wide, camera: newCamera(sc.him.x, wide, 1) });
			return p.data;
		};
		let differ = 0;
		const a = draw(s);
		const b = draw({ ...s, sky: undefined });
		for (let i = 0; i < a.length; i += 4) if (a[i + 3] !== b[i + 3]) differ++;
		expect(differ).toBeGreaterThan(500);
	});
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
		expect(() => drawWorld(pixelPainter(0, 0, art), { ...scene(40), view: { w: 0, h: 0 } })).not.toThrow();
	});
});

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

// The big-world fixture (fakes, not T1's generator; today's 71 tiles only): home and the whole castle at the offset,
// island A (columns 300 to 419, top row 70, 12 rows of stone) with twenty small pines, and island B (560 to 699, top 100).
const slab = (x0: number, w: number, top: number, depth: number): Block[] => {
	const out: Block[] = [];
	for (let c = 0; c < w; c++) {
		out.push({ x: x0 + c, y: top, tile: c === 0 ? "snow-edge-l" : c === w - 1 ? "snow-edge-r" : "snow", layer: "ground" });
		for (let r = 1; r <= depth; r++) out.push({ x: x0 + c, y: top + r, tile: r <= 2 ? "stone" : "stone-dark", layer: "ground" });
	}
	return out;
};
const pines = (x0: number, top: number): Block[] =>
	Array.from({ length: 20 }, (_, i) => x0 + 4 + i * 5).flatMap((x): Block[] => [
		{ x, y: top - 1, tile: "trunk-base", layer: "ground" },
		{ x, y: top - 2, tile: "pine-small", layer: "ground" },
		{ x, y: top - 3, tile: "pine-tip", layer: "ground" },
	]);
const BIG_GROUND: Block[] = [...homeGround(), ...slab(300, 120, 70, 12), ...pines(300, 70), ...slab(560, 140, 100, 14)];
const BIG_LAID: Block[] = CASTLE_ROOMS.flatMap((room) => shiftBlocks(CASTLE_BLOCKS[room], 445, 60));
// The densest view (ruling 8): land 40 rows deep under the whole of a 1920 by 1080 view at zoom 1, and three castles'
// worth of builds standing on it (the castle's snow row, 26, moved to 70).
const DENSE_GROUND: Block[] = slab(380, 200, 70, 40);
const DENSE_LAID: Block[] = [382, 442, 502].flatMap((dx) => CASTLE_ROOMS.flatMap((room) => shiftBlocks(CASTLE_BLOCKS[room], dx, 44)));
const cam = (x: number, y: number, z: number): Camera => ({ x, y, from: z, to: z, at: 0, aimX: x, aimY: y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY });
const HOME = { x: 7640, y: 86 * TILE };
const bigScene = (z: number, view: View, over: Partial<WorldScene> = {}): WorldScene => ({
	camera: cam(HOME.x, HOME.y - 120, z), view, now: 0, clock: 0, ground: BIG_GROUND, laid: BIG_LAID, ghost: null, outline: [],
	him: { x: HOME.x, y: HOME.y, look: look(newActor(HOME.x, 0, 12), 0, "warm") }, anchor: { x: HOME.x, groundY: HOME.y }, ...over,
});
const dense = (z: number, view: View, over: Partial<WorldScene> = {}): WorldScene =>
	bigScene(z, view, { ground: DENSE_GROUND, laid: DENSE_LAID, camera: cam(480 * TILE, 78 * TILE, z), anchor: { x: 480 * TILE, groundY: 70 * TILE }, ...over });
// Draw a scene until the bake budget has caught up (no chunk pending), at most 30 frames; the last frame's result.
const settle = (p: Painter, s: WorldScene) => {
	let r = drawWorld(p, s);
	for (let k = 1; k <= 30 && r.pending > 0; k++) r = drawWorld(p, { ...s, now: s.now + k });
	return r;
};
// A painter that passes every call on and records it.
type Call = { kind: string; sheet?: string; cell?: number; color?: string; x?: number; y?: number; scale?: number };
const recording = (p: Painter) => {
	const log: Call[] = [];
	const counted: Painter = {
		get w() {
			return p.w;
		},
		get h() {
			return p.h;
		},
		get chunkKeep() {
			return p.chunkKeep;
		},
		get clock() {
			return p.clock;
		},
		clear: () => (log.push({ kind: "clear" }), p.clear()),
		gradient: (...a) => (log.push({ kind: "gradient" }), p.gradient(...a)),
		rect: (x, y, w, h, color, alpha) => (log.push({ kind: "rect", color, x, y }), p.rect(x, y, w, h, color, alpha)),
		stamp: (sheet, cell, ...a) => (log.push({ kind: "stamp", sheet, cell, x: a[0], y: a[1], scale: a[2] }), p.stamp(sheet, cell, ...a)),
		glow: (...a) => (log.push({ kind: "glow" }), p.glow(...a)),
		pool: (...a) => (log.push({ kind: "pool" }), p.pool(...a)),
		shape: (...a) => (log.push({ kind: "shape" }), p.shape(...a)),
		chunk: (...a) => (log.push({ kind: "chunk" }), p.chunk(...a)),
	};
	return { counted, log };
};
// A painter that draws nothing and counts (the budgets: fast at any size): n, the calls to the screen; inner, what the
// bakes stamp; stats, the chunk cache's, the same chunkCache the real painters keep their bitmaps in.
const budgetPainter = (w: number, h: number, keep: number = CHUNK_KEEP.desk) => {
	const count = { n: 0, inner: 0 };
	const inner: Painter = {
		w: CHUNK_PX, h: CHUNK_PX, clear() {}, gradient() {}, glow() {}, pool() {}, shape() {},
		rect: () => void count.inner++,
		stamp: () => void count.inner++,
		chunk: () => "missing",
	};
	const cache = chunkCache(keep, () => inner, () => {});
	const p: Painter = {
		w, h, chunkKeep: keep,
		clear: () => void count.n++,
		gradient: () => void count.n++,
		rect: () => void count.n++,
		stamp: () => void count.n++,
		glow: () => void count.n++,
		pool: () => void count.n++,
		shape: () => void count.n++,
		chunk: (key, version, bake, x, y, cw, ch, mayBake = true) => {
			void [x, y, cw, ch];
			count.n++;
			return cache.get(key, version, mayBake, bake)?.state ?? "missing";
		},
		release: () => cache.release(),
	};
	return { p, count, stats: cache.stats };
};

describe("the big world (free-will spec 3.3)", () => {
	const V = { w: 480, h: 270 };
	it("draws the far islands behind the big world but not home's hills and haze, which would make a horizon across its sky", () => {
		const shapes = (scene: WorldScene) => {
			const seen: unknown[] = [];
			const p = pixelPainter(V.w, V.h, art);
			drawWorld({ ...p, shape: (...a: Parameters<Painter["shape"]>) => (seen.push(a[0]), p.shape(...a)) }, scene);
			return seen;
		};
		const sky = skyAt("hsl(172 38% 50%)", "hsl(212 38% 50%)", 12);
		// The camera on the ground line, where the hills would stand.
		const big = shapes(bigScene(1, V, { sky, camera: cam(HOME.x, HOME.y + 20, 1) }));
		expect(big.some((f) => (FAR_ISLANDS as readonly unknown[]).includes(f))).toBe(true);
		expect(big).not.toContain(HILLS);
		expect(shapes({ ...scene(40), sky })).toContain(HILLS); // the small world keeps them
	});
	it("walks only the chunks on screen: after the first frame a frame reads no block from the lists themselves", () => {
		let reads = 0;
		const watch = (list: Block[]): Block[] =>
			new Proxy(list, {
				get(t, k, r) {
					if (typeof k === "string" && /^\d+$/.test(k)) reads++;
					return Reflect.get(t, k, r);
				},
			});
		const s = bigScene(2, V, { ground: watch([...BIG_GROUND]), laid: watch([...BIG_LAID]) });
		const p = pixelPainter(V.w, V.h, art);
		drawWorld(p, s);
		reads = 0;
		drawWorld(p, { ...s, now: 1 });
		expect(reads).toBe(0);
	});
	it("bakes each chunk once, again when a block lands in it or the lamps light, and not otherwise", () => {
		const p = pixelPainter(V.w, V.h, art);
		const s = bigScene(0.5, V);
		expect(settle(p, s).pending).toBe(0);
		const first = p.chunks.baked;
		expect(first).toBeGreaterThan(0);
		drawWorld(p, { ...s, now: 50 });
		expect(p.chunks.baked).toBe(first);
		const laid = [...BIG_LAID, { x: 470, y: 70, tile: "brick", layer: "walls" } as Block];
		drawWorld(p, { ...s, laid });
		expect(p.chunks.baked).toBe(first + 1);
		drawWorld(p, { ...s, laid, dark: 0.6 });
		expect(p.chunks.baked).toBeGreaterThan(first + 1);
	});
	it("bakes at most four chunks a frame, with the silhouette under the ones still to come", () => {
		const { p, stats } = budgetPainter(1920, 1080);
		const { counted, log } = recording(p);
		const r = drawWorld(counted, bigScene(0.25, { w: 1920, h: 1080 }));
		expect(stats.baked).toBe(4);
		expect(r.pending).toBeGreaterThan(0);
		expect(log.filter((c) => c.kind === "shape")).toHaveLength(1);
	});
	// A budget painter with a clock that a bake advances by `ms` (a fake: the bakes cost nothing here).
	const timed = (ms: number) => {
		const { p, stats } = budgetPainter(1920, 1080);
		let t = 0;
		const painter: Painter = {
			...p, clock: () => t,
			chunk: (...a) => {
				const got = p.chunk(...a);
				if (got === "baked") t += ms;
				return got;
			},
		};
		return { painter, stats };
	};
	it.each([[1.5, 3], [3, 2], [10, 1], [0, 4]])("stops baking once a frame's bakes have taken 4 ms by the painter's clock: at %f ms a bake, %i of them", (ms, baked) => {
		const { painter, stats } = timed(ms);
		const { counted, log } = recording(painter);
		const r = drawWorld(counted, bigScene(0.25, { w: 1920, h: 1080 }));
		expect(stats.baked).toBe(baked);
		expect(r.pending).toBeGreaterThan(0);
		expect(log.filter((c) => c.kind === "shape")).toHaveLength(1); // the silhouette under the chunks still to come
	});
	it("fills a zoom out in over a few frames when each bake is slow, and then bakes nothing more", () => {
		const { painter, stats } = timed(10);
		const s = bigScene(0.25, { w: 1920, h: 1080 });
		let frames = 1;
		let r = drawWorld(painter, s);
		for (; r.pending > 0 && frames < 200; frames++) {
			const before = stats.baked;
			r = drawWorld(painter, { ...s, now: frames });
			expect(stats.baked - before).toBe(1);
		}
		expect(r.pending).toBe(0);
		expect(frames).toBeGreaterThan(BAKE_BUDGET);
		const done = stats.baked;
		drawWorld(painter, { ...s, now: 999 });
		expect(stats.baked).toBe(done);
	});
	it("bakes a chunk in a frame whose bakes already took longer than the budget only when it is the first", () => {
		const { painter, stats } = timed(60);
		drawWorld(painter, bigScene(0.5, { w: 1920, h: 1080 }));
		expect(stats.baked).toBe(1);
	});
	it("draws the far steps as one silhouette, the lights of finished builds at night, and his mark, never his sprite", () => {
		const { counted, log } = recording(pixelPainter(V.w, V.h, art));
		drawWorld(counted, bigScene(0.125, V, { dark: 1, lights: [{ x: HOME.x - 200, y: HOME.y - 40 }, { x: HOME.x + 200, y: HOME.y - 40 }] }));
		expect(log.filter((c) => c.kind === "shape")).toHaveLength(1);
		expect(log.filter((c) => c.kind === "stamp" && c.sheet !== "clouds" && c.sheet !== "birds")).toEqual([]);
		expect(log.filter((c) => c.kind === "rect" && c.color === PALETTE.t).length).toBeGreaterThanOrEqual(2);
		expect(log.filter((c) => c.kind === "rect" && c.color === PALETTE.p).length).toBeGreaterThanOrEqual(1);
	});
	it("pools a lamp's light on the build's own floor under it, not on the snow a row below (the look pass)", () => {
		const poolsY = (scene: WorldScene) => {
			const ys: number[] = [];
			const p = pixelPainter(V.w, V.h, art);
			drawWorld({ ...p, pool: (...a: Parameters<Painter["pool"]>) => (ys.push(a[1]), p.pool(...a)) }, scene);
			return ys;
		};
		const lamp: Block = { x: 477, y: 83, tile: "lantern", layer: "lanterns" };
		const floor: Block = { x: 477, y: 85, tile: "step", layer: "floor" };
		const camera = cam(HOME.x, HOME.y - 40, 2);
		const on = poolsY(bigScene(2, V, { camera, dark: 1, laid: [floor, lamp] }));
		const bare = poolsY(bigScene(2, V, { camera, dark: 1, laid: [lamp] }));
		expect(on).toHaveLength(1);
		expect(bare[0] - on[0]).toBe(TILE * 2); // a row higher, at zoom 2
	});
	it("draws no clouds at the far steps, where they would tile into a strip louder than the islands (the look pass)", () => {
		const clouds = (z: number) => {
			const { counted, log } = recording(pixelPainter(V.w, V.h, art));
			drawWorld(counted, bigScene(z, V, { camera: cam(HOME.x, 600, z) })); // the clouds' height
			return log.filter((c) => c.kind === "stamp" && c.sheet === "clouds").length;
		};
		expect(clouds(0.25)).toBeGreaterThan(0);
		expect(clouds(0.125)).toBe(0);
		expect(clouds(480 / 16384)).toBe(0);
	});
	it("draws his mark in his scarf's colour inside a dark ring inside a snow outline, so at night it is no star (the look pass)", () => {
		const { counted, log } = recording(pixelPainter(V.w, V.h, art));
		drawWorld(counted, bigScene(0.125, V, { dark: 1, mark: "#3aa597" }));
		const rects = log.filter((c) => c.kind === "rect");
		const inner = rects.findIndex((c) => c.color === "#3aa597");
		expect(inner).toBeGreaterThan(1);
		expect(rects.slice(inner - 2, inner).map((c) => c.color)).toEqual([PALETTE.p, PALETTE.H]); // the outline and the ring, drawn first, round it
		const dflt = recording(pixelPainter(V.w, V.h, art));
		drawWorld(dflt.counted, bigScene(0.125, V));
		expect(dflt.log.some((c) => c.kind === "rect" && c.color === PALETTE.Z)).toBe(true); // his scarf's own letter when none is given
	});
	it("draws his mark nine px across, by day and at night: a snow ring, a dark ring in it, his mood's colour in the middle (the hand checks)", () => {
		// Five px of his mood's colour, near the sky's own, was hard to find at the far steps.
		const mood = "#3aa597";
		for (const [z, dark] of [[0.125, 0], [0.125, 1], [480 / 16384, 0]] as const) {
			const p = pixelPainter(V.w, V.h, art);
			const s = bigScene(z, V, { dark, mark: mood });
			drawWorld(p, s);
			const cx = Math.round((s.him.x - s.camera.x) * z + V.w / 2);
			const cy = Math.round(((s.him.y ?? 0) - 16 - s.camera.y) * z + V.h / 2);
			const at = (x: number, y: number) => Array.from(p.data.slice((y * V.w + x) * 4, (y * V.w + x) * 4 + 3)).join();
			const name = (x: number, y: number) => {
				const c = at(x, y);
				return c === rgb("p").join() ? "snow" : c === rgb("H").join() ? "dark" : c === (parseColor(mood) ?? []).slice(0, 3).join() ? "mood" : "other";
			};
			const across = Array.from({ length: 11 }, (_, k) => name(cx - 5 + k, cy));
			const down = Array.from({ length: 11 }, (_, k) => name(cx, cy - 5 + k));
			const want = ["snow", "dark", "mood", "mood", "mood", "mood", "mood", "dark", "snow"];
			expect(across.slice(1, 10), `zoom ${z}, dark ${dark}`).toEqual(want);
			expect(down.slice(1, 10), `zoom ${z}, dark ${dark}`).toEqual(want);
			expect([across[0], across[10], down[0], down[10]]).not.toContain("snow"); // nine across, no more
		}
	});
	it("draws his sprite at 1/2 and his mark at 1/4", () => {
		const near = { camera: cam(HOME.x, HOME.y - 40, 0.5) };
		const half = recording(pixelPainter(V.w, V.h, art));
		drawWorld(half.counted, bigScene(0.5, V, near));
		expect(half.log.some((c) => c.kind === "stamp" && c.sheet === "sprite")).toBe(true);
		const quarter = recording(pixelPainter(V.w, V.h, art));
		drawWorld(quarter.counted, bigScene(0.25, V, { camera: cam(HOME.x, HOME.y - 40, 0.25) }));
		expect(quarter.log.some((c) => c.kind === "stamp" && c.sheet === "sprite")).toBe(false);
		expect(quarter.log.some((c) => c.kind === "rect" && c.color === PALETTE.p)).toBe(true);
	});
	it("stands him on the height he is given", () => {
		const coatRows = (y: number) => {
			const p = pixelPainter(V.w, V.h, art);
			drawWorld(p, bigScene(2, V, { camera: cam(HOME.x, HOME.y - 40, 2), him: { x: HOME.x, y, look: look(newActor(HOME.x, 0, 12), 0, "warm") } }));
			const coat = (["K", "L", "M"] as const).map((l) => (parseColor(PALETTE[l]) ?? []).slice(0, 3).join());
			let lowest = -1;
			for (let yy = 0; yy < V.h; yy++) for (let xx = 0; xx < V.w; xx++) if (coat.includes(Array.from(p.data.slice((yy * V.w + xx) * 4, (yy * V.w + xx) * 4 + 3)).join())) lowest = yy;
			return lowest;
		};
		expect(coatRows(HOME.y) - coatRows(HOME.y - 32)).toBe(64);
	});
	it("draws the balloon's envelope before him and its basket after him", () => {
		const { counted, log } = recording(pixelPainter(V.w, V.h, art));
		drawWorld(counted, bigScene(2, V, { camera: cam(HOME.x, HOME.y - 40, 2), balloon: { x: HOME.x, y: HOME.y + 4 } }));
		const order = log.filter((c) => c.kind === "stamp").map((c) => (c.sheet === "sprite" ? "him" : c.sheet === "tiles" && c.cell === tileIndex(BALLOON_BASKET.tile) ? "basket" : c.sheet === "tiles" && c.cell === tileIndex(BALLOON_ENVELOPE[0].tile) ? "envelope" : "other"));
		expect(order.indexOf("envelope")).toBeGreaterThanOrEqual(0);
		expect(order.indexOf("envelope")).toBeLessThan(order.indexOf("him"));
		expect(order.indexOf("basket")).toBeGreaterThan(order.indexOf("him"));
	});
	it("goes by the CSS zoom: at a device pixel ratio of 2, a canvas zoom of 1 is chunks", () => {
		const { counted, log } = recording(pixelPainter(V.w, V.h, art));
		drawWorld(counted, bigScene(1, V, { dpr: 2 }));
		expect(log.some((c) => c.kind === "chunk")).toBe(true);
		expect(log.some((c) => c.kind === "stamp" && c.sheet === "tiles" && c.cell === tileIndex("stone-dark"))).toBe(false);
	});
	it("never builds an atlas past scale 4: a phone at a device pixel ratio of 3 zoomed to 4 stays inside iOS's canvas limit", () => {
		const { counted, log } = recording(pixelPainter(V.w, V.h, art));
		const life = lifeAt({ wallMs: 20_000, now: 0, view: V, scale: 12, day: true, night: false, chimney: true, landing: null, motion: true, force: "all" });
		drawWorld(counted, bigScene(12, V, { camera: cam(HOME.x, HOME.y - 40, 12), dpr: 3, life }));
		drawWorld(counted, bigScene(12, V, { camera: cam(667, 200, 12), dpr: 3 })); // in the clouds: a layer-0 cloud's cell spans x 40 to 360 at parallax 0.3
		const stamps = log.filter((c) => c.kind === "stamp");
		const sheets = new Set(stamps.map((c) => c.sheet));
		for (const sheet of ["tiles", "sprite", "clouds"]) expect(sheets.has(sheet), sheet).toBe(true); // the cloud sheet is the largest atlas
		const atlasPx = (sheet: Sheet, scale: number) => art.grids[sheet].length * CELL[sheet].w * scale * CELL[sheet].h * scale;
		for (const c of stamps) {
			expect(c.scale, String(c.sheet)).toBeLessThanOrEqual(ATLAS_MAX);
			expect(atlasPx(c.sheet as Sheet, c.scale ?? 1)).toBeLessThanOrEqual(16_000_000);
		}
	});
});

describe("every zoom step's pixels (480 by 270, day, no life)", () => {
	const V = { w: 480, h: 270 };
	const hashAt = (z: number) => {
		const p = pixelPainter(V.w, V.h, art);
		settle(p, bigScene(z, V, { sky: skyAt("hsl(172 38% 50%)", "hsl(212 38% 50%)", 12) }));
		snapshot(`big-step-${String(z).replace(".", "_")}`, p);
		return hashPixels(p.data);
	};
	it("draws each step the same every time", () => {
		for (const z of [4, 1, 0.25, 0.125]) expect(hashAt(z)).toBe(hashAt(z));
	});
	it("pins each step", () => {
		expect(hashAt(4)).toMatchInlineSnapshot(`"9da4a4c5"`);
		expect(hashAt(3)).toMatchInlineSnapshot(`"bea28ec4"`);
		expect(hashAt(2)).toMatchInlineSnapshot(`"0c4c2065"`);
		expect(hashAt(1)).toMatchInlineSnapshot(`"d8d75cf9"`);
		expect(hashAt(0.5)).toMatchInlineSnapshot(`"e28abdcc"`);
		expect(hashAt(0.25)).toMatchInlineSnapshot(`"10fc4545"`);
		expect(hashAt(0.125)).toMatchInlineSnapshot(`"895b310b"`);
		expect(hashAt(480 / 16384)).toMatchInlineSnapshot(`"3310f750"`);
	});
	it("draws the same pixels with the ground from chunk bitmaps as stamped, at a whole zoom", () => {
		for (const z of [1, 2, 3]) {
			const hashOf = (stampCap: number) => {
				const p = pixelPainter(V.w, V.h, art);
				settle(p, dense(z, V, { stampCap }));
				return hashPixels(p.data);
			};
			expect(hashOf(0), `zoom ${z}`).toBe(hashOf(Number.POSITIVE_INFINITY));
		}
	});
});

describe("the cost of a frame (review B1)", () => {
	// A Painter that passes every call on and counts it.
	const counting = (p: Painter) => {
		const calls = { n: 0 };
		const counted: Painter = {
			get w() {
				return p.w;
			},
			get h() {
				return p.h;
			},
			get chunkKeep() {
				return p.chunkKeep;
			},
			clear: () => (calls.n++, p.clear()),
			gradient: (...a) => (calls.n++, p.gradient(...a)),
			rect: (...a) => (calls.n++, p.rect(...a)),
			stamp: (...a) => (calls.n++, p.stamp(...a)),
			glow: (...a) => (calls.n++, p.glow(...a)),
			pool: (...a) => (calls.n++, p.pool(...a)),
			shape: (...a) => (calls.n++, p.shape(...a)),
			chunk: (...a) => (calls.n++, p.chunk(...a)),
		};
		return { counted, calls };
	};
	// The whole castle laid, at night (lit windows, glows and pools) with the hills, the far islands, the haze and every
	// kind of life at its cap, at 1920 by 1080: 1,758 painter calls today (1,174 stamps for the island's 507 blocks, the
	// castle's 644, the clouds, the birds and him; 514 rects for the 164 haze rows, the shadow rows, 40 flakes of snow and
	// the smoke; 45 glows, 18 pools, 6 shapes and the clear). Before the fix the hills alone added 27,357 rects for each
	// period across the view (84,559 calls in all). The bound leaves room for more art, not for the hills to come back
	// as runs.
	it("draws the whole castle at 1920 by 1080, at night with all its life, in under 2,000 painter calls", { timeout: 60_000 }, () => {
		const view = { w: 1920, h: 1080 };
		const laid = Object.values(CASTLE_BLOCKS).flat();
		const life = lifeAt({ wallMs: 20_000, now: 0, view, scale: 1, day: true, night: true, chimney: true, landing: null, motion: true, force: "all" });
		const { counted, calls } = counting(pixelPainter(view.w, view.h, artFor("hsl(172 38% 50%)", 1)));
		const him = newActor(START_X, 0, 23);
		drawWorld(counted, {
			camera: newCamera(START_X, view, 1), view, now: 0, clock: 0, ground: blocksOf(ISLAND), laid, ghost: null, outline: [],
			him: { x: him.x, look: look(him, 0, "warm") }, sky: skyAt("hsl(172 38% 50%)", "hsl(212 38% 50%)", 23), dark: 1, life,
		});
		expect(calls.n).toBeLessThan(2_000);
	});
	const BIG = { w: 1920, h: 1080 };
	// Measured (calls to the screen): 798, 1,082, 1,644, 1,700, 237, 94, 156 and 166; each ceiling is the count rounded up
	// to the next 250.
	const CEILINGS: [number, number][] = [[4, 1000], [3, 1250], [2, 1750], [1, 1750], [0.5, 250], [0.25, 250], [0.125, 250], [1920 / 16384, 250]];
	const nightLife = lifeAt({ wallMs: 20_000, now: 0, view: BIG, scale: 1, day: true, night: true, chimney: true, landing: null, motion: true, force: "all" });
	const night = (s: WorldScene): WorldScene => ({ ...s, sky: skyAt("hsl(172 38% 50%)", "hsl(212 38% 50%)", 23), dark: 1, life: nightLife });
	it.each(CEILINGS)("step %f stays under %i calls to the screen at 1920 by 1080, at night with all its life, baking at most 4 chunks", (z, ceiling) => {
		const { p, count, stats } = budgetPainter(BIG.w, BIG.h);
		drawWorld(p, night(bigScene(z, BIG)));
		expect(count.n).toBeLessThan(ceiling);
		expect(stats.baked).toBeLessThanOrEqual(BAKE_BUDGET);
	});
	// Measured: 1,944 at zoom 1, 1,010 at 2.
	it.each([[1, 2000], [2, 1250]] as const)("the densest view at CSS zoom %f stays under %i calls to the screen, its ground from chunk bitmaps when it is over the cap", (z, ceiling) => {
		const { p, count, stats } = budgetPainter(BIG.w, BIG.h);
		expect(settle(p, night(dense(z, BIG))).pending).toBe(0);
		const baked = stats.baked;
		count.n = 0;
		drawWorld(p, night(dense(z, BIG, { now: 99 })));
		expect(count.n).toBeLessThan(ceiling);
		expect(stats.baked).toBe(baked);
		expect(baked).toBeGreaterThan(0); // about 4,900 ground blocks in view at zoom 1, 1,660 in the chunks at 2: over the cap
	});
	it("a phone pans the whole world: at most 16 chunk bitmaps kept, every evicted one released, at most 4 bakes a frame, nothing baked again at rest", () => {
		const phone = { w: 750, h: 1400 }; // 375 by 700 CSS px at a device pixel ratio of 2
		const ground = [...BIG_GROUND, ...[40, 100, 130].flatMap((top) => slab(2, 1020, top, 5))]; // land on four chunk rows, 1 to 4
		for (const css of [0.5, 0.25]) {
			const { p, count, stats } = budgetPainter(phone.w, phone.h, CHUNK_KEEP.phone);
			const at = (x: number, now: number) => bigScene(css * 2, phone, { ground, camera: cam(x, 1300, css * 2), dpr: 2, now });
			for (let x = 0; x <= 16384; x += 600) {
				const baked = stats.baked;
				count.n = 0;
				drawWorld(p, at(x, x));
				expect(count.n).toBeLessThan(600);
				expect(stats.baked - baked).toBeLessThanOrEqual(BAKE_BUDGET);
				expect(stats.kept()).toBeLessThanOrEqual(CHUNK_KEEP.phone);
			}
			expect(settle(p, at(8000, 20_000)).pending).toBe(0);
			const baked = stats.baked;
			drawWorld(p, at(8000, 20_100));
			expect(stats.baked).toBe(baked);
			expect(stats.released).toBeGreaterThan(0);
			expect(stats.made).toBe(stats.kept() + stats.released);
		}
	});
	describe.runIf(process.env.WORLD_TIMING === "1")("the drawing code's own time (WORLD_TIMING=1 only)", () => {
		const median = (s: WorldScene) => {
			const { p } = budgetPainter(BIG.w, BIG.h);
			settle(p, s);
			const times = Array.from({ length: 7 }, (_, k) => {
				const t = performance.now();
				drawWorld(p, { ...s, now: s.now + 100 + k });
				return performance.now() - t;
			}).sort((a, b) => a - b);
			return times[3];
		};
		it.each(CEILINGS.map(([z]) => z))("step %f takes under 4 ms (median of 7)", (z) => {
			expect(median(night(bigScene(z, BIG)))).toBeLessThan(4);
		});
		it.each([1, 2])("the densest view at CSS zoom %f takes under 4 ms (median of 7)", (z) => {
			expect(median(night(dense(z, BIG)))).toBeLessThan(4);
		});
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

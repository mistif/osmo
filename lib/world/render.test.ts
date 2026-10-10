import { describe, expect, it } from "vitest";
import { look, newActor } from "./actor";
import { blocksOf, START_X } from "./blueprints";
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { HALL } from "./blueprints/hall";
import { ISLAND } from "./blueprints/island";
import { GROUND_Y, TILE } from "./blueprints/types";
import { newCamera, toScreen, zoomAt } from "./camera";
import { PALETTE } from "./palette";
import { hashPixels, pixelPainter } from "./pixel-painter";
import { snapshot } from "./png";
import { colours, parseColor } from "./raster";
import { artFor, drawSky, drawWorld, GHOST_ALPHA, HAZE, OUTLINE_ALPHA, sheetBitmap, type Painter, type WorldScene } from "./render";
import { BIRD_CELL, CLOUD_CELL, CLOUD_GRIDS, HILLS } from "./backdrop";
import { hslCss, skyAt, starField, twinkle } from "./sky";
import { poolsOf, shadowed, SHADOW_ALPHA, variantOf } from "./texture";
import { TILE_IDS, TILES } from "./tiles";
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
			clear: () => (calls.n++, p.clear()),
			gradient: (...a) => (calls.n++, p.gradient(...a)),
			rect: (...a) => (calls.n++, p.rect(...a)),
			stamp: (...a) => (calls.n++, p.stamp(...a)),
			glow: (...a) => (calls.n++, p.glow(...a)),
			pool: (...a) => (calls.n++, p.pool(...a)),
			shape: (...a) => (calls.n++, p.shape(...a)),
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

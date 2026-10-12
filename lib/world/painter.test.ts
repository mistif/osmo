import { afterEach, describe, expect, it, vi } from "vitest";
import { TILE } from "./blueprints/types";
import { canvasPainter } from "./canvas-painter";
import { CHUNK_PX } from "./lod";
import { FRAME_H, FRAME_NAMES, FRAME_W } from "./osmo-sprite";
import { hashPixels, pixelPainter } from "./pixel-painter";
import { colours } from "./raster";
import { artFor, sheetBitmap, type Painter } from "./render";
import { TILE_IDS, tileIndex } from "./tiles";

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

describe("chunk bitmaps (free-will spec 3.3)", () => {
	const brickBake = (p: Painter) => p.stamp("tiles", brick, 0, 0, 1, 1, false);
	it("bakes a chunk once per version and draws it scaled into its box, nearest neighbour", () => {
		const p = pixelPainter(W, H, art, 4);
		let bakes = 0;
		const bake = (q: Painter) => {
			bakes++;
			brickBake(q);
		};
		expect(p.chunk("0,0", "a", bake, 0, 0, 32, 32)).toBe("baked");
		expect(p.chunk("0,0", "a", bake, 0, 0, 32, 32)).toBe("kept");
		expect(bakes).toBe(1);
		expect(p.chunk("0,0", "b", bake, 0, 0, 32, 32, false)).toBe("missing"); // stale, and the frame's budget is spent
		expect(p.chunk("0,0", "b", bake, 0, 0, 32, 32)).toBe("baked");
		expect(bakes).toBe(2);
		expect(p.chunks).toMatchObject({ made: 1, baked: 2, released: 0 });
		expect(p.chunkKeep).toBe(4);
		const direct = pixelPainter(W, H, art);
		direct.stamp("tiles", brick, 0, 0, 1, 1, false, 1, 1); // a 16 px tile in a 512 px chunk shown 32 px wide: one pixel
		expect(px(p.data, 0, 0)).toEqual(px(direct.data, 0, 0));
	});
	it("draws a faint block in a chunk as faint as it is stamped (the ghost at 1/2 and 1/4)", () => {
		const p = pixelPainter(W, H, art);
		p.chunk("0,0", "a", (q) => q.stamp("tiles", brick, 0, 0, 1, 0.3, false), 0, 0, CHUNK_PX, CHUNK_PX);
		const direct = pixelPainter(W, H, art);
		direct.stamp("tiles", brick, 0, 0, 1, 0.3, false);
		for (const [x, y] of [[0, 0], [5, 7], [15, 15]]) expect(px(p.data, x, y)).toEqual(px(direct.data, x, y));
	});
	it("keeps at most `keep`, releasing the least recently drawn", () => {
		const p = pixelPainter(W, H, art, 2);
		for (const key of ["a", "b", "a", "c"]) p.chunk(key, "1", brickBake, 0, 0, 8, 8);
		expect(p.chunks.kept()).toBe(2);
		expect(p.chunks).toMatchObject({ made: 3, released: 1 });
		p.chunk("a", "1", brickBake, 0, 0, 8, 8); // "a" was kept (drawn after "b"), so no bake
		expect(p.chunks.made).toBe(3);
		p.release?.();
		expect(p.chunks.kept()).toBe(0);
		expect(p.chunks.released).toBe(3);
	});
	it("the canvas painter empties an evicted chunk's canvas, and every kept one on release", () => {
		const canvases: { width: number; height: number }[] = [];
		const ctx = () => ({ canvas: { width: 512, height: 512 }, imageSmoothingEnabled: false, globalAlpha: 1, clearRect() {}, drawImage() {}, fillRect() {}, save() {}, restore() {}, translate() {}, scale() {} });
		vi.stubGlobal("document", {
			createElement: () => {
				const c = { width: 0, height: 0, getContext: () => ctx() };
				canvases.push(c);
				return c;
			},
		});
		try {
			const p = canvasPainter(ctx() as unknown as CanvasRenderingContext2D, art, {}, 2);
			for (const key of ["a", "b", "c"]) p.chunk(key, "1", () => {}, 0, 0, 8, 8);
			expect(canvases.map((c) => [c.width, c.height])).toEqual([[0, 0], [512, 512], [512, 512]]);
			p.release?.();
			expect(canvases.every((c) => c.width === 0 && c.height === 0)).toBe(true);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("the painter's clock (what drawWorld times a frame's bakes with)", () => {
	const ctx = { canvas: { width: 512, height: 512 } } as unknown as CanvasRenderingContext2D;
	it("is the one the painter is given, and the page's own clock otherwise", () => {
		const fake = () => 7;
		expect(canvasPainter(ctx, art, {}, 2, fake).clock).toBe(fake);
		expect(pixelPainter(W, H, art, 2, fake).clock).toBe(fake);
		const own = canvasPainter(ctx, art).clock;
		expect(typeof own?.()).toBe("number");
		expect(pixelPainter(W, H, art).clock).toBeUndefined();
	});
});

describe("the optional art files (/village/tiles.png and /village/osmo-sheet.png)", () => {
	const TILES_FILE = "/village/tiles.png";
	const SPRITE_FILE = "/village/osmo-sheet.png";
	// A fresh copy of the module each time: what it remembers lives as long as the page, here as long as the copy.
	const fresh = async () => {
		vi.resetModules();
		return (await import("./canvas-painter")).loadSheets;
	};
	const image = (w: number, h: number) => ({ img: { tag: `${w}x${h}` } as unknown as CanvasImageSource, w, h });
	const RIGHT = { [TILES_FILE]: image(TILE_IDS.length * TILE, TILE), [SPRITE_FILE]: image(FRAME_NAMES.length * FRAME_W, FRAME_H) };
	const quiet = () => ({ info: vi.spyOn(console, "info").mockImplementation(() => {}), warn: vi.spyOn(console, "warn").mockImplementation(() => {}) });
	afterEach(() => vi.restoreAllMocks());

	it("asks for a file that is not there once per page load, however often the world restarts", async () => {
		const loadSheets = await fresh();
		const { info } = quiet();
		const asked: string[] = [];
		const load = async (file: string) => (asked.push(file), null);
		for (let k = 0; k < 3; k++) expect(await loadSheets(load)).toEqual({});
		expect(asked).toEqual([TILES_FILE, SPRITE_FILE]);
		expect(info).toHaveBeenCalledTimes(2); // the console says so once for each, not at every restart
	});
	it("asks for a file of the wrong size once too, and says why once", async () => {
		const loadSheets = await fresh();
		const { warn } = quiet();
		const asked: string[] = [];
		const load = async (file: string) => (asked.push(file), image(10, 10));
		for (let k = 0; k < 2; k++) expect(await loadSheets(load)).toEqual({});
		expect(asked).toEqual([TILES_FILE, SPRITE_FILE]);
		expect(warn).toHaveBeenCalledTimes(2);
	});
	it("uses a file that is there and the right size, and does not ask for it again", async () => {
		const loadSheets = await fresh();
		const asked: string[] = [];
		const load = async (file: string) => (asked.push(file), RIGHT[file as keyof typeof RIGHT] ?? null);
		const first = await loadSheets(load);
		expect(first).toEqual({ tiles: RIGHT[TILES_FILE].img, sprite: RIGHT[SPRITE_FILE].img });
		expect(await loadSheets(load)).toEqual(first);
		expect(asked).toEqual([TILES_FILE, SPRITE_FILE]);
	});
	it("keeps what each file answered on its own: one there, one missing", async () => {
		const loadSheets = await fresh();
		quiet();
		const asked: string[] = [];
		const load = async (file: string) => (asked.push(file), file === TILES_FILE ? RIGHT[TILES_FILE] : null);
		expect(await loadSheets(load)).toEqual({ tiles: RIGHT[TILES_FILE].img });
		expect(await loadSheets(load)).toEqual({ tiles: RIGHT[TILES_FILE].img });
		expect(asked).toEqual([TILES_FILE, SPRITE_FILE]);
	});
	it("asks once when two restarts overlap, and treats a loader that throws as a miss", async () => {
		const loadSheets = await fresh();
		quiet();
		const asked: string[] = [];
		const load = (file: string): Promise<null> => (asked.push(file), Promise.reject(new Error("offline")));
		const both = await Promise.all([loadSheets(load), loadSheets(load)]);
		expect(both).toEqual([{}, {}]);
		expect(asked).toEqual([TILES_FILE, SPRITE_FILE]);
	});
});

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
		expect(hashPixels(p.data)).toMatchInlineSnapshot(`"720c6d4d"`);
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
		const without = paint({ ...scene(40), ground: [] }).data;
		for (let y = rows.y0; y < rows.y1; y++) {
			for (let x = rows.x0; x < rows.x1; x++) {
				expect(px(without, x, y)[3], `nothing but the island paints ${x},${y}`).toBe(0);
				const [r, g, b, a] = px(withIsland, x, y);
				expect(a, `${x},${y}`).toBe(255);
				expect(snow, `${x},${y}`).toContain([r, g, b].join());
			}
		}
	});
	it("leaves the sky transparent where nothing is built yet", () => {
		expect(px(paint(scene(40)).data, 16, 12)[3]).toBe(0); // world (440, 350): row 21 is not laid at 40
	});
	it("draws him standing on the ground line", () => {
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

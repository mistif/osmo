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

import { describe, expect, it } from "vitest";
import { START_X } from "./blueprints";
import { HALL } from "./blueprints/hall";
import { GROUND_Y, TILE, WORLD_W } from "./blueprints/types";
import {
	baseZoom, BELOW_TILES, easeOutCubic, easing, follow, GLIDE_MS, groundAbove, JUMP_PX, newCamera, settling, SKY_TILES, toScreen, ZOOM_MS, zoomAt, zoomTo,
} from "./camera";

const V = { w: 960, h: 600 }; // a desktop view: 480 by 300 world px at zoom 2
const GROUND = GROUND_Y * TILE;
const settle = (c: ReturnType<typeof newCamera>, heX: number, v = V, close = false) => {
	for (let t = 0; t < 3000; t += 33) c = follow(c, heX, v, t, 33, close);
	return c;
};

describe("following him", () => {
	it("starts on him with the ground low enough for the whole hall above it", () => {
		const c = newCamera(512, V, 2);
		expect(c.x).toBe(512);
		expect(c.y).toBeCloseTo(GROUND - groundAbove(300) + 150);
		expect(toScreen(c, V, 0, 512, GROUND)).toEqual({ x: 480, y: 536 }); // 268 world px above the ground, 32 below
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

describe("framing the hall", () => {
	const hallTop = HALL.y * TILE; // the apex row
	const islandTwo = (GROUND_Y + BELOW_TILES) * TILE; // the bottom of the island's snow row and the stone row under it
	it.each([
		[960, 600],
		[1200, 800],
		[1440, 900],
		[375, 700],
	])("shows the hall's apex row and the island's top two rows at %i by %i", (w, h) => {
		const v = { w, h };
		const z = baseZoom(w, h);
		const c = newCamera(START_X, v, z);
		expect(toScreen(c, v, 0, START_X, hallTop).y).toBeGreaterThanOrEqual(0);
		expect(toScreen(c, v, 0, START_X, islandTwo).y).toBeLessThanOrEqual(h);
		expect(toScreen(c, v, 0, START_X, GROUND).y).toBeLessThan(h);
	});
	it("keeps two tiles of sky over the hall when the view is tall enough", () => {
		const v = { w: 1200, h: 800 };
		const c = newCamera(START_X, v, 2);
		expect(toScreen(c, v, 0, START_X, hallTop).y).toBeGreaterThanOrEqual(SKY_TILES * TILE * 2);
	});
	it("keeps the framing while following and settling", () => {
		const c = settle(newCamera(START_X, V, 2), START_X);
		expect(toScreen(c, V, 0, START_X, hallTop).y).toBeGreaterThanOrEqual(0);
		expect(toScreen(c, V, 0, START_X, islandTwo).y).toBeLessThanOrEqual(V.h);
	});
	it("uses scale 1 from 900 px wide, and 2 below unless the hall would not fit at 2", () => {
		expect([baseZoom(1920, 1080), baseZoom(1200, 800), baseZoom(960, 600), baseZoom(900, 500)]).toEqual([1, 1, 1, 1]);
		expect([baseZoom(899, 900), baseZoom(375, 700), baseZoom(375, 608)]).toEqual([2, 2, 2]);
		expect(baseZoom(800, 400)).toBe(1); // a landscape phone: 200 world px tall at 2 would crop the hall
	});
	it.each([
		[1200, 800],
		[1920, 1080],
		[1366, 768],
	])("puts the ground 70 to 75%% down at scale 1 at %i by %i, with the hall and two tiles of sky above it", (w, h) => {
		const v = { w, h };
		const c = newCamera(START_X, v, baseZoom(w, h));
		const ground = toScreen(c, v, 0, START_X, GROUND).y / h;
		expect(ground).toBeGreaterThanOrEqual(0.7);
		expect(ground).toBeLessThanOrEqual(0.75);
		expect(toScreen(c, v, 0, START_X, hallTop).y).toBeGreaterThanOrEqual(SKY_TILES * TILE);
	});
	it("does not clamp up and down: above and below the world there is only sky", () => {
		const v = { w: 1920, h: 1080 };
		const c = newCamera(START_X, v, 1);
		expect(c.y - v.h / 2).toBeLessThan(0); // the top of the view is above the world's top
	});
	it("puts the ground at 72% when there is room, and keeps it finite for a view of no size", () => {
		expect(groundAbove(500)).toBeCloseTo(360);
		expect(Number.isFinite(groundAbove(0))).toBe(true);
	});
});

describe("smoothing", () => {
	it("counts the camera as settling until it is within half a pixel of where it is heading", () => {
		let c = newCamera(512, V, 2);
		expect(settling(c, 512, V, 0, false)).toBe(false);
		expect(settling(c, 540, V, 0, true)).toBe(true);
		for (let t = 0; t < 3000; t += 33) c = follow(c, 540, V, t, 33, true);
		expect(settling(c, 540, V, 3000, true)).toBe(false);
	});
	it("treats a dt that is NaN or negative as 0", () => {
		const c = newCamera(512, V, 2);
		expect(follow(c, 700, V, 0, Number.NaN, false)).toEqual(c);
		expect(follow(c, 700, V, 0, -50, false)).toEqual(c);
	});
});

describe("the easing (polish pass)", () => {
	it("is an ease-out cubic: 0 to 1, fast at first, settling softly, clamped outside", () => {
		expect([0, 0.5, 1].map(easeOutCubic)).toEqual([0, 0.875, 1]);
		expect(easeOutCubic(-1)).toBe(0);
		expect(easeOutCubic(2)).toBe(1);
		expect(easeOutCubic(0.25) - easeOutCubic(0)).toBeGreaterThan(easeOutCubic(1) - easeOutCubic(0.75));
	});
});

describe("coming in on him", () => {
	it("eases in over 400 ms on the curve, with no steps, and eases back the same way", () => {
		let c = zoomTo(newCamera(512, V, 2), 4, 1000);
		expect(ZOOM_MS).toBe(400);
		expect(zoomAt(c, 1000)).toBe(2);
		expect(zoomAt(c, 1200)).toBeCloseTo(2 + 2 * 0.875, 6);
		expect(zoomAt(c, 1400)).toBe(4);
		expect(zoomAt(c, 2000)).toBe(4);
		const seen = Array.from({ length: 13 }, (_, i) => zoomAt(c, 1000 + i * 33));
		for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]); // every frame moves: no steps
		expect(easing(c, 1300)).toBe(true);
		expect(easing(c, 1400)).toBe(false);
		c = zoomTo(c, 2, 3000);
		expect(zoomAt(c, 3200)).toBeCloseTo(4 - 2 * 0.875, 6);
		expect(zoomAt(c, 3400)).toBe(2);
	});
	it("turns back from wherever it is if he turns away mid-zoom", () => {
		const c = zoomTo(zoomTo(newCamera(512, V, 2), 4, 0), 2, 250);
		const mid = 2 + 2 * easeOutCubic(250 / 400);
		expect(zoomAt(c, 250)).toBeCloseTo(mid, 6);
		expect(zoomAt(c, 450)).toBeLessThan(mid);
		expect(zoomAt(c, 650)).toBe(2);
	});
	it("copes with a clock that is not a number", () => {
		expect(zoomAt(zoomTo(newCamera(512, V, 2), 4, 0), Number.NaN)).toBe(4);
	});
	it("jumps at once under reduced motion", () => {
		expect(zoomAt(zoomTo(newCamera(512, V, 2), 4, 0, true), 0)).toBe(4);
	});
	it("centres on him when close", () => {
		expect(settle(zoomTo(newCamera(512, V, 2), 4, 0), 540, V, true).x).toBeCloseTo(540, 1);
	});
	it("comes in from 1 to 3 on a desktop when he turns, passing 2 on the way", () => {
		const v = { w: 1920, h: 1080 };
		const c = zoomTo(newCamera(START_X, v, baseZoom(v.w, v.h)), baseZoom(v.w, v.h) + 2, 0);
		expect(zoomAt(c, 0)).toBe(1);
		expect(zoomAt(c, 100)).toBeGreaterThan(2);
		expect(zoomAt(c, 400)).toBe(3);
	});
});

describe("gliding (polish pass)", () => {
	it("glides to him on the curve when he turns to Gur, instead of snapping", () => {
		let c = settle(newCamera(512, V, 2), 512);
		c = follow(c, 600, V, 10_000, 33, true); // he turned: the aim jumps 88 px to him
		expect(c.aimX).toBe(600);
		expect(c.x).toBeCloseTo(512, 6); // the first frame of the glide has not moved yet
		const at = (t: number) => follow(c, 600, V, 10_000 + t, 33, true).x;
		expect(at(GLIDE_MS / 2)).toBeCloseTo(600 - 88 * (1 - 0.875), 6);
		expect(at(GLIDE_MS)).toBe(600);
		expect(at(GLIDE_MS * 2)).toBe(600);
	});
	it("tracks him exactly at the edge of the dead zone while he walks: no lag, no glide", () => {
		expect(48 * 0.033).toBeLessThan(JUMP_PX);
		let c = settle(newCamera(512, V, 2), 584); // at the zone's edge: 512 + 72
		let x = 584;
		for (let t = 0; t < 1000; t += 33) {
			x += 48 * 0.033;
			c = follow(c, x, V, 20_000 + t, 33, false);
		}
		expect(c.x).toBeCloseTo(x - 72, 6);
		expect(c.ox).toBe(0);
	});
	it("starts a new glide from wherever it is when the aim jumps again mid-glide", () => {
		let c = settle(newCamera(512, V, 2), 512);
		c = follow(c, 600, V, 0, 33, true);
		c = follow(c, 600, V, 200, 33, true);
		const mid = c.x;
		c = follow(c, 512, V, 233, 33, false); // he turned back to work: the aim is the dead zone's edge, 512 + 72 = 584
		expect(c.aimX).toBe(584);
		expect(c.x).toBeCloseTo(mid, 6);
		expect(follow(c, 512, V, 233 + GLIDE_MS, 33, false).x).toBe(584);
	});
	it("jumps at once under reduced motion", () => {
		const c = follow(settle(newCamera(512, V, 2), 512), 600, V, 0, 33, true, true);
		expect(c.x).toBe(600);
	});
	it("zooms back out in one motion: the glide starts with the zoom and runs alongside it (review M2)", () => {
		const v = { w: 1200, h: 800 };
		let c = zoomTo(newCamera(START_X, v, 1), 3, 0);
		for (let t = 33; t < 3000; t += 33) c = follow(c, START_X, v, t, 33, true); // close up on him, settled
		const T = 3003;
		c = zoomTo(c, 1, T); // he turns back to work
		const ys: number[] = [];
		const glides: number[] = [];
		for (let t = T; t <= T + GLIDE_MS + 66; t += 33) {
			c = follow(c, START_X, v, t, 33, false);
			ys.push(c.y);
			glides.push(c.glideAt);
		}
		expect(new Set(glides)).toEqual(new Set([T])); // one glide, started with the zoom, never restarted by it
		expect(Math.abs(ys[3] - ys[0])).toBeGreaterThan(20); // already well under way 100 ms in, while the zoom eases
		for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThanOrEqual(ys[i - 1] + 1e-9); // one way, no hold then slide
		expect(c.y).toBeCloseTo(newCamera(START_X, v, 1).y, 6); // there by the end of the glide
		expect(settling(c, START_X, v, T + GLIDE_MS + 66, false)).toBe(false);
	});
	it("counts the glide as settling until it is within half a pixel", () => {
		const c = follow(settle(newCamera(512, V, 2), 512), 600, V, 0, 33, true);
		expect(settling(c, 600, V, 0, true)).toBe(true);
		expect(settling(follow(c, 600, V, GLIDE_MS, 33, true), 600, V, GLIDE_MS, true)).toBe(false);
	});
});

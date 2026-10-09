import { describe, expect, it } from "vitest";
import { START_X } from "./blueprints";
import { HALL } from "./blueprints/hall";
import { GROUND_Y, TILE, WORLD_W } from "./blueprints/types";
import { baseZoom, BELOW_TILES, easing, follow, groundAbove, newCamera, settling, SKY_TILES, toScreen, zoomAt, zoomTo } from "./camera";

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
	it("drops the base scale to 2 when scale 3 would crop the hall or the island", () => {
		expect(baseZoom(1500, 1000)).toBe(3);
		expect(baseZoom(1500, 900)).toBe(2);
		expect(baseZoom(1920, 700)).toBe(2);
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
		expect(baseZoom(1400, 2000)).toBe(2);
		expect(baseZoom(1401, 2000)).toBe(3);
	});
});

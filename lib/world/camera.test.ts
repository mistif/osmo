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

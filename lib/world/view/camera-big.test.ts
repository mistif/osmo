import { describe, expect, it } from "vitest";
import { toScreen, zoomAt, type Camera } from "../camera";
import { BIG_BOUNDS, drift, FAR_MIN, fitZoom, followBig, himOnScreen, homeTo, nearestStep, newBigCamera, offScreen, panBy, reachOf, STEPS, zoomAbout, zoomSteps } from "./camera-big";

const V = { w: 1000, h: 600 };
const cam = (x: number, y: number, z: number): Camera => ({ x, y, from: z, to: z, at: 0, aimX: x, aimY: y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY });

describe("the zoom steps (spec 3.2)", () => {
	it("are 4 down to 1/8, then the whole world fitted to the width", () => {
		expect(fitZoom(1920, BIG_BOUNDS)).toBe(1920 / 16384);
		expect(zoomSteps(1920, BIG_BOUNDS)).toEqual([4, 3, 2, 1, 0.5, 0.25, 1920 / 16384]); // 1/8 is within a fifth of the fit
		expect(zoomSteps(375, BIG_BOUNDS)).toEqual([4, 3, 2, 1, 0.5, 0.25, 0.125, FAR_MIN]);
	});
	it("leave out a fixed step that is not larger than the fit, and have no fit on a view of no width", () => {
		expect(zoomSteps(2560, BIG_BOUNDS)).toEqual([4, 3, 2, 1, 0.5, 0.25, 2560 / 16384]);
		expect(zoomSteps(0, BIG_BOUNDS)).toEqual([...STEPS]);
	});
	it("finds the nearest step by ratio", () => {
		expect(nearestStep([4, 3, 2, 1, 0.5], 1.9)).toBe(2);
		expect(nearestStep([4, 3, 2, 1, 0.5], 0.8)).toBe(3);
		expect(nearestStep([4, 3, 2, 1, 0.5], 0.7)).toBe(4);
	});
});

// The islands of a world, in tiles: from tile 250 to tile 875.
const ISLANDS = [{ x0: 448, x1: 506 }, { x0: 250, x1: 400 }, { x0: 520, x1: 875 }];
describe("the whole-world step fits the islands, not the whole width (the hand checks)", () => {
	const reach = { x0: 4000, x1: 14000 }; // 10,000 world px, 10,800 with the margin
	it("takes the leftmost island's start to the rightmost island's end, in world px", () => {
		expect(reachOf(ISLANDS)).toEqual({ x0: 250 * 16, x1: 875 * 16 });
		expect(reachOf([])).toBeNull();
	});
	it("fits that reach and a small margin each side to the width of the view", () => {
		expect(fitZoom(1080, BIG_BOUNDS, reach)).toBeCloseTo(0.1, 12);
		expect(fitZoom(1920, BIG_BOUNDS, reach)).toBeCloseTo(1920 / 10_800, 12);
		expect(fitZoom(1920, BIG_BOUNDS, reach)).toBeGreaterThan(fitZoom(1920, BIG_BOUNDS));
	});
	it("is never below 1/16: on a phone the farthest step is 1/16", () => {
		expect(FAR_MIN).toBe(1 / 16);
		expect(fitZoom(375, BIG_BOUNDS, reach)).toBe(1 / 16); // 375 / 10,800 is a 29th
		expect(fitZoom(375, BIG_BOUNDS)).toBe(1 / 16);
		expect(fitZoom(0, BIG_BOUNDS, reach)).toBe(1 / 16);
		expect(zoomSteps(375, BIG_BOUNDS, reach)).toEqual([4, 3, 2, 1, 0.5, 0.25, 0.125, 1 / 16]);
	});
	it("is the last step, after the fixed steps larger than it", () => {
		expect(zoomSteps(1080, BIG_BOUNDS, reach).slice(-2)).toEqual([0.125, fitZoom(1080, BIG_BOUNDS, reach)]);
		const wide = zoomSteps(1920, BIG_BOUNDS, reach); // a 6th: the 1/8 step is nearer than the fit and left out
		expect(wide).toEqual([4, 3, 2, 1, 0.5, 0.25, 1920 / 10_800]);
		expect(zoomSteps(0, BIG_BOUNDS, reach)).toEqual([...STEPS]);
	});
	it("never makes zooming out a no-op or a zoom in (the review): no fixed step within a fifth of the fit, and the fit never closer than 1", () => {
		const near = { x0: 0, x1: 1920 / 0.12 / (1 + 2 * 0.04) }; // a reach whose fit on 1920 is 0.12, next to the 1/8 step
		expect(zoomSteps(1920, BIG_BOUNDS, near)).toEqual([4, 3, 2, 1, 0.5, 0.25, fitZoom(1920, BIG_BOUNDS, near)]);
		const home = reachOf([{ x0: 448, x1: 506 }])!; // home alone, before the world row answers: its fit on 1920 would be about 1.9
		expect(fitZoom(1920, BIG_BOUNDS, home)).toBe(1);
		expect(zoomSteps(1920, BIG_BOUNDS, home)).toEqual([4, 3, 2, 1]);
		const out = zoomAbout(cam(7600, 1400, 1), zoomSteps(1920, BIG_BOUNDS, home), -1, { x: 960, y: 540 }, { w: 1920, h: 1080 }, BIG_BOUNDS, 0, true, home);
		expect(out.to).toBe(1);
	});
	it("falls back to the whole width when no island is given", () => {
		expect(zoomSteps(1920, BIG_BOUNDS, null)).toEqual(zoomSteps(1920, BIG_BOUNDS));
	});
	it("rests with the islands in the middle of the view when it is the fit, and about the pointer when the floor stopped it", () => {
		const steps = zoomSteps(1000, BIG_BOUNDS, reach); // V is 1000 wide: the fit is 1000 / 10,800
		const fit = zoomAbout(cam(5000, 1400, 0.125), steps, -1, { x: 900, y: 50 }, V, BIG_BOUNDS, 0, true, reach);
		expect(fit.to).toBe(steps[steps.length - 1]);
		expect([fit.x, fit.y]).toEqual([9000, 1280]);
		const phone = { w: 375, h: 700 };
		const floor = zoomSteps(phone.w, BIG_BOUNDS, reach); // ends at 1/16: the view shows 6,000 of the 10,800
		const far = zoomAbout(cam(5000, 1400, 0.125), floor, -1, { x: 300, y: 50 }, phone, BIG_BOUNDS, 0, true, reach);
		expect(far.to).toBe(1 / 16);
		expect(far.x).toBeCloseTo(5000 + (300 - 187.5) * (1 / 0.125 - 1 / (1 / 16)), 6); // the world point under the pointer stays under it
		expect(far.x).not.toBe(9000);
	});
});

describe("zooming about a point", () => {
	const steps = [4, 3, 2, 1, 0.5, 0.25, 0.125, 1000 / 16384];
	it("keeps the world point under the pointer where it was", () => {
		const c = zoomAbout(cam(8000, 1400, 1), steps, 1, { x: 750, y: 300 }, V, BIG_BOUNDS, 0, true);
		expect([c.x, c.y, c.to]).toEqual([8125, 1400, 2]);
		expect(toScreen(c, V, 0, 8250, 1400)).toEqual({ x: 750, y: 300 });
	});
	it("eases there over the zoom's 400 ms, from where it was", () => {
		const c = zoomAbout(cam(8000, 1400, 1), steps, 1, { x: 750, y: 300 }, V, BIG_BOUNDS, 1000, false);
		expect([c.from, c.to]).toEqual([1, 2]);
		expect(drift(c, V, BIG_BOUNDS, 1000).x).toBe(8000);
		expect(drift(c, V, BIG_BOUNDS, 1400).x).toBe(8125);
		expect(zoomAt(c, 1400)).toBe(2);
	});
	it("stops at the nearest and the farthest step", () => {
		expect(zoomAbout(cam(8000, 1400, 4), steps, 1, { x: 500, y: 300 }, V, BIG_BOUNDS, 0, true).to).toBe(4);
		const fit = zoomAbout(cam(8000, 1400, 0.125), steps, -1, { x: 500, y: 300 }, V, BIG_BOUNDS, 0, true);
		expect(fit.to).toBe(1000 / 16384);
		expect(zoomAbout(fit, steps, -1, { x: 500, y: 300 }, V, BIG_BOUNDS, 0, true).to).toBe(1000 / 16384);
	});
	it("shows sky round the whole world at the fit, centred on both axes", () => {
		const fit = zoomAbout(cam(3000, 400, 0.125), steps, -1, { x: 900, y: 50 }, V, BIG_BOUNDS, 0, true);
		expect([fit.x, fit.y]).toEqual([8192, 1280]);
	});
});

describe("panning and the clamps", () => {
	it("moves the world with the pointer", () => {
		const c = panBy(cam(8000, 1400, 2), 100, -50, V, BIG_BOUNDS, 0);
		expect([c.x, c.y]).toEqual([7950, 1425]);
	});
	it("stops at the world's edges on both axes", () => {
		expect(panBy(cam(600, 400, 1), 1000, 1000, V, BIG_BOUNDS, 0)).toMatchObject({ x: 500, y: 300 });
		expect(panBy(cam(16000, 2400, 1), -1000, -1000, V, BIG_BOUNDS, 0)).toMatchObject({ x: 15884, y: 2260 });
	});
});

describe("following him and coming home", () => {
	const him = { x: 7640, y: 1376 };
	const run = (c: Camera, h = him, close = false) => {
		for (let t = 33; t < 3000; t += 33) c = followBig(c, h, V, BIG_BOUNDS, t, 33, close, false, false);
		return c;
	};
	it("frames his feet with room above, as the small world frames the ground", () => {
		const c = newBigCamera(him, V, 1, BIG_BOUNDS);
		expect(c.x).toBe(7640);
		expect(toScreen(c, V, 0, him.x, him.y).y).toBeGreaterThan(300);
		expect(toScreen(c, V, 0, him.x, him.y).y).toBeLessThan(600);
	});
	it("keeps him at the dead zone's edge, and follows him up a step", () => {
		const c = run(newBigCamera(him, V, 1, BIG_BOUNDS), { x: him.x + 300, y: him.y });
		expect(c.x).toBeCloseTo(him.x + 300 - 0.15 * 1000, 1);
		const up = run(c, { x: him.x + 300, y: him.y - 32 });
		expect(up.y).toBeCloseTo(c.y - 32, 1);
	});
	it("keeps the phone's tighter dead zone whatever the device pixel ratio", () => {
		let c = newBigCamera(him, V, 1, BIG_BOUNDS);
		for (let t = 33; t < 3000; t += 33) c = followBig(c, { x: him.x + 300, y: him.y }, V, BIG_BOUNDS, t, 33, false, false, true);
		expect(c.x).toBeCloseTo(him.x + 300 - 0.06 * 1000, 1);
	});
	it("glides home from anywhere to the base zoom in 500 ms, and jumps under reduced motion", () => {
		const away = cam(2000, 600, 0.25);
		const c = homeTo(away, him, 1, V, BIG_BOUNDS, 1000, false);
		expect(c.to).toBe(1);
		const there = followBig(c, him, V, BIG_BOUNDS, 1600, 33, false, false, false);
		expect(there.x).toBeCloseTo(7640, 0);
		const jump = homeTo(away, him, 1, V, BIG_BOUNDS, 1000, true);
		expect([jump.x, jump.from, jump.to]).toEqual([7640, 1, 1]);
	});
	it("knows when he is off screen", () => {
		const c = cam(7640, 1300, 1);
		expect(offScreen(c, him, V, 0)).toBe(false);
		expect(offScreen(cam(2000, 1300, 1), him, V, 0)).toBe(true);
		expect(offScreen(cam(7640, 300, 1), him, V, 0)).toBe(true);
	});
});

describe("where he is on the view (the zoom keys and control zoom about him)", () => {
	const him = { x: 7640, y: 1376 };
	it("is his feet in canvas px while any of him is in view", () => {
		const c = newBigCamera(him, V, 1, BIG_BOUNDS);
		const at = himOnScreen(c, him, V, 0);
		expect(at).toEqual(toScreen(c, V, 0, him.x, him.y));
		expect(at?.x).toBe(500);
	});
	it("is still there with only his head in view, and gone once none of him is", () => {
		const head = cam(7640, 1376 - 330, 1); // his feet 30 px below the view, his head 2 px inside
		expect(himOnScreen(head, him, V, 0)).not.toBeNull();
		expect(himOnScreen(cam(7640, 1376 - 333, 1), him, V, 0)).toBeNull();
		expect(himOnScreen(cam(2000, 1300, 1), him, V, 0)).toBeNull();
	});
	it("keeps him where he stands on the view through a zoom about it, at home three steps in", () => {
		const steps = [4, 3, 2, 1, 0.5, 0.25, 0.125];
		let c = newBigCamera(him, V, 1, BIG_BOUNDS);
		for (let k = 0; k < 3; k++) {
			const at = himOnScreen(c, him, V, 0);
			expect(at).not.toBeNull();
			c = zoomAbout(c, steps, 1, at as { x: number; y: number }, V, BIG_BOUNDS, 0, true);
			const now = toScreen(c, V, 0, him.x, him.y);
			expect(now.x).toBeCloseTo(at?.x ?? NaN, 5);
			expect(now.y).toBeCloseTo(at?.y ?? NaN, 5);
			expect(offScreen(c, him, V, 0)).toBe(false);
		}
		expect(c.to).toBe(4);
	});
	it("pushes him off the bottom when the same steps zoom about the middle", () => {
		const steps = [4, 3, 2, 1, 0.5, 0.25, 0.125];
		let c = newBigCamera(him, V, 1, BIG_BOUNDS);
		for (let k = 0; k < 3; k++) c = zoomAbout(c, steps, 1, { x: V.w / 2, y: V.h / 2 }, V, BIG_BOUNDS, 0, true);
		expect(offScreen(c, him, V, 0)).toBe(true);
	});
});

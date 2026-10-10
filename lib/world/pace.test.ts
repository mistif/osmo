import { describe, expect, it } from "vitest";
import { newActor, type Actor } from "./actor";
import { AMBIENT_MS, CALM_FRAME_MS, FRAME_MS, nextTickIn, shouldDraw, SLOW_MS } from "./pace";

const a = newActor(200, 0, 12);
type Over = Partial<{ now: number; easing: boolean; hasWork: boolean; reducedMotion: boolean; lookIn: number | null; ambient: number | null }>;
const input = (actor: Actor, over: Over = {}) =>
	({ actor, now: 0, easing: false, hasWork: true, reducedMotion: false, ...over });

describe("the redraw pace", () => {
	it("ticks every frame while he walks, builds or turns, or the camera eases", () => {
		for (const kind of ["walking", "building", "turning"] as const) expect(nextTickIn(input({ ...a, kind }))).toBe(FRAME_MS);
		expect(nextTickIn(input(a, { easing: true, hasWork: false }))).toBe(FRAME_MS);
	});
	it("waits for the next block on one timer, not on frames", () => {
		expect(nextTickIn(input({ ...a, nextAt: 1800 }))).toBe(1800);
		expect(nextTickIn(input({ ...a, nextAt: 9000 }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, nextAt: 10 }))).toBe(FRAME_MS);
	});
	it("ticks every 3 s with nothing to do, and not at all while hidden", () => {
		expect(nextTickIn(input(a, { hasWork: false }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, kind: "resting" }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, hidden: true, kind: "walking" }))).toBeNull();
	});
	it("runs frames while he speaks to Gur, and waits for the window to close when quiet", () => {
		expect(nextTickIn(input({ ...a, kind: "facing", talk: "speaking" }))).toBe(FRAME_MS);
		expect(nextTickIn(input({ ...a, kind: "facing", quietSince: 0 }, { now: 1000 }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, kind: "facing", quietSince: 0 }, { now: 5500 }))).toBe(500);
	});
	it("slows the frames under reduced motion", () => {
		expect(nextTickIn(input({ ...a, kind: "walking" }, { reducedMotion: true }))).toBe(CALM_FRAME_MS);
	});
	it("wakes for a breath or a blink while he stands, never faster than a frame (polish pass)", () => {
		expect(nextTickIn(input(a, { hasWork: false, lookIn: 400 }))).toBe(400);
		expect(nextTickIn(input(a, { hasWork: false, lookIn: 5 }))).toBe(FRAME_MS);
		expect(nextTickIn(input(a, { hasWork: false, lookIn: 9000 }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, nextAt: 300 }, { lookIn: 900 }))).toBe(300); // the next block comes first
		expect(nextTickIn(input({ ...a, kind: "facing", quietSince: 0 }, { now: 1000, lookIn: 140 }))).toBe(140);
	});
	it("keeps the pace the life in the world asks for while it is on screen (polish pass)", () => {
		expect(nextTickIn(input(a, { hasWork: false, ambient: AMBIENT_MS }))).toBe(AMBIENT_MS);
		expect(nextTickIn(input(a, { hasWork: false, ambient: FRAME_MS }))).toBe(FRAME_MS);
		expect(nextTickIn(input(a, { hasWork: false, ambient: 1 }))).toBe(FRAME_MS); // the 30 frames a second cap holds
		expect(nextTickIn(input(a, { hasWork: false, ambient: null }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, kind: "resting" }, { ambient: AMBIENT_MS }))).toBe(AMBIENT_MS);
	});
	it("ignores both under reduced motion, and while hidden", () => {
		expect(nextTickIn(input(a, { hasWork: false, ambient: AMBIENT_MS, lookIn: 100, reducedMotion: true }))).toBe(SLOW_MS);
		expect(nextTickIn(input({ ...a, hidden: true }, { ambient: AMBIENT_MS, lookIn: 100 }))).toBeNull();
	});
	it("redraws a still frame only on a new block, mode, sky phase, zoom or tile", () => {
		const k = { laid: 3, kind: "idle", phase: "day", zoom: 2, tx: 10 };
		expect(shouldDraw(true, null, k)).toBe(true);
		expect(shouldDraw(true, k, { ...k })).toBe(false);
		expect(shouldDraw(true, k, { ...k, laid: 4 })).toBe(true);
		expect(shouldDraw(true, k, { ...k, kind: "facing" })).toBe(true);
		expect(shouldDraw(true, k, { ...k, phase: "dusk" })).toBe(true);
		expect(shouldDraw(true, k, { ...k, zoom: 4 })).toBe(true);
		expect(shouldDraw(true, k, { ...k, tx: 11 })).toBe(true); // he walks tile by tile, not in one jump on arrival
		expect(shouldDraw(false, k, { ...k })).toBe(true);
	});
});

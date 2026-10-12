import { describe, expect, it } from "vitest";
import type { BuildRow, Variation } from "../build/types";
import { asVariation, isFresh, lean, NOVELTY, REPEAT, REPEAT_WINDOW, scoreOf, tasteOf } from "./taste";

const v = (parts: string[], material: Variation["material"] = "stone"): Variation => ({
	width: 5, material, tiers: Object.fromEntries(parts.map((p, i) => [`t${i}`, { part: p, count: 1 }])), door: null, decor: [], sides: [],
});
const done = (id: string, recipe: string, params: unknown, finished: string): BuildRow => ({
	id, recipe, params, island: 1, x: 0, y: 0, footprint: { map: ["B"], decor: [], legend: { B: { tile: "brick", layer: "walls" } } }, total: 1, laid: 1, reason: null,
	started_at: finished, finished_at: finished,
});

describe("his taste (spec 4.4)", () => {
	const rows = [
		done("1", "cottage", v(["wall", "roof"]), "2026-10-01T00:00:00.000Z"),
		done("2", "cottage", v(["wall", "thatch"], "wood"), "2026-10-02T00:00:00.000Z"),
		done("3", "well", v(["ring"]), "2026-10-03T00:00:00.000Z"),
		done("4", "castle:hall", {}, "2026-10-04T00:00:00.000Z"),
		{ ...done("5", "tower", v(["shaft"]), "2026-10-05T00:00:00.000Z"), laid: 0, finished_at: null },
	];
	const t = tasteOf(rows);
	it("counts finished free builds' recipes, parts and materials, never the castle", () => {
		expect(t.recipes).toEqual({ cottage: 2, well: 1 });
		expect(t.parts).toEqual({ wall: 2, roof: 1, thatch: 1, ring: 1 });
		expect(t.materials).toEqual({ stone: 2, wood: 1 });
		expect([...t.used].sort()).toEqual(["cottage", "ring", "roof", "shaft", "thatch", "tower", "wall", "well"]);
	});
	it("weights what he has used, with a small bonus for each part not in his last five builds", () => {
		// three ponds since: the cottage is not among his last three builds, and its roof is not among his last five's parts
		const older = tasteOf([...rows, ...["a", "b", "c"].map((id, i) => done(id, "pond", v(["basin"], "wood"), `2026-10-0${6 + i}T00:00:00.000Z`))]);
		expect(scoreOf("cottage", v(["wall", "roof"]), older)).toBe(1 + 2 * lean(2) + 0.5 * (lean(2) + lean(1)) + 0.5 * lean(2) + NOVELTY);
		expect(scoreOf("statue", v(["plinth"]), t)).toBe(1 + 0.5 * lean(2) + NOVELTY);
	});
	it("adds weight with each use, less each time, so one recipe never runs away with his taste", () => {
		expect([0, 1, 3, 7, 15].map(lean)).toEqual([0, 1, 2, 3, 4]);
		const after = (k: number) => {
			const many = Array.from({ length: k }, (_, i) => done(`c${i}`, "cottage", v(["wall", "roof"]), `2026-09-${String(1 + i).padStart(2, "0")}T00:00:00.000Z`));
			const later = ["x", "y", "z"].map((id, i) => done(id, "well", v(["ring"]), `2026-10-0${1 + i}T00:00:00.000Z`)); // the cottage is not among his last builds
			return scoreOf("cottage", v(["wall", "roof"]), tasteOf([...many, ...later]));
		};
		expect(after(2)).toBeGreaterThan(after(1));
		expect(after(20)).toBeGreaterThan(after(10));
		expect(after(11) - after(10)).toBeLessThan(after(2) - after(1));
		expect(after(25)).toBeLessThan(6 * after(1));
	});
	it("weighs a recipe among his last REPEAT_WINDOW free builds (finished or not) at REPEAT, so he does not repeat himself", () => {
		expect(REPEAT_WINDOW).toBe(3);
		expect(t.last).toEqual(["cottage", "well", "tower"]);
		const plain = { ...t, last: [] };
		expect(scoreOf("cottage", v(["wall", "roof"]), t)).toBeCloseTo(REPEAT * scoreOf("cottage", v(["wall", "roof"]), plain), 9);
		expect(scoreOf("tower", v(["shaft"]), t)).toBeCloseTo(REPEAT * scoreOf("tower", v(["shaft"]), plain), 9);
		expect(scoreOf("statue", v(["plinth"]), t)).toBe(scoreOf("statue", v(["plinth"]), plain));
	});
	it("calls a recipe or a part he has never used fresh", () => {
		expect(isFresh("cottage", v(["wall", "roof"]), t)).toBe(false);
		expect(isFresh("cottage", v(["wall", "spire"]), t)).toBe(true);
		expect(isFresh("statue", v(["wall"]), t)).toBe(true);
		expect(isFresh("tower", v(["shaft"]), t)).toBe(false); // a tower in progress counts as used
	});
	it("reads saved params back as a variation only when they are one", () => {
		expect(asVariation(v(["wall"]))).toEqual(v(["wall"]));
		expect(asVariation({})).toBeNull();
		expect(asVariation(null)).toBeNull();
	});
});

import { describe, expect, it } from "vitest";
import type { Layer } from "../blueprints/types";
import type { TileId } from "../tiles";
import { compile } from "./compile";
import type { Part, Recipe, Site, Variation } from "./types";
import { partsOf } from "./util";
import { chooseVariation, vary } from "./variation";

const L = (tile: TileId, layer: Layer) => ({ tile, layer });
const FAKE: Part[] = [
	{ id: "f", name: "floor", group: "structure", role: "floor", material: null, fit: "row", overhang: 1, map: ["SSS"], legend: { S: L("step", "floor") } },
	{ id: "s", name: "wall", group: "structure", role: "storey", material: null, fit: "row", map: ["hhhhh", "IBvBI", "IBwBI", "IBBBI"],
		legend: { h: L("beam-h", "walls"), I: L("pillar", "walls"), B: L("brick", "walls"), v: L("window-top", "windows"), w: L("window", "windows") } },
	{ id: "w", name: "wood wall", group: "structure", role: "storey", material: "wood", fit: "row", map: ["hhh", "pPp", "pPp", "pPp"], legend: { h: L("beam-h", "walls"), p: L("pillar", "walls"), P: L("plank", "walls") } },
	{ id: "r", name: "roof", group: "tops", role: "roof", material: null, fit: "gable", map: ["<=>^"], legend: { "<": L("roof-left", "roof"), "=": L("roof-flat", "roof"), ">": L("roof-right", "roof"), "^": L("roof-peak", "roof") } },
	{ id: "t", name: "battlements", group: "tops", role: "roof", material: null, fit: "row", map: ["TTT"], legend: { T: L("battlement", "roof") } },
	{ id: "c", name: "chimney", group: "tops", role: "chimney", material: null, fit: "fixed", map: ["T", "C"], legend: { T: L("battlement", "roof"), C: L("brick", "roof") } },
	{ id: "d", name: "door", group: "structure", role: "door", material: null, fit: "fixed", map: ["a", "d"], legend: { a: L("door-top", "door"), d: L("door", "door") } },
	{ id: "l", name: "lantern", group: "additions", role: "decor", material: null, fit: "fixed", map: ["l"], legend: { l: L("lantern", "lanterns") } },
	{ id: "b", name: "banner", group: "additions", role: "decor", material: null, fit: "fixed", map: ["b", "e"], legend: { b: L("banner", "banners"), e: L("banner-end", "banners") } },
	{ id: "bench", name: "bench", group: "around", role: "side", material: null, fit: "fixed", map: ["n"], legend: { n: L("bench", "walls") } },
	{ id: "span", name: "deck", group: "travel", role: "span", material: "wood", fit: "row", map: ["rrr", "BBB"], legend: { r: L("fence", "walls"), B: L("plank", "floor") } },
	{ id: "post", name: "post", group: "travel", role: "anchor", material: "wood", fit: "fixed", map: ["p", "p", "p"], legend: { p: L("pillar", "walls") } },
];
const HUT: Recipe = {
	id: "hut", name: "hut", kind: "cottage", size: "small", site: "level", width: [7, 9], materials: ["stone", "wood"],
	tiers: [
		{ slot: "floor", role: "floor", parts: ["f"] },
		{ slot: "storey", role: "storey", parts: ["s", "w"], count: [1, 2] },
		{ slot: "roof", role: "roof", parts: ["r", "t"] },
		{ slot: "chimney", role: "chimney", parts: ["c"], optional: true },
	],
	doors: ["d"], decor: { parts: ["l", "b"], max: 2 }, sides: { parts: ["bench"], max: 1 },
};
const SITE: Site = { kind: "ground", island: 1, x: 100, w: 20, ground: 60, cliff: null };

const diff = (a: Variation, b: Variation): string[] => {
	const fields = (["width", "material", "door", "decor", "sides"] as const).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k): string => k);
	const tiers = Object.keys({ ...a.tiers, ...b.tiers }).filter((s) => JSON.stringify(a.tiers[s]) !== JSON.stringify(b.tiers[s])).map((s) => `tier ${s}`);
	return [...fields, ...tiers];
};

describe("choosing a variation", () => {
	it("is the same for the same seed and stays inside the recipe", () => {
		for (let seed = 0; seed < 200; seed++) {
			const v = chooseVariation(HUT, FAKE, seed);
			expect(chooseVariation(HUT, FAKE, seed)).toEqual(v);
			expect([7, 9]).toContain(v.width);
			expect(HUT.materials).toContain(v.material);
			expect(["f"]).toContain(v.tiers.floor?.part);
			expect(v.tiers.storey?.count).toBeGreaterThanOrEqual(1);
			expect(v.tiers.storey?.count).toBeLessThanOrEqual(2);
			expect(v.decor.length).toBeLessThanOrEqual(2);
			expect(v.sides.length).toBeLessThanOrEqual(1);
			expect(v.door).toBe("d");
			if (v.material === "stone") expect(v.tiers.storey?.part).toBe("s"); // the wood wall is wood's only
			expect(() => compile(HUT, v, SITE, FAKE)).not.toThrow();
		}
	});
	it("varies across seeds: both widths, both materials, the chimney sometimes, and different decor", () => {
		const all = Array.from({ length: 200 }, (_, s) => chooseVariation(HUT, FAKE, s));
		expect(new Set(all.map((v) => v.width))).toEqual(new Set([7, 9]));
		expect(new Set(all.map((v) => v.material))).toEqual(new Set(["stone", "wood"]));
		expect(all.some((v) => v.tiers.chimney === null) && all.some((v) => v.tiers.chimney !== null)).toBe(true);
		expect(new Set(all.map((v) => JSON.stringify(v))).size).toBeGreaterThan(40);
	});
	it("varies one of his own builds by exactly one choice", () => {
		for (let seed = 0; seed < 100; seed++) {
			const v = chooseVariation(HUT, FAKE, seed);
			const w = vary(v, HUT, FAKE, seed + 1000);
			expect(diff(v, w), `seed ${seed}`).toHaveLength(1);
			expect(vary(v, HUT, FAKE, seed + 1000)).toEqual(w);
			expect(() => compile(HUT, w, SITE, FAKE)).not.toThrow();
			expect(partsOf(w).every((id) => FAKE.some((p) => p.id === id))).toBe(true);
		}
	});
	it("refuses a recipe with no part for its material in a required tier", () => {
		expect(() => chooseVariation({ ...HUT, materials: ["brick"], tiers: [{ slot: "storey", role: "storey", parts: ["w"] }] }, FAKE, 1)).toThrow();
	});
});

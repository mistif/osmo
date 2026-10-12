import { describe, expect, it } from "vitest";
import { cellsOf } from "../blueprints";
import type { Layer } from "../blueprints/types";
import type { TileId } from "../tiles";
import { compile } from "./compile";
import type { Part, Recipe, Site, Variation } from "./types";

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
	{ id: "sh", name: "shutters", group: "structure", role: "decor", material: null, fit: "fixed", map: ["s", "s"], legend: { s: L("shutter", "banners") } },
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
const BRIDGE: Recipe = {
	id: "bridge", name: "bridge", kind: "rope-bridge", size: "medium", site: "bridge", width: [1, 1], materials: ["wood"],
	tiers: [{ slot: "span", role: "span", parts: ["span"] }, { slot: "anchor", role: "anchor", parts: ["post"] }],
	doors: [], decor: { parts: [], max: 0 }, sides: { parts: [], max: 0 },
};
const V1: Variation = {
	width: 7, material: "stone", tiers: { floor: { part: "f", count: 1 }, storey: { part: "s", count: 1 }, roof: { part: "r", count: 1 }, chimney: null },
	door: "d", decor: [{ part: "l", spot: 0 }], sides: [{ part: "bench", at: "left" }],
};
const SITE: Site = { kind: "ground", island: 1, x: 100, w: 20, ground: 60, cliff: null };

describe("the compiler (spec 4.2)", () => {
	const c = compile(HUT, V1, SITE, FAKE);
	const blocks = cellsOf(c.footprint, c.x, c.y, "hut");
	it("stacks floor, storey and roof, places it centred on its site, bottom row on the row above the ground", () => {
		expect([c.recipe, c.x, c.y, c.w, c.h, c.total]).toEqual(["hut", 104, 51, 11, 9, 55]);
		expect(blocks.filter((b) => b.layer === "floor").every((b) => b.y === 59)).toBe(true);
		expect(blocks.filter((b) => b.layer === "floor")).toHaveLength(9);
	});
	it("gives each tile and layer its own letter in first-seen order", () => {
		expect(c.footprint.map[0]).toBe("......A....");
		expect(c.footprint.map[5]).toBe("...FGGGGGF.");
		expect(c.footprint.map[7]).toBe("...FGGIGGF.");
		expect(c.footprint.map[8]).toBe("J.KKKKKKKKK");
		expect(c.footprint.decor[7]).toBe(".....L.....");
		expect(c.footprint.legend).toMatchObject({ A: L("roof-peak", "roof"), E: L("beam-h", "walls"), H: L("door-top", "door"), I: L("door", "door"), J: L("bench", "walls"), K: L("step", "floor"), L: L("lantern", "lanterns") });
	});
	it("sets one door in the middle of the lowest storey, on the floor, and turns the window above it into wall", () => {
		expect(blocks.filter((b) => b.tile === "door")).toEqual([{ x: 110, y: 58, tile: "door", layer: "door" }]);
		expect(blocks.find((b) => b.tile === "door-top")).toMatchObject({ x: 110, y: 57 });
		expect(blocks.some((b) => b.tile === "window-top" || b.tile === "window")).toBe(false);
	});
	it("hangs decor on the nearest free wall beside the door, a banner on two wall cells", () => {
		const two = compile(HUT, { ...V1, decor: [{ part: "l", spot: 0 }, { part: "b", spot: 0 }] }, SITE, FAKE);
		const d = cellsOf(two.footprint, two.x, two.y, "hut").filter((b) => b.layer === "lanterns" || b.layer === "banners");
		expect(d).toContainEqual({ x: 109, y: 58, tile: "lantern", layer: "lanterns" });
		expect(d).toContainEqual({ x: 111, y: 57, tile: "banner", layer: "banners" });
		expect(d).toContainEqual({ x: 111, y: 58, tile: "banner-end", layer: "banners" });
	});
	it("hangs decor only on a storey's three wall rows inside its corner posts, and shutters only beside a window", () => {
		const two: Variation = { ...V1, tiers: { ...V1.tiers, storey: { part: "s", count: 2 } } };
		let shutters = 0;
		for (let spot = 0; spot < 30; spot++) {
			for (const part of ["l", "b", "sh"]) {
				const c = compile(HUT, { ...two, decor: [{ part, spot }] }, SITE, FAKE);
				const bs = cellsOf(c.footprint, c.x, c.y, "hut");
				const on = (tile: string) => new Set(bs.filter((b) => b.tile === tile).map((b) => `${b.x},${b.y}`));
				const beams = on("beam-h");
				const caps = on("pillar");
				const windows = bs.filter((b) => b.layer === "windows");
				for (const d of bs.filter((b) => b.layer === "lanterns" || b.layer === "banners")) {
					expect(beams.has(`${d.x},${d.y}`), `${part} ${spot} on a beam`).toBe(false);
					expect(caps.has(`${d.x},${d.y}`), `${part} ${spot} on a corner post`).toBe(false);
					if (d.tile !== "shutter") continue;
					shutters++;
					expect(windows.some((w) => w.y === d.y && Math.abs(w.x - d.x) === 1), `shutter ${spot} beside a window`).toBe(true);
				}
			}
		}
		expect(shutters).toBeGreaterThan(0);
		// one storey: its only window became wall over the door, so no shutter is hung at all
		const one = compile(HUT, { ...V1, decor: [{ part: "sh", spot: 3 }] }, SITE, FAKE);
		expect(cellsOf(one.footprint, one.x, one.y, "hut").some((b) => b.tile === "shutter")).toBe(false);
	});
	it("stands a side on the ground one tile from the body, and a chimney on the roof's right slope", () => {
		expect(blocks.find((b) => b.tile === "bench")).toMatchObject({ x: 104, y: 59 });
		const right = compile(HUT, { ...V1, sides: [{ part: "bench", at: "right" }] }, SITE, FAKE);
		expect(cellsOf(right.footprint, right.x, right.y, "hut").find((b) => b.tile === "bench")?.x).toBe(right.x + right.w - 1);
		const ch = compile(HUT, { ...V1, tiers: { ...V1.tiers, chimney: { part: "c", count: 1 } } }, SITE, FAKE);
		const cb = cellsOf(ch.footprint, ch.x, ch.y, "hut");
		expect(cb).toContainEqual({ x: 112, y: 51, tile: "battlement", layer: "roof" });
		expect(cb).toContainEqual({ x: 112, y: 52, tile: "brick", layer: "roof" });
		// it stands in the slope, not on its corner: the slope cell under it is the chimney's foot, shingles round it
		expect(cb).toContainEqual({ x: 112, y: 53, tile: "chimney-base", layer: "roof" });
		expect(cb.some((b) => b.x === 112 && b.y === 53 && b.tile === "roof-right")).toBe(false);
	});
	it("sinks a top into the roof under it, its hub on the peak and its arm over the roof's face, drawn over the shingles", () => {
		const sails: Part = { id: "x", name: "sails", group: "tops", role: "top", material: null, fit: "fixed", map: ["s", "h", "s"], sink: 2, legend: { s: L("sail", "walls"), h: L("post", "walls") } };
		const MILL: Recipe = { ...HUT, id: "mill", tiers: [...HUT.tiers.slice(0, 3), { slot: "sails", role: "top", parts: ["x"] }], decor: { parts: [], max: 0 }, sides: { parts: [], max: 0 } };
		const v: Variation = { ...V1, tiers: { ...V1.tiers, sails: { part: "x", count: 1 } }, decor: [], sides: [] };
		const m = compile(MILL, v, SITE, [...FAKE, sails]);
		const bs = cellsOf(m.footprint, m.x, m.y, "mill");
		const plain = cellsOf(compile(HUT, { ...V1, decor: [], sides: [] }, SITE, FAKE).footprint, 0, 0, "hut");
		const peak = bs.find((b) => b.tile === "hub-roof");
		expect(peak).toBeDefined();
		if (!peak) return;
		expect(bs).toContainEqual({ x: peak.x, y: peak.y + 1, tile: "sail-roof", layer: "roof" });
		expect(bs).toContainEqual({ x: peak.x, y: peak.y - 1, tile: "sail", layer: "walls" });
		expect(bs.some((b) => b.tile === "roof-peak")).toBe(false);
		expect(m.h).toBe(Math.max(...plain.map((b) => b.y)) - Math.min(...plain.map((b) => b.y)) + 2); // one row over the roof
	});
	it("stacks storeys, narrows nothing for a row roof, and puts a cliff build flush to its cliff", () => {
		const tall = compile(HUT, { ...V1, tiers: { ...V1.tiers, storey: { part: "s", count: 2 }, roof: { part: "t", count: 1 } } }, SITE, FAKE);
		expect(tall.h).toBe(10);
		expect(compile(HUT, V1, { ...SITE, cliff: "left" }, FAKE).x).toBe(100);
		expect(compile(HUT, V1, { ...SITE, cliff: "right" }, FAKE).x).toBe(109);
	});
	it("refuses a part it does not have, one in the wrong tier, and a required tier left out", () => {
		expect(() => compile(HUT, { ...V1, tiers: { ...V1.tiers, roof: { part: "nope", count: 1 } } }, SITE, FAKE)).toThrow('no part "nope"');
		expect(() => compile(HUT, { ...V1, tiers: { ...V1.tiers, roof: { part: "f", count: 1 } } }, SITE, FAKE)).toThrow();
		expect(() => compile(HUT, { ...V1, tiers: { ...V1.tiers, roof: null } }, SITE, FAKE)).toThrow("the roof tier is required");
	});
	it("hangs a bridge between its two anchors: one board a column on a sagging curve, level with each end, a rope over every board", () => {
		const v: Variation = { width: 1, material: "wood", tiers: { span: { part: "span", count: 1 }, anchor: { part: "post", count: 1 } }, door: null, decor: [], sides: [] };
		const site: Site = { kind: "bridge", from: 1, to: 2, a: { x: 200, y: 60 }, b: { x: 230, y: 64 } };
		const br = compile(BRIDGE, v, site, FAKE);
		const bb = cellsOf(br.footprint, br.x, br.y, "bridge");
		for (const y of [57, 58, 59]) expect(bb).toContainEqual({ x: 200, y, tile: "pillar", layer: "walls" });
		for (const y of [61, 62, 63]) expect(bb).toContainEqual({ x: 230, y, tile: "pillar", layer: "walls" });
		const deck: number[] = [];
		for (let x = 201; x < 230; x++) {
			const boards = bb.filter((b) => b.x === x && b.tile === "plank").map((b) => b.y);
			expect(boards, `column ${x}`).toHaveLength(1);
			expect(bb, `the rope over column ${x}`).toContainEqual({ x, y: boards[0] - 1, tile: "fence", layer: "walls" });
			expect(bb.filter((b) => b.x === x)).toHaveLength(2);
			deck.push(boards[0]);
		}
		expect([deck[0], deck[deck.length - 1]]).toEqual([60, 64]); // level with the island top at each end
		for (let k = 1; k < deck.length; k++) expect(Math.abs(deck[k] - deck[k - 1]), `step at ${201 + k}`).toBeLessThanOrEqual(1);
		expect(deck[215 - 201]).toBeGreaterThan(62); // half way it hangs below the straight line between its ends (62)
		expect(() => compile(BRIDGE, v, SITE, FAKE)).toThrow("needs a bridge site");
	});
});

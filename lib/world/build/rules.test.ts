import { describe, expect, it } from "vitest";
import type { Layer } from "../blueprints/types";
import { DOCK_DECK, HOME_ISLAND, homeGround } from "../map/home";
import type { TileId } from "../tiles";
import { compile } from "./compile";
import { checkBuild, ruleWorldOf } from "./rules";
import type { Compiled, Footprint, Part, Recipe, RuleWorld, Site, Variation } from "./types";

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
// A flat world for the rules: land from row 60 down between columns 90 and 139.
const FLAT: RuleWorld = { w: 1024, h: 160, land: (x, y) => x >= 90 && x < 140 && y >= 60, taken: () => false };

const rules = (c: Compiled, site: Site = SITE, world = FLAT, recipe: Recipe = HUT) => checkBuild(c, recipe, site, world).map((p) => p.rule);
const fp = (map: string[], legend: Footprint["legend"], decor: string[] = []): Footprint => ({ map, decor, legend });
const at = (footprint: Footprint, x: number, y: number): Compiled => ({ recipe: "test", footprint, x, y, w: footprint.map[0].length, h: footprint.map.length, total: 0 });
const NO_DOOR: Recipe = { ...HUT, doors: [] };

describe("the rules every build passes (spec 4.3)", () => {
	it("passes a well-made build on level land", () => {
		expect(rules(compile(HUT, V1, SITE, FAKE))).toEqual([]);
	});
	it("finds a block in mid-air, and holds an overhang joined to the ground", () => {
		const floating = at(fp(["A..", "...", "BBB"], { A: L("brick", "walls"), B: L("step", "floor") }), 100, 57);
		expect(rules(floating, SITE, FLAT, NO_DOOR)).toContain("mid-air");
		const tree = at(fp(["AAA", ".B.", ".B."], { A: L("pine-c", "roof"), B: L("trunk", "walls") }), 100, 57);
		expect(rules(tree, SITE, FLAT, NO_DOOR)).toEqual([]);
	});
	it("lets no block hang under another: only a bridge's deck may hang", () => {
		const overhang = at(fp(["BBB", "B.B", "B.."], { B: L("brick", "walls") }), 100, 57);
		expect(checkBuild(overhang, NO_DOOR, SITE, FLAT)).toEqual([{ rule: "mid-air", x: 102, y: 58 }]);
	});
	it("allows at most one door, needs it when the recipe has one, and stands it on the build's floor", () => {
		expect(rules(at(fp(["d.d", "SSS"], { d: L("door", "door"), S: L("step", "floor") }), 100, 58))).toContain("door");
		expect(rules(at(fp(["BBB", "SSS"], { B: L("brick", "walls"), S: L("step", "floor") }), 100, 58))).toContain("door");
		expect(rules(at(fp(["BdB", "B.B"], { B: L("brick", "walls"), d: L("door", "door") }), 100, 58))).toContain("door");
		expect(rules(at(fp(["BBB", "SSS"], { B: L("brick", "walls"), S: L("step", "floor") }), 100, 58), SITE, FLAT, NO_DOOR)).toEqual([]);
	});
	it("hangs decor only on the build's own wall or back wall", () => {
		const legend = { B: L("brick", "walls"), S: L("step", "floor"), R: L("roof-flat", "roof"), l: L("lantern", "lanterns") };
		expect(rules(at(fp(["BR", "SS"], legend, ["l.", ".."]), 100, 58), SITE, FLAT, NO_DOOR)).toEqual([]);
		expect(rules(at(fp(["BR", "SS"], legend, [".l", ".."]), 100, 58), SITE, FLAT, NO_DOOR)).toContain("decor");
	});
	it("keeps a build inside its site with land under every block of its bottom row", () => {
		const legend = { S: L("step", "floor") };
		expect(rules(at(fp(["SSS"], legend), 99, 59), SITE, FLAT, NO_DOOR)).toContain("site");
		const gap = { ...FLAT, land: (x: number, y: number) => FLAT.land(x, y) && x !== 101 };
		expect(rules(at(fp(["SSS"], legend), 100, 59), SITE, gap, NO_DOOR)).toContain("site");
	});
	it("overlaps no other build and no land", () => {
		const one = at(fp(["S"], { S: L("step", "floor") }), 105, 59);
		expect(rules(one, SITE, { ...FLAT, taken: (x, y) => x === 105 && y === 59 }, NO_DOOR)).toContain("overlap");
		expect(rules(at(fp(["S", "S"], { S: L("step", "floor") }), 105, 59), SITE, FLAT, NO_DOOR)).toContain("overlap");
	});
	it("is at most 24 rows tall and inside the world", () => {
		const column = at(fp(Array.from({ length: 25 }, () => "B"), { B: L("brick", "walls") }), 105, 35);
		expect(rules(column, SITE, FLAT, NO_DOOR)).toContain("tall");
		expect(rules(at(fp(["S"], { S: L("step", "floor") }), -1, 59), { ...SITE, x: -5 }, { ...FLAT, land: () => true }, NO_DOOR)).toContain("bounds");
	});
	it("lets a bridge hang between two anchors, and only then", () => {
		const v: Variation = { width: 1, material: "wood", tiers: { span: { part: "span", count: 1 }, anchor: { part: "post", count: 1 } }, door: null, decor: [], sides: [] };
		const site: Site = { kind: "bridge", from: 1, to: 2, a: { x: 200, y: 60 }, b: { x: 230, y: 64 } };
		const edges = { w: 1024, h: 160, land: (x: number, y: number) => (x <= 200 && y >= 60) || (x >= 230 && y >= 64), taken: () => false };
		const br = compile(BRIDGE, v, site, FAKE);
		expect(checkBuild(br, BRIDGE, site, edges)).toEqual([]);
		const oneEnd = { ...edges, land: (x: number, y: number) => x <= 200 && y >= 60 };
		expect(checkBuild(br, BRIDGE, site, oneEnd).map((p) => p.rule)).toContain("mid-air");
		// the same deck sagging under a hut's floor is not a bridge: it hangs, so it is in mid-air. (The sloped deck above
		// only falls toward the far post, which holds it sideways; a deck between two level ends dips, and its dip hangs.)
		const level: Site = { kind: "bridge", from: 1, to: 2, a: { x: 200, y: 60 }, b: { x: 230, y: 60 } };
		const levelEdges = { w: 1024, h: 160, land: (x: number, y: number) => (x <= 200 || x >= 230) && y >= 60, taken: () => false };
		const dip = compile(BRIDGE, v, level, FAKE);
		expect(checkBuild(dip, BRIDGE, level, levelEdges)).toEqual([]);
		expect(checkBuild(dip, { ...BRIDGE, site: "level" }, level, levelEdges).map((p) => p.rule)).toContain("mid-air");
	});
	it("sees land under each island's top row, and scenery as no land", () => {
		const w = ruleWorldOf({ seed: 0, gen: 1, islands: [HOME_ISLAND], ground: homeGround() }, [{ x: 460, y: 70, w: 5, h: 5 }]);
		expect([w.w, w.h]).toEqual([1024, 160]);
		expect(w.land(470, 86)).toBe(true);
		expect(w.land(470, 85)).toBe(false);
		expect(w.land(453, 83)).toBe(false); // a pine on the home island
		expect(w.taken(462, 72)).toBe(true);
		expect(w.taken(465, 72)).toBe(false);
	});
	it("counts the balloon dock's boards as land when it is given, and only its boards", () => {
		const map = { seed: 0, gen: 1, islands: [HOME_ISLAND], ground: homeGround() };
		expect(ruleWorldOf(map, []).land(509, 86)).toBe(false);
		const docked = ruleWorldOf(map, [], [DOCK_DECK]);
		expect([506, 507, 508, 509].map((x) => docked.land(x, 86))).toEqual([true, true, true, true]);
		expect(docked.land(509, 85)).toBe(false);
		expect(docked.land(510, 86)).toBe(false);
	});
});

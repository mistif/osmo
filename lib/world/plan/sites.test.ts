import { describe, expect, it } from "vitest";
import { CASTLE_RECTS } from "../build/castle-sites";
import type { BuildRow, Part, Recipe, Variation } from "../build/types";
import type { Island, WorldMap } from "../map/types";
import { freeRuns, placeWords, sitesFor } from "./sites";

const flat = (id: number, x0: number, w: number, top: number, home = false): Island => ({ id, x0, x1: x0 + w, ground: top, top: Array.from({ length: w }, () => top), home });
const HOME = flat(0, 448, 58, 86, true);
const EAST = flat(1, 530, 100, 70); // 24 columns of sky after home's 506, 20 after the dock's far board
const WEST = { ...flat(2, 300, 120, 110), top: Array.from({ length: 120 }, (_, i) => (i < 60 ? 110 : 111)) }; // too far below home for a bridge
const MAP: WorldMap = { seed: 7, gen: 1, islands: [HOME, EAST, WEST], ground: [] };
const recipe = (id: Recipe["id"], site: Recipe["site"] = "level", kind = id): Recipe => ({
	id, name: id.replace(/-/g, " "), kind: kind as Recipe["kind"], size: "small", site, width: [3, 3], materials: ["stone"], tiers: [], doors: [], decor: { parts: [], max: 0 }, sides: { parts: [], max: 0 },
});
const RECIPES = [recipe("cottage"), recipe("tower"), recipe("garden", "beside"), recipe("well"), recipe("lighthouse", "cliff"), recipe("rope-bridge", "bridge"), recipe("orchard")];
const PARTS: Part[] = ["a", "b", "c"].map((id) => ({ id, name: `part ${id}`, group: "structure", role: "storey", material: null, fit: "fixed", map: ["A"], legend: { A: { tile: "brick", layer: "walls" } } }));
const fakeChoose = (r: Recipe, _p: readonly Part[], seed: number): Variation => ({
	width: 3, material: "stone", tiers: { body: { part: ["a", "b", "c"][Math.abs(seed) % 3], count: 1 } }, door: null, decor: [], sides: [],
});
const row = (id: string, rec: string, over: Partial<BuildRow> = {}): BuildRow => ({
	id, recipe: rec, params: fakeChoose(recipe(rec), PARTS, id.length), island: 1, x: 560, y: 66, footprint: { map: ["BBBBB"], decor: [], legend: { B: { tile: "brick", layer: "walls" } } },
	total: 5, laid: 5, reason: `I wanted a ${rec}.`, started_at: "2026-10-10T10:00:00.000Z", finished_at: "2026-10-10T11:00:00.000Z", ...over,
});
// A finished cottage on the east island: x 560 to 564, rows 66 to 69, on its row 70.
const HOUSE = row("h1", "cottage", { footprint: { map: ["BBBBB", "BBBBB", "BBBBB", "BBBBB"], decor: [], legend: { B: { tile: "brick", layer: "walls" } } } });

describe("where he may build (spec 4.8)", () => {
	it("finds level runs, all but each island's ends, split at a step, around what is built", () => {
		const runs = freeRuns(MAP, [{ x: 560, y: 60, w: 10, h: 10 }]);
		const east = runs.filter((r) => r.island === 1);
		expect(east.map((r) => [r.x, r.w])).toEqual([[531, 29], [570, 59]]);
		const west = runs.filter((r) => r.island === 2);
		expect(west.map((r) => [r.x, r.w, r.ground])).toEqual([[301, 59, 110], [360, 59, 111]]);
	});
	it("puts his own island first, nearest his last build, then the nearest island", () => {
		const sites = sitesFor(recipe("cottage"), MAP, [row("f1", "cottage")], { island: 1, x: 600 }, []);
		expect(sites[0]).toMatchObject({ kind: "ground", island: 1 });
		expect(sitesFor(recipe("cottage"), MAP, [], { island: 0, x: 477 }, [])[0]).toMatchObject({ island: 0 });
	});
	it("leaves the home island to the castle: with its rooms reserved, the first site from home is on the east island", () => {
		const fromHome = sitesFor(recipe("cottage"), MAP, [], { island: 0, x: 477 }, CASTLE_RECTS);
		expect(fromHome.some((s) => s.kind === "ground" && s.island === 0)).toBe(false);
		expect(fromHome[0]).toMatchObject({ kind: "ground", island: 1 });
	});
	it("offers cliff sites at an island's ends, beside sites by a house, and bridges between near islands", () => {
		const cliffs = sitesFor(recipe("lighthouse", "cliff"), MAP, [], { island: 1, x: 600 }, []);
		expect(cliffs.every((s) => s.kind === "ground" && s.cliff !== null)).toBe(true);
		expect(cliffs).toContainEqual({ kind: "ground", island: 1, x: 531, w: 98, ground: 70, cliff: "left" });
		const beside = sitesFor(recipe("garden", "beside"), MAP, [HOUSE], { island: 1, x: 600 }, [{ x: 560, y: 66, w: 5, h: 4 }]);
		expect(beside.length).toBeGreaterThan(0);
		expect(beside.every((s) => s.kind === "ground" && s.island === 1)).toBe(true);
		const bridges = sitesFor(recipe("rope-bridge", "bridge"), MAP, [], { island: 0, x: 477 }, CASTLE_RECTS);
		expect(bridges).toEqual([{ kind: "bridge", from: 0, to: 1, a: { x: 509, y: 86 }, b: { x: 530, y: 70 } }]);
	});
	it("offers no bridge over more than 60 columns or 16 rows, or where one stands", () => {
		const far: WorldMap = { ...MAP, islands: [HOME, flat(1, 600, 100, 80)] };
		expect(sitesFor(recipe("rope-bridge", "bridge"), far, [], { island: 0, x: 477 }, [])).toEqual([]);
		const steep: WorldMap = { ...MAP, islands: [HOME, flat(1, 530, 100, 60)] };
		expect(sitesFor(recipe("rope-bridge", "bridge"), steep, [], { island: 0, x: 477 }, [])).toEqual([]);
		const standing = row("b1", "rope-bridge", { x: 509, y: 67, island: 0, footprint: { map: ["B".repeat(22)], decor: [], legend: { B: { tile: "brick", layer: "walls" } } } });
		expect(sitesFor(recipe("rope-bridge", "bridge"), MAP, [standing], { island: 0, x: 477 }, [])).toEqual([]);
	});
	it("says where in words", () => {
		expect(placeWords({ kind: "ground", island: 1, x: 531, w: 98, ground: 70, cliff: "left" }, MAP, [], RECIPES)).toBe("on the east island, by the cliff");
		expect(placeWords({ kind: "ground", island: 2, x: 301, w: 59, ground: 110, cliff: null }, MAP, [], RECIPES)).toBe("on the west island");
		expect(placeWords({ kind: "ground", island: 1, x: 565, w: 64, ground: 70, cliff: null }, MAP, [HOUSE], RECIPES, "beside")).toBe("on the east island, beside the cottage");
		expect(placeWords({ kind: "ground", island: 1, x: 565, w: 64, ground: 70, cliff: null }, MAP, [HOUSE], RECIPES)).toBe("on the east island");
		expect(placeWords({ kind: "bridge", from: 0, to: 1, a: { x: 509, y: 86 }, b: { x: 530, y: 70 } }, MAP, [], RECIPES)).toBe("between the home island and the east island");
	});
});

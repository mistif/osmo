import { describe, expect, it } from "vitest";
import type { Block } from "../blueprints/types";
import { TILE } from "../blueprints/types";
import { HOME_ISLAND, HOME_TOP } from "../map/home";
import type { Island } from "../map/types";
import { CASTLE_RECIPES } from "./castle";
import { compile } from "./compile";
import { PARTS } from "./parts";
import { standBeside } from "./stand";
import type { Compiled, Site } from "./types";
import { chooseVariation } from "./variation";

// The dev page's recipe preview stands Osmo a tile beside the build, on the side that has ground (the hand checks: he
// stood past the castle observatory's cliff).
const build = (x: number, w: number, y = 50, h = 10): Compiled => ({ recipe: "t", footprint: { map: [], decor: [], legend: {} }, x, y, w, h, total: 0 });
const island = (x0: number, x1: number, top = 60): Island => ({ id: 1, x0, x1, ground: top, top: Array.from({ length: x1 - x0 }, () => top), home: false });
const mid = (col: number) => col * TILE + TILE / 2;

describe("where Osmo stands in a build's picture", () => {
	it("is a tile to the right of the build, on the island's top, when the ground is there", () => {
		const c = build(20, 6);
		expect(standBeside(c, island(0, 100), [])).toEqual({ x: mid(27), y: 60 * TILE });
	});
	it("is a tile to the left when the ground ends before the right side", () => {
		const c = build(20, 6);
		expect(standBeside(c, island(0, 27), [])).toEqual({ x: mid(18), y: 60 * TILE }); // the island's last column is 26: no ground at 27
		expect(standBeside(c, island(0, 28), [])).toEqual({ x: mid(27), y: 60 * TILE }); // 27 is its last column: ground
		expect(standBeside(c, island(10, 27), [])).toEqual({ x: mid(18), y: 60 * TILE });
	});
	it("takes the right when both sides have ground, and when only the right has", () => {
		const c = build(20, 6);
		expect(standBeside(c, island(10, 100), [])).toEqual({ x: mid(27), y: 60 * TILE });
		expect(standBeside(c, island(19, 100), [])).toEqual({ x: mid(27), y: 60 * TILE }); // none at 18
	});
	it("stands at the height of the ground in his own column", () => {
		const hilly: Island = { ...island(0, 100), top: Array.from({ length: 100 }, (_, i) => (i === 27 ? 58 : 60)) };
		expect(standBeside(build(20, 6), hilly, [])).toEqual({ x: mid(27), y: 58 * TILE });
	});
	it("is on the build's own floor when there is no ground on either side", () => {
		const c = build(20, 6);
		const floor = (x: number, y: number): Block => ({ x, y, tile: "step", layer: "floor" });
		const wall: Block = { x: 23, y: 59, tile: "brick", layer: "walls" };
		const laid = [floor(20, 58), floor(21, 58), floor(22, 59), floor(23, 59), floor(24, 59), wall, floor(25, 59)];
		const here = standBeside(c, island(20, 26), laid); // the island is the build's width
		expect(here).toEqual({ x: mid(23), y: 59 * TILE }); // the lowest floor row, its block nearest the middle column (23)
		expect(standBeside(c, undefined, laid)).toEqual(here);
	});
	it("is on the build's bottom edge, in the middle, when it has no floor at all", () => {
		const c = build(20, 6);
		expect(standBeside(c, island(20, 26), [])).toEqual({ x: mid(23), y: 60 * TILE });
	});
	it("keeps the castle's six rooms on the home island's ground, not past a cliff", () => {
		const site: Site = { kind: "ground", island: 0, x: HOME_ISLAND.x0, w: HOME_ISLAND.x1 - HOME_ISLAND.x0, ground: HOME_TOP, cliff: null };
		for (const r of CASTLE_RECIPES) {
			const c = compile(r, chooseVariation(r, PARTS, 0), site, PARTS);
			const at = standBeside(c, HOME_ISLAND, []);
			const col = Math.floor(at.x / TILE);
			expect(col, r.id).toBeGreaterThanOrEqual(HOME_ISLAND.x0);
			expect(col, r.id).toBeLessThan(HOME_ISLAND.x1);
			expect(col < c.x || col >= c.x + c.w, r.id).toBe(true);
			expect(at.y, r.id).toBe(HOME_TOP * TILE);
		}
		const observatory = CASTLE_RECIPES.find((r) => r.id === "castle:observatory");
		expect(observatory).toBeDefined();
		if (!observatory) return;
		const c = compile(observatory, chooseVariation(observatory, PARTS, 0), site, PARTS);
		expect(standBeside(c, HOME_ISLAND, []).x).toBeLessThan(c.x * TILE); // beside it on the left: its right side is past the island's end
	});
});

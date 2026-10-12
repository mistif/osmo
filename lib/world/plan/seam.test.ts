import { describe, expect, it } from "vitest";
import { moodWords } from "../../agent/slow-mood";
import { checkWillBody } from "../../chat/will";
import { cellsOf } from "../blueprints";
import { CASTLE_ROOMS } from "../blueprints/types";
import { CASTLE_RECTS, castleAt, castleFootprint, castleRecipeId } from "../build/castle-sites";
import { compile } from "../build/compile";
import { PARTS } from "../build/parts";
import { RECIPES } from "../build/recipes";
import { checkBuild, ruleWorldOf } from "../build/rules";
import type { BuildRow } from "../build/types";
import { chooseVariation, vary } from "../build/variation";
import { generateWorld } from "../map/generate";
import { DOCK_DECK } from "../map/home";
import type { Rect, WorldMap } from "../map/types";
import { newRow, pickByCode, plan, willBody } from "./planner";
import { sitesFor } from "./sites";

const DONE = "2026-10-01T00:00:00.000Z";
// The castle finished, as six saved rows.
const CASTLE: BuildRow[] = CASTLE_ROOMS.map((room) => {
	const at = castleAt(room);
	const footprint = castleFootprint(room);
	const total = cellsOf(footprint, at.x, at.y, castleRecipeId(room)).length;
	return { id: `castle-${room}`, recipe: castleRecipeId(room), params: {}, island: 0, ...at, footprint, total, laid: total, reason: null, started_at: DONE, finished_at: DONE };
});
const TAKEN: Rect[] = [...CASTLE.map((r) => ({ x: r.x, y: r.y, w: r.footprint.map[0].length, h: r.footprint.map.length })), ...CASTLE_RECTS];
// What I1 passes: the real compiler, rules and variations, the dock's boards as land.
const deps = (map: WorldMap) => ({ compile, check: checkBuild, choose: chooseVariation, vary, world: (taken: readonly Rect[]) => ruleWorldOf(map, taken, [DOCK_DECK]) });
const input = (seed: number) => {
	const map = generateWorld(seed, 1, 4);
	return { seed, n: 0, map, rows: CASTLE, recipes: RECIPES, parts: PARTS, mood: "calm" as const, him: { island: 0, x: 477 }, blocked: CASTLE_RECTS };
};

describe("the real planner on a generated world (T1, T5, T6, T8 and T9 together)", () => {
	it.each(Array.from({ length: 20 }, (_, s) => s))("seed %i: three candidates of different recipes, each passing every real rule, and a body the route takes", (seed) => {
		const inp = input(seed);
		const cands = plan(inp, deps(inp.map));
		expect(cands).toHaveLength(3);
		expect(new Set(cands.map((c) => c.recipe.id)).size).toBe(3);
		const world = ruleWorldOf(inp.map, TAKEN, [DOCK_DECK]);
		for (const c of cands) {
			expect(checkBuild(c.compiled, c.recipe, c.site, world), `${c.recipe.id} at ${JSON.stringify(c.site)}`).toEqual([]);
			if (c.site.kind === "ground") expect(c.site.island, "never a free build on the castle's island").not.toBe(0);
		}
		expect(checkWillBody(JSON.parse(JSON.stringify(willBody(cands, moodWords(null), CASTLE, RECIPES))))).not.toBeNull();
	});
	it.each([2, 7, 9])("seed %i: code's picks do not repeat themselves as his builds pile up (spec 4.4)", (seed) => {
		const inp = input(seed);
		const rows = [...CASTLE];
		const picked: string[] = [];
		for (let n = 0; n < 16; n++) {
			const cands = plan({ ...inp, n, rows }, deps(inp.map));
			if (cands.length === 0) break;
			const c = cands[pickByCode(cands, seed, n)];
			const at = new Date(Date.parse(DONE) + (n + 1) * 86_400_000).toISOString();
			rows.push({ ...newRow(c, "x"), id: `b${n}`, laid: c.compiled.total, started_at: at, finished_at: at });
			picked.push(c.recipe.id);
		}
		expect(picked.length).toBe(16);
		const run = picked.reduce((m, id, i) => {
			let k = 1;
			while (i - k >= 0 && picked[i - k] === id) k++;
			return Math.max(m, k);
		}, 0);
		expect(run, picked.join(" ")).toBeLessThanOrEqual(2);
		const most = Math.max(...picked.map((id) => picked.filter((x) => x === id).length));
		expect(most, picked.join(" ")).toBeLessThanOrEqual(5);
	});
	it("places a rope bridge wherever two islands face each other within reach, the one east of home from the dock", () => {
		const bridge = RECIPES.find((r) => r.id === "rope-bridge");
		if (!bridge) throw new Error("no rope bridge recipe");
		let tried = 0;
		let fromDock = 0;
		for (let seed = 0; seed < 200; seed++) {
			const inp = input(seed);
			const world = ruleWorldOf(inp.map, TAKEN, [DOCK_DECK]);
			for (const site of sitesFor(bridge, inp.map, CASTLE, inp.him, TAKEN)) {
				if (site.kind !== "bridge") continue;
				tried++;
				if (site.a.x === 509) fromDock++;
				const c = compile(bridge, chooseVariation(bridge, PARTS, seed), site, PARTS);
				expect(checkBuild(c, bridge, site, world), `seed ${seed}: ${JSON.stringify(site)}`).toEqual([]);
			}
		}
		expect(tried).toBeGreaterThan(0);
		expect(fromDock).toBeGreaterThan(0);
	});
});

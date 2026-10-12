import { describe, expect, it } from "vitest";
import { CASTLE_RECTS } from "../build/castle-sites";
import type { BuildRow, Compiled, Part, Recipe, RuleWorld, Site, Variation } from "../build/types";
import type { Island, Rect, WorldMap } from "../map/types";
import { WILL_LIMITS } from "../will/types";
import { decidedToday, decisionDue, newRow, OWN_MAX, pickByCode, plan, returnDecisions, willBody } from "./planner";

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
// Every recipe compiles to a 5 by 4 box on the row above its site's ground; a bridge to the box of its posts and deck, as
// the real one lies: from the post on a to the post on b, from the posts' tops (three over the higher end) down to the
// deck's row at the lower end, so a bridge east of home covers the dock's far board's column from row 67 to 85.
const fakeCompile = (r: Recipe, _v: Variation, s: Site): Compiled => {
	const box = (x: number, y: number, w: number, h: number): Compiled => ({
		recipe: r.id, footprint: { map: Array.from({ length: h }, () => "B".repeat(w)), decor: [], legend: { B: { tile: "brick", layer: "walls" } } }, x, y, w, h, total: w * h,
	});
	if (s.kind === "bridge") {
		const y = Math.min(s.a.y, s.b.y) - 3;
		return box(s.a.x, y, s.b.x - s.a.x + 1, Math.max(s.a.y, s.b.y) - y);
	}
	return box(s.cliff === "right" ? s.x + s.w - 5 : s.cliff === "left" ? s.x : s.x + Math.floor((s.w - 5) / 2), s.ground - 4, 5, 4);
};
// It passes unless it leaves its site or covers a taken cell.
const fakeCheck = (c: Compiled, _r: Recipe, s: Site, world: RuleWorld) => {
	const out = [];
	if (s.kind === "ground" && (c.x < s.x || c.x + c.w > s.x + s.w)) out.push({ rule: "site" as const, x: c.x, y: c.y });
	for (let x = c.x; x < c.x + c.w; x++) for (let y = c.y; y < c.y + c.h; y++) if (world.taken(x, y)) out.push({ rule: "overlap" as const, x, y });
	return out;
};
const fakeChoose = (r: Recipe, _p: readonly Part[], seed: number): Variation => ({
	width: 3, material: "stone", tiers: { body: { part: ["a", "b", "c"][Math.abs(seed) % 3], count: 1 } }, door: null, decor: [], sides: [],
});
const fakeVary = (v: Variation): Variation => ({ ...v, width: 5 });
const world = (taken: readonly Rect[]): RuleWorld => ({ w: 1024, h: 160, land: () => false, taken: (x, y) => taken.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) });
const DEPS = { compile: fakeCompile, check: fakeCheck, choose: fakeChoose, vary: fakeVary, world };
const row = (id: string, rec: string, over: Partial<BuildRow> = {}): BuildRow => ({
	id, recipe: rec, params: fakeChoose(recipe(rec), PARTS, id.length), island: 1, x: 560, y: 66, footprint: { map: ["BBBBB"], decor: [], legend: { B: { tile: "brick", layer: "walls" } } },
	total: 5, laid: 5, reason: `I wanted a ${rec}.`, started_at: "2026-10-10T10:00:00.000Z", finished_at: "2026-10-10T11:00:00.000Z", ...over,
});
const INPUT = { seed: 7, n: 0, map: MAP, rows: [] as BuildRow[], recipes: RECIPES, parts: PARTS, mood: "calm" as const, him: { island: 0, x: 477 }, blocked: CASTLE_RECTS };
// A finished cottage on the east island: x 560 to 564, rows 66 to 69, on its row 70.
const HOUSE = row("h1", "cottage", { footprint: { map: ["BBBBB", "BBBBB", "BBBBB", "BBBBB"], decor: [], legend: { B: { tile: "brick", layer: "walls" } } } });

describe("the planner (spec 4.8)", () => {
	it("offers three candidates of different recipes: one he leans toward, one for his mood, one new to him", () => {
		const on = (day: number) => ({ started_at: `2026-10-0${day}T10:00:00.000Z`, finished_at: `2026-10-0${day}T11:00:00.000Z` });
		const rows = [row("w1", "well", on(1)), row("w2", "well", on(2)), row("w3", "well", on(3)), row("c1", "cottage", on(4)), row("o1", "orchard", on(5)), row("o2", "orchard", on(6))];
		const cands = plan({ ...INPUT, rows, mood: "bright" }, DEPS);
		expect(cands.map((c) => c.why)).toEqual(["leaned", "mood", "fresh"]);
		expect(new Set(cands.map((c) => c.recipe.id)).size).toBe(3);
		expect(cands[0].recipe.id).toBe("well");
		// three wells in a row: he leans away from the well for now (taste.ts REPEAT)
		expect(plan({ ...INPUT, rows: rows.slice(0, 3), mood: "bright" }, DEPS)[0].recipe.id).not.toBe("well");
		expect(["tower", "lighthouse"]).toContain(cands[1].recipe.id);
		expect(cands[2].fresh).toBe(true);
		for (const c of cands) expect(fakeCheck(c.compiled, c.recipe, c.site, world(CASTLE_RECTS))).toEqual([]);
	});
	it("chooses the same for two tabs with the same rows, and differently for the next decision", () => {
		const a = plan({ ...INPUT, mood: "low" }, DEPS);
		expect(plan({ ...INPUT, mood: "low" }, DEPS)).toEqual(a);
		expect(pickByCode(a, 7, 0)).toBe(pickByCode(a, 7, 0));
		const picks = new Set(Array.from({ length: 40 }, (_, n) => pickByCode(a, 7, n)));
		expect(picks.size).toBeGreaterThan(1);
	});
	it("puts a lighthouse on a cliff and a garden beside a house, never on a taken cell", () => {
		const cands = plan({ ...INPUT, rows: [HOUSE], recipes: [recipe("lighthouse", "cliff"), recipe("garden", "beside"), recipe("well")] }, DEPS);
		expect(cands).toHaveLength(3);
		const light = cands.find((c) => c.recipe.id === "lighthouse");
		expect(light?.site.kind === "ground" && light.site.cliff).toBeTruthy();
		const garden = cands.find((c) => c.recipe.id === "garden");
		expect(garden?.site).toMatchObject({ kind: "ground", island: 1, ground: 70 });
		// a run that starts or ends 2 columns from the house (560 to 564): the open ground kept beside every build (sites.ts SPACE)
		if (garden?.site.kind === "ground") expect(garden.site.x === 567 || garden.site.x + garden.site.w === 558).toBe(true);
		const meets = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
		for (const c of cands) for (const r of [{ x: 560, y: 66, w: 5, h: 4 }, ...CASTLE_RECTS]) expect(meets(c.compiled, r), `${c.recipe.id} on ${JSON.stringify(r)}`).toBe(false);
	});
	it("takes a curious mood to an island he has not built on, when it has room", () => {
		const cands = plan({ ...INPUT, rows: [row("w1", "well")], mood: "curious", him: { island: 1, x: 600 } }, DEPS);
		expect(cands.find((c) => c.why === "mood")?.site).toMatchObject({ kind: "ground", island: 2 });
	});
	it("offers the bridge east of home from the dock's far board, which a blocked dock would forbid", () => {
		const recipes = [recipe("rope-bridge", "bridge"), recipe("well"), recipe("tower")];
		const bridge = plan({ ...INPUT, recipes }, DEPS).find((c) => c.recipe.id === "rope-bridge");
		expect(bridge?.site).toEqual({ kind: "bridge", from: 0, to: 1, a: { x: 509, y: 86 }, b: { x: 530, y: 70 } });
		expect(bridge?.compiled.x).toBe(509);
		const dockBlocked = plan({ ...INPUT, recipes, blocked: [...CASTLE_RECTS, { x: 506, y: 84, w: 4, h: 4 }] }, DEPS);
		expect(dockBlocked.some((c) => c.recipe.id === "rope-bridge")).toBe(false);
	});
	it("takes a missing mood to the site nearest the hall", () => {
		const recipes = [recipe("cottage"), recipe("tower"), recipe("well"), recipe("orchard")];
		const cands = plan({ ...INPUT, recipes, mood: "missing" }, DEPS);
		// the home island is the castle's: the west island's second run (centre 389.5) is nearer column 477 than the east island's (centre 580)
		expect(cands.find((c) => c.why === "mood")?.site).toMatchObject({ kind: "ground", island: 2, x: 360 });
	});
	it("offers fewer than three only when no other recipe fits", () => {
		const cands = plan({ ...INPUT, recipes: [recipe("well"), recipe("tower")] }, DEPS);
		expect(cands).toHaveLength(2);
		expect(new Set(cands.map((c) => c.recipe.id)).size).toBe(2);
		expect(plan({ ...INPUT, recipes: [recipe("well")] }, DEPS)).toHaveLength(1);
	});
	it("offers nothing when no site is free", () => {
		const full = [{ x: 0, y: 0, w: 1024, h: 160 }];
		expect(plan({ ...INPUT, blocked: full }, DEPS)).toEqual([]);
	});
	it("stays cheap as his builds pile up: each option is tried on each site at most once, his own recipes from his last OWN_MAX builds", () => {
		const tried: string[] = [];
		let varied = 0;
		const counting = {
			...DEPS,
			compile: (r: Recipe, v: Variation, s: Site, p: readonly Part[]) => {
				tried.push(JSON.stringify([r.id, v, s]));
				return fakeCompile(r, v, s);
			},
			check: () => [{ rule: "site" as const, x: 0, y: 0 }], // nothing fits: every pass tries every option
			vary: (v: Variation) => {
				varied++;
				return fakeVary(v);
			},
		};
		const rows = Array.from({ length: 12 }, (_, i) => row(`r${i}`, i % 2 ? "well" : "orchard", { started_at: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`, finished_at: `2026-10-${String(i + 1).padStart(2, "0")}T11:00:00.000Z` }));
		expect(plan({ ...INPUT, rows, mood: "missing" }, counting)).toEqual([]);
		expect(OWN_MAX).toBe(8);
		expect(varied).toBe(OWN_MAX);
		expect(tried.length).toBeGreaterThan(0);
		expect(new Set(tried).size).toBe(tried.length);
	});
	it("builds the model's body inside its limits, and the row to insert", () => {
		const cands = plan({ ...INPUT, rows: [row("w1", "well", { reason: "x".repeat(300) })] }, DEPS);
		const body = willBody(cands, "calm and ".repeat(40), [row("w1", "well", { reason: "x".repeat(300) })], RECIPES);
		expect(body.candidates).toHaveLength(3);
		expect(body.mood.length).toBeLessThanOrEqual(WILL_LIMITS.mood);
		expect(body.recent).toEqual([{ name: "well", reason: "x".repeat(140) }]);
		for (const c of body.candidates) {
			expect(c.name.length).toBeLessThanOrEqual(60);
			expect(c.place.length).toBeLessThanOrEqual(80);
			expect(c.parts.length).toBeLessThanOrEqual(5);
		}
		expect(() => willBody(cands.slice(0, 2), "calm", [], RECIPES)).toThrow();
		const r = newRow(cands[0], "I wanted water close at hand, so I am building a well.");
		expect(r).toMatchObject({ recipe: cands[0].recipe.id, laid: 0, x: cands[0].compiled.x, y: cands[0].compiled.y, total: cands[0].compiled.total });
	});
});

describe("when a decision is due (spec 4.8)", () => {
	const due = { building: false, castleWaiting: false, budget: 1, quietMs: 120_000, decidedToday: 0 };
	it("is due when nothing is building, a block has accrued and the talk has been quiet two minutes, at most four a day", () => {
		expect(decisionDue(due)).toBe(true);
		expect(decisionDue({ ...due, building: true })).toBe(false);
		expect(decisionDue({ ...due, castleWaiting: true })).toBe(false);
		expect(decisionDue({ ...due, budget: 0 })).toBe(false);
		expect(decisionDue({ ...due, quietMs: 119_999 })).toBe(false);
		expect(decisionDue({ ...due, decidedToday: 4 })).toBe(false);
	});
	it("makes at most three missed decisions on return, never past four in the day", () => {
		expect([0, 1, 2, 3, 4, 9].map(returnDecisions)).toEqual([3, 3, 2, 1, 0, 0]);
	});
	it("counts today's decisions by the local calendar, across midnight", () => {
		const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
		const rows = [row("a", "well", { started_at: local(11, 23, 50) }), row("b", "well", { started_at: local(12, 0, 10) }), row("c", "castle:hall", { started_at: local(12, 1) })];
		expect(decidedToday(rows, new Date(2026, 9, 12, 9).getTime())).toBe(1);
		expect(decidedToday(rows, new Date(2026, 9, 11, 23, 59).getTime())).toBe(1);
	});
});

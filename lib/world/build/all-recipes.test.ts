import { describe, expect, it } from "vitest";
import { CASTLE_RECIPES } from "./castle";
import { compile } from "./compile";
import { PARTS } from "./parts";
import { RECIPES } from "./recipes";
import { checkBuild } from "./rules";
import type { Recipe, RuleWorld, Site } from "./types";
import { chooseVariation } from "./variation";

// Two flat islands: A, columns 100 to 299, top row 60; B, columns 330 to 529, top row 66 (30 columns of sky, a drop of 6).
const WORLD: RuleWorld = {
	w: 1024, h: 160, taken: () => false,
	land: (x, y) => (x >= 100 && x < 300 && y >= 60 && y < 100) || (x >= 330 && x < 530 && y >= 66 && y < 100),
};
const siteFor = (r: Recipe): Site =>
	r.site === "bridge" ? { kind: "bridge", from: 1, to: 2, a: { x: 299, y: 60 }, b: { x: 330, y: 66 } }
	: r.site === "cliff" ? { kind: "ground", island: 1, x: 101, w: 60, ground: 60, cliff: "left" }
	: { kind: "ground", island: 1, x: 120, w: 60, ground: 60, cliff: null };

describe.each(RECIPES.map((r) => [r.id, r] as const))("the %s, with 50 seeds (spec 4.3)", (_, r) => {
	it("compiles every time and passes every rule, at most 24 tall, its footprint and params inside the table's limits", () => {
		for (let seed = 0; seed < 50; seed++) {
			const v = chooseVariation(r, PARTS, seed);
			const site = siteFor(r);
			const c = compile(r, v, site, PARTS);
			expect(checkBuild(c, r, site, WORLD), `${r.id} seed ${seed}: ${JSON.stringify(v)}`).toEqual([]);
			expect(c.h).toBeLessThanOrEqual(24);
			expect(c.total).toBeGreaterThan(0);
			expect(JSON.stringify(c.footprint).length).toBeLessThanOrEqual(16_384);
			expect(JSON.stringify(v).length).toBeLessThanOrEqual(2_048);
		}
	});
});

describe("the grammar as a whole (spec 4.2)", () => {
	it("makes several hundred distinct builds from the twenty recipes", () => {
		const seen = new Set<string>();
		for (const r of RECIPES) for (let seed = 0; seed < 50; seed++) seen.add(JSON.stringify(compile(r, chooseVariation(r, PARTS, seed), siteFor(r), PARTS).footprint));
		expect(seen.size).toBeGreaterThanOrEqual(300);
	});
	it("keeps the castle's six rooms at today's counts", () => {
		expect(CASTLE_RECIPES.map((r) => compile(r, chooseVariation(r, PARTS, 0), siteFor(r), PARTS).total)).toEqual([180, 84, 101, 61, 69, 149]);
	});
});

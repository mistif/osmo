import { describe, expect, it } from "vitest";
import { CASTLE_ROOMS } from "../blueprints/types";
import { CASTLE_RECIPES } from "./castle";
import { castleAt } from "./castle-sites";
import { compile } from "./compile";
import { chooseVariation } from "./variation";

const COUNTS = { hall: 180, library: 84, workshop: 101, study: 61, gate: 69, observatory: 149 };
const ANY_SITE = { kind: "ground" as const, island: 3, x: 0, w: 5, ground: 30, cliff: null };

describe("the castle's six rooms as fixed recipes (spec 4.2)", () => {
	it("are the six rooms by recipe name, in spec order", () => {
		expect(CASTLE_RECIPES.map((r) => r.id)).toEqual(CASTLE_ROOMS.map((room) => `castle:${room}`));
		for (const r of CASTLE_RECIPES) expect(r.kind).toBe("castle");
	});
	it.each(CASTLE_ROOMS)("%s compiles to today's block count at its place, whatever the site or variation", (room) => {
		const r = CASTLE_RECIPES.find((x) => x.id === `castle:${room}`);
		expect(r).toBeDefined();
		if (!r) return;
		const c = compile(r, chooseVariation(r, [], 1), ANY_SITE, []);
		expect(c.total).toBe(COUNTS[room]);
		expect({ x: c.x, y: c.y }).toEqual(castleAt(room));
	});
});

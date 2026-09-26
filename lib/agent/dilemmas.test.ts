import { describe, expect, it } from "vitest";
import { VALUES } from "./state";
import { DILEMMAS, findDilemma, nextDilemma } from "./dilemmas";

describe("dilemma library", () => {
	it("has 8 well-formed scenarios starting with the trolley problem", () => {
		expect(DILEMMAS).toHaveLength(8);
		expect(DILEMMAS[0].id).toBe("trolley");
		expect(new Set(DILEMMAS.map((d) => d.id)).size).toBe(8);
		for (const d of DILEMMAS) {
			expect(d.options.length).toBeGreaterThanOrEqual(2);
			expect(d.options.length).toBeLessThanOrEqual(3);
			for (const o of d.options) {
				for (const v of VALUES) {
					expect(o.scores[v]).toBeGreaterThanOrEqual(-1);
					expect(o.scores[v]).toBeLessThanOrEqual(1);
				}
			}
		}
	});
});

describe("findDilemma and nextDilemma", () => {
	it("matches a scenario by keyword", () => {
		expect(findDilemma("what would you do if I found a wallet")?.id).toBe("wallet");
	});

	it("returns null when nothing matches", () => {
		expect(findDilemma("what would you do if aliens landed")).toBeNull();
	});

	it("walks the library in order, then cycles without crashing", () => {
		expect(nextDilemma([]).id).toBe("trolley");
		expect(nextDilemma(["trolley"]).id).toBe(DILEMMAS[1].id);
		expect(() => nextDilemma(DILEMMAS.map((d) => d.id))).not.toThrow();
	});
});

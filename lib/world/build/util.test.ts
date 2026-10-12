import { describe, expect, it } from "vitest";
import { hash01, partsOf, pickIndex, roofRows, rowsAt, sizeOf } from "./util";

describe("the seeded hash", () => {
	it("is the same every time, in 0..1, and differs by key", () => {
		expect(hash01(7, 3)).toBe(hash01(7, 3));
		const all = Array.from({ length: 200 }, (_, k) => hash01(42, k));
		for (const h of all) {
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThan(1);
		}
		expect(new Set(all).size).toBeGreaterThan(190);
		expect(hash01(1, 0)).not.toBe(hash01(2, 0));
	});
	it("picks an index inside the list", () => {
		for (let k = 0; k < 50; k++) expect(pickIndex(9, k, 3)).toBeLessThan(3);
		expect(pickIndex(9, 0, 0)).toBe(0);
	});
});

describe("row parts at a width", () => {
	it("centres the pattern so the windows sit evenly", () => {
		expect(rowsAt(["hhhhh", "IBvBI", "IBwBI", "IBBBI"], 7)).toEqual(["hhhhhhh", "IBBvBBI", "IBBwBBI", "IBBBBBI"]);
		expect(rowsAt(["IBBvBI"], 9)).toEqual(["IBvBBBvBI"]);
	});
	it("reads a mirrored pair of letters (1 and 2, 3 and 4: a canopy's corners) as the same both ways, so every tree is whole", () => {
		const orchard = ["..1F2.", "..3F4.", "...t.."];
		for (const w of [9, 11, 13, 15]) {
			const [top, , trunk] = rowsAt(orchard, w);
			expect(top.match(/1F2/g)?.length, `${w}: ${top}`).toBe((top.match(/F/g) ?? []).length); // no tree cut at an end
			expect(trunk.match(/t/g)?.length).toBe(top.match(/1F2/g)?.length);
		}
		expect(rowsAt(orchard, 9)[0]).toBe(".1F2.1F2.");
	});
	it("keeps only the caps at width 2, and refuses less or a ragged part", () => {
		expect(rowsAt(["SSS"], 2)).toEqual(["SS"]);
		expect(() => rowsAt(["SSS"], 1)).toThrow("a row is at least 2 wide, not 1");
		expect(() => rowsAt(["SSS", "SSSS"], 5)).toThrow();
	});
});

describe("roofs at a width", () => {
	it("narrows a gable by one each side per row, to a peak", () => {
		expect(roofRows("<=>^", 5, "gable")).toEqual(["..^..", ".<=>.", "<===>"]);
		expect(roofRows("<=>^", 4, "gable")).toEqual([".<>.", "<==>"]);
		expect(roofRows("<=>^", 1, "gable")).toEqual(["^"]);
	});
	it("narrows a spire every second row", () => {
		expect(roofRows("<=>^", 3, "spire")).toEqual([".^.", ".^.", "<=>", "<=>"]);
	});
	it("gives a spire with six letters its own slopes for the upper row of each pair, and one peak at the top", () => {
		// lower left, fill, lower right, peak, upper left, upper right: two rows per inset, a 2:1 slope
		expect(roofRows("<=>^{}", 5, "spire")).toEqual(["..^..", ".{=}.", ".<=>.", "{===}", "<===>"]);
		expect(roofRows("<=>^{}", 3, "spire")).toEqual([".^.", "{=}", "<=>"]);
		expect(roofRows("<=>^{}", 1, "spire")).toEqual(["^"]);
	});
	it("ends a roof whose peak letter is a dot flat, at its last row of three or more (a dome)", () => {
		expect(roofRows("(=).", 5, "gable")).toEqual([".(=).", "(===)"]);
		expect(roofRows("(=).", 7, "gable")).toEqual(["..(=)..", ".(===).", "(=====)"]);
		expect(roofRows("(=).", 3, "gable")).toEqual(["(=)"]);
	});
	it("refuses a part that is not four letters (six for a spire)", () => {
		expect(() => roofRows("<=>", 5, "gable")).toThrow();
		expect(() => roofRows("<=>^{}", 5, "gable")).toThrow();
	});
});

describe("a variation's parts and a build's size", () => {
	it("lists every part once: tiers, door, decor, sides", () => {
		const v = {
			width: 7, material: "stone" as const, tiers: { floor: { part: "f", count: 1 }, storey: { part: "s", count: 2 }, chimney: null, roof: { part: "r", count: 1 } },
			door: "d", decor: [{ part: "l", spot: 0 }, { part: "l", spot: 3 }], sides: [{ part: "b", at: "left" as const }],
		};
		expect(partsOf(v)).toEqual(["f", "s", "r", "d", "l", "b"]);
	});
	it("calls under 80 blocks small, under 200 medium, the rest large", () => {
		expect([sizeOf(79), sizeOf(80), sizeOf(199), sizeOf(200)]).toEqual(["small", "medium", "medium", "large"]);
	});
});

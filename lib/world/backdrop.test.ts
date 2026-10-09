import { describe, expect, it } from "vitest";
import { CLOUD_CELL, CLOUD_GRIDS, CLOUD_SHAPES, FAR_ISLANDS } from "./backdrop";
import { gridProblems } from "./raster";

describe("the cloud sheet", () => {
	it.each(CLOUD_GRIDS.map((g, i) => [i, g] as const))("cloud %i fits its cell in cloud letters only", (_, g) => {
		expect(gridProblems(g, CLOUD_CELL.w, CLOUD_CELL.h)).toEqual([]);
		expect(g.join("").replace(/\./g, "")).toMatch(/^[FGXp]+$/);
	});
	it("knows where each cloud is drawn inside its cell, and leaves room at the edges", () => {
		for (const s of CLOUD_SHAPES) {
			expect(s.x0).toBeGreaterThan(0);
			expect(s.x1).toBeLessThan(CLOUD_CELL.w);
			expect(s.x1 - s.x0).toBeGreaterThan(60);
			expect(s.y0).toBeGreaterThan(0);
		}
	});
});

describe("the far islands", () => {
	it("are two or three shapes, each made of runs inside its own width", () => {
		expect(FAR_ISLANDS.length).toBeGreaterThanOrEqual(2);
		expect(FAR_ISLANDS.length).toBeLessThanOrEqual(3);
		for (const f of FAR_ISLANDS) {
			expect(f.runs.length).toBeGreaterThan(20);
			for (const [, x0, x1, tone] of f.runs) {
				expect(x0).toBeGreaterThanOrEqual(0);
				expect(x1).toBeLessThanOrEqual(f.w);
				expect(x1).toBeGreaterThan(x0);
				expect([0, 1, 2]).toContain(tone);
			}
		}
	});
});

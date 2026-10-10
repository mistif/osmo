import { describe, expect, it } from "vitest";
import { BIRD_CELL, BIRD_GRIDS, CLOUD_CELL, CLOUD_GRIDS, CLOUD_SHAPES, FAR_ISLANDS, HILLS, silhouette } from "./backdrop";
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

describe("a hand-drawn silhouette (polish pass)", () => {
	it("fills its outline by scanlines, lights its top and hazes its underside", () => {
		// A square 10 wide from y 0 to 10 with a tree 2 wide from y -4.
		const s = silhouette([[0, 0], [4, 0], [4, -4], [6, -4], [6, 0], [10, 0], [10, 10], [0, 10]]);
		expect(s.w).toBe(10);
		const at = (x: number, y: number) => s.runs.find(([ry, x0, x1]) => ry === y && x >= x0 && x < x1)?.[3];
		expect(at(5, -4)).toBe(1); // the tree's top is lit
		expect(at(1, 0)).toBe(1); // the shoulder beside it too
		expect(at(5, 2)).toBe(0); // the body
		expect(at(5, 9)).toBe(2); // the underside, in haze
		expect(at(5, 6)).toBe(3); // between the two, the body dithered into the haze
		expect(at(11, 5)).toBeUndefined();
		expect(at(5, -5)).toBeUndefined();
		expect([s.top, s.bottom]).toEqual([-4, 10]);
	});
	it("keeps a dithered row as one run, not a run a pixel (review B1)", () => {
		const s = silhouette([[0, 0], [40, 0], [40, 20], [0, 20]]);
		const dithered = s.runs.filter(([y]) => y / 20 > 0.5 && y / 20 <= 0.72);
		expect(dithered.length).toBeGreaterThan(0);
		for (const [, x0, x1, tone] of dithered) expect([x0, x1, tone]).toEqual([0, 40, 3]);
	});
	// The renderer draws each shape from a kept bitmap, so the runs cost nothing a frame; this budget only stops the
	// dither (or anything else) from exploding them again. Before the fix the hills alone were 27,357 runs; now the
	// hills are 759 and the three far islands 862 (372, 218, 272): about six runs a row, from the lit rims along the
	// tree crowns, towers and keels.
	it("keeps the hills and the far islands to a budget of runs (review B1)", () => {
		const total = HILLS.runs.length + FAR_ISLANDS.reduce((n, f) => n + f.runs.length, 0);
		expect(total).toBeLessThan(1_800);
	});
});

describe("the far islands", () => {
	it("are two or three shapes, each made of runs inside its own width", () => {
		expect(FAR_ISLANDS.length).toBeGreaterThanOrEqual(2);
		expect(FAR_ISLANDS.length).toBeLessThanOrEqual(3);
		for (const f of FAR_ISLANDS) {
			expect(f.runs.length).toBeGreaterThan(20);
			for (const [y, x0, x1, tone] of f.runs) {
				expect(x0).toBeGreaterThanOrEqual(0);
				expect(x1).toBeLessThanOrEqual(f.w);
				expect(x1).toBeGreaterThan(x0);
				expect([0, 1, 2, 3]).toContain(tone);
				expect(y).toBeGreaterThanOrEqual(f.top);
				expect(y).toBeLessThan(f.bottom);
			}
		}
	});
	it("are three places of their own, hand drawn: each has something standing on it and something hanging under it", () => {
		expect(FAR_ISLANDS).toHaveLength(3);
		expect(new Set(FAR_ISLANDS.map((f) => f.w)).size).toBe(3);
		for (const f of FAR_ISLANDS) {
			const ys = f.runs.map(([y]) => y);
			expect(Math.min(...ys)).toBeLessThanOrEqual(-8); // a tree, a tower or a hill above its top line
			expect(Math.max(...ys)).toBeGreaterThanOrEqual(40);
			// Under it, in its lowest fifth, at least two parts hang apart from each other.
			const low = Math.max(...ys) - Math.round(Math.max(...ys) / 5);
			const lowRow = f.runs.filter(([y]) => y === low);
			expect(lowRow.length).toBeGreaterThanOrEqual(2);
		}
	});
});

describe("the hills (polish pass)", () => {
	it("are one ridge across their whole width that wraps without a seam", () => {
		const top = (x: number) => Math.min(...HILLS.runs.filter(([, x0, x1]) => x >= x0 && x < x1).map(([y]) => y));
		for (let x = 0; x < HILLS.w; x++) expect(Number.isFinite(top(x)), `${x}`).toBe(true);
		expect(Math.abs(top(0) - top(HILLS.w - 1))).toBeLessThanOrEqual(2);
		const tops = Array.from({ length: HILLS.w }, (_, x) => top(x));
		expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThanOrEqual(24); // hills, not a flat band
		expect(HILLS.w).toBeGreaterThanOrEqual(640);
		expect(HILLS.parallax).toBeGreaterThan(0.12); // nearer than the far islands
		expect(HILLS.parallax).toBeLessThan(0.6);
		expect(HILLS.drop).toBeGreaterThan(0);
		expect(Math.max(...HILLS.runs.map(([y]) => y))).toBeGreaterThanOrEqual(72); // deep enough for the haze band to swallow their foot
	});
});

describe("the birds (polish pass)", () => {
	it("are two small dark cells, wings up and wings down", () => {
		expect(BIRD_GRIDS).toHaveLength(2);
		for (const g of BIRD_GRIDS) {
			expect(gridProblems(g, BIRD_CELL.w, BIRD_CELL.h)).toEqual([]);
			expect(g.join("").replace(/\./g, "")).toMatch(/^[ab]+$/);
		}
		expect(BIRD_GRIDS[0]).not.toEqual(BIRD_GRIDS[1]);
	});
});

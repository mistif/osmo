import { describe, expect, it } from "vitest";
import { PALETTE } from "./palette";
import { encodePng } from "./png";
import { colours, gridProblems, parseColor, parseHsl, rasterize, sheetProblem } from "./raster";

describe("the palette", () => {
	it("has single-letter ASCII keys, six-digit hex values, and no dot", () => {
		for (const [k, v] of Object.entries(PALETTE)) {
			expect(k).toMatch(/^[a-zA-Z]$/);
			expect(v).toMatch(/^#[0-9a-f]{6}$/);
		}
		expect(Object.keys(PALETTE)).not.toContain(".");
	});
	it("never gives two letters the same colour", () => {
		const values = Object.values(PALETTE);
		expect(new Set(values).size).toBe(values.length);
	});
});

describe("reading colours", () => {
	it("reads hex and the hsl moodTheme writes", () => {
		expect(parseColor("#ff8000")).toEqual([255, 128, 0, 255]);
		expect(parseColor("hsl(0 100% 50%)")).toEqual([255, 0, 0, 255]);
		expect(parseColor("hsl(172 38% 50%)")).toEqual([79, 176, 163, 255]);
		expect(parseColor("blue")).toBeNull();
	});
	it("parses hsl with or without commas and wraps the hue", () => {
		expect(parseHsl("hsl(42 95% 58%)")).toEqual([42, 95, 58]);
		expect(parseHsl("hsl(42, 95%, 58%)")).toEqual([42, 95, 58]);
		expect(parseHsl("hsl(-30 50% 40%)")).toEqual([330, 50, 40]);
		expect(parseHsl("#ffffff")).toBeNull();
	});
});

describe("rasterize", () => {
	const cols = colours();
	it("lays cells side by side at the scale, and leaves dots transparent", () => {
		const bmp = rasterize([["a.", ".p"], ["pp", "pp"]], 2, 2, 2, cols);
		expect([bmp.w, bmp.h]).toEqual([8, 4]);
		const px = (x: number, y: number) => Array.from(bmp.data.slice((y * bmp.w + x) * 4, (y * bmp.w + x) * 4 + 4));
		expect(px(0, 0)).toEqual([...cols.a]);
		expect(px(1, 1)).toEqual([...cols.a]);
		expect(px(2, 0)).toEqual([0, 0, 0, 0]);
		expect(px(3, 3)).toEqual([...cols.p]);
		expect(px(4, 0)).toEqual([...cols.p]);
	});
	it("takes an override for the scarf, and ignores one it cannot read", () => {
		expect(colours({ Z: "hsl(0 100% 50%)" }).Z).toEqual([255, 0, 0, 255]);
		expect(colours({ Z: "nope" }).Z).toEqual(parseColor(PALETTE.Z));
	});
});

describe("checks", () => {
	it("names what is wrong with a grid", () => {
		expect(gridProblems(["ab", "pp"], 2, 2)).toEqual([]);
		expect(gridProblems(["ab"], 2, 2)).toEqual(["has 1 rows, not 2"]);
		expect(gridProblems(["abc", "p#"], 2, 2)).toEqual(["row 0 is 3 wide, not 2", "row 1 has unknown letter #"]);
	});
	it("says why a sheet cannot replace the drawn one", () => {
		expect(sheetProblem(608, 16, 608, 16)).toBeNull();
		expect(sheetProblem(600, 16, 608, 16)).toBe("is 600 by 16; it must be 608 by 16");
	});
	it("writes a PNG with the right signature and size", () => {
		const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]));
		expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
		expect(png.readUInt32BE(16)).toBe(2);
		expect(png.readUInt32BE(20)).toBe(1);
	});
});

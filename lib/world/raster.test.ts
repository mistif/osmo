import { describe, expect, it } from "vitest";
import { PALETTE } from "./palette";
import { encodePng } from "./png";
import { colours, gridProblems, parseColor, parseHsl, rasterize, sheetProblem } from "./raster";

describe("the palette", () => {
	const NEW_KEYS = ["5", "6", "7", "8", "9", "!", "#", "$", "%", "&", "'", "(", ")", "*", "+", "-", "/", ":", ";", "<", "=", ">", "?", "@", "[", "]", "^", "_", "`", "{", "|", "}", "~"];
	it("has one printable ASCII character per key (never space, dot, comma, quote or backslash) and six-digit hex values", () => {
		for (const [k, v] of Object.entries(PALETTE)) {
			expect(k).toMatch(/^[!-~]$/);
			expect([".", ",", '"', "\\"]).not.toContain(k);
			expect(v).toMatch(/^#[0-9a-f]{6}$/);
		}
		expect(Object.keys(PALETTE)).toHaveLength(57 + 33);
		for (const k of NEW_KEYS) expect(Object.keys(PALETTE)).toContain(k);
	});
	it("keeps every colour of today's 57 keys (free-will spec 4.5)", () => {
		const OLD: Record<string, string> = {
			a: "#23262f", b: "#3d4250", c: "#5d6475", d: "#868ea0", e: "#b9c0cd", f: "#4a2320", g: "#7c3a2c", h: "#a9533a", i: "#d27a52",
			j: "#2e1d14", k: "#55361f", l: "#7d5530", m: "#a8794a", n: "#93a7bd", o: "#d3dee9", p: "#f7fbff", q: "#16243a", r: "#2f5683",
			s: "#86b8e0", t: "#ffcf6e", u: "#f08a3c", v: "#fff4cc", w: "#1f4d4a", x: "#2f7a72", y: "#6fbfae", z: "#1c120c", A: "#3e2a1c",
			B: "#6a4a30", C: "#234a2a", D: "#3f7a3c", E: "#79b85a", F: "#9aa6bf", G: "#d6dcea", H: "#1a1726", I: "#f0c7a0", J: "#c9926c",
			K: "#2c3f66", L: "#4462a0", M: "#1b2744", N: "#f3efe8", O: "#3b3350", P: "#0d0b14", Q: "#8a5a3c", R: "#737b8d", S: "#6a6570",
			T: "#938c90", U: "#62779c", V: "#eca079", W: "#c8965e", X: "#b6bfd4", Y: "#b3c3d6", Z: "#3aa597", "0": "#15171d", "1": "#fffaf0",
			"2": "#56546a", "3": "#3a3949", "4": "#7d9ad8",
		};
		for (const [k, v] of Object.entries(OLD)) expect(PALETTE[k as keyof typeof PALETTE], k).toBe(v);
	});
	it("reads the new keys like any other letter", () => {
		const cols = colours();
		const bmp = rasterize([["$~", "`|"]], 2, 2, 1, cols);
		expect(Array.from(bmp.data.slice(0, 4))).toEqual([...(parseColor(PALETTE.$) ?? [])]);
		expect(gridProblems(["$~`|", "{}[]"], 4, 2)).toEqual([]);
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
	it("reads the digit letters of the polish pass like any other", () => {
		const bmp = rasterize([["01", "34"]], 2, 2, 1, cols);
		expect(Array.from(bmp.data.slice(0, 4))).toEqual([...(parseColor(PALETTE["0"]) ?? [])]);
		expect(Array.from(bmp.data.slice(12, 16))).toEqual([...(parseColor(PALETTE["4"]) ?? [])]);
		expect(gridProblems(["0123", "4..."], 4, 2)).toEqual([]);
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
		// "#" is a palette key since the free-will tiles; a backslash never is.
		expect(gridProblems(["abc", "p\\"], 2, 2)).toEqual(["row 0 is 3 wide, not 2", "row 1 has unknown letter \\"]);
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

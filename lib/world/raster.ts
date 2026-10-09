// Letter grids to pixels (spec 2): the atlas the renderer stamps from, at any whole-number scale. Pure and free of
// the DOM, so the tests and the browser share it.
import { hslToRgb } from "../shell/contrast";
import { PALETTE, TRANSPARENT } from "./palette";

export type Rgba = readonly [number, number, number, number];
export type Bitmap = { w: number; h: number; data: Uint8ClampedArray<ArrayBuffer> };
// One picture: one string per pixel row, one palette letter per pixel, "." transparent.
export type Grid = readonly string[];
export type Colours = Readonly<Record<string, Rgba>>;

const HEX = /^#([0-9a-f]{6})$/i;
const HSL = /^hsl\(\s*(-?[\d.]+)(?:deg)?\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%\s*\)$/i;

// The "hsl(h s% l%)" moodTheme writes, as [hue 0..360, saturation %, lightness %]; null for anything else.
export function parseHsl(css: string): [number, number, number] | null {
	const m = HSL.exec(css.trim());
	if (!m) return null;
	return [((Number(m[1]) % 360) + 360) % 360, Number(m[2]), Number(m[3])];
}

// "#rrggbb" or "hsl(...)"; null for anything else.
export function parseColor(css: string): Rgba | null {
	const hex = HEX.exec(css.trim());
	if (hex) {
		const n = parseInt(hex[1], 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
	}
	const hsl = parseHsl(css);
	if (!hsl) return null;
	const [r, g, b] = hslToRgb(hsl[0], hsl[1], hsl[2]);
	return [Math.round(r), Math.round(g), Math.round(b), 255];
}

// The palette as RGBA, with overrides (the scarf); an override that cannot be read keeps the palette's colour.
export function colours(overrides: Readonly<Record<string, string>> = {}): Colours {
	const out: Record<string, Rgba> = {};
	for (const [k, v] of Object.entries(PALETTE)) {
		const c = parseColor(v);
		if (c) out[k] = c;
	}
	for (const [k, v] of Object.entries(overrides)) {
		const c = parseColor(v);
		if (c) out[k] = c;
	}
	return out;
}

// Grids side by side in one strip: cell i starts at x = i * cellW * scale; each letter is scale by scale pixels.
export function rasterize(grids: readonly Grid[], cellW: number, cellH: number, scale: number, cols: Colours): Bitmap {
	const w = grids.length * cellW * scale;
	const h = cellH * scale;
	const data = new Uint8ClampedArray(w * h * 4);
	grids.forEach((grid, i) => {
		for (let y = 0; y < cellH; y++) {
			const row = grid[y] ?? "";
			for (let x = 0; x < cellW; x++) {
				const ch = row[x] ?? TRANSPARENT;
				if (ch === TRANSPARENT) continue;
				const c = cols[ch];
				if (!c) continue;
				for (let dy = 0; dy < scale; dy++) {
					for (let dx = 0; dx < scale; dx++) {
						const o = ((y * scale + dy) * w + (i * cellW + x) * scale + dx) * 4;
						data[o] = c[0];
						data[o + 1] = c[1];
						data[o + 2] = c[2];
						data[o + 3] = c[3];
					}
				}
			}
		}
	});
	return { w, h, data };
}

const KNOWN = new Set<string>([...Object.keys(PALETTE), TRANSPARENT]);

// What is wrong with a grid, for the art tests: the row count, each row's width, the first unknown letter per row.
export function gridProblems(grid: Grid, w: number, h: number): string[] {
	const out: string[] = [];
	if (grid.length !== h) out.push(`has ${grid.length} rows, not ${h}`);
	grid.forEach((row, y) => {
		if (row.length !== w) out.push(`row ${y} is ${row.length} wide, not ${w}`);
		const bad = [...row].find((c) => !KNOWN.has(c));
		if (bad !== undefined) out.push(`row ${y} has unknown letter ${bad}`);
	});
	return out;
}

// Why an optional PNG sheet cannot replace the drawn one, or null when it can (spec 2 and 3).
export function sheetProblem(w: number, h: number, wantW: number, wantH: number): string | null {
	return w === wantW && h === wantH ? null : `is ${w} by ${h}; it must be ${wantW} by ${wantH}`;
}

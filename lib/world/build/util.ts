// Small pure helpers the whole grammar shares (Task 0, complete): the seeded hash, a variation's part ids, the size word,
// and how row parts and roofs take a width ("The grammar, in one place" in the plan).
import { cellHash } from "../texture";
import { SIZE_FROM, type Size, type Variation } from "./types";

// A fixed hash of a seed and a key, in 0..1. Every seeded choice of the grammar and the planner draws from it.
export const hash01 = (seed: number, k: number): number => cellHash((seed | 0) ^ 0x5bd1e995, (k | 0) + 0x27d4eb2d);
// An index into n things from a seed and a key (0 when there are none).
export const pickIndex = (seed: number, k: number, n: number): number => (n <= 0 ? 0 : Math.min(n - 1, Math.floor(hash01(seed, k) * n)));

// Every part id a variation uses, each once: its tiers in order, its door, its decor, its sides.
export function partsOf(v: Variation): string[] {
	const ids = [
		...Object.values(v.tiers).flatMap((t) => (t ? [t.part] : [])),
		...(v.door ? [v.door] : []),
		...v.decor.map((d) => d.part),
		...v.sides.map((s) => s.part),
	];
	return [...new Set(ids)];
}

export const sizeOf = (total: number): Size => (total < SIZE_FROM.medium ? "small" : total < SIZE_FROM.large ? "medium" : "large");

// A row part's rows at width w (each row: left cap, fill pattern, right cap; every pattern the same length). The fill is
// taken from the first offset at which every row's fill reads the same both ways, so windows and lamps sit evenly; from
// offset 0 when none does.
export function rowsAt(rows: readonly string[], w: number): string[] {
	if (!Number.isInteger(w) || w < 2) throw new Error(`a row is at least 2 wide, not ${w}`);
	const p = rows.length > 0 ? rows[0].length - 2 : 0;
	if (p < 1 || rows.some((r) => r.length - 2 !== p)) throw new Error("each row of a row part is a left cap, a fill pattern and a right cap, all the same length");
	const n = w - 2;
	const fills = (s: number) => rows.map((r) => r.slice(1, -1).repeat(Math.ceil((n + s) / p) + 1).slice(s, s + n));
	const even = (f: string) => f === [...f].reverse().join("");
	let chosen = fills(0);
	for (let s = 0; s < p; s++) {
		const f = fills(s);
		if (f.every(even)) {
			chosen = f;
			break;
		}
	}
	return rows.map((r, i) => r[0] + chosen[i] + r[r.length - 1]);
}

// A roof over a span w, top row first. Row k from the bottom is inset k (gable) or floor(k / 2) (spire) on each side; a
// row of two or more cells is left slope, fill, right slope, and a row of one cell is the peak. letters: "<=>^" style.
export function roofRows(letters: string, w: number, fit: "gable" | "spire"): string[] {
	if (letters.length !== 4) throw new Error(`a roof part's map is one row of four letters, not "${letters}"`);
	if (!Number.isInteger(w) || w < 1) throw new Error(`a roof is at least 1 wide, not ${w}`);
	const [l, f, r, peak] = [...letters];
	const rows: string[] = [];
	for (let k = 0; ; k++) {
		const inset = fit === "gable" ? k : Math.floor(k / 2);
		const len = w - 2 * inset;
		if (len < 1) break;
		rows.push(".".repeat(inset) + (len === 1 ? peak : l + f.repeat(len - 2) + r) + ".".repeat(inset));
	}
	return rows.reverse();
}

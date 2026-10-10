// The island (spec 2 and 4, reshaped in the look pass): pre-built, never laid. 58 tiles wide from x 3, rows 20 to 39:
// scenery above the snow (pines, bushes, tufts, a signpost, a fence; phase 2 took out the bench and the lantern post), the snow
// cap with a flagstone path to the hall, and under it a rock body that tapers in an uneven bowl, steep near the ends
// (where the snow overhangs), with jutting stones and roots of different lengths hanging below.
import type { Blueprint } from "./types";

const X = 3; // the island's left end, in world tiles
const W = 58;
const TOP = 20; // the first map row, in world tiles
const GROUND = 6; // the snow row (world row 26), as a map row
const H = 20;

// Rows of rock under the snow, per column: steep near the ends, an uneven bowl under the hall, deepest left of centre.
const DEPTH = [
	1, 2, 3, 3, 4, 5, 5, 5, 6, 6, 7, 6, 7, 7, 7, 8, 8, 8, 9, 8, 8, 9, 9, 9, 9, 10, 10, 10, 9, 9,
	10, 10, 9, 9, 9, 9, 8, 9, 8, 8, 8, 7, 8, 7, 7, 7, 6, 6, 6, 5, 5, 4, 4, 4, 3, 2, 2, 1,
];
// What hangs under a column: a jutting stone ("v"), or a root of that many tiles.
const HANGS: Readonly<Record<number, "v" | number>> = {
	4: 1, 9: "v", 12: 2, 16: 3, 19: "v", 22: 1, 26: 2, 30: 3, 33: "v", 35: 1, 39: 2, 42: "v", 45: 3, 48: 1, 52: "v",
};
// Scenery standing on the snow, by column (world x minus X) and row above the ground (1 is right on the snow).
type Thing = readonly [col: number, up: number, letter: string];
const BIG_PINE = (c: number): Thing[] => [
	[c, 1, "|"], [c - 1, 2, "("], [c, 2, "#"], [c + 1, 2, ")"], [c - 1, 3, "("], [c, 3, "#"], [c + 1, 3, ")"], [c, 4, "^"], [c, 5, "A"],
];
const SMALL_PINE = (c: number): Thing[] => [[c, 1, "|"], [c, 2, "^"], [c, 3, "^"], [c, 4, "A"]];
const THINGS: readonly Thing[] = [
	[2, 1, "o"],
	...BIG_PINE(5),
	[8, 1, "t"],
	...SMALL_PINE(11),
	[10, 1, "g"],
	[13, 1, "o"],
	[15, 1, "S"],
	[39, 1, "t"],
	[40, 1, "f"],
	[41, 1, "f"],
	[48, 1, "o"],
	[49, 1, "g"],
	...BIG_PINE(52),
	[55, 1, "t"],
	...SMALL_PINE(56),
];
const PATH = [14, 15, 16, 17, 18, 19, 20]; // columns of flagstones in the snow, up to the hall's step at x 24

function draw(): string[] {
	const g = Array.from({ length: H }, () => Array.from({ length: W }, () => "."));
	for (const [col, up, ch] of THINGS) g[GROUND - up][col] = ch;
	for (let c = 0; c < W; c++) g[GROUND][c] = c === 0 ? "[" : c === W - 1 ? "]" : PATH.includes(c) ? "=" : "n";
	const depth = (c: number) => (c < 0 || c >= W ? 0 : DEPTH[c]);
	for (let c = 0; c < W; c++) {
		const d = depth(c);
		for (let r = 1; r <= d; r++) {
			const openL = depth(c - 1) < r;
			const openR = depth(c + 1) < r;
			let ch = r <= 2 ? "s" : "k";
			if (r === d) ch = openL && !openR ? "/" : openR && !openL ? "\\" : "u";
			else if (openL) ch = "{";
			else if (openR) ch = "}";
			g[GROUND + r][c] = ch;
		}
		const hang = HANGS[c];
		if (hang === "v") g[GROUND + d + 1][c] = "v";
		else if (hang) for (let i = 1; i <= hang; i++) g[GROUND + d + i][c] = i === hang ? "e" : "r";
	}
	return g.map((row) => row.join(""));
}

export const ISLAND: Blueprint = {
	room: "island",
	x: X,
	y: TOP,
	map: draw(),
	decor: [],
	legend: {
		"[": { tile: "snow-edge-l", layer: "ground" },
		n: { tile: "snow", layer: "ground" },
		"]": { tile: "snow-edge-r", layer: "ground" },
		"=": { tile: "path", layer: "ground" },
		s: { tile: "stone", layer: "ground" },
		k: { tile: "stone-dark", layer: "ground" },
		"{": { tile: "stone-edge-l", layer: "ground" },
		"}": { tile: "stone-edge-r", layer: "ground" },
		"/": { tile: "stone-under-l", layer: "ground" },
		"\\": { tile: "stone-under-r", layer: "ground" },
		u: { tile: "stone-bottom", layer: "ground" },
		v: { tile: "stone-hang", layer: "ground" },
		r: { tile: "root", layer: "ground" },
		e: { tile: "root-end", layer: "ground" },
		g: { tile: "grass", layer: "ground" },
		t: { tile: "tuft", layer: "ground" },
		o: { tile: "bush", layer: "ground" },
		S: { tile: "sign", layer: "ground" },
		f: { tile: "fence", layer: "ground" },
		"|": { tile: "trunk-base", layer: "ground" },
		"(": { tile: "pine-l", layer: "ground" },
		"#": { tile: "pine-c", layer: "ground" },
		")": { tile: "pine-r", layer: "ground" },
		"^": { tile: "pine-small", layer: "ground" },
		A: { tile: "pine-tip", layer: "ground" },
	},
};

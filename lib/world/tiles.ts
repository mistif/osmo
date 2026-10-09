// The village tiles (spec 2): 16 by 16 grids of palette letters, light from the top left (see palette.ts).
// TILE_IDS is the cell order of the atlas and of the optional public/village/tiles.png (608 by 16).
// The patterned tiles are built by the small helpers below from hand-laid maps; the rest are drawn letter by letter.
import type { Grid } from "./raster";

export const TILE_IDS = [
	"snow", "snow-edge-l", "snow-edge-r", "stone", "stone-dark", "stone-edge-l", "stone-edge-r", "stone-bottom",
	"root", "root-end", "grass", "brick", "brick-dark", "plank", "beam", "beam-h", "glass", "window", "window-top",
	"door", "door-top", "roof-left", "roof-right", "roof-flat", "roof-peak", "battlement", "lantern", "lantern-post",
	"banner", "banner-end", "step", "pillar", "bench", "cloud-l", "cloud-m", "cloud-r", "cloud-top", "cloud-small",
] as const;
export type TileId = (typeof TILE_IDS)[number];

const N = 16;
const wrap = (v: number) => ((v % N) + N) % N;
// A tile from a function of its pixel; the function sees x and y in 0..15.
const make = (f: (x: number, y: number) => string): Grid =>
	Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => f(x, y)).join(""));
// A pixel of a seamless pattern, wrapping at the edges.
const at = (g: readonly string[], x: number, y: number) => g[wrap(y)][wrap(x)];
// One step darker on the stone ramp, for shadows cast onto stone.
const DARKER: Record<string, string> = { e: "d", d: "c", c: "b", b: "a", a: "a" };
const darker = (ch: string) => DARKER[ch] ?? ch;

// --- Stone: each letter of a map is one stone; the shader lights its top-left and outlines its bottom-right. ---
type Ramp = { outline: string; shadow: string; base: string; light: string; corner: string };
function stonework(map: readonly string[], ramp: Ramp): Grid {
	const same = (x: number, y: number, dx: number, dy: number) => at(map, x + dx, y + dy) === at(map, x, y);
	const edge = (x: number, y: number) => !same(x, y, 1, 0) || !same(x, y, 0, 1);
	return make((x, y) => {
		if (edge(x, y)) return ramp.outline;
		const top = !same(x, y, 0, -1);
		const left = !same(x, y, -1, 0);
		if (top && left) return ramp.corner;
		if (top || left) return ramp.light;
		if ((same(x, y, 1, 0) && edge(x + 1, y)) || (same(x, y, 0, 1) && edge(x, y + 1))) return ramp.shadow;
		return ramp.base;
	});
}
// Three uneven courses, wrapping in both directions.
const STONE_MAP = [
	"HHBBBBCCCCCAAGGG",
	"ABBBBBCCCCCAAAAA",
	"ABBBBBCCCCCAAAAA",
	"ABBBBBCCCCCAAAAA",
	"ABBBBBCCCCCDDDEE",
	"EEEEBBCCFDDDDDEE",
	"EEEEFFFFFDDDDDEE",
	"EEEEFFFFFDDDDDEE",
	"EEEEFFFFFDDDDDEE",
	"EEEEFFFFFDDDDDEE",
	"HHHEFFFIIIDDDDGG",
	"HHHHHIIIIIIIGGGG",
	"HHHHHIIIIIIIGGGG",
	"HHHHHIIIIIIIGGGG",
	"HHHHHIIIIIIIGGGG",
	"HHHHHBCCIIIIGGGG",
];
// Four lower courses, laid on different joints.
const DARK_MAP = [
	"JAABBBBBCCCCCLLJ",
	"AAABBBBBCCCCCAAA",
	"AAABBBBBCCCCCAAA",
	"AAABBBBBCCCCCAAA",
	"AAADDEEECCCFFFAA",
	"DDDDDEEEEEFFFFFF",
	"DDDDDEEEEEFFFFFF",
	"DDDDDEEEEEFFFFFF",
	"DDDDDEEEEEFFFFFF",
	"DDDDHHHIIIIIGGGF",
	"GGHHHHHIIIIIGGGG",
	"GGHHHHHIIIIIGGGG",
	"GGHHHHHKKLIIGGGG",
	"GGHJKKKKKLLLLLLJ",
	"JJJJKKKKKLLLLLLJ",
	"JJJJKBBKKLLLLLLJ",
];
const stone = stonework(STONE_MAP, { outline: "a", shadow: "b", base: "c", light: "d", corner: "e" });
const stoneDark = stonework(DARK_MAP, { outline: "a", shadow: "b", base: "b", light: "c", corner: "d" });

// --- Snow: a cap over the stone, its lower edge dipping to row 6 in three places. ---
const SNOW_DIPS = new Set([2, 3, 8, 13]);
const SNOW_DULL = new Set([5, 11]);
function snowCap(x: number, y: number): string {
	if (y === 0) return SNOW_DULL.has(x) ? "o" : "p";
	if (y <= 4) return "o";
	if (y === 5 || (y === 6 && SNOW_DIPS.has(x))) return "n";
	const under = y === 6 || (y === 7 && SNOW_DIPS.has(x));
	return under ? darker(stone[y][x]) : stone[y][x];
}
// The rounded top corner: pixels outside a radius-4 quarter circle in rows 0 to 3 (cx, cy is the corner's centre).
const outsideCorner = (x: number, y: number, cx: number) => y < 4 && (x + 0.5 - cx) ** 2 + (y + 0.5 - 4) ** 2 > 12.25;
function snowEdge(x: number, y: number, side: "l" | "r"): string {
	const cx = side === "l" ? 4 : 12;
	if (outsideCorner(x, y, cx)) return ".";
	const rim = (dx: number, dy: number) => x + dx < 0 || x + dx > 15 || (y + dy >= 0 && outsideCorner(x + dx, y + dy, cx));
	const edgeX = side === "l" ? 0 : 15;
	if (y <= 5 || (y === 6 && SNOW_DIPS.has(x))) {
		if (side === "l") {
			if (y <= 4 && (rim(-1, 0) || rim(0, -1))) return "p";
			return snowCap(x, y);
		}
		// The shadow side: the right rim and the last columns of the cap go grey-blue.
		if (y <= 4 && rim(1, 0)) return "n";
		if (y <= 4 && rim(0, -1)) return "o";
		if (y >= 1 && y <= 4 && x >= 13) return "n";
		return snowCap(x, y) === "p" && x >= 10 ? "o" : snowCap(x, y);
	}
	if (x === edgeX) return "a";
	const s = snowCap(x, y);
	return side === "r" && x >= 10 ? darker(s === "e" ? "d" : s) : s;
}

// --- Brick: 8 by 4 bricks in running bond, b mortar on the right and bottom of each. ---
const BRICK = ["eddddddb", "dccccccb", "dccccccb", "bbbbbbbb"];
const BRICK_DARK = ["ccccccca", "bbbbbbba", "bbbbbbba", "aaaaaaaa"];
const bond = (cell: readonly string[]) => (x: number, y: number) => cell[y % 4][(x + ((y >> 2) % 2) * 4) % 8];
const brickAt = bond(BRICK);
const brick = make(brickAt);

// --- Roof: rows of 4 (highlight, body, shadow, gap), shingles 8 wide with rounded lower corners, each row
// staggered by half a shingle. The shade cell is the same shape for the slope facing away from the light. ---
const SHINGLE_LIT = ["iiiiiihf", "ihhhhhgf", "fhhhhgff", "ffgggfff"];
const SHINGLE_SHADE = ["ihhhhhgf", "hggggggf", "fgggggff", "ffgggfff"];
const shingle = (cell: readonly string[], x: number, y: number) => cell[y % 4][(x + ((y >> 2) % 2) * 4) % 8];

// --- Clouds: a body given by its top and bottom row per column; rim on the upper left, shadow underneath. ---
type Span = readonly (readonly [number, number] | null)[];
function cloud(span: Span, opts: { shadeRight?: boolean; openBottom?: boolean; shadowRows?: number } = {}): Grid {
	const inside = (x: number, y: number) => {
		const s = span[x];
		return !!s && y >= s[0] && y <= s[1];
	};
	return make((x, y) => {
		const s = span[x];
		if (!s || !inside(x, y)) return ".";
		const topOpen = !inside(x, y - 1) && y > 0;
		const leftOpen = x > 0 && !inside(x - 1, y);
		const leftHigher = x > 0 && !!span[x - 1] && span[x - 1]![0] < s[0];
		if (!opts.openBottom && y > s[1] - (opts.shadowRows ?? 2)) return "F";
		if (opts.shadeRight && (x === 15 || !inside(x + 1, y))) return "F";
		if (leftOpen && !(y === s[1])) return "p";
		if (topOpen && !leftHigher) return "p";
		return "G";
	});
}
const cols = (from: number, rows: readonly (readonly [number, number])[]): Span =>
	Array.from({ length: N }, (_, x) => (x >= from && x - from < rows.length ? rows[x - from] : null));

// --- Roots: two strands, B lit left, A body, z outline right, swaying and back to their columns at row 15. ---
const SWAY_1 = [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, -1, -1, -1, -1, 0, 0];
const SWAY_2 = [0, -1, -1, -1, -1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0];
const STRAND = "BAz";
// Width per row for the tapering ends (3 is full); 0 is past the tip.
const TAPER_1 = [3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0];
const TAPER_2 = [3, 3, 3, 3, 3, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0];
function roots(end: boolean): Grid {
	return make((x, y) => {
		for (const [base, sway, taper] of [
			[3, SWAY_1, TAPER_1],
			[10, SWAY_2, TAPER_2],
		] as const) {
			const left = base + sway[y];
			const w = end ? taper[y] : 3;
			if (w === 0) continue;
			const i = x - left;
			if (w === 3 && i >= 0 && i < 3) return STRAND[i];
			if (w === 2 && i >= 1 && i < 3) return STRAND[i];
			if (w === 1 && i === 1) return taper[y + 1] === 0 ? "z" : "A";
		}
		// A rootlet off each full strand.
		if (!end && ((y === 8 && x === 1) || (y === 9 && x === 2))) return "z";
		if (!end && ((y === 5 && x === 13) || (y === 4 && x === 14))) return "z";
		return ".";
	});
}

// --- The stone underside: hanging points, each column ending at its own row. ---
const UNDER = [10, 12, 13, 11, 10, 11, 14, 15, 12, 10, 12, 11, 10, 12, 14, 11];
function stoneBottom(x: number, y: number): string {
	const end = UNDER[x];
	if (y > end) return ".";
	if (y === end) return "a";
	if (y >= 10) {
		if (y > UNDER[wrap(x + 1)]) return "a";
		if (y > UNDER[wrap(x - 1)]) return "b";
		return darker(stoneDark[y][x]) === "a" ? "a" : stoneDark[y][x];
	}
	return stoneDark[y][x];
}

// --- Windows and doors, set into the brick bond. ---
const inGlass = (x: number, y: number) => x >= 4 && x <= 11 && y <= 12;
function windowLow(x: number, y: number): string {
	if (y >= 13 && x >= 2 && x <= 13) {
		if (y === 15) return "a";
		if (x === 13) return "a";
		if (y === 13) return x === 2 ? "e" : "d";
		return "b";
	}
	if (!inGlass(x, y)) return brickAt(x, y);
	if (x === 11 || y === 12) return "q";
	if ((x === 5 && y === 2) || (x === 6 && y === 1) || (x === 7 && y === 0)) return "s";
	return "r";
}
// The arch: the opening's first and last column per row (rows 3 to 15).
const ARCH: Record<number, readonly [number, number]> = { 3: [7, 8], 4: [6, 9], 5: [5, 10] };
const archSpan = (y: number): readonly [number, number] | null => (y >= 6 ? [4, 11] : (ARCH[y] ?? null));
function windowTop(x: number, y: number): string {
	const s = archSpan(y);
	if (s && x >= s[0] && x <= s[1]) {
		if (x === s[1]) return "q";
		if ((x === 5 && y === 9) || (x === 6 && y === 8) || (x === 7 && y === 7)) return "s";
		if ((x === 5 && y === 12) || (x === 6 && y === 11)) return "s";
		return "r";
	}
	if (y === 2 && (x === 7 || x === 8)) return x === 7 ? "e" : "d";
	const below = archSpan(y + 1);
	if (y <= 5 && below && x >= below[0] && x <= below[1]) return "a";
	return brickAt(x, y);
}
// The door's planks by column: a lit left edge, seams, a dark right edge.
const DOOR_COLS = "..mllkllklllkj..";
const isBand = (y: number) => y === 3 || y === 11;
function doorWood(x: number, y: number): string {
	if (isBand(y)) return x === 4 || x === 7 || x === 11 ? "d" : "a";
	return DOOR_COLS[x];
}
function doorLow(x: number, y: number): string {
	if (x < 2 || x > 13) return brickAt(x, y);
	if (y === 15) return x === 2 ? "e" : "d";
	if ((y === 7 && x === 10) || (y === 9 && x === 10) || (y === 8 && (x === 9 || x === 11))) return "d";
	return doorWood(x, y);
}
const DOOR_ARCH: Record<number, readonly [number, number]> = { 2: [6, 9], 3: [4, 11], 4: [3, 12], 5: [3, 12] };
const doorSpan = (y: number): readonly [number, number] | null => (y >= 6 ? [2, 13] : (DOOR_ARCH[y] ?? null));
function doorTop(x: number, y: number): string {
	const s = doorSpan(y);
	if (s && x >= s[0] && x <= s[1]) {
		const up = doorSpan(y - 1);
		if (y < 6 && (!up || x < up[0] || x > up[1])) return x === s[1] ? "k" : "m";
		if (x === s[0]) return isBand(y) ? "a" : "m";
		if (x === s[1]) return isBand(y) ? "a" : "j";
		return doorWood(x, y);
	}
	if ((y === 0 || y === 1) && (x === 7 || x === 8)) return x === 7 && y === 0 ? "e" : x === 8 && y === 1 ? "d" : "e";
	const below = doorSpan(y + 1);
	if (y <= 5 && below && x >= below[0] && x <= below[1]) return "a";
	return brickAt(x, y);
}

// --- The worked example: two courses of 8 by 8 blocks, the lower course offset by 4. ---
const BLOCK = ["edddddda", "dcccccca", "dcccccca", "dcccccca", "dcccccca", "dcccccba", "dbbbbbba", "aaaaaaaa"];
const course = (rows: readonly string[], offset: number) =>
	rows.map((r) => (offset === 0 ? r + r : r.slice(offset) + r + r.slice(0, offset)));

export const TILES: Readonly<Record<TileId, Grid>> = {
	snow: make(snowCap),
	"snow-edge-l": make((x, y) => snowEdge(x, y, "l")),
	"snow-edge-r": make((x, y) => snowEdge(x, y, "r")),
	stone,
	"stone-dark": stoneDark,
	// The flanks: a diagonal cut, transparent outside, outlined along it.
	"stone-edge-l": make((x, y) => {
		const cut = Math.round((y * 6) / 15);
		return x < cut ? "." : x === cut ? "a" : x === cut + 1 ? darker(stoneDark[y][x]) : stoneDark[y][x];
	}),
	"stone-edge-r": make((x, y) => {
		const cut = 15 - Math.round((y * 6) / 15);
		return x > cut ? "." : x === cut ? "a" : x === cut - 1 ? darker(stoneDark[y][x]) : stoneDark[y][x];
	}),
	"stone-bottom": make(stoneBottom),
	root: roots(false),
	"root-end": roots(true),
	grass: [
		"................",
		"................",
		"................",
		"................",
		"................",
		"................",
		"................",
		"................",
		"................",
		"................",
		"........E.......",
		".E.....ED.E.....",
		".D..E..CD.D.....",
		"CD..D..CDDC...E.",
		"CDCDC.CDDDC..CD.",
		"CDDDC.CDDDDC.CDC",
	],
	brick,
	"brick-dark": make(bond(BRICK_DARK)),
	// Boards 4 rows tall (top, body, bottom, gap); each row of boards has its joint somewhere else, nailed both sides.
	plank: make((x, y) => {
		const joint = [5, 13, 9, 1][y >> 2];
		const row = y % 4;
		if (row === 3) return "j";
		if (x === joint) return "j";
		if (row === 1 && (x === wrap(joint - 2) || x === wrap(joint + 2))) return "a";
		if (x === wrap(joint - 1)) return "k";
		if (row === 0) return "m";
		if (row === 2) return "k";
		if (x === wrap(joint + 1)) return "m";
		return x === wrap(joint + 5) || x === wrap(joint + 6) ? "k" : "l";
	}),
	beam: make((x, y) => {
		if (x < 5 || x > 10) return ".";
		const grain = (x === 7 && y >= 2 && y <= 5) || (x === 8 && y >= 6 && y <= 9) || (x === 7 && y >= 12 && y <= 14);
		if (grain) return "a";
		return "mlllkj"[x - 5];
	}),
	"beam-h": make((x, y) => {
		if (y === 15) return "j";
		if (y >= 13) return "k";
		if (y <= 1) return "m";
		for (const bx of [3, 12]) {
			if (y === 7 && x === bx) return "d";
			if ((y === 7 && x === bx + 1) || (y === 8 && (x === bx || x === bx + 1))) return "a";
		}
		// A little grain, off-centre.
		if ((y === 4 && x >= 6 && x <= 14) || (y === 5 && x === 5) || (y === 11 && (x <= 1 || x >= 14))) return "k";
		return "l";
	}),
	glass: make((x, y) => {
		if (x === 15 || y === 15) return "q";
		if (x + y === 5 && x >= 1 && x <= 4) return "s";
		if (x + y === 10 && x >= 4 && x <= 6) return "s";
		return "r";
	}),
	window: make(windowLow),
	"window-top": make(windowTop),
	door: make(doorLow),
	"door-top": make(doorTop),
	"roof-left": make((x, y) => (x + y < 15 ? "." : x + y === 15 ? "f" : shingle(SHINGLE_LIT, x, y))),
	"roof-right": make((x, y) => (y < x ? "." : y === x ? "f" : shingle(SHINGLE_SHADE, x, y))),
	"roof-flat": make((x, y) => shingle(SHINGLE_LIT, x, y)),
	"roof-peak": make((x, y) => {
		if (y <= 2 && (x === 7 || x === 8)) return x === 7 ? "e" : "d";
		const left = 7 - Math.round((y * 7) / 15);
		const right = 15 - left;
		if (x < left || x > right) return ".";
		if (x === left || x === right) return "f";
		return shingle(x < 8 ? SHINGLE_LIT : SHINGLE_SHADE, x, y);
	}),
	battlement: make((x, y) => {
		const merlon = (x >= 1 && x <= 6) || (x >= 9 && x <= 14);
		if (!merlon || y < 4) return ".";
		if (x === 6 || x === 14) return "a";
		if (y === 4) return x === 1 || x === 9 ? "e" : "d";
		return brickAt(x, y);
	}),
	lantern: [
		"................",
		"................",
		"aaaaaaaaa.......",
		".a.....aa.......",
		"a.....dddd......",
		".....ddddda.....",
		".....atttta.....",
		".....attvta.....",
		".....atvvta.....",
		".....atvvta.....",
		".....atuuta.....",
		".....atttta.....",
		".....aaaaaa.....",
		"......aaaa......",
		".......aa.......",
		".......aa.......",
	],
	"lantern-post": make((x, y) => {
		if (y >= 13 && x >= 5 && x <= 10) return y === 13 ? (x === 10 ? "b" : "d") : y === 14 ? (x === 10 ? "a" : "b") : "a";
		if (x === 7) return "d";
		if (x === 8) return "a";
		return ".";
	}),
	banner: make((x, y) => {
		if (y <= 1) {
			if (x < 1 || x > 14) return ".";
			if (x === 1 || x === 14) return "j";
			return y === 0 ? "m" : "l";
		}
		if (x < 3 || x > 12) return ".";
		if (y >= 8 && y <= 10 && x >= 6 && x <= 9 && ["t..t", "tttt", ".tt."][y - 8][x - 6] === "t") return "t";
		if (x === 3) return "y";
		if (x === 12 || y === 2) return "w";
		return "x";
	}),
	"banner-end": make((x, y) => {
		if (x < 3 || x > 12) return ".";
		// The swallowtail: each column's last row; the notch opens at row 9.
		const last = [13, 12, 11, 9, 8, 8, 9, 11, 12, 13][x - 3];
		if (y > last) return ".";
		if (y === last) return "w";
		if (x === 3) return "y";
		return x === 12 ? "w" : "x";
	}),
	step: [...course(BLOCK, 0), ...course(BLOCK, 4)],
	pillar: make((x, y) => (y === 7 || y === 15 ? "a" : "eedddccccccbbbaa"[x])),
	bench: make((x, y) => {
		if (y >= 8 && y <= 10 && x >= 1 && x <= 14) {
			if (x === 14) return "j";
			return ["m", "l", "k"][y - 8];
		}
		if (y >= 11) {
			if (x === 2 || x === 12) return "k";
			if (x === 3 || x === 13) return "j";
		}
		return ".";
	}),
	"cloud-l": cloud(
		cols(4, [[7, 14], [6, 15], [6, 15], [5, 15], [4, 15], [3, 15], [3, 15], [3, 15], [3, 15], [3, 15], [3, 15], [3, 15]]),
	),
	"cloud-m": cloud(
		cols(0, [[4, 15], [4, 15], [4, 15], [4, 15], [3, 15], [2, 15], [1, 15], [1, 15], [1, 15], [1, 15], [2, 15], [3, 15], [4, 15], [4, 15], [4, 15], [4, 15]]),
	),
	"cloud-r": cloud(
		cols(0, [[4, 15], [4, 15], [3, 15], [2, 15], [2, 15], [2, 15], [3, 15], [4, 15], [4, 15], [5, 15], [7, 14], [9, 13]]),
		{ shadeRight: true },
	),
	"cloud-top": cloud(
		cols(2, [[12, 15], [9, 15], [8, 15], [7, 15], [6, 15], [6, 15], [6, 15], [6, 15], [7, 15], [8, 15], [9, 15], [12, 15]]),
		{ openBottom: true },
	),
	"cloud-small": cloud(
		cols(2, [[10, 11], [8, 12], [7, 12], [6, 12], [6, 12], [6, 12], [7, 12], [7, 12], [7, 12], [8, 12], [9, 12], [10, 11]]),
		{ shadowRows: 1 },
	),
};

const INDEX = new Map<TileId, number>(TILE_IDS.map((id, i) => [id, i]));
export const tileIndex = (id: TileId): number => INDEX.get(id) ?? 0;

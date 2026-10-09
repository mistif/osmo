// Credit: the roof shingles (roof-flat, roof-left, roof-right, roof-peak) and brick-dark adapt Tiny Town by Kenney (kenney.nl), CC0.
// The village tiles (spec 2): 16 by 16 grids of palette letters, light from the top left (see palette.ts).
// TILE_IDS is the cell order of the atlas and of the optional public/village/tiles.png (16 px per cell, by 16).
// Brick is shaded by a small helper from hand-laid maps (one letter per brick); the rest is drawn from per-pixel
// rules and a few hand-drawn grids. Texture comes from a fixed hash, so every run draws the same pixels.
import type { Grid } from "./raster";

export const TILE_IDS = [
	"snow", "snow-edge-l", "snow-edge-r", "stone", "stone-dark", "stone-edge-l", "stone-edge-r", "stone-bottom",
	"root", "root-end", "grass", "brick", "brick-dark", "plank", "beam", "beam-h", "glass", "window", "window-top",
	"door", "door-top", "roof-left", "roof-right", "roof-flat", "roof-peak", "battlement", "lantern", "lantern-post",
	"banner", "banner-end", "step", "pillar", "bench", "cloud-l", "cloud-m", "cloud-r", "cloud-top", "cloud-small",
	// Appended in the look pass; the 38 above keep their cells.
	"window-lit", "window-top-lit", "stone-under-l", "stone-under-r", "stone-hang", "trunk", "trunk-base", "pine-tip",
	"pine-small", "pine-l", "pine-c", "pine-r", "bush", "tuft", "path", "sign", "fence",
] as const;
export type TileId = (typeof TILE_IDS)[number];

const N = 16;
const wrap = (v: number) => ((v % N) + N) % N;
// A tile from a function of its pixel; the function sees x and y in 0..15.
const make = (f: (x: number, y: number) => string): Grid =>
	Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => f(x, y)).join(""));
// A pixel of a seamless pattern, wrapping at the edges.
const at = (g: readonly string[], x: number, y: number) => g[wrap(y)][wrap(x)];
// Paint a hand-drawn patch over a tile: a space or a "," keeps the pixel underneath.
const over = (base: Grid, patch: readonly string[]): Grid =>
	base.map((row, y) => [...row].map((ch, x) => (patch[y]?.[x] ?? " ").replace(/[ ,]/, ch)).join(""));

// A fixed hash of a pixel and a seed, in 0..1, so texture is identical on every run.
function noise(x: number, y: number, seed: number): number {
	let h = Math.imul(wrap(x) + 1, 0x27d4eb2d) ^ Math.imul(wrap(y) + 7, 0x165667b1) ^ Math.imul(seed + 13, 0x9e3779b9);
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const checker = (x: number, y: number) => ((x + y) & 1) === 0;
// A step on a ramp (darkest first) for a value in 0..1; between two steps it dithers in a checkerboard.
function ramp(steps: string, v: number, x: number, y: number): string {
	const t = Math.min(1, Math.max(0, v)) * (steps.length - 1);
	const i = Math.floor(t);
	const f = t - i;
	return steps[Math.min(steps.length - 1, f > 0.7 || (f > 0.3 && checker(x, y)) ? i + 1 : i)];
}
// One step darker, for shadows cast onto stone, snow and wood.
const DARKER: Record<string, string> = {
	e: "d", d: "R", R: "c", c: "b", b: "a", a: "a", T: "S", S: "b",
	p: "o", o: "Y", Y: "n", n: "U", U: "U", m: "l", W: "m", l: "k", k: "j", j: "j",
};
const darker = (ch: string, steps = 1): string => (steps <= 0 ? ch : darker(DARKER[ch] ?? ch, steps - 1));

// --- Masonry: each letter of a map is one stone or brick. Its bottom row and right column are the joint; its
// face is lit along the top and left with a bright top-left corner, falls off toward the bottom right with a
// dithered gradient, and carries a few pits. ---
type Reach = { id: string; up: number; down: number; left: number; right: number };
function reach(map: readonly string[], x: number, y: number): Reach {
	const id = at(map, x, y);
	const run = (dx: number, dy: number) => {
		let n = 0;
		while (n < N - 1 && at(map, x + dx * (n + 1), y + dy * (n + 1)) === id) n++;
		return n;
	};
	return { id, up: run(0, -1), down: run(0, 1), left: run(-1, 0), right: run(1, 0) };
}
type Mason = {
	joint: string;
	steps: string; // the face, darkest first
	seed: number;
	lift?: Readonly<Record<string, number>>; // per stone, so neighbours differ
	warm?: ReadonlySet<string>; // stones drawn on the warm ramp
	warmSteps?: string;
	pits?: number;
	flat?: boolean; // no dither on the face, for small bricks
};
function masonry(map: readonly string[], m: Mason): Grid {
	return make((x, y) => {
		const r = reach(map, x, y);
		if (r.right === 0 || r.down === 0) return m.joint;
		const steps = m.warm?.has(r.id) ? (m.warmSteps ?? m.steps) : m.steps;
		if (r.up === 0 && r.left === 0) return steps[steps.length - 1];
		const fy = r.up / Math.max(1, r.up + r.down - 1);
		const fx = r.left / Math.max(1, r.left + r.right - 1);
		let v = 0.55 - 0.16 * fy - 0.08 * fx + (m.lift?.[r.id] ?? 0);
		if (r.up === 0) v += 0.28;
		else if (r.left === 0) v += 0.2;
		if (r.down === 1) v -= 0.2;
		else if (r.right === 1) v -= 0.12;
		const inner = r.up > 0 && r.left > 0 && r.down > 1 && r.right > 1;
		if (inner && noise(x, y, m.seed) < (m.pits ?? 0.04)) v -= 0.3;
		return m.flat ? steps[Math.round(Math.min(1, Math.max(0, v)) * (steps.length - 1))] : ramp(steps, v, x, y);
	});
}

// --- The island's rock: a mottled ground with stones bedded in it (lit along the top and left, outlined on the
// bottom and right, casting a dithered shadow), and cracks with a lit lower lip. ---
type Rock = {
	ramp: string; // deep, dark, base, light, highlight, top
	seed: number;
	stones: readonly (readonly [number, number, number, number])[]; // x, y, width, height; they wrap
	cracks: readonly (readonly [number, number])[];
};
function rock(r: Rock): Grid {
	const [deep, dark, base, light, high, top] = r.ramp;
	const g = Array.from({ length: N }, (_, y) =>
		Array.from({ length: N }, (_, x) => {
			const n = noise(x, y, r.seed);
			if (n < 0.05) return dark;
			if (n > 0.965) return light;
			// A faint second layer of mottling, in two-pixel clumps.
			return noise(x >> 1, y >> 1, r.seed + 1) > 0.78 && checker(x, y) ? light : base;
		}),
	);
	const put = (x: number, y: number, ch: string) => {
		g[wrap(y)][wrap(x)] = ch;
	};
	const get = (x: number, y: number) => g[wrap(y)][wrap(x)];
	for (const [x0, y0, w, h] of r.stones) {
		for (let py = 0; py < h; py++) {
			for (let px = 0; px < w; px++) {
				const edgeX = px === 0 || px === w - 1;
				const edgeY = py === 0 || py === h - 1;
				if (edgeX && edgeY && !(px === w - 1 && py === h - 1 && w > 3)) continue;
				let ch = light;
				if (px === w - 1 || py === h - 1) ch = deep;
				else if (py === 0) ch = px === 1 ? top : high;
				else if (px === 0) ch = high;
				else if (px + py >= w - 1 && checker(x0 + px, y0 + py)) ch = base;
				put(x0 + px, y0 + py, ch);
			}
		}
		// The shadow it casts down and to the right, dithered.
		for (let px = 1; px < w; px++) if (checker(x0 + px, y0 + h) || px === w - 1) put(x0 + px, y0 + h, dark);
		for (let py = 1; py < h; py++) if (get(x0 + w, y0 + py) === base) put(x0 + w, y0 + py, dark);
	}
	for (const [x, y] of r.cracks) {
		put(x, y, deep);
		if (get(x, y + 1) === base) put(x, y + 1, light);
	}
	return g.map((row) => row.join(""));
}
const stone = rock({
	ramp: "abcRde",
	seed: 3,
	stones: [[1, 1, 6, 3], [9, 4, 4, 3], [12, 10, 6, 4], [3, 11, 5, 3], [7, 8, 3, 2]],
	cracks: [[0, 7], [1, 7], [2, 8], [3, 8], [4, 8], [5, 7], [9, 14], [10, 14], [11, 15], [14, 1], [15, 2]],
});
const stoneDark = rock({
	ramp: "aabcRd",
	seed: 5,
	stones: [[3, 2, 5, 3], [10, 1, 5, 3], [0, 9, 5, 4], [8, 11, 4, 3], [13, 6, 3, 2]],
	cracks: [[6, 7], [7, 7], [8, 8], [9, 8], [10, 8], [11, 7], [2, 15], [3, 15], [4, 0]],
});

// --- Snow: a soft cap over the stone, deeper in some columns, with a blue shadow edge and the stone under it in
// its shadow. Sparkles are single bright pixels. ---
const SNOW_DEPTH = [7, 7, 7, 8, 8, 8, 7, 7, 6, 6, 7, 7, 8, 9, 8, 7];
const SNOW_SOFT = new Set([4, 12]);
const ICICLES: Readonly<Record<number, number>> = { 5: 2, 13: 3 };
function snowCap(x: number, y: number, under: Grid = stone): string {
	const d = SNOW_DEPTH[wrap(x)];
	if (y === 0) return SNOW_SOFT.has(wrap(x)) ? "o" : "p";
	if (y < d - 2) {
		if (y <= 4 && noise(x, y, 11) > 0.93) return "p";
		// White in the top rows, then through the mid blue into the shadow.
		return y <= 3 ? ramp("op", 1.05 - y / 4, x, y) : ramp("nYo", 1.1 - (y - 3) / (d - 4), x, y);
	}
	if (y === d - 2) return "n";
	if (y === d - 1) return "U";
	// Two icicles hang from the cap.
	const icicle = ICICLES[wrap(x)];
	if (icicle && y - d < icicle) return y - d === icicle - 1 ? "n" : "Y";
	return darker(under[y][wrap(x)], y === d ? 2 : y === d + 1 ? 1 : 0);
}
// The rounded top corner: pixels outside a radius-5 quarter circle in rows 0 to 4 (cx is the corner's centre column).
const R_SNOW = 5;
const outsideCorner = (x: number, y: number, cx: number) =>
	y < R_SNOW && (x + 0.5 - cx) ** 2 + (y + 0.5 - R_SNOW) ** 2 > R_SNOW * R_SNOW;
function snowEdge(x: number, y: number, side: "l" | "r"): string {
	const cx = side === "l" ? R_SNOW : N - R_SNOW;
	if (outsideCorner(x, y, cx)) return ".";
	const out = (dx: number, dy: number) => x + dx < 0 || x + dx > 15 || (y + dy >= 0 && outsideCorner(x + dx, y + dy, cx));
	const d = SNOW_DEPTH[x];
	const edgeX = side === "l" ? 0 : 15;
	if (y < d) {
		// The rim where the snow meets the sky: soft blue-grey on the lit side, the deep shadow on the other.
		if (out(side === "l" ? -1 : 1, 0) || out(0, -1)) return side === "l" ? (y < 3 ? "Y" : "n") : y < 2 ? "n" : "U";
		const s = snowCap(x, y);
		if (side === "l" && x <= 2 && y < d - 2) return s === "o" || s === "Y" ? "p" : s;
		return side === "r" && x >= 11 ? darker(s) : s;
	}
	if (x === edgeX) return "a";
	const s = snowCap(x, y);
	return side === "r" && x >= 12 ? darker(s) : side === "l" && x === 1 ? (s === "a" ? s : "d") : s;
}

// --- Brick: courses of 4 rows (3 of face, 1 of mortar), bricks of 3 to 9, never two head joints in line. ---
const BRICK_MAP = [
	"AAAABBBBBBBCCCCC",
	"AAAABBBBBBBCCCCC",
	"AAAABBBBBBBCCCCC",
	"AAAABBBBBBBCCCCC",
	"DDDDDDDEEEEEEEDD",
	"DDDDDDDEEEEEEEDD",
	"DDDDDDDEEEEEEEDD",
	"DDDDDDDEEEEEEEDD",
	"GGGHHHHHHHIIIGGG",
	"GGGHHHHHHHIIIGGG",
	"GGGHHHHHHHIIIGGG",
	"GGGHHHHHHHIIIGGG",
	"JKKKKKLLLLLLJJJJ",
	"JKKKKKLLLLLLJJJJ",
	"JKKKKKLLLLLLJJJJ",
	"JKKKKKLLLLLLJJJJ",
];
const brickBase = masonry(BRICK_MAP, {
	joint: "a", steps: "bcRde", seed: 7, pits: 0.08, flat: true, warm: new Set(["C", "G", "K"]), warmSteps: "bSSTe",
	lift: { A: 0.04, B: -0.06, C: 0, D: 0.08, E: -0.12, G: 0.02, H: 0.04, I: -0.1, J: 0.1, K: -0.04, L: -0.02 },
});
// A hairline crack in the long brick of the top course.
const brick = over(brickBase, [
	"       b        ",
	"       Rb       ",
	"        b       ",
	"                ",
	"                ",
	"                ",
	"                ",
	"                ",
	"                ",
	"                ",
	"                ",
	"                ",
	"                ",
	"                ",
	"                ",
	"                ",
]);
const brickAt = (x: number, y: number) => brick[wrap(y)][wrap(x)];

// brick-dark: the running bond of Tiny Town's stone wall (head joints at 6 and 13, then 3 and 10), with some bricks
// lit along the top as in the pack, recoloured dark and damp, moss in the joints.
const DARK_BRICK_MAP = [
	"AAAAAAABBBBBBBAA",
	"AAAAAAABBBBBBBAA",
	"AAAAAAABBBBBBBAA",
	"AAAAAAABBBBBBBAA",
	"CCCCDDDDDDDCCCCC",
	"CCCCDDDDDDDCCCCC",
	"CCCCDDDDDDDCCCCC",
	"CCCCDDDDDDDCCCCC",
	"EEEEEEEFFFFFFFEE",
	"EEEEEEEFFFFFFFEE",
	"EEEEEEEFFFFFFFEE",
	"EEEEEEEFFFFFFFEE",
	"GGGGHHHHHHHGGGGG",
	"GGGGHHHHHHHGGGGG",
	"GGGGHHHHHHHGGGGG",
	"GGGGHHHHHHHGGGGG",
];
const brickDark = over(
	masonry(DARK_BRICK_MAP, {
		joint: "a", steps: "abcR", seed: 9, pits: 0.1, warm: new Set(["B", "G"]), warmSteps: "abSS",
		lift: { A: 0.04, B: 0, C: 0.12, D: -0.06, E: -0.14, F: 0.06, G: 0.02, H: -0.04 },
	}),
	[
		"                ",
		"                ",
		"                ",
		"   C   E        ",
		"  CDC CDC       ",
		"                ",
		"                ",
		"             E  ",
		"            DDC ",
		"             C  ",
		"                ",
		"                ",
		"                ",
		"                ",
		"                ",
		"   E            ",
	],
);

// --- Roof: shingles 8 wide in courses of 4 rows (the shadow of the course above, the body, the lit lip, the dark
// gap), each course staggered by half a shingle. The body and lip rows are Tiny Town's red roof rows, copied pixel
// for pixel (its peach glints and dithered light band) and recoloured to our terracotta. ---
const KENNEY_ROOF = ["5445354453434343", "4444344443434343"];
const ROOF_INK: Readonly<Record<string, string>> = { "3": "h", "4": "i", "5": "V" };
function shingle(x: number, y: number): string {
	const course = (y >> 2) & 3;
	const sx = wrap(x + (course % 2) * 4);
	const k = sx & 7; // the column within its shingle; 7 is the joint
	const row = y & 3;
	if (row === 3) return k === 0 || k === 6 ? "g" : "f";
	if (k === 7) return "f";
	if (row === 0) return k === 6 ? "f" : "g";
	if (k === 6) return row === 2 ? "g" : "h";
	if (k === 0 && row === 2) return "h";
	// Kenney's rows, shifted per course so the glints do not line up.
	return ROOF_INK[KENNEY_ROOF[row - 1][wrap(x + course * 5)]];
}

// --- Clouds: a body given by its top and bottom row per column; a bright rim on the top and left of each puff, a
// mid band, and a shaded underside two rows deep. ---
type Span = readonly (readonly [number, number] | null)[];
function cloud(span: Span, opts: { shadeRight?: boolean; openBottom?: boolean; under?: number } = {}): Grid {
	const inside = (x: number, y: number) => {
		const s = x >= 0 && x < N ? span[x] : null;
		return !!s && y >= s[0] && y <= s[1];
	};
	return make((x, y) => {
		const s = span[x];
		if (!s || !inside(x, y)) return ".";
		const fromBottom = s[1] - y;
		const under = opts.under ?? 2;
		if (!opts.openBottom && fromBottom < under) return "F";
		// The shade under the body rises and falls with the puffs above it.
		if (!opts.openBottom && fromBottom <= under + CLOUD_WAVE[x]) return "X";
		if (opts.shadeRight && !inside(x + 1, y)) return "F";
		if (opts.shadeRight && !inside(x + 2, y)) return "X";
		// The rim of each puff, where it meets the sky on its top or its left, and the lit row under the very top.
		if ((y > 0 && !inside(x, y - 1)) || (x > 0 && !inside(x - 1, y))) return "p";
		if (y > 1 && !inside(x, y - 2) && x > 0 && !inside(x - 1, y - 2)) return "p";
		// A soft seam where a puff sits in front of the one behind it: under a dip in the top line.
		if (x > 0 && x < N - 1 && span[x - 1] && span[x + 1] && y === s[0] + 3 && span[x - 1]![0] < s[0] && span[x + 1]![0] <= s[0]) return "X";
		return "G";
	});
}
const CLOUD_WAVE = [0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1];
const cols = (from: number, rows: readonly (readonly [number, number])[]): Span =>
	Array.from({ length: N }, (_, x) => (x >= from && x - from < rows.length ? rows[x - from] : null));

// --- Roots: two strands four wide (lit edge, two body tones, outline), with bark rings and flecks, swaying and
// back in their columns at row 15. ---
const SWAY_1 = [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, -1, -1, -1, -1, 0, 0];
const SWAY_2 = [0, -1, -1, -1, -1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0];
const STRAND = "BkAz";
const TAPER_1 = [4, 4, 4, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1, 0, 0];
const TAPER_2 = [4, 4, 4, 4, 3, 3, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0];
const RINGS = new Set([5, 13]);
function roots(end: boolean): Grid {
	return make((x, y) => {
		for (const [base, sway, taper, seed] of [
			[2, SWAY_1, TAPER_1, 1],
			[10, SWAY_2, TAPER_2, 2],
		] as const) {
			const left = base + sway[y];
			const w = end ? taper[y] : 4;
			if (w === 0) continue;
			const i = x - left - (4 - w);
			if (i < 0 || i >= w) continue;
			const ch = w === 4 ? STRAND[i] : w === 3 ? "kAz"[i] : w === 2 ? "Az"[i] : end && taper[y + 1] === 0 ? "z" : "A";
			// Bark: a dark ring across the strand every few rows, offset per strand, and a pale fleck now and then.
			if (w >= 3 && i > 0 && i < w - 1 && RINGS.has(wrap(y + seed * 3))) return "z";
			if (w >= 3 && i === 1 && noise(x, y, 20 + seed) > 0.86) return "B";
			return ch;
		}
		// A rootlet off each full strand.
		if (!end && ((y === 8 && (x === 0 || x === 1)) || (y === 9 && x === 0))) return y === 8 && x === 1 ? "A" : "z";
		if (!end && ((y === 4 && (x === 14 || x === 15)) || (y === 3 && x === 15))) return y === 4 && x === 14 ? "A" : "z";
		return ".";
	});
}

// --- The stone underside: hanging lumps, each column ending at its own row, darker the lower it hangs. ---
const UNDER = [9, 11, 12, 13, 13, 12, 11, 10, 10, 11, 12, 14, 15, 14, 12, 10];
function stoneBottom(x: number, y: number): string {
	const end = UNDER[x];
	if (y > end) return ".";
	if (y === end) return "a";
	// The sides of each lump, where a neighbour column ends higher: lit on the left of a lump, dark on its right.
	if (y > UNDER[wrap(x - 1)]) return y === end - 1 ? "a" : "c";
	if (y > UNDER[wrap(x + 1)]) return "a";
	if (y === end - 1) return "b";
	const s = stoneDark[y][x];
	return y >= 9 ? darker(s) : s;
}

// --- Arches, for the window and the door: an opening that is a half circle on top of straight jambs, ringed by
// voussoirs (wedge stones, the one at the top a pale keystone). ---
type Arch = { cx: number; cy: number; r: number; ring: number; x0: number; x1: number };
const inOpening = (a: Arch, x: number, y: number) =>
	x >= a.x0 && x <= a.x1 && (y >= a.cy || (x + 0.5 - a.cx) ** 2 + (y + 0.5 - a.cy) ** 2 <= a.r * a.r);
function voussoir(a: Arch, x: number, y: number): string | null {
	if (y >= a.cy) return null;
	const d = Math.hypot(x + 0.5 - a.cx, y + 0.5 - a.cy);
	if (d <= a.r || d > a.r + a.ring) return null;
	const angle = Math.atan2(a.cy - (y + 0.5), x + 0.5 - a.cx); // 0 right, pi/2 up, pi left
	const k = Math.round((angle / Math.PI) * 6); // 7 wedges: 0..6, 3 is the keystone
	const seam = Math.abs((angle / Math.PI) * 6 - (k - 0.5 * Math.sign((angle / Math.PI) * 6 - k))) < 0.12;
	if (d > a.r + a.ring - 0.9) return "a";
	if (seam && k !== 3) return "a";
	if (k === 3) return d < a.r + 1 ? "d" : "e";
	const lit = k >= 3;
	return d < a.r + 1.1 ? (lit ? "R" : "b") : lit ? "d" : "c";
}

// --- The window: two tiles, an arch over glass in two lights, a lead cross, glints on the left panes, a stone sill
// that casts its shadow on the wall. ---
const WIN: Arch = { cx: 8, cy: 9, r: 5.5, ring: 2.6, x0: 3, x1: 13 };
const winOpenTop = (x: number, y: number) => inOpening(WIN, x, y);
const winOpenLow = (x: number, y: number) => x >= WIN.x0 && x <= WIN.x1 && y <= 11;
// Glass in the opening, by position in the whole window (y from the top tile's row 0 to the lower tile's row 11).
function pane(x: number, wy: number, lit: boolean): string {
	if (x === 8) return lit ? "k" : "j";
	if (wy === 18) return lit ? "k" : "j";
	if (lit) {
		const v = 0.9 - (Math.abs(x - 8) / 5) * 0.4 - (wy / 27) * 0.4;
		return ramp("utv", v, x, wy);
	}
	const left = x < 8;
	const glint = left ? x - 4 + (wy - 9) : x - 9 + (wy - 20);
	if (glint === 0 || (left && glint === 1 && wy < 14)) return "s";
	if (glint === 1 || glint === -1) return "r";
	// The sky's reflection: the upper glass lighter, the lower in the room's dark, split on a slant.
	return wy + (x > 8 ? 4 : 0) - (x % 4) < 23 ? "r" : "q";
}
function windowShape(x: number, y: number, top: boolean, lit = false): string {
	const open = top ? winOpenTop(x, y) : winOpenLow(x, y);
	const wy = top ? y : y + 16;
	if (open) {
		const edge = top
			? !winOpenTop(x - 1, y) || !winOpenTop(x + 1, y) || !winOpenTop(x, y - 1)
			: x === WIN.x0 || x === WIN.x1;
		if (edge) return "a";
		// The reveal: one pixel of shadow inside the top and left of the opening.
		if ((top && !winOpenTop(x, y - 2) && x < 8) || x === WIN.x0 + 1) return "q";
		return pane(x, wy, lit);
	}
	if (top) {
		const v = voussoir(WIN, x, y);
		if (v) return v;
	}
	// The jambs: dressed stones either side of the opening, in courses with the brick.
	if ((x === 1 || x === 2 || x === 14 || x === 15) && wy >= 9 && wy <= 27) {
		if (wy % 4 === 3) return "a";
		if (x === 15 || x === 2) return x === 15 ? "a" : "c";
		return x === 1 ? (wy % 4 === 0 ? "e" : "d") : wy % 4 === 0 ? "R" : "c";
	}
	if (!top) {
		// The sill, wider than the opening, and its shadow down and to the right.
		if (y === 12 && x >= 1 && x <= 15) return x === 1 ? "e" : x === 15 ? "a" : "e";
		if (y === 13 && x >= 1 && x <= 15) return x === 15 ? "a" : x <= 3 ? "d" : "R";
		if (y === 14 && x >= 1 && x <= 15) return "a";
		if (y === 15 && x >= 3) return darker(brickAt(x, y));
	}
	return brickAt(x, y);
}

// --- The door: two tiles, oak boards in an arch with a keystone, iron straps with rivets and hinge ends, a ring. ---
const DOOR: Arch = { cx: 8, cy: 8, r: 6, ring: 2.4, x0: 2, x1: 13 };
const BOARD = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4];
function oak(x: number, wy: number): string {
	// wy runs over both tiles: 0..31.
	const band = wy === 13 || wy === 14 || wy === 25 || wy === 26;
	if (band) {
		if (x >= 3 && x <= 12 && (x === 4 || x === 8 || x === 11) && wy % 2 === 1) return "R";
		return wy % 2 === 1 ? "b" : "a";
	}
	// The hinge ends: rounded tips of the straps on the left.
	if ((wy === 12 || wy === 15 || wy === 24 || wy === 27) && x === 3) return "b";
	// The ring pull: a dark ring with a lit upper left.
	const rx = x - 10;
	const ry = wy - 20;
	if (Math.abs(rx) <= 1 && Math.abs(ry) <= 1 && !(rx === 0 && ry === 0)) return rx < 0 || ry < 0 ? "R" : "a";
	if (rx === 0 && ry === -2) return "a";
	const b = BOARD[x];
	const first = x === 0 || BOARD[x - 1] !== b;
	const last = x === 15 || BOARD[x + 1] !== b;
	if (last) return "j";
	if (first) return "m";
	const g = noise(x, Math.floor(wy / 3), 30 + b);
	if (g < 0.22) return "k";
	if (g > 0.86) return "W";
	return "l";
}
function doorShape(x: number, y: number, top: boolean): string {
	const wy = top ? y : y + 16;
	const open = top ? inOpening(DOOR, x, y) : x >= DOOR.x0 && x <= DOOR.x1;
	if (!top && y === 15 && x >= 1 && x <= 14) return x === 1 ? "e" : x === 14 ? "c" : "d";
	if (open) {
		const edge = top ? !inOpening(DOOR, x - 1, y) || !inOpening(DOOR, x + 1, y) || !inOpening(DOOR, x, y - 1) : x === 2 || x === 13;
		if (edge) return "a";
		// The pale jamb inside the outline on the lit side, the shadowed one on the other.
		if (x === 3 || (top && !inOpening(DOOR, x, y - 2) && x < 8)) return "k";
		if (x === 12 || (top && !inOpening(DOOR, x, y - 2))) return "j";
		return oak(x, wy);
	}
	if (top) {
		const v = voussoir(DOOR, x, y);
		if (v) return v;
	}
	return !top && x >= 14 && y >= 2 ? darker(brickAt(x, y)) : brickAt(x, y);
}

// --- Roof edges: the outline where the roof meets the sky, a lit verge on the left slope, a shaded one on the right.
const roofLeft = (x: number, y: number) => {
	const d = x + y - 15;
	if (d < 0) return ".";
	if (d === 0) return "f";
	if (d === 1) return "V";
	if (d === 2) return checker(x, y) ? "i" : "V";
	if (d === 3) return "g";
	return shingle(x, y);
};
const roofRight = (x: number, y: number) => {
	const d = y - x;
	if (d < 0) return ".";
	if (d === 0) return "f";
	if (d === 1) return "h";
	if (d === 2) return "g";
	if (d === 3) return "f";
	return shingle(x, y);
};

// --- The worked example: two courses of 8 by 8 blocks, the lower course offset by 4. ---
const BLOCK = ["edddddda", "dcccccca", "dcccccca", "dcccccca", "dcccccca", "dcccccba", "dbbbbbba", "aaaaaaaa"];
const course = (rows: readonly string[], offset: number) =>
	rows.map((r) => (offset === 0 ? r + r : r.slice(offset) + r + r.slice(0, offset)));
const STEP_PLAIN = [...course(BLOCK, 0), ...course(BLOCK, 4)];
// Texture on the block faces (the rows the worked example pins are left alone): a lit dither under the top edge,
// pits, a chipped corner.
const step = STEP_PLAIN.map((row, y) =>
	y === 0 || y === 8 || y === 15
		? row
		: [...row]
				.map((ch, x) => {
					if (ch !== "c") return ch;
					const n = noise(x, y, 40);
					if ((y === 1 || y === 9) && checker(x, y)) return "R";
					if (n < 0.08) return "b";
					if (n > 0.93) return "R";
					return ch;
				})
				.join(""),
);

// --- The pillar: dressed blocks two to a tile, the lower one split, rounded by light from the left. ---
const PILLAR_COLS = "aedRRcccccccbbba";
const pillar = make((x, y) => {
	if (x === 0 || x === 15) return "a";
	if (y === 7 || y === 15) return x === 1 ? "b" : "a";
	if (y >= 8 && x === 10) return "a";
	if (y === 0 || y === 8) return x <= 2 ? "e" : x >= 13 ? "c" : x === 9 ? "c" : "d";
	const base = PILLAR_COLS[x];
	if (y >= 8 && x === 11) return "R";
	if (y >= 8 && x === 9) return "b";
	const n = noise(x, y, 50);
	if (x > 2 && x < 13 && n < 0.07) return darker(base);
	if (base === "R" && !checker(x, y)) return "c";
	if (base === "c" && x >= 10 && checker(x, y)) return "b";
	return base;
});

// --- Small things, drawn by hand. ---
const GRASS = [
	"................",
	"................",
	"................",
	"................",
	"................",
	"................",
	"................",
	"................",
	"................",
	"...E..........E.",
	"...D.E.......ED.",
	".E.DCD....E..DC.",
	".DEDCD...EDC.DCE",
	"EDDCDC.o.DDC.DCD",
	"CDCCDCoE.CDCCDCC",
	"CCCCCC.D.CCCCCCC",
];
const LANTERN = [
	"................",
	"..aa............",
	".a..aaaaaaa.....",
	"..aa......a.....",
	".......abba.....",
	"......aRccba....",
	".....aRcccbba...",
	".....aaaaaaaa...",
	".....atvvvtua...",
	".....atvvvtua...",
	".....atvuvtua...",
	".....atuuutua...",
	".....aaaaaaaa...",
	"......aRcba.....",
	".......Ra.......",
	".......ca.......",
];
const BANNER_TOP = [
	".a..............",
	"aWa..........aWa",
	"aWmWmmWmmWmmmmka",
	".jjkkkkkkkkkkkj.",
	"...yxxyxxwxxxw..",
	"...tuttuttuttu..",
	"...yxxyxxwxxxw..",
	"...yxxyxxwxxxw..",
	"...yxtyxtwxxxw..",
	"...yxvttttuxxw..",
	"...ytvttttuxxw..",
	"...yxtttttuxxw..",
	"...yxxtttuwxxw..",
	"...yxxyxuwxxxw..",
	"...yxxyxxwxxxw..",
	"...yxxyxxwxxxw..",
];

// --- Added in the look pass: the island's organic underside, its scenery, and the lit windows. ---

// The underside where it slopes up toward the island's ends: rock on one side of a slightly ragged diagonal,
// outlined along it with a shaded lip (the underside faces down, away from the light). "l" is the left end of the
// island (rock in the upper right), "r" the right end (rock in the upper left, deeper in shadow).
const SLOPE_JITTER = [0, 0, 1, 1, 0, -1, 0, 0, 1, 0, 0, -1, -1, 0, 0, 0];
function underSlope(x: number, y: number, side: "l" | "r"): string {
	const u = side === "l" ? x : 15 - x; // distance in from the open side
	const cut = y + SLOPE_JITTER[y];
	if (u < cut) return ".";
	if (u === cut) return "a";
	const s = stoneDark[y][x];
	if (u === cut + 1) return side === "l" ? "b" : "a";
	if (u === cut + 2) return darker(s);
	return side === "r" && u <= cut + 4 ? darker(s) : s;
}
// A stone that juts down from the underside: a wedge ending in a point, lit on its left side.
const HANG: readonly (readonly [number, number])[] = [
	[1, 14], [2, 13], [2, 13], [3, 12], [3, 12], [4, 11], [5, 11], [5, 10], [6, 10], [6, 9], [7, 9], [7, 8], [8, 8],
];
function hangingStone(x: number, y: number): string {
	const row = HANG[y];
	if (!row || x < row[0] || x > row[1]) return ".";
	const below = HANG[y + 1];
	if (x === row[1] || !below || x < below[0] || x > below[1]) return "a";
	if (x === row[0]) return y < 4 ? "R" : "c";
	if (x === row[1] - 1) return "b";
	const s = stoneDark[y][x];
	return y >= 7 ? darker(s) : s;
}

// A tree trunk: bark five wide, lit on its left, with knots; the base flares into roots, with snow drifted at its foot.
function bark(x: number, y: number, left: number, w: number): string | null {
	const i = x - left;
	if (i < 0 || i >= w) return null;
	if (i === w - 1) return "j";
	if (i === 0) return "l";
	if (noise(x, y >> 1, 90) > 0.82) return "j";
	return i === 1 ? (noise(x, y, 91) > 0.6 ? "m" : "l") : "k";
}
function trunk(x: number, y: number, base: boolean): string {
	if (!base) return bark(x, y, 6, 5) ?? ".";
	const flare = y >= 12 ? y - 11 : 0; // rows 12 to 15 spread out by 1 to 4 pixels each side
	const b = bark(x, y, 6 - flare, 5 + 2 * flare);
	if (y === 15 && (x === 1 || x === 14)) return "o";
	if (y === 15 && (x === 0 || x === 15)) return "Y";
	return b ?? ".";
}

// Snowy pines. A tier is a skirt of boughs in a cell 16 rows tall and `w` wide, narrow at its top and wide at its
// bottom, with snow along the top of every bough. Big pines are three cells wide (pine-l, pine-c, pine-r), small
// ones a single cell (pine-small); pine-tip is the point of either.
type Tier = { w: number; top: number; bottom: number; from: number; seed: number };
const tierHalf = (t: Tier, y: number) => t.top / 2 + ((t.bottom - t.top) / 2) * ((y - t.from) / (15 - t.from));
function inTier(t: Tier, x: number, y: number): boolean {
	if (y < t.from || y > 15 || x < 0 || x >= t.w) return false;
	const off = Math.abs(x + 0.5 - t.w / 2);
	// The bough tips droop along the bottom: every five pixels out from the trunk the skirt dips a row.
	const dip = y === 15 && Math.floor(off) % 5 === 2 ? 1 : 0;
	const notch = y >= 13 && off > tierHalf(t, y) - 2 && Math.floor(off) % 4 === 0;
	return off <= tierHalf(t, y) - dip && !notch;
}
function pine(t: Tier, x: number, y: number): string {
	if (!inTier(t, x, y)) return ".";
	const c = t.w / 2;
	if (!inTier(t, x, y + 1)) return "a";
	if (!inTier(t, x + 1, y) && x + 0.5 > c) return "a";
	// Snow on the boughs: the top surface of the skirt, one or two pixels thick, bluer on the shaded right.
	const snowTop = !inTier(t, x, y - 1);
	const snowTwo = !inTier(t, x, y - 2) && noise(x, 0, t.seed) > 0.35;
	const right = x + 0.5 > c + 2;
	if (snowTop) return right ? "o" : "p";
	if (snowTwo) return right ? "Y" : "o";
	if (!inTier(t, x - 1, y) && x + 0.5 < c) return "C";
	if (!inTier(t, x, y + 2)) return "C"; // the shade under each bough
	// Needles: lit left of the trunk, deep on the right, with a few branch streaks running down and out.
	const streak = (Math.floor(Math.abs(x + 0.5 - c)) + y + t.seed) % 6 === 0;
	if (streak) return "C";
	const v = 0.62 - ((x + 0.5 - c) / (t.w / 2)) * 0.45 - (y - t.from) * 0.012 + (noise(x, y, t.seed + 1) - 0.5) * 0.3;
	return ramp("CDE", v, x, y);
}
const BIG_TIER: Tier = { w: 48, top: 12, bottom: 46, from: 0, seed: 100 };
const SMALL_TIER: Tier = { w: 16, top: 3, bottom: 15, from: 0, seed: 104 };
const TIP_TIER: Tier = { w: 16, top: 1, bottom: 12, from: 3, seed: 106 };
const bigPine = (cell: number) => make((x, y) => pine(BIG_TIER, x + cell * 16, y));

// A low shrub, rounded, dusted with snow on top.
const BUSH_TOP = [11, 8, 7, 6, 6, 7, 6, 6, 6, 7, 7, 8, 8, 9, 10, 12];
function bush(x: number, y: number): string {
	const top = BUSH_TOP[x];
	if (y < top) return ".";
	if (x === 15 || y === 15) return "a";
	if (y === top) return x < 9 ? "p" : "o";
	if (y === top + 1 && noise(x, 0, 110) > 0.4) return x < 9 ? "o" : "Y";
	if (x === 14 || y === 14) return "C";
	const v = 0.7 - x * 0.03 - (y - top) * 0.05 + (noise(x, y, 111) - 0.5) * 0.35;
	return ramp("CDE", v, x, y);
}

// Grass tufts poking through the snow, and two small flowers.
const TUFT = [
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
	"......V.........",
	".....ViV....E...",
	"..E...g...E.DE..",
	"..DE..D..EDCD.E.",
	".EDC.EDC.DCCDCD.",
	"CDCCDCCCCCCCCCCC",
];

// A flagstone path laid into the snow: two pale slabs set flush with its top, lit along their top and left, with
// packed snow between them and the snow's own cap and rock below.
const SLABS: readonly (readonly [number, number])[] = [[1, 6], [9, 14]];
function path(x: number, y: number): string {
	const slab = SLABS.find(([a, b]) => x >= a && x <= b);
	if (slab && y <= 3) {
		const [a, b] = slab;
		if (y === 3 || x === b) return "c";
		if (y === 0 || x === a) return x === a && y === 0 ? "p" : "e";
		return noise(x, y, 120) > 0.75 ? "R" : "d";
	}
	return snowCap(x, y);
}

// A signpost pointing right, to the hall: a board with an arrow end, snow on its top, on a post.
const SIGN = [
	"................",
	"................",
	"................",
	"..ppppppppoo....",
	".jmmmmmmmmmml...",
	".jmWmmWmmmmmlj..",
	".jlkkkklkkklllj.",
	".jllllllllllkj..",
	".jkkkkkkkkkkj...",
	"......lkj.......",
	"......lkj.......",
	"......lkj.......",
	"......lkj.......",
	"......lkj.......",
	".....olkjo......",
	"....oYYYYYo.....",
];

// A fence piece: a post at its left and two rails running through, snow on the post's cap and the top rail.
const FENCE = [
	"................",
	"................",
	"................",
	"................",
	".pp.............",
	"lmmj............",
	"lmkj............",
	"lmkjpppppoooooop",
	"lmkjmmmWmmmmmWmm",
	"lmkjkkkkkkkkkkkk",
	"lmkjjjjjjjjjjjjj",
	"lmkj............",
	"lmkjmmmmmWmmmmmm",
	"lmkjkkkkkkkkkkkk",
	"lmkjjjjjjjjjjjjj",
	"lmkj............",
];

export const TILES: Readonly<Record<TileId, Grid>> = {
	snow: make((x, y) => snowCap(x, y)),
	"snow-edge-l": make((x, y) => snowEdge(x, y, "l")),
	"snow-edge-r": make((x, y) => snowEdge(x, y, "r")),
	stone,
	"stone-dark": stoneDark,
	// The flanks: a diagonal cut, transparent outside, outlined along it, lit on the left flank, shaded on the right.
	"stone-edge-l": make((x, y) => {
		const cut = Math.round((y * 6) / 15);
		if (x < cut) return ".";
		if (x === cut) return "a";
		const s = y < 8 ? stone[y][x] : stoneDark[y][x];
		return x === cut + 1 && s !== "a" ? "d" : s;
	}),
	"stone-edge-r": make((x, y) => {
		const cut = 15 - Math.round((y * 6) / 15);
		if (x > cut) return ".";
		if (x === cut) return "a";
		const s = y < 8 ? stone[y][x] : stoneDark[y][x];
		return x >= cut - 2 ? darker(s) : s;
	}),
	"stone-bottom": make(stoneBottom),
	root: roots(false),
	"root-end": roots(true),
	grass: GRASS,
	brick,
	"brick-dark": brickDark,
	// Boards 4 rows tall (lit top, two rows of grain, the gap); each row of boards has its joint somewhere else,
	// nailed both sides of it, and one knot.
	plank: make((x, y) => {
		const joint = [5, 13, 9, 1][y >> 2];
		const row = y % 4;
		if (row === 3) return "j";
		if (x === joint) return "j";
		if (row === 1 && (x === wrap(joint - 2) || x === wrap(joint + 2))) return x === wrap(joint - 2) ? "a" : "b";
		if (x === wrap(joint - 1)) return row === 0 ? "l" : "k";
		if (x === wrap(joint + 1)) return row === 0 ? "W" : "m";
		if (row === 0) return noise(x, y, 60) > 0.75 ? "W" : "m";
		if (y === 9 && (x === 3 || x === 4)) return x === 3 ? "j" : "k";
		if (y === 10 && x === 4) return "k";
		const grain = noise(x >> 1, y, 61 + (y >> 2)) < 0.3;
		return row === 2 ? (grain ? "k" : checker(x, y) ? "l" : "k") : grain ? "k" : "l";
	}),
	// A post: outlined, lit left, grain running down it, an iron band.
	beam: make((x, y) => {
		if (x < 4 || x > 11) return ".";
		if (x === 4 || x === 11) return "j";
		if (y === 6 || y === 7) return y === 6 ? (x === 5 ? "R" : x === 10 ? "a" : "c") : x === 5 ? "c" : "a";
		if (y === 8 && x === 9) return "a";
		const grain = (x === 7 && (y + 3) % 9 < 4) || (x === 8 && (y + 7) % 11 < 3);
		if (grain) return "k";
		if (y === 12 && (x === 6 || x === 7)) return x === 6 ? "j" : "k";
		return "Wmlllk"[x - 5];
	}),
	// The lintel under the eaves: the shingles' lip and the dark of the eave, a timber with iron plates and bolts, and
	// the eave's shadow lying across the top of the brick below.
	"beam-h": make((x, y) => {
		if (y === 0) return x % 8 === 7 ? "f" : x % 8 === 0 ? "i" : "h";
		if (y === 1) return x % 8 === 7 ? "f" : "g";
		if (y === 2) return "f";
		if (y === 3) return "j";
		if (y === 11) return "j";
		// The eave's shadow on the brick: deepest just under the timber.
		if (y >= 12) return darker(brickAt(x, y), y <= 13 ? 2 : 1);
		// An iron plate, lit on its top and left, with two bolt heads.
		if (x >= 10 && x <= 13 && y >= 5 && y <= 9) {
			if (y === 9 || x === 13) return "a";
			if (y === 5 || x === 10) return "R";
			return (x === 11 || x === 12) && (y === 6 || y === 8) && x - 11 === (y - 6) / 2 ? "d" : "b";
		}
		if (y === 4) return noise(x, y, 70) > 0.7 ? "l" : "k";
		if (y === 10) return "k";
		const grain = noise(x >> 2, y, 71) < 0.35;
		if (grain) return "k";
		return y === 5 && noise(x, y, 72) > 0.6 ? "W" : y <= 6 ? "m" : "l";
	}),
	// The lit window pane (the other side of the glass at night): warm light in four panes and a wooden cross.
	glass: make((x, y) => {
		if (x === 15 || y === 15) return "j";
		if (x === 0 || y === 0) return "k";
		if (x === 7 || y === 7) return x === 7 && y !== 7 ? "k" : "j";
		const v = 0.95 - ((x % 8) + (y % 8)) / 16 - (x > 7 ? 0.1 : 0) - (y > 7 ? 0.1 : 0);
		if ((x % 8) + (y % 8) === 4 && x < 7 && y < 7) return "v";
		return ramp("utv", v, x, y);
	}),
	window: make((x, y) => windowShape(x, y, false)),
	"window-top": make((x, y) => windowShape(x, y, true)),
	door: make((x, y) => doorShape(x, y, false)),
	"door-top": make((x, y) => doorShape(x, y, true)),
	"roof-left": make(roofLeft),
	"roof-right": make(roofRight),
	"roof-flat": make(shingle),
	// The apex: the two verges meeting under a ridge cap, and an iron finial with a ball and a small teal pennant.
	"roof-peak": make((x, y) => {
		if (y < 8) {
			if (y >= 1 && y <= 2 && x >= 9 && x <= 12) return y === 1 ? (x === 12 ? "w" : "y") : x <= 10 ? "x" : x === 11 ? "w" : ".";
			if (y >= 3 && y <= 5 && x >= 6 && x <= 9) {
				const bx = x - 6;
				const by = y - 3;
				const ball = [".ab.", "aeca", ".aa."];
				const ch = ball[by][bx];
				if (ch !== ".") return ch;
			}
			if (x === 7 || x === 8) {
				if (y === 0) return x === 7 ? "d" : ".";
				if (y < 3) return x === 7 ? "c" : "a";
				if (y >= 6) return x === 7 ? "R" : "a";
			}
			return ".";
		}
		const dl = x + y - 15;
		const dr = y - x;
		if (dl < 0 || dr < 0) return ".";
		if (dl === 0 || dr === 0) return "f";
		// The ridge cap: two rows of pale tiles following each verge near the top.
		if (y <= 10) return dl <= 1 ? "V" : dr <= 1 ? "h" : checker(x, y) ? "i" : "V";
		if (dl === 1) return "V";
		if (dl === 2) return checker(x, y) ? "i" : "V";
		if (dl === 3) return "g";
		if (dr === 1) return "h";
		if (dr === 2) return "g";
		if (dr === 3) return "f";
		return shingle(x, y);
	}),
	// The top of the chimney tower: two merlons with coping stones, outlined against the sky, on a full course.
	battlement: make((x, y) => {
		const merlon = x <= 5 || x >= 10;
		if (y < 3) return ".";
		if (!merlon && y < 9) return y === 8 ? (x === 6 ? "d" : "e") : ".";
		if (y === 3) return x !== 0 && x !== 5 && x !== 10 && x !== 15 ? "a" : ".";
		if (merlon && y <= 5) {
			const edge = x === 0 || x === 10;
			const right = x === 5 || x === 15;
			if (y === 4) return edge || right ? "a" : x === 1 || x === 11 ? "e" : "d";
			return edge || right ? "a" : "b";
		}
		if (y === 9 && !merlon) return "a";
		if (merlon && y < 9 && (x === 0 || x === 10)) return "a";
		if (merlon && y < 9 && (x === 5 || x === 15)) return "a";
		if (y === 6 && merlon) return darker(brickAt(x, y), 2);
		return brickAt(x, y);
	}),
	lantern: LANTERN,
	// An iron post: lit left, a collar, a flared foot.
	"lantern-post": make((x, y) => {
		if (y >= 12) {
			const half = y === 12 ? 2 : y === 13 ? 3 : 4;
			if (x < 8 - half || x > 7 + half) return ".";
			if (y === 15 || x === 7 + half) return "a";
			if (x === 8 - half) return y === 12 ? "R" : "c";
			return y === 12 ? "c" : x <= 7 ? "c" : "b";
		}
		if (y === 4 || y === 5) {
			if (x < 6 || x > 9) return ".";
			return y === 4 ? (x === 9 ? "a" : x === 6 ? "d" : "R") : x === 6 ? "c" : x === 9 ? "a" : "b";
		}
		if (x === 7) return y === 0 ? "R" : "c";
		if (x === 8) return "a";
		if (x === 6 && y <= 1) return "a";
		if (x === 9 && y <= 1) return "a";
		return ".";
	}),
	banner: BANNER_TOP,
	// The swallowtail, with a gold hem along the two points.
	"banner-end": make((x, y) => {
		if (x < 3 || x > 12) return ".";
		const last = [13, 12, 11, 9, 7, 7, 9, 11, 12, 13][x - 3];
		if (y > last) return ".";
		if (y === last) return "w";
		if (y === last - 1) return x === 3 ? "t" : "u";
		return BANNER_TOP[15][x];
	}),
	step,
	pillar,
	// A garden bench: a seat board with grain and a lit edge, a shadowed apron, two legs with a stretcher.
	bench: make((x, y) => {
		if (y === 7 && x >= 1 && x <= 14) return "j";
		if (y === 8 && x >= 1 && x <= 14) return x === 14 ? "j" : x === 1 ? "W" : noise(x, y, 80) > 0.7 ? "W" : "m";
		if (y === 9 && x >= 1 && x <= 14) return x === 14 ? "j" : x === 1 ? "m" : noise(x >> 1, y, 81) < 0.3 ? "k" : "l";
		if (y === 10 && x >= 1 && x <= 14) return x === 1 || x === 14 ? "j" : "k";
		if (y === 11 && x >= 2 && x <= 13) return "j";
		if (y >= 11) {
			if (x === 2 || x === 11) return "l";
			if (x === 3 || x === 12) return "k";
			if (x === 4 || x === 13) return "j";
			if (y === 13 && x >= 5 && x <= 10) return x === 10 ? "j" : "k";
		}
		return ".";
	}),
	"cloud-l": cloud(
		cols(3, [[9, 14], [7, 15], [6, 15], [6, 15], [5, 15], [4, 15], [4, 15], [5, 15], [5, 15], [4, 15], [3, 15], [3, 15], [3, 15]]),
	),
	"cloud-m": cloud(
		cols(0, [[3, 15], [3, 15], [4, 15], [4, 15], [3, 15], [2, 15], [1, 15], [1, 15], [1, 15], [1, 15], [2, 15], [3, 15], [4, 15], [4, 15], [3, 15], [3, 15]]),
	),
	"cloud-r": cloud(
		cols(0, [[3, 15], [3, 15], [2, 15], [2, 15], [2, 15], [3, 15], [4, 15], [5, 15], [5, 15], [4, 15], [5, 15], [7, 14], [9, 13]]),
		{ shadeRight: true },
	),
	"cloud-top": cloud(
		cols(2, [[12, 15], [9, 15], [8, 15], [7, 15], [6, 15], [6, 15], [7, 15], [7, 15], [6, 15], [7, 15], [9, 15], [12, 15]]),
		{ openBottom: true },
	),
	"cloud-small": cloud(
		cols(2, [[10, 12], [8, 13], [7, 13], [6, 13], [7, 13], [7, 13], [6, 13], [6, 13], [7, 13], [8, 13], [9, 13], [11, 12]]),
		{ under: 2 },
	),
	"window-lit": make((x, y) => windowShape(x, y, false, true)),
	"window-top-lit": make((x, y) => windowShape(x, y, true, true)),
	"stone-under-l": make((x, y) => underSlope(x, y, "l")),
	"stone-under-r": make((x, y) => underSlope(x, y, "r")),
	"stone-hang": make(hangingStone),
	trunk: make((x, y) => trunk(x, y, false)),
	"trunk-base": make((x, y) => trunk(x, y, true)),
	"pine-tip": make((x, y) => pine(TIP_TIER, x, y)),
	"pine-small": make((x, y) => pine(SMALL_TIER, x, y)),
	"pine-l": bigPine(0),
	"pine-c": bigPine(1),
	"pine-r": bigPine(2),
	bush: make(bush),
	tuft: TUFT,
	path: make(path),
	sign: SIGN,
	fence: FENCE,
};

const INDEX = new Map<TileId, number>(TILE_IDS.map((id, i) => [id, i]));
export const tileIndex = (id: TileId): number => INDEX.get(id) ?? 0;

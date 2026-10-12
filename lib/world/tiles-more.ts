// The free-will tiles (spec docs/superpowers/specs/2026-10-11-osmo-free-will-design.md section 4.5), appended after the
// polish pass's 71 in this order, which is their atlas order: append only. Each is a 16 by 16 grid of palette letters,
// light from the top left (palette.ts), drawn here with the same kind of helpers tiles.ts uses (copied, since tiles.ts
// imports this file): walls of upright planks and of dressed stone with a variant each, the back walls behind open
// fronts, a post and shutters, straw thatch in the shingle roof's four shapes, a rope and a bridge's deck, leaves,
// fruit, a hedge, water, flowers and soil, greenhouse glass for a wall and its two roof slopes, a striped balloon in four
// quarters and its basket, a bell, an awning, a windmill's sail, a statue, an arch course and a balcony rail.
import type { Grid } from "./raster";

export const MORE_TILE_IDS = [
	"plank-wall", "stone-wall", "back-wood", "back-stone", "post", "shutter", "thatch-l", "thatch-r", "thatch-flat", "thatch-peak",
	"rope", "bridge-board", "leaves", "fruit-leaves", "hedge", "water", "water-top", "flowers", "soil", "glass-wall",
	"glass-roof-l", "glass-roof-r", "balloon-tl", "balloon-tr", "balloon-bl", "balloon-br", "basket", "bell", "awning", "sail",
	"statue", "arch", "rail", "plank-wall-2", "stone-wall-2",
	// Appended in the fix round (the look pass's findings); the 106 above keep their cells.
	"deck", "spire-l", "spire-r", "spire-l-hi", "spire-r-hi", "spire-peak", "pond-water", "pond-rim", "pond-dock",
	"leaves-tl", "leaves-tr", "leaves-bl", "leaves-br",
	"post-plank-l", "post-plank-r", "post-back-l", "post-back-r", "post-back", "post-glass-l", "post-glass-r", "post-glass",
	"back-wood-top", "back-stone-top", "arch-back", "statue-back",
	"balloon-1", "balloon-2", "balloon-3", "balloon-4", "balloon-5", "balloon-6", "balloon-7", "balloon-8", "balloon-9", "basket-full",
	"chimney-base", "chimney-base-thatch",
] as const;
export type MoreTileId = (typeof MORE_TILE_IDS)[number];

// --- Helpers, as in tiles.ts. ---
const N = 16;
const wrap = (v: number) => ((v % N) + N) % N;
// A tile from a function of its pixel; the function sees x and y in 0..15.
const make = (f: (x: number, y: number) => string): Grid =>
	Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => f(x, y)).join(""));
// Paint a hand-drawn patch over a tile: a space or a "," keeps the pixel underneath.
const over = (base: Grid, patch: readonly string[]): Grid =>
	base.map((row, y) => [...row].map((ch, x) => (patch[y]?.[x] ?? " ").replace(/[ ,]/, () => ch)).join(""));
// A variant keeps its base's outermost ring of pixels exactly, so it joins its neighbours the way the base does.
const keepRing = (base: Grid, inner: Grid): Grid =>
	base.map((row, y) => (y === 0 || y === N - 1 ? row : row[0] + inner[y].slice(1, N - 1) + row[N - 1]));
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
// The shingle roof's slopes (tiles.ts roofLeft, roofRight): d is how far a pixel lies inside the slope, below 0 is sky.
const slopeL = (x: number, y: number) => x + y - 15;
const slopeR = (x: number, y: number) => y - x;

// --- Masonry, as in tiles.ts: each letter of a map is one stone; its bottom row and right column are the joint, its
// face lit along the top and left with a bright top-left corner, falling off toward the bottom right. ---
type Reach = { id: string; up: number; down: number; left: number; right: number };
function reach(map: readonly string[], x: number, y: number): Reach {
	const at = (px: number, py: number) => map[wrap(py)][wrap(px)];
	const id = at(x, y);
	const run = (dx: number, dy: number) => {
		let n = 0;
		while (n < N - 1 && at(x + dx * (n + 1), y + dy * (n + 1)) === id) n++;
		return n;
	};
	return { id, up: run(0, -1), down: run(0, 1), left: run(-1, 0), right: run(1, 0) };
}
type Mason = { joint: string; steps: string; seed: number; lift?: Readonly<Record<string, number>>; pits?: number; flat?: boolean };
function masonry(map: readonly string[], m: Mason): Grid {
	return make((x, y) => {
		const r = reach(map, x, y);
		if (r.right === 0 || r.down === 0) return m.joint;
		if (r.up === 0 && r.left === 0) return m.steps[m.steps.length - 1];
		const fy = r.up / Math.max(1, r.up + r.down - 1);
		const fx = r.left / Math.max(1, r.left + r.right - 1);
		let v = 0.55 - 0.16 * fy - 0.08 * fx + (m.lift?.[r.id] ?? 0);
		if (r.up === 0) v += 0.28;
		else if (r.left === 0) v += 0.2;
		if (r.down === 1) v -= 0.2;
		else if (r.right === 1) v -= 0.12;
		const inner = r.up > 0 && r.left > 0 && r.down > 1 && r.right > 1;
		if (inner && noise(x, y, m.seed) < (m.pits ?? 0.04)) v -= 0.3;
		return m.flat ? m.steps[Math.round(Math.min(1, Math.max(0, v)) * (m.steps.length - 1))] : ramp(m.steps, v, x, y);
	});
}

// --- Upright boards: three across (5, 5 and 6 px), each lit on its left, shaded on its right and followed by a dark
// gap; each has a butt joint at its own row, the board above it ending in shadow and the one below lit along its cut
// end. The pattern wraps both ways, so a wall of them has no seam. ---
const BOARDS: readonly (readonly [number, number, number])[] = [[0, 5, 15], [5, 10, 6], [10, 16, 11]]; // from x, to x, joint row
type Wood = { gap: string; dark: string; base: string; light: string; end: string; high: string; seed: number };
function boards(x: number, y: number, w: Wood): string {
	const [x0, x1, joint] = BOARDS.find(([a, b]) => x >= a && x < b) ?? BOARDS[0];
	const i = x - x0;
	const width = x1 - x0;
	if (i === width - 1 || y === joint) return w.gap;
	const below = wrap(y - joint - 1); // rows under the joint: 0 is the lit cut end
	if (below === 0) return i === 0 ? w.high : w.end;
	if (below === N - 2) return i === 0 ? w.base : w.dark; // the end of the board above, in shadow
	if (i === 0) return w.light;
	if (i === width - 2) return w.dark;
	// Grain: short dark streaks running down the board, and a lighter one now and then.
	const g = noise(x, (y + x * 5) >> 2, w.seed);
	if (g < 0.2) return w.dark;
	if (g > 0.9 && i === 1) return w.light;
	return w.base;
}
const PLANK: Wood = { gap: "j", dark: "k", base: "l", light: "m", end: "_", high: "`", seed: 130 };
// A nail under each of the middle and right boards' joints.
const plankWall = over(
	make((x, y) => boards(x, y, PLANK)),
	[
		"                ",
		"                ",
		"                ",
		"                ",
		"                ",
		"                ",
		"                ",
		"                ",
		"       a        ",
		"                ",
		"                ",
		"                ",
		"                ",
		"            a   ",
		"                ",
		"                ",
	],
);
// The same boards behind an open front, a quarter darker, with no nails.
// Dark and flat (the look pass: an open front must not read as a closed wall): the room's shade, its boards barely lit.
const backWood = make((x, y) => boards(x, y, { gap: "z", dark: "z", base: "A", light: "A", end: "k", high: "k", seed: 131 }));
// plank-wall-2: a knot in the left board with the grain bending round it, and a split in the right board.
const plankWall2 = keepRing(
	plankWall,
	over(plankWall, [
		"                ",
		"                ",
		"   k            ",
		"  k             ",
		"  l             ",
		" mkk            ",
		" kjjk           ",
		" kjAj           ",
		" lkjk           ",
		"  lk         j  ",
		"  k          j  ",
		"   k         kj ",
		"              j ",
		"                ",
		"                ",
		"                ",
	]),
);

// --- Dressed stone: courses 6, 5 and 5 rows deep, blocks 8 or 9 wide, never two head joints in line, lighter and more
// even than the island's rock. ---
const STONE_MAP = [
	"AAAAAAABBBBBBBBB",
	"AAAAAAABBBBBBBBB",
	"AAAAAAABBBBBBBBB",
	"AAAAAAABBBBBBBBB",
	"AAAAAAABBBBBBBBB",
	"AAAAAAABBBBBBBBB",
	"CCCDDDDDDDDCCCCC",
	"CCCDDDDDDDDCCCCC",
	"CCCDDDDDDDDCCCCC",
	"CCCDDDDDDDDCCCCC",
	"CCCDDDDDDDDCCCCC",
	"EEEEEFFFFFFFFEEE",
	"EEEEEFFFFFFFFEEE",
	"EEEEEFFFFFFFFEEE",
	"EEEEEFFFFFFFFEEE",
	"EEEEEFFFFFFFFEEE",
];
const STONE_LIFT = { A: 0.04, B: -0.04, C: 0.06, D: -0.02, E: 0, F: 0.05 };
const stoneWall = masonry(STONE_MAP, { joint: "~", steps: "}T|{", seed: 140, pits: 0.06, lift: STONE_LIFT, flat: true });
// The same courses behind an arcade, a quarter darker.
// Dark and flat, as the back wood.
const backStone = masonry(STONE_MAP, { joint: "a", steps: "~~}", seed: 141, pits: 0.02, lift: STONE_LIFT, flat: true });
// stone-wall-2: a crack running down across the middle course's long block and a hairline in the top course, each
// with its lit lower lip, and a chipped corner in the bottom course.
const stoneWall2 = keepRing(
	stoneWall,
	over(stoneWall, [
		"                ",
		"                ",
		"  ~             ",
		"  {~            ",
		"                ",
		"                ",
		"     ~          ",
		"     {~         ",
		"      {~~       ",
		"        {~      ",
		"                ",
		"     ~}         ",
		"     }          ",
		"                ",
		"                ",
		"                ",
	]),
);

// --- A squared timber post, six wide: outlined, a warm lit face on its left, grain down it, a peg through it. ---
const post = make((x, y) => {
	if (x < 5 || x > 10) return ".";
	if (x === 5 || x === 10) return "j";
	if (x === 7 && (y === 4 || y === 5)) return y === 4 ? "j" : "m"; // the peg: its hole's shadow, its lit end
	if (x === 8 && y === 4) return "k";
	const grain = (x === 7 && (y + 5) % 7 < 3) || (x === 8 && (y + 2) % 9 < 4);
	if (grain) return "k";
	return "`_llk"[x - 5] ?? "l";
});

// --- Shutters: a pair of boarded leaves painted teal, each two boards and a gap, lit on the left, outlined on the right
// and bottom, iron hinge straps on the outer edges, a diamond cut through each. ---
const SHUTTER = [
	"..yyyyyjyyyyyj..",
	"..yxwxxjyxwxxj..",
	"..yxwxxjyxwxxj..",
	"..RRRexjyxwRRj..",
	"..aaabxjyxwbaj..",
	"..yxwxxjyxwxxj..",
	"..yxwxxjyxwxxj..",
	"..yxwjxjyxwjxj..",
	"..yxjjwjyxjjwj..",
	"..yxwjxjyxwjxj..",
	"..yxwxxjyxwxxj..",
	"..RRRexjyxwRRj..",
	"..aaabxjyxwbaj..",
	"..yxwxxjyxwxxj..",
	"..xwwwwjxwwwwj..",
	"..jjjjjjjjjjjj..",
];

// --- Straw thatch: courses 4 rows deep, each lit along its top where it comes out from under the course above, combed
// into bundles of strands (lit on the left of each), its lower edge a ragged fringe in shadow; each course shifted half
// a bundle so the bundles do not line up. ---
function straw(x: number, y: number): string {
	const course = y >> 2;
	const row = y & 3;
	const sx = wrap(x + course * 6);
	const phase = sx % 4; // 0 the lit strand of a bundle, 3 the shadow between two bundles
	if (row === 0) {
		// Under the fringe of the course above: a long strand of it hangs over here and there.
		const above = wrap(x + ((course + 3) & 3) * 6);
		if (noise(above, (course + 3) & 3, 151) < 0.3) return "8";
		return noise(x, y, 152) > 0.86 ? "5" : "6";
	}
	if (row === 3) return noise(sx, course, 151) < 0.3 ? "7" : "8";
	if (phase === 3) return row === 1 ? "7" : "8";
	const n = noise(x, y, 150);
	if (phase === 0) return row === 1 || n > 0.5 ? "6" : "7";
	if (row === 1) return n > 0.6 ? "6" : "7";
	return n > 0.9 ? "6" : "7";
}
const thatchL = make((x, y) => {
	const d = slopeL(x, y);
	if (d < 0) return ".";
	if (d === 0) return "A";
	if (d === 1) return "5";
	if (d === 2) return checker(x, y) ? "6" : "5";
	if (d === 3) return "8";
	return straw(x, y);
});
const thatchR = make((x, y) => {
	const d = slopeR(x, y);
	if (d < 0) return ".";
	if (d === 0) return "A";
	if (d === 1) return "7";
	if (d === 2) return "8";
	if (d === 3) return "A";
	return straw(x, y);
});
// The ridge: the two verges meeting under a rolled cap, its end bound with rope and the straw tips showing above.
const TUFT = [
	"................",
	"................",
	"................",
	"................",
	"................",
	"................",
	"......5667......",
	"......?@@A......",
];
const thatchPeak = make((x, y) => {
	if (y < 8) return TUFT[y][x];
	const dl = slopeL(x, y);
	const dr = slopeR(x, y);
	if (dl < 0 || dr < 0) return ".";
	if (dl === 0 || dr === 0) return "A";
	if (y <= 10) return dl <= 1 ? "5" : dr <= 1 ? "7" : checker(x, y) ? "6" : "5";
	if (dl === 1) return "5";
	if (dl === 2) return checker(x, y) ? "6" : "5";
	if (dl === 3) return "8";
	if (dr === 1) return "7";
	if (dr === 2) return "8";
	if (dr === 3) return "A";
	return straw(x, y);
});

// --- A hand rope near the top of its cell (a bridge's handrail, at his waist over the board under it): three rows thick,
// its strands twisted in a slant every 4 px, lit on top, shaded under, sagging a
// pixel between x 4 and 11; level at both ends, so ropes join. ---
const SAG = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
function twisted(x: number, i: number): string {
	const seam = (x + i) % 4 === 0;
	if (i === 0) return seam ? "@" : "?";
	if (i === 1) return seam ? "8" : "@";
	return seam ? "A" : "8";
}
const rope = make((x, y) => {
	const i = y - 1 - SAG[x];
	return i < 0 || i > 2 ? "." : twisted(x, i);
});

// --- A rope bridge's deck from the side: the ends of two cross boards, lit along the top he walks on, with the end
// grain's rings, the sky in the gaps between them, and the rope that ties them running under. ---
const BOARD_END = ["`____mj", "_lllllj", "mlkkllj", "mkllklj", "klllkkj", "jjjjjjj"];
const bridgeBoard = make((x, y) => {
	const i = x % 8;
	if (y <= 5) return i === 7 ? "." : BOARD_END[y][i];
	if (y <= 8) return twisted(x, y - 6);
	return ".";
});

// --- Leaves: round clumps (they wrap), each lit on its upper left with a dithered fall-off and a deep rim on its lower
// right, the later clumps in front; the deep green between them. ---
const CLUMPS: readonly (readonly [number, number, number])[] = [
	[13, 15, 4.5], [3, 2, 4.2], [11, 3, 4.6], [6, 8, 4.4], [14, 9, 4.2], [1, 12, 4.4], [9, 13, 4.6],
];
function leaf(x: number, y: number): string {
	let hit: { dx: number; dy: number; r: number } | null = null;
	for (const [cx, cy, r] of CLUMPS) {
		for (const ox of [-N, 0, N]) {
			for (const oy of [-N, 0, N]) {
				const dx = x + 0.5 - cx - ox;
				const dy = y + 0.5 - cy - oy;
				if (dx * dx + dy * dy <= r * r) hit = { dx, dy, r };
			}
		}
	}
	if (!hit) return "%";
	const { dx, dy, r } = hit;
	if (Math.hypot(dx, dy) > r - 1 && dx + dy > 0) return "%";
	const v = 0.6 - ((dx + dy) / (2 * r)) * 0.6 + (noise(x, y, 160) - 0.5) * 0.3;
	if (v > 0.9 && dx < -1 && dy < -1) return "(";
	return ramp("%&'", v, x, y);
}
const leaves = make(leaf);
// Five apples among them: red, lit on the upper left, shaded on the lower right.
const fruitLeaves = over(leaves, [
	"                ",
	"          +)    ",
	"   +)    )));   ",
	"  ));     ;;    ",
	"   ;            ",
	"                ",
	"                ",
	"       +)       ",
	"      ));       ",
	"       ;;  +)   ",
	"          ));   ",
	"           ;    ",
	"  +)            ",
	" ));            ",
	"  ;;            ",
	"                ",
]);

// --- A clipped hedge: fine leaves, flatter and darker than the tree's, a speckle of lit leaf tips and dark gaps, more
// of the light near its squared, clipped top. ---
const hedge = make((x, y) => {
	if (y === 0) return noise(x, 0, 170) > 0.8 ? "&" : "'";
	if (y === 1) return noise(x, 1, 171) > 0.6 ? "'" : "&";
	if (y === 15) return noise(x, 15, 172) > 0.75 ? "%" : "C";
	const n = noise(x, y, 173);
	if (n > 0.86 - (15 - y) * 0.012 && (x + y) % 3 !== 2) return "&";
	if (n < 0.12 + y * 0.012) return "C";
	return "%";
});

// --- Water: water-top is the surface, a bright line and ripples over the deep; water is the deep below it. One
// pattern runs through both (wy 0 to 31), so a pond two deep has no seam: under the surface the base blue, then the
// deep coming in as short dashes, then the deep with the last dashes of the base; ripples lit at their left end. ---
const RIPPLES: readonly (readonly [number, number, number])[] = [
	[2, 6, 3], [10, 14, 5], [6, 9, 8], [12, 15, 11], [1, 4, 14], [8, 12, 19], [3, 6, 24], [11, 13, 28],
];
function water(x: number, wy: number): string {
	if (wy === 0) return noise(x, 0, 180) > 0.7 ? "$" : "#";
	if (wy === 1) return noise(x, 1, 181) > 0.6 ? "#" : "!";
	const r = RIPPLES.find(([a, b, ry]) => ry === wy && x >= a && x <= b);
	if (r) return wy < 16 ? (x === r[0] ? "$" : "#") : x === r[0] ? "#" : "!";
	const phase = (x + wy * 3) & 7;
	if (wy <= 5) return "!";
	if (wy <= 12) return phase < wy - 5 ? "9" : "!";
	if (wy <= 20) return phase < (21 - wy) >> 1 ? "!" : "9";
	return "9";
}
const waterTop = make((x, y) => water(x, y));
const waterDeep = make((x, y) => water(x, y + N));

// --- Flowers: red, yellow and pink heads on short stems over a bed of leaves, the sky between the stems. ---
const FLOWERS = [
	"................",
	"................",
	"................",
	"................",
	"..)..........+..",
	".)*)........+*+.",
	"..)....*.....+..",
	"..&...*>*....&..",
	"..&....*..)..'..",
	"..&'...&.)*).&..",
	"..&....&..).'&..",
	".'&..'.&'.&..&..",
	".'&'&&'&&.&''&'.",
	"'&&&%&&%&&&&%&&'",
	"&%&%%&%%&%&%%&%&",
	"%%%%%%%%%%%%%%%%",
];

// --- Soil: dark tilled earth, its crumbling top lit, clods lit on their upper left and shadowed below, a pebble. ---
const CLODS: readonly (readonly [number, number])[] = [[2, 4], [9, 3], [5, 8], [13, 7], [0, 12], [10, 11], [6, 14]];
const soil = make((x, y) => {
	if (y === 0) return noise(x, 0, 190) > 0.35 ? "B" : "k";
	if (y === 1) return noise(x, 1, 191) > 0.6 ? "B" : "A";
	if (y === 15) return noise(x, 15, 193) > 0.6 ? "A" : "z";
	for (const [cx, cy] of CLODS) {
		const dx = x - cx;
		const dy = y - cy;
		if (dx >= 0 && dx <= 2 && dy >= 0 && dy <= 1) return dy === 0 && dx < 2 ? (dx === 0 ? "B" : "k") : dx === 2 ? "z" : "k";
		if (dy === 2 && dx >= 1 && dx <= 2) return "z";
	}
	if (x === 12 && y === 13) return "R";
	if (x === 13 && y === 13) return "a";
	const n = noise(x, y, 192);
	return n < 0.08 + x * 0.012 ? "z" : n > 0.92 - (15 - x) * 0.004 ? "k" : "A";
});

// --- Greenhouse glass: four panes in a thin pale frame, the glass a cool green, the sky's reflection across each pane's
// upper left and the dark of the house behind it lower down; one glint. shade darkens it, for a roof's shadow side. ---
function glass(x: number, y: number, shade = 0): string {
	const px = x & 7;
	const py = y & 7;
	if (py === 0) return "e";
	if (px === 0) return "d";
	if (px === 7 || py === 7) return "^"; // the frame's shadow on the glass
	const s = px + py;
	if (s <= 4 - shade * 2 && !(px === 1 && py === 1)) return "[";
	if (s >= 11 - shade * 2) return "^";
	return "]";
}
const glassWall = over(
	make((x, y) => glass(x, y)),
	[
		"                ",
		"                ",
		"   $            ",
		"  $             ",
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
	],
);
const glassRoofL = make((x, y) => {
	const d = slopeL(x, y);
	if (d < 0) return ".";
	return d < 3 ? "aed"[d] : glass(x, y);
});
const glassRoofR = make((x, y) => {
	const d = slopeR(x, y);
	if (d < 0) return ".";
	return d < 3 ? "acb"[d] : glass(x, y, 1);
});

// --- The balloon: an envelope 32 by 32 over four tiles, a round crown narrowing to its throat, six gores in cream and
// red that curve with its surface, lit from the top left, outlined on its lower right, a bronze ring at the throat. ---
const ENV_R = 15.5;
function envelopeHalf(gy: number): number {
	const t = gy + 0.5 - 15;
	if (t <= 0) return Math.sqrt(Math.max(0, ENV_R * ENV_R - t * t));
	const k = Math.min(1, t / 14);
	return 3.5 + (ENV_R - 3.5) * Math.cos((k * Math.PI) / 2) ** 0.9;
}
const insideEnvelope = (gx: number, gy: number) => gy >= 0 && gy < 29 && Math.abs(gx + 0.5 - 16) <= envelopeHalf(gy);
function envelope(gx: number, gy: number): string {
	if (gy >= 29) {
		// The throat's ring, and nothing else.
		if (gx < 12 || gx > 19 || gy > 30) return ".";
		if (gy === 30) return gx === 12 ? ">" : "j";
		return gx === 12 ? "=" : gx === 19 ? "j" : gx >= 17 ? ">" : "<";
	}
	if (!insideEnvelope(gx, gy)) return ".";
	const w = envelopeHalf(gy);
	const u = Math.max(-1, Math.min(1, (gx + 0.5 - 16) / w));
	const t = gy + 0.5 - 15;
	const ny = t <= 0 ? t / ENV_R : (t / 14) * 0.7;
	const nx = u * Math.sqrt(Math.max(0, 1 - ny * ny));
	const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
	const b = -0.55 * nx - 0.55 * ny + 0.63 * nz;
	// The outline, where the envelope meets the sky on its lower right.
	const edge = !insideEnvelope(gx + 1, gy) || !insideEnvelope(gx, gy + 1);
	if (edge && (nx > -0.2 || ny > 0.3)) return "f";
	// Which of the six gores across it (by the longitude under the pixel), and whether it lies on a seam between two.
	const g = (Math.asin(u) / Math.PI + 0.5) * 6;
	const seam = Math.abs(g - Math.round(g)) < 0.06;
	if (Math.floor(g) % 2 === 0) {
		if (seam && b < 0.6) return "/";
		return b > 0.5 ? "-" : b > -0.2 ? "/" : "W";
	}
	return b > 0.97 ? "i" : b > 0.1 ? ":" : ";";
}
const balloonQuarter = (qx: number, qy: number) => make((x, y) => envelope(x + qx * N, y + qy * N));

// --- The basket: wicker in the bottom half, a lit rolled rim, the weave in two-by-two blocks, outlined. ---
const basket = make((x, y) => {
	if (y < 8 || x < 2 || x > 13) return ".";
	if (y === 15) return x === 2 || x === 13 ? "." : "j";
	if (x === 13) return "j";
	if (y === 8) return x <= 3 ? "`" : x === 12 ? "m" : "_";
	if (y === 9) return x === 12 ? "k" : x === 2 ? "m" : "j";
	if (x === 2) return "m";
	if (x === 12) return "k";
	const block = ((x >> 1) + ((y - 10) >> 1)) & 1;
	const first = (x & 1) === 0;
	return block ? (first ? "_" : "l") : first ? "l" : "k";
});

// --- A bronze bell on a short beam: an iron hanger, the crown, the waist flaring to the lip, a glint on its upper left,
// the clapper under it. ---
const BELL = [
	"................",
	"...`_____mmmj...",
	"...mllllllllkj..",
	"...jjjjjjjjjjj..",
	".......bj.......",
	"......=<<>j.....",
	".....=5<<<>j....",
	".....=5<<<>j....",
	".....=<<<<>j....",
	"....=<<<<<<>j...",
	"....=<<<<<>>j...",
	"...=<<<<<<<>>j..",
	"..==<<<<<<<<>>j.",
	"..j>>>>>>>>>>>j.",
	"......j>>j......",
	".......jj.......",
];

// --- An awning: stripes 4 wide in cream and red under a timber rod, lit on their left, a fold of shadow on their right,
// each ending in a rounded tongue; the sky under the tongues. ---
const awning = make((x, y) => {
	const red = (x & 7) >= 4;
	const i = x & 3;
	if (y === 0) return x % 8 === 0 ? "`" : "m";
	if (y === 1) return "j";
	const lit = red ? ":" : "-";
	const dark = red ? ";" : "/";
	if (y === 2) return dark;
	if (y <= 11) return i === 3 || (y === 9 && i !== 0) ? dark : lit;
	if (y === 12) return i === 0 || i === 3 ? "f" : dark;
	if (y === 13) return i === 1 || i === 2 ? "f" : ".";
	return ".";
});

// --- A windmill's sail: the whip down its middle, laths across it every four rows, the cloth spread over the outer
// half out to the hemlath (the laths behind it show as seams), the inner half an open lattice with the sky between. ---
const SAIL = [
	"......mkj.......",
	"..m_`_mkj_____lj",
	"..lk..mkj----/lj",
	"..lk..mkj----/lj",
	"..lk..mkj----/lj",
	"..m_`_mkj/////lj",
	"..lk..mkj----/lj",
	"..lk..mkj----/lj",
	"..lk..mkj----/lj",
	"..m_`_mkj/////lj",
	"..lk..mkj----/lj",
	"..lk..mkj----/lj",
	"..lk..mkj----/lj",
	"..m_`_mkj_____lj",
	"..jj..mkjjjjjjjj",
	"......mkj.......",
];

// --- A small robed figure in dressed stone on a plinth, facing left: a hooded head, hands folded, the robe falling in
// folds, lit on the left, outlined on the right and bottom. ---
const STATUE = [
	"................",
	".......{|~......",
	"......{||}~.....",
	".......{|}~.....",
	"........|~......",
	"......{||}}~....",
	".....{|{{}}~....",
	".....{||{}}~....",
	".....{|||}}~....",
	".....{||}|}~....",
	"....{|||}|}}~...",
	"....{||}||}}~...",
	"...{|||}||}}}~..",
	"..{{{{{{{{{{{}~.",
	"..{||||||||||}~.",
	"..~~~~~~~~~~~~~.",
];

// --- An arch course: the voussoirs of a small round arch radiating from its opening, a pale keystone at the crown, the
// stones above as the dressed stone wall's; the sky in the opening. Arches side by side share their piers. ---
const ARCH_R = 6;
const ARCH_RING = 3.2;
const arch = make((x, y) => {
	const dx = x + 0.5 - 8;
	const dy = y + 0.5 - 16;
	const d = Math.hypot(dx, dy);
	if (d <= ARCH_R) return ".";
	if (d > ARCH_R + ARCH_RING) return stoneWall[y][x];
	if (d > ARCH_R + ARCH_RING - 0.9) return "~";
	const a = Math.atan2(-dy, dx) / Math.PI; // 0 right, 0.5 up, 1 left
	const k = Math.round(a * 6);
	if (Math.abs(a * 6 - k) > 0.42 && k !== 3) return "~"; // the joint between two wedges
	if (k === 3) return d < ARCH_R + 1 ? "|" : "{";
	const lit = k > 3;
	if (d < ARCH_R + 1) return lit ? "}" : "~"; // the underside, facing down, in shadow
	return lit ? (d < ARCH_R + 2 ? "{" : "|") : d < ARCH_R + 2 ? "|" : "}";
});

// --- A balcony rail: a top rail lit along its top, turned balusters four apart, a bottom rail; sky between them. ---
const rail = make((x, y) => {
	if (y < 2) return ".";
	if (y === 2) return x % 8 === 0 ? "`" : "_";
	if (y === 3) return "l";
	if (y === 4) return "j";
	if (y >= 13) return y === 13 ? "m" : y === 14 ? "l" : "j";
	const i = x & 3;
	if (i === 0) return ".";
	if (y === 8 && i !== 3) return i === 1 ? "`" : "m"; // the turned bulge, catching the light
	return i === 1 ? "_" : i === 2 ? "k" : "j";
});

// --- A timber deck, full depth (a floor or a balcony, so nothing under it shows sky): the ends of the cross boards along
// the top, lit where he walks, their joints every 8 px; under them a fascia beam lit along its top with grain along it,
// outlined below. ---
const deck = make((x, y) => {
	const i = x & 7;
	if (y === 0) return i === 7 ? "j" : i === 0 ? "`" : "_";
	if (y <= 4) return i === 7 ? "j" : i === 0 ? "m" : BOARD_END[y][i];
	if (y === 5) return "j";
	if (y === 6) return "k";
	if (y === 7) return x % 8 === 3 ? "`" : "m";
	if (y >= 14) return "j";
	if (y === 13) return "k";
	if ((x === 4 || x === 12) && y === 10) return "a"; // the bolts through the beam
	if ((x === 4 || x === 12) && y === 9) return "j";
	const grain = noise((x + y * 3) >> 2, y, 200) < 0.18;
	return grain ? "k" : "l";
});

// --- A spire's slopes, 2:1 (two rows up for one across), each over a pair of cells: the lower and the upper half of the
// left and the right slope, with the shingle roof's verges (lit on the left, shaded on the right) and its shingles
// (tiles.ts shingle, the Tiny Town rows recoloured, copied here since tiles.ts imports this file); and the tip, the two
// slopes meeting under a ridge cap with an iron finial, ball and pennant over it. ---
const KENNEY_ROOF = ["5445354453434343", "4444344443434343"];
const ROOF_INK: Readonly<Record<string, string>> = { "3": "h", "4": "i", "5": "V" };
function shingle(x: number, y: number): string {
	const course = (y >> 2) & 3;
	const sx = wrap(x + (course % 2) * 4);
	const k = sx & 7;
	const row = y & 3;
	if (row === 3) return k === 0 || k === 6 ? "g" : "f";
	if (k === 7) return "f";
	if (row === 0) return k === 6 ? "f" : "g";
	if (k === 6) return row === 2 ? "g" : "h";
	if (k === 0 && row === 2) return "h";
	return ROOF_INK[KENNEY_ROOF[row - 1][wrap(x + course * 5)]];
}
// d: how far a pixel lies inside the slope, 2 a pixel across (below 0 is sky). up: the upper cell of the pair.
const steepL = (x: number, y: number, up: boolean) => 2 * x + y - (up ? 31 : 15);
const steepR = (x: number, y: number, up: boolean) => 2 * (15 - x) + y - (up ? 31 : 15);
const verge = (d: number, x: number, y: number, lit: boolean): string | null => {
	if (d < 0) return ".";
	if (d <= 1) return "f";
	if (lit) return d <= 3 ? "V" : d <= 5 ? (checker(x, y) ? "i" : "V") : d <= 7 ? "g" : null;
	return d <= 3 ? "h" : d <= 5 ? "g" : d <= 7 ? "f" : null;
};
const spireL = (up: boolean) => make((x, y) => verge(steepL(x, y, up), x, y, true) ?? shingle(x, y));
const spireR = (up: boolean) => make((x, y) => verge(steepR(x, y, up), x, y, false) ?? shingle(x, y));
const FINIAL = [
	".........yyyw...",
	".......cxxxw....",
	"......abca......",
	".....aeca.......",
	"......aa........",
	".......Ra.......",
];
const spirePeak = make((x, y) => {
	if (y < FINIAL.length) return FINIAL[y][x];
	const dl = steepL(x, y, false);
	const dr = steepR(x, y, false);
	if (dl < 0 || dr < 0) return x === 7 && y < 9 ? "R" : x === 8 && y < 9 ? "a" : ".";
	if (dl <= 1 || dr <= 1) return "f";
	if (y <= 8) return dl <= 3 ? "V" : "h"; // the ridge cap where the slopes meet
	return verge(dl, x, y, true) ?? verge(dr, x, y, false) ?? shingle(x, y);
});

// --- A low pond, one row deep: the water's surface half way down the cell behind a stone lip along its front (the
// dressed stone's colours, a block every 8 px, lit along its top); its end is a stone rim a little higher than the lip;
// the dock is the lip and the water with a jetty's boards over them at the rim's height, on a post into the water. ---
const LIP = 11;
const lip = (x: number, y: number): string => {
	if (y === LIP) return (x & 7) === 7 ? "|" : "{";
	if (y === 15 || (x & 7) === 7) return "~";
	if ((x & 7) === 0) return "|";
	return y === 14 ? "}" : "|";
};
const pondWater = make((x, y) => {
	if (y < 7) return ".";
	if (y >= LIP) return lip(x, y);
	if (y === 7) return noise(x, 7, 210) > 0.65 ? "$" : "#";
	if (y === 8) return noise(x, 8, 211) > 0.7 ? "#" : "!";
	return (x + y * 3) % 7 === 0 ? "#" : y === 10 && noise(x, 10, 212) < 0.4 ? "9" : "!";
});
const pondRim = make((x, y) => {
	if (y < 6 || x < 1 || x > 14) return ".";
	if (y === 6) return x === 14 ? "|" : "{";
	if (y === 15 || x === 14) return "~";
	if (x === 1) return "{";
	if (y === 10) return x === 8 ? "|" : "~"; // the joint between its two courses
	return x >= 12 ? "}" : "|";
});
const pondDock = make((x, y) => {
	if (y === 4) return (x & 7) === 7 ? "j" : x % 8 === 0 ? "`" : "_";
	if (y === 5 || y === 6) return (x & 7) === 7 ? "j" : y === 5 ? "l" : "k";
	if (y === 7) return "j";
	if ((x === 3 || x === 4) && y >= 8 && y < LIP) return x === 3 ? "l" : "j"; // the post into the water
	return pondWater[y][x];
});

// --- A canopy's four corners: the leaves with the corner rounded off (a leafy edge, its radius stirred a little by the
// hash), the edge in deep shadow where it faces down or right, so a tree reads as a round crown, not a box. ---
const canopyCorner = (right: boolean, bottom: boolean) =>
	make((x, y) => {
		const R = 9;
		const dx = right ? x + 0.5 - (N - R) : R - (x + 0.5);
		const dy = bottom ? y + 0.5 - (N - R) : R - (y + 0.5);
		if (dx > 0 && dy > 0) {
			const d = Math.hypot(dx, dy);
			const edge = R - 0.6 + noise(x, y, 220) * 1.4;
			if (d > edge) return ".";
			if (d > edge - 1.2 && (right || bottom)) return "%";
		}
		return leaves[y][x];
	});

// --- A wall's posts with the wall behind them, so no sky shows beside a post: the timber post (as "post") at the left
// edge, the right edge or the middle of a cell of plank wall, back wall or greenhouse glass. ---
const postOver = (bg: Grid, at: "l" | "r" | "c"): Grid => {
	const x0 = at === "l" ? 0 : at === "r" ? N - 6 : 5;
	return make((x, y) => (x >= x0 && x < x0 + 6 ? post[y][x - x0 + 5] : bg[y][x]));
};

// --- Inside an open storey: the back walls' top row in the beam's shadow (darkest under the beam, dithered off), an
// arch of the arcade with the shaded back wall through its opening, and the shrine's figure standing against it. ---
const shaded = (bg: Grid, deep: string) => make((x, y) => (y <= 1 ? deep : y <= 3 && checker(x, y) ? deep : bg[y][x]));
const backWoodTop = shaded(backWood, "z");
const backStoneTop = shaded(backStone, "a");
const archBack = make((x, y) => (arch[y][x] === "." ? backStoneTop[y][x] : arch[y][x]));
const statueBack = make((x, y) => (STATUE[y][x] === "." ? backStone[y][x] : STATUE[y][x]));

// --- The balloon at his scale (the look pass: the 32 px one was his height, a toy): an envelope 48 by 48 over nine
// cells, drawn as the small one is (a round crown narrowing to its throat, eight gores in cream and red that curve with
// its surface, lit from the top left, outlined on its lower right, a bronze ring at the throat), and a basket a full
// cell deep, its rolled rim on the cell's top row, at his waist when he stands in it. ---
const BIG = 48;
const BIG_R = 23.5;
const BIG_CY = 22.5; // the crown's centre row
const BIG_NECK = 19; // rows from the crown's centre down to the throat
const BIG_THROAT = 43; // the ring's first row
function bigHalf(gy: number): number {
	const t = gy + 0.5 - BIG_CY;
	if (t <= 0) return Math.sqrt(Math.max(0, BIG_R * BIG_R - t * t));
	const k = Math.min(1, t / BIG_NECK);
	return 5 + (BIG_R - 5) * Math.cos((k * Math.PI) / 2) ** 0.9;
}
const insideBig = (gx: number, gy: number) => gy >= 0 && gy < BIG_THROAT && Math.abs(gx + 0.5 - BIG / 2) <= bigHalf(gy);
function bigEnvelope(gx: number, gy: number): string {
	if (gy >= BIG_THROAT) {
		if (gx < 18 || gx > 29 || gy > BIG_THROAT + 2) return ".";
		if (gy === BIG_THROAT + 2) return gx === 18 ? ">" : "j";
		return gx === 18 ? "=" : gx === 29 ? "j" : gx >= 26 ? ">" : "<";
	}
	if (!insideBig(gx, gy)) return ".";
	const w = bigHalf(gy);
	const u = Math.max(-1, Math.min(1, (gx + 0.5 - BIG / 2) / w));
	const t = gy + 0.5 - BIG_CY;
	const ny = t <= 0 ? t / BIG_R : (t / BIG_NECK) * 0.7;
	const nx = u * Math.sqrt(Math.max(0, 1 - ny * ny));
	const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
	const b = -0.55 * nx - 0.55 * ny + 0.63 * nz;
	const edge = !insideBig(gx + 1, gy) || !insideBig(gx, gy + 1);
	if (edge && (nx > -0.2 || ny > 0.3)) return "f";
	const g = (Math.asin(u) / Math.PI + 0.5) * 8;
	const seam = Math.abs(g - Math.round(g)) < 0.05;
	if (Math.floor(g) % 2 === 0) {
		if (seam && b < 0.6) return "/";
		return b > 0.5 ? "-" : b > -0.2 ? "/" : "W";
	}
	return b > 0.97 ? "i" : b > 0.1 ? ":" : ";";
}
const bigBalloon = (n: number) => make((x, y) => bigEnvelope(x + (n % 3) * N, y + Math.floor(n / 3) * N));
// The basket: wicker the cell's full height, a lit rolled rim on top, the weave in two-by-two blocks, outlined.
const basketFull = make((x, y) => {
	if (x < 1 || x > 14) return ".";
	if (y === 15) return x === 1 || x === 14 ? "." : "j";
	if (x === 14) return "j";
	if (y === 0) return x <= 2 ? "`" : x === 13 ? "m" : "_";
	if (y === 1) return x === 13 ? "k" : x === 1 ? "m" : "j";
	if (x === 1) return "m";
	if (x === 13) return "k";
	const block = ((x >> 1) + ((y - 2) >> 1)) & 1;
	const first = (x & 1) === 0;
	return block ? (first ? "_" : "l") : first ? "l" : "k";
});

// A chimney's foot: the brick stack down to a right slope, the roof below the slope line; tiles.ts makes it from its
// own brick and the slope (chimneyFoot), since this file cannot import those.
export const chimneyFoot = (brick: Grid, slope: Grid): Grid => make((x, y) => (y < x ? brick[y][x] : slope[y][x]));
export type FootTileId = "chimney-base" | "chimney-base-thatch";

export const MORE_TILES: Readonly<Record<Exclude<MoreTileId, FootTileId>, Grid>> = {
	"plank-wall": plankWall,
	"stone-wall": stoneWall,
	"back-wood": backWood,
	"back-stone": backStone,
	post,
	shutter: SHUTTER,
	"thatch-l": thatchL,
	"thatch-r": thatchR,
	"thatch-flat": make(straw),
	"thatch-peak": thatchPeak,
	rope,
	"bridge-board": bridgeBoard,
	leaves,
	"fruit-leaves": fruitLeaves,
	hedge,
	water: waterDeep,
	"water-top": waterTop,
	flowers: FLOWERS,
	soil,
	"glass-wall": glassWall,
	"glass-roof-l": glassRoofL,
	"glass-roof-r": glassRoofR,
	"balloon-tl": balloonQuarter(0, 0),
	"balloon-tr": balloonQuarter(1, 0),
	"balloon-bl": balloonQuarter(0, 1),
	"balloon-br": balloonQuarter(1, 1),
	basket,
	bell: BELL,
	awning,
	sail: SAIL,
	statue: STATUE,
	arch,
	rail,
	"plank-wall-2": plankWall2,
	"stone-wall-2": stoneWall2,
	deck,
	"spire-l": spireL(false),
	"spire-r": spireR(false),
	"spire-l-hi": spireL(true),
	"spire-r-hi": spireR(true),
	"spire-peak": spirePeak,
	"pond-water": pondWater,
	"pond-rim": pondRim,
	"pond-dock": pondDock,
	"leaves-tl": canopyCorner(false, false),
	"leaves-tr": canopyCorner(true, false),
	"leaves-bl": canopyCorner(false, true),
	"leaves-br": canopyCorner(true, true),
	"post-plank-l": postOver(plankWall, "l"),
	"post-plank-r": postOver(plankWall, "r"),
	"post-back-l": postOver(backWood, "l"),
	"post-back-r": postOver(backWood, "r"),
	"post-back": postOver(backWood, "c"),
	"post-glass-l": postOver(glassWall, "l"),
	"post-glass-r": postOver(glassWall, "r"),
	"post-glass": postOver(glassWall, "c"),
	"back-wood-top": backWoodTop,
	"back-stone-top": backStoneTop,
	"arch-back": archBack,
	"statue-back": statueBack,
	"balloon-1": bigBalloon(0),
	"balloon-2": bigBalloon(1),
	"balloon-3": bigBalloon(2),
	"balloon-4": bigBalloon(3),
	"balloon-5": bigBalloon(4),
	"balloon-6": bigBalloon(5),
	"balloon-7": bigBalloon(6),
	"balloon-8": bigBalloon(7),
	"balloon-9": bigBalloon(8),
	"basket-full": basketFull,
};

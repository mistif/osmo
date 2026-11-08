// What lies behind the island (the look pass, redrawn in the polish pass): the cloud sheet, big soft clouds drawn as
// palette grids so they stamp like tiles; the far islands, hand-drawn silhouettes in haze that the renderer tints from
// the sky; a nearer ridge of hills; and the birds that cross the sky by day. Pure.
import type { Grid } from "./raster";

// --- Clouds: each is one soft mass, a wide flat-bottomed body (half an ellipse) with round puffs heaped on it. The
// light is from the top left: a bright rim along the top and left of the mass and a lit cap on each puff's upper left,
// the body, a shade that rises and falls under the puffs (dithered into the body), and a darker underside. No outline,
// so they read soft. ---
export const CLOUD_CELL = { w: 320, h: 100 };
const GROW = 1.25; // the plans below are drawn this much larger, so the rim stays a pixel or two wide
type Puff = readonly [cx: number, cy: number, r: number];
type CloudPlan = { body: readonly [cx: number, rx: number, ry: number]; puffs: readonly Puff[]; base: number };
const PLANS: readonly CloudPlan[] = [
	// a big heaped one
	{ body: [118, 100, 30], puffs: [[56, 54, 16], [88, 42, 24], [124, 34, 26], [160, 46, 20], [190, 58, 13]], base: 76 },
	// a medium one
	{ body: [86, 64, 22], puffs: [[46, 58, 13], [74, 48, 18], [104, 52, 15], [128, 62, 9]], base: 76 },
	// a long low bank
	{ body: [118, 100, 15], puffs: [[40, 66, 8], [70, 60, 12], [104, 58, 13], [140, 61, 11], [172, 66, 8], [198, 69, 5]], base: 76 },
	// a small one
	{ body: [51, 36, 13], puffs: [[32, 66, 8], [52, 60, 12], [70, 67, 7]], base: 76 },
	// a tall one
	{ body: [96, 72, 26], puffs: [[50, 56, 15], [82, 38, 26], [114, 44, 21], [142, 58, 13]], base: 76 },
	// a medium bank, wider than tall
	{ body: [102, 80, 18], puffs: [[44, 63, 10], [72, 55, 15], [104, 52, 16], [134, 58, 12], [160, 65, 8]], base: 76 },
];
const WAVE = [0, 1, 2, 2, 1, 0, 0, 1, 2, 3, 2, 1, 0, 1];

function cloudGrid(plan: CloudPlan): Grid {
	const { body, puffs, base } = plan;
	// Pixel (x, y) of the cell, in the plan's units.
	const u = (v: number) => (v + 0.5) / GROW;
	const inPuff = (p: Puff, x: number, y: number) => (u(x) - p[0]) ** 2 + (u(y) - p[1]) ** 2 <= p[2] * p[2];
	const inBody = (x: number, y: number) => ((u(x) - body[0]) / body[1]) ** 2 + ((u(y) - (base - body[2] * 0.45)) / body[2]) ** 2 <= 1;
	const inside = (x: number, y: number) => u(y) <= base && (inBody(x, y) || puffs.some((p) => inPuff(p, x, y)));
	return Array.from({ length: CLOUD_CELL.h }, (_, y) =>
		Array.from({ length: CLOUD_CELL.w }, (_, x) => {
			if (!inside(x, y)) return ".";
			const fromBase = Math.floor(base * GROW) - y;
			const wave = WAVE[Math.floor(x / 9) % WAVE.length];
			if (fromBase < 2) return "F";
			if (fromBase < 4 + wave) return fromBase === 3 + wave && (x + y) % 2 === 0 ? "X" : fromBase < 3 ? "F" : "X";
			// The lit top: how far the sky is above (or, less, to the left): bright at the rim, dithered into the body.
			let lit = 0;
			while (lit < 5 && inside(x, y - lit - 1) && inside(x - Math.floor(lit / 2) - 1, y - lit)) lit++;
			if (lit <= 1) return "p";
			if (lit <= 3) return (x + y) % 2 === 0 || lit === 2 ? "p" : "G";
			if (!inside(x + 1, y) || !inside(x + 2, y) || (!inside(x + 4, y) && (x + y) % 2 === 0)) return "X";
			if (fromBase < 8 + wave) return (x + y) % 2 === 0 ? "X" : "G";
			if (fromBase < 12 + wave) return x % 2 === 0 && y % 2 === 0 ? "X" : "G";
			return "G";
		}).join(""),
	);
}
export const CLOUD_GRIDS: readonly Grid[] = PLANS.map(cloudGrid);
// The drawn extent of each cloud inside its cell, for culling: x0..x1 and y0..y1, in px.
export const CLOUD_SHAPES = CLOUD_GRIDS.map((g) => {
	let x0 = CLOUD_CELL.w;
	let x1 = 0;
	let y0 = CLOUD_CELL.h;
	g.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) {
			if (row[x] === ".") continue;
			x0 = Math.min(x0, x);
			x1 = Math.max(x1, x + 1);
			y0 = Math.min(y0, y);
		}
	});
	return { x0, x1, y0, y1: CLOUD_CELL.h };
});

// --- The far islands and the hills: silhouettes as runs of pixels, one tone each (0 the body, 1 the lit rim along
// the top, 2 the hazier underside, 3 the body dithered into that haze: tone 2 on every pixel whose x + y is even, tone
// 0 on the rest). y is down from the silhouette's top line (negative above it: its trees, towers and hills); x is
// across from its left end. A Shape also knows its rows: from top to bottom (exclusive). The renderer draws each shape
// as one bitmap (render.ts shapeBitmap, kept by the painter), not run by run. ---
export type Tone = 0 | 1 | 2 | 3;
export type Run = readonly [y: number, x0: number, x1: number, tone: Tone];
export type Shape = { runs: readonly Run[]; w: number; top: number; bottom: number };
export type FarIsland = Shape & { fx: number; lift: number };
export type Pt = readonly [x: number, y: number];

// A hand-drawn outline (a closed polygon of points, clockwise or not) filled by scanlines into runs. A filled pixel
// with sky one or two pixels above it is the lit rim; from hazeFrom of the way down to the outline's lowest point the
// body dithers into the haze (one run of tone 3, so the dither does not split a row into one-pixel runs: review B1),
// and from hazeAll on it is all haze.
export function silhouette(outline: readonly Pt[], hazeFrom = 0.5, hazeAll = 0.72): Shape {
	const ys = outline.map((p) => p[1]);
	const top = Math.floor(Math.min(...ys));
	const bottom = Math.ceil(Math.max(...ys));
	const w = Math.ceil(Math.max(...outline.map((p) => p[0])));
	const filled = new Map<number, Set<number>>();
	for (let y = top; y < bottom; y++) {
		const sy = y + 0.5;
		const xs: number[] = [];
		for (let i = 0; i < outline.length; i++) {
			const [ax, ay] = outline[i];
			const [bx, by] = outline[(i + 1) % outline.length];
			if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
		}
		xs.sort((a, b) => a - b);
		const row = new Set<number>();
		for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(w, Math.round(xs[k + 1])); x++) row.add(x);
		if (row.size > 0) filled.set(y, row);
	}
	const has = (x: number, y: number) => filled.get(y)?.has(x) ?? false;
	const runs: Run[] = [];
	for (const [y, row] of [...filled.entries()].sort((a, b) => a[0] - b[0])) {
		const t = bottom > 0 ? y / bottom : 0;
		const tone = (x: number): Tone => {
			if (!has(x, y - 1) || !has(x, y - 2)) return 1;
			return t > hazeAll ? 2 : t > hazeFrom ? 3 : 0;
		};
		const xs = [...row].sort((a, b) => a - b);
		let start = xs[0];
		for (let i = 1; i <= xs.length; i++) {
			const x = xs[i];
			const prev = xs[i - 1];
			if (x === prev + 1 && tone(x) === tone(prev)) continue;
			runs.push([y, start, prev + 1, tone(prev)]);
			start = x;
		}
	}
	const rows = runs.map((r) => r[0]);
	return { runs, w, top: Math.min(...rows), bottom: Math.max(...rows) + 1 };
}

// fx: where its centre sits across the view (a share of the width); lift: how far its top line stands above the
// island's snow, in world px. Three places of their own, the middle one far behind the hall and mostly hidden by it.
// The watchtower isle: a long tilted top, a broken tower left of centre, two pines to the right, a keel with three
// hanging rocks and roots between them.
const WATCHTOWER: readonly Pt[] = [
	[0, 5], [3, 2], [8, 0], [20, 0], [34, -1], [38, -3], [41, -3], [43, -1], [56, -1], [60, -2], [62, -1],
	[66, -1], [67, -3], [68, -3], [68, -20], [71, -20], [71, -17], [73, -17], [73, -20], [68, -20], [68, -34], [67, -34],
	[67, -37], [69, -37], [69, -35], [71, -35], [71, -37], [73, -37], [73, -33], [74, -32], [74, -29], [76, -28], [76, -24],
	[78, -23], [79, -23], [79, -3], [80, -3], [81, -1], [83, -1], [84, -3], [86, -4], [88, -3], [89, -1],
	[110, -2], [124, -2], [128, -4], [131, -5], [134, -4], [136, -2], [160, -3], [196, -3],
	[200, -3], [202, -8], [201.2, -8], [203, -14], [202.4, -14], [204.5, -23], [206.6, -14], [206, -14], [207.8, -8], [207, -8], [209, -3],
	[212, -3.5], [214, -8], [213.4, -8], [215.5, -18], [217.6, -8], [217, -8], [219, -3.5],
	[232, -4], [244, -4], [252, -5], [258, -4], [262, -2],
	[260, 1], [255, 3], [252, 7], [247, 8], [244, 12], [238, 12], [235, 15], [228, 16], [224, 20], [216, 20], [212, 23],
	[204, 24], [200, 27], [193, 28], [190, 31], [186, 31], [185, 31], [184.6, 38], [184, 31], [182, 32],
	[181, 38], [180, 46], [178.5, 54], [177, 47], [175, 40], [174, 35], [170, 36], [167, 40],
	[165, 40], [164.4, 49], [163.5, 41], [162, 42], [161.5, 46], [160.8, 42], [158, 43], [155, 47],
	[152, 48], [151, 56], [149.5, 62], [149, 70], [147.5, 74], [147, 82], [145.5, 92], [144, 84], [143, 76], [141.5, 70],
	[141, 62], [139, 56], [137, 52], [134, 54], [132, 52],
	[130, 53], [129.4, 63], [128.6, 53], [126, 52], [125.4, 58], [124.8, 52], [122, 51],
	[120, 50], [119, 58], [117.5, 64], [117, 72], [115.5, 79], [114, 72], [113, 64], [111, 56], [109, 53], [106, 52], [104, 49],
	[102, 48], [101.4, 57], [100.6, 47], [98, 46], [97.5, 51], [97, 45], [94, 44], [90, 41], [88, 41], [86, 38],
	[84, 37], [83.4, 44], [82.6, 37], [79, 35], [74, 33], [70, 30], [66, 30], [62, 27], [56, 25], [52, 22], [47, 21],
	[45, 20], [44.4, 26], [43.6, 20], [40, 18], [36, 16], [30, 15], [26, 13], [20, 12], [14, 10], [8, 8], [3, 6],
];
// The lone tree: a small high islet, one round-crowned tree off centre, a shallow body with one long drip-stone and a
// smaller one beside it.
const LONE_TREE: readonly Pt[] = [
	[0, 3], [4, 0], [20, 0], [30, -1], [34, -1], [60, 0], [98, 0], [100, -2], [100, -7],
	[97, -8], [94, -8], [91, -10], [87, -10], [84, -12], [82, -14], [80, -16], [81, -19], [80, -21], [82, -24], [85, -26],
	[87, -29], [90, -30], [92, -32], [96, -33], [99, -32], [102, -34], [106, -33], [109, -31], [113, -31], [116, -29], [118, -26],
	[120, -24], [121, -21], [122, -18], [121, -15], [119, -12], [116, -11], [113, -9], [109, -9], [106, -8], [103, -7], [103, -2], [105, 0],
	[118, 0], [130, 0], [140, 1], [146, 1], [150, 3],
	[148, 6], [142, 8], [136, 12], [128, 14], [120, 18], [110, 20], [100, 22],
	[93, 24], [91, 34], [89, 48], [88, 64], [87, 84], [86, 68], [85, 50], [84, 36], [83, 27],
	[80, 28], [75, 30], [72, 32], [70, 44], [68, 56], [67, 66], [66, 76], [65, 88], [64, 96], [63, 88], [62, 76], [61, 62],
	[60, 50], [58, 40], [56, 32], [50, 30], [44, 28], [36, 24], [28, 18], [20, 14], [12, 10], [6, 7], [2, 5],
];
// The cottage isle: two humps and a saddle, a cottage with a chimney and two windows on the larger hump, a fence of
// posts, and two lobes underneath with a gap between them, each with a hanging stone.
const COTTAGE: readonly Pt[] = [
	[0, 3], [4, 0], [12, -1], [22, -3], [32, -6], [42, -8], [52, -10], [58, -11],
	[58, -14], [61, -14], [61, -16], [63, -16], [63, -14], [58, -14],
	[58, -18], [55, -18], [69, -31], [74, -27], [74, -33], [77, -33], [77, -24.5], [83, -18], [80, -18],
	[80, -14], [77, -14], [77, -16], [75, -16], [75, -14], [80, -14], [80, -11],
	[86, -10], [92, -9], [94, -8.5], [94, -12.5], [95.2, -12.5], [95.2, -8.2], [99, -7.2], [99, -11.2], [100.2, -11.2],
	[100.2, -7], [104, -6], [104, -10], [105.2, -10], [105.2, -5.8], [109, -4.7], [109, -8.7], [110.2, -8.7], [110.2, -4.4],
	[118, -2], [132, -2], [140, -4], [148, -6], [156, -7], [160, -7], [162, -9], [165, -9], [167, -7], [174, -6],
	[182, -4], [190, -2], [198, 0], [206, 1], [210, 3],
	[208, 6], [205, 7], [203, 10], [198, 12], [195, 16], [191, 18], [188, 22], [184, 23], [180, 28], [176, 29], [172, 32],
	[168, 34], [166, 37], [163, 38], [162, 44], [161, 50], [160, 58], [159, 64], [158, 56], [157, 50], [155, 44], [153, 41],
	[148, 40], [144, 37], [140, 36], [136, 32], [132, 30], [129, 26], [126, 24], [122, 19], [118, 17], [115, 14], [112, 13],
	[108, 14], [105, 16], [102, 19], [99, 21], [96, 25], [92, 28], [89, 32], [85, 34], [82, 38], [77, 41], [73, 45], [69, 46],
	[66, 48], [65, 56], [64, 62], [63, 68], [62, 73], [60.5, 66], [59.5, 58], [58, 51], [56, 48],
	[52, 46], [48, 45], [44, 42], [39, 40], [36, 37], [31, 35], [28, 31], [23, 28], [20, 25], [16, 22], [13, 18], [9, 13],
	[6, 10], [4, 7], [1, 5],
];
export const FAR_ISLANDS: readonly FarIsland[] = [
	{ ...silhouette(WATCHTOWER), fx: 0.12, lift: 170 },
	{ ...silhouette(LONE_TREE), fx: 0.62, lift: 300 },
	{ ...silhouette(COTTAGE), fx: 0.89, lift: 120 },
];
export const FAR_PARALLAX = 0.12;

// The hills (polish pass): a long ridge nearer than the far islands, its top line HILLS.drop world px below the
// island's snow (they lie lower, the island floats above them), repeating every HILLS.w px across the view, moving at
// HILLS.parallax. Its foot sinks into the haze band the renderer lays at the horizon (render.ts HAZE).
export type Hills = Shape & { drop: number; parallax: number };
// The ridge: four rounded summits (the highest at y 0, the last a double crown), a long gentle shoulder lined with
// trees falling east of the highest, and its two ends at the same height so it wraps.
const RIDGE: readonly Pt[] = [
	[0, 30], [24, 33], [44, 37], [60, 38], [74, 35], [88, 28], [100, 20], [110, 14], [122, 10], [134, 9], [144, 11],
	[156, 16], [170, 24], [188, 33], [208, 41], [228, 46], [246, 48], [262, 47], [276, 43], [290, 36], [304, 27],
	[318, 18], [332, 11], [346, 6], [360, 3], [374, 1], [388, 0], [400, 0], [412, 1], [424, 3], [440, 6], [460, 9],
	[484, 12], [506, 15],
	[510, 15], [510.4, 11.5], [511, 10], [512, 9], [513, 9.5], [514, 10.5], [514.6, 12], [515, 15.5], [516, 15.5], [516.4, 11],
	[517, 8.5], [518, 7.5], [521, 8], [522, 9], [522.6, 11.5], [523, 16], [523, 16], [523.4, 13.5], [524, 12], [525, 11],
	[525, 11], [526, 12], [526.6, 13.5], [527, 16], [529, 16.5], [529.4, 12.5], [530, 10.5], [531, 9.5], [533, 9.5], [534, 10.5],
	[534.6, 12.5], [535, 16.5], [536, 16.5], [536.4, 13], [537, 11.5], [538, 10.5], [539, 11], [540, 12], [540.6, 13.5], [541, 17],
	[544, 17], [544.4, 12.5], [545, 10], [546, 9], [548, 9.5], [549, 10.5], [549.6, 13], [550, 17.5], [550, 17.5], [550.4, 15],
	[551, 13.5], [552, 12.5], [552, 12.5], [553, 13.5], [553.6, 15], [554, 17.5], [555, 18], [555.4, 14], [556, 12], [557, 11],
	[560, 11], [561, 12], [561.6, 14], [562, 18], [564, 18.5], [564.4, 15], [565, 13.5], [566, 12.5], [567, 12.5], [568, 13.5],
	[568.6, 15], [569, 18.5], [569, 18.5], [569.4, 16], [570, 14.5], [571, 13.5], [571, 14], [572, 15], [572.6, 16.5], [573, 19],
	[577, 19], [577.4, 15], [578, 13], [579, 12], [581, 12.5], [582, 13.5], [582.6, 15.5], [583, 19.5], [584, 19.5], [584.4, 16],
	[585, 14.5], [586, 13.5], [587, 13.5], [588, 14.5], [588.6, 16], [589, 19.5], [589, 19.5], [589.4, 15], [590, 12.5], [591, 11.5],
	[594, 12], [595, 13], [595.6, 15.5], [596, 20], [598, 20], [598.4, 17.5], [599, 16], [600, 15], [600, 15.5], [601, 16.5],
	[601.6, 18], [602, 20.5], [603, 20.5], [603.4, 17], [604, 15.5], [605, 14.5], [606, 15], [607, 16], [607.6, 17.5], [608, 21],
	[611, 21], [611.4, 17], [612, 15], [613, 14], [615, 14.5], [616, 15.5], [616.6, 17.5], [617, 21.5], [618, 21.5], [618.4, 19],
	[619, 17.5], [620, 16.5], [621, 16.5], [622, 17.5], [622.6, 19], [623, 21.5], [623, 21.5], [623.4, 19.5], [624, 18], [625, 17.5],
	[625, 18], [626, 18.5], [626.6, 20], [627, 22], [632, 22], [632.4, 18.5], [633, 17], [634, 16], [636, 16.5], [637, 17.5],
	[637.6, 19], [638, 22.5], [639, 22.5], [639.4, 18.5], [640, 16.5], [641, 15.5], [644, 16], [645, 17], [645.6, 19], [646, 23],
	[648, 23], [648.4, 20.5], [649, 19], [650, 18], [651, 18.5], [652, 19.5], [652.6, 21], [653, 23.5], [654, 23.5], [654.4, 21.5],
	[655, 20], [656, 19.5], [656, 19.5], [657, 20], [657.6, 21.5], [658, 23.5], [661, 24], [661.4, 21.5], [662, 20], [663, 19],
	[665, 19], [666, 20], [666.6, 21.5], [667, 24], [669, 24], [669.4, 22], [670, 20.5], [671, 20], [672, 20.5], [673, 21],
	[673.6, 22.5], [674, 24.5], [675, 24.5], [675.4, 22.5], [676, 21], [677, 20.5], [679, 21], [680, 21.5], [680.6, 23], [681, 25],
	[683, 25], [683.4, 23.5], [684, 22.5], [685, 22], [685, 22.5], [686, 23], [686.6, 24], [687, 25.5],
	[700, 26], [716, 28], [730, 31], [742, 32], [752, 30], [764, 25], [776, 19], [786, 15], [796, 13], [804, 13],
	[812, 15], [820, 18], [830, 20], [840, 19], [850, 17], [858, 18], [868, 23], [880, 31], [894, 38], [910, 44],
	[926, 47], [942, 46], [958, 42], [974, 37], [990, 33], [1008, 30], [1024, 30],
	[1024, 120], [0, 120],
];
export const HILLS: Hills = { ...silhouette(RIDGE), drop: 40, parallax: 0.25 };

// The birds (polish pass, life.ts birdsAt): a small dark bird, wings up and wings down, 9 by 5, facing right.
export const BIRD_CELL = { w: 9, h: 5 };
export const BIRD_GRIDS: readonly Grid[] = [
	// wings up: a shallow V, the body at the bottom of it, the head a pixel to the right
	[
		".........",
		"a.......a",
		".aa...aa.",
		"...abba..",
		".........",
	],
	// wings down: level with the body, the tips dipped
	[
		".........",
		".........",
		".........",
		".aaabbaa.",
		"a.......a",
	],
];

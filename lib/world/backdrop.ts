// What lies behind the island (the look pass): the cloud sheet, big soft clouds drawn as palette grids so they stamp
// like tiles, and the far islands, flat silhouettes in haze that the renderer tints from the sky. Pure.
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

// --- The far islands: silhouettes as runs of pixels, one tone each (0 the body, 1 the snow-lit rim along the top,
// 2 the hazier underside). y is up from the island's top line (negative above it, for its trees and hills). ---
export type Run = readonly [y: number, x0: number, x1: number, tone: 0 | 1 | 2];
export type FarIsland = { runs: readonly Run[]; w: number; fx: number; lift: number };
type FarPlan = { w: number; depth: number; seed: number; pines: readonly (readonly [x: number, h: number])[]; hill?: readonly [x: number, w: number, h: number]; fx: number; lift: number };

function hash(n: number, seed: number): number {
	let h = Math.imul(n + 17, 0x27d4eb2d) ^ Math.imul(seed + 3, 0x9e3779b9);
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

function farIsland(plan: FarPlan): FarIsland {
	const { w, depth, seed } = plan;
	const cells = new Map<number, Map<number, 0 | 1 | 2>>();
	const put = (x: number, y: number, tone: 0 | 1 | 2) => {
		if (x < 0 || x >= w) return;
		let row = cells.get(y);
		if (!row) cells.set(y, (row = new Map()));
		if (!row.has(x) || tone === 1) row.set(x, tone);
	};
	// The body: an uneven bowl, the sides stepping in by a jittered amount every two rows.
	for (let y = 0; y < depth; y++) {
		const t = y / depth;
		const jitter = Math.round((hash(Math.floor(y / 3), seed) - 0.5) * 10);
		const half = (w / 2) * Math.sqrt(Math.max(0, 1 - t ** 1.6)) * (1 - 0.35 * t) + (y > 1 ? jitter : 0);
		const skew = Math.round(Math.sin(t * 2.4 + seed) * w * 0.06 * t);
		for (let x = Math.round(w / 2 - half) + skew; x < Math.round(w / 2 + half) + skew; x++) {
			const haze = t > 0.72 || (t > 0.5 && (x + y) % 2 === 0);
			put(x, y, y < 2 ? 1 : haze ? 2 : 0);
		}
	}
	// Roots and stones hanging below, of different lengths.
	for (let k = 0; k < 5; k++) {
		const x = Math.round(w * (0.4 + 0.2 * hash(k, seed + 9)));
		const len = 5 + Math.round(hash(k, seed + 11) * 12);
		const t0 = depth - 3;
		for (let y = Math.max(0, Math.floor(t0)); y < t0 + len; y++) put(x, y, 2);
	}
	// A hill on the top line.
	if (plan.hill) {
		const [hx, hw, hh] = plan.hill;
		for (let x = hx; x < hx + hw; x++) {
			const h = Math.round(hh * Math.sin(((x - hx + 0.5) / hw) * Math.PI));
			for (let y = -h; y < 0; y++) put(x, y, y === -h ? 1 : 0);
		}
	}
	// Pines: narrow triangles with a lit edge on their left.
	for (const [px, ph] of plan.pines) {
		for (let y = -ph; y < 0; y++) {
			const half = Math.floor(((y + ph) / ph) * (ph / 3.2));
			for (let x = px - half; x <= px + half; x++) put(x, y, x === px - half && y > -ph + 1 ? 1 : 0);
		}
	}
	const runs: Run[] = [];
	for (const [y, row] of [...cells.entries()].sort((a, b) => a[0] - b[0])) {
		const xs = [...row.keys()].sort((a, b) => a - b);
		let start = xs[0];
		for (let i = 1; i <= xs.length; i++) {
			const x = xs[i];
			const prev = xs[i - 1];
			if (x === prev + 1 && row.get(x) === row.get(prev)) continue;
			runs.push([y, start, prev + 1, row.get(prev) ?? 0]);
			start = x;
		}
	}
	return { runs, w, fx: plan.fx, lift: plan.lift };
}
// fx: where its centre sits across the view (a share of the width); lift: how far its top line stands above the
// island's snow, in world px. Three shapes, the middle one far behind the hall and mostly hidden by it.
export const FAR_ISLANDS: readonly FarIsland[] = [
	farIsland({ w: 260, depth: 96, seed: 1, pines: [[40, 14], [52, 20], [63, 12], [196, 17], [206, 12]], hill: [96, 80, 14], fx: 0.12, lift: 170 }),
	farIsland({ w: 150, depth: 60, seed: 4, pines: [[30, 11], [112, 14], [122, 9]], fx: 0.62, lift: 300 }),
	farIsland({ w: 210, depth: 80, seed: 7, pines: [[34, 13], [166, 16], [178, 11]], hill: [62, 66, 11], fx: 0.89, lift: 120 }),
];
export const FAR_PARALLAX = 0.12;

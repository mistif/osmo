// The world generator (spec section 3.1), pure and versioned. Version 1: today's island at its offset, then up to seven
// more, alternately east and west of the ones before, each 80 to 200 columns wide with 20 to 60 columns of sky before
// it and its top 12 to 30 rows above or below home's, made of level runs joined by steps of one or two rows. Every
// choice comes from a fixed hash of the seed, so the same seed and version always give the same world.
import type { Block } from "../blueprints/types";
import { cellHash } from "../texture";
import type { TileId } from "../tiles";
import { HOME_ISLAND, homeGround } from "./home";
import { BIG_W, MAX_ISLANDS, type Island, type WorldMap } from "./types";

const MARGIN = 2; // columns of sky kept at the world's two ends
const MIN_W = 80;
const MAX_W = 200;
// A number in 0..1 from the seed, the island and a key; a whole number from lo to hi.
const rnd = (seed: number, i: number, k: number): number => cellHash((seed | 0) ^ Math.imul(i + 1, 0x9e3779b1), Math.imul(k + 1, 0x85ebca6b) ^ ((seed | 0) >>> 16));
const int = (seed: number, i: number, k: number, lo: number, hi: number): number => lo + Math.min(hi - lo, Math.floor(rnd(seed, i, k) * (hi - lo + 1)));

type Place = { x0: number; x1: number; ground: number };
// Where islands 1, 2, ... go, in the order they rise, as far as the world has room: odd ones east of the last on the
// east, even ones west of the last on the west; a side that has no room for 80 columns closes, and the rest go on the other.
function layout(seed: number): Place[] {
	const out: Place[] = [];
	const edge = { east: HOME_ISLAND.x1, west: HOME_ISLAND.x0 };
	const open = { east: true, west: true };
	while (out.length < MAX_ISLANDS - 1 && (open.east || open.west)) {
		const i = out.length + 1;
		const prefer: "east" | "west" = i % 2 === 1 ? "east" : "west";
		const side: "east" | "west" = open[prefer] ? prefer : prefer === "east" ? "west" : "east";
		const gap = int(seed, i, 0, 20, 60);
		const width = int(seed, i, 1, MIN_W, MAX_W);
		const dy = int(seed, i, 2, 12, 30);
		const ground = HOME_ISLAND.ground + (rnd(seed, i, 3) < 0.5 ? -dy : dy);
		const x0 = side === "east" ? edge.east + gap : Math.max(MARGIN, edge.west - gap - width);
		const x1 = side === "east" ? Math.min(BIG_W - MARGIN, edge.east + gap + width) : edge.west - gap;
		if (x1 - x0 < MIN_W) {
			open[side] = false;
			continue;
		}
		out.push({ x0, x1, ground });
		if (side === "east") edge.east = x1;
		else edge.west = x0;
	}
	return out;
}

// The row he stands on in each column: a level run of 24 to 40 columns at the ground row round the middle, then runs of
// 8 to 24 columns outward to both ends, each one or two rows up or down from the last, never more than 3 from the ground row.
function tops(seed: number, i: number, w: number, ground: number): number[] {
	const out = Array.from({ length: w }, () => ground);
	const half = Math.floor(int(seed, i, 100, 24, 40) / 2);
	const mid = Math.floor(w / 2);
	const lo = Math.max(0, mid - half);
	const hi = Math.min(w, mid + half);
	for (const dir of [1, -1] as const) {
		let row = ground;
		let c = dir === 1 ? hi : lo - 1;
		for (let k = 0; dir === 1 ? c < w : c >= 0; k++) {
			const key = 2 * k + (dir === 1 ? 0 : 1);
			const step = rnd(seed, i, 200 + key) < 0.5 ? 1 : 2;
			row = Math.max(ground - 3, Math.min(ground + 3, row + (rnd(seed, i, 300 + key) < 0.5 ? -step : step)));
			const len = int(seed, i, 400 + key, 8, 24);
			for (let j = 0; j < len && (dir === 1 ? c < w : c >= 0); j++, c += dir) out[c] = row;
		}
	}
	return out;
}

// Rows of rock under each column: deepest in the middle (6 plus a twelfth of the width, at most 18), tapering to one at
// the ends, with a little jitter.
function depths(seed: number, i: number, w: number): number[] {
	const deepest = Math.min(18, 6 + Math.floor(w / 12));
	return Array.from({ length: w }, (_, c) => {
		const t = (2 * (c + 0.5)) / w - 1;
		const shape = Math.pow(Math.max(0, 1 - t * t), 0.8);
		return Math.max(1, Math.round(deepest * shape * (0.85 + 0.3 * rnd(seed, i, 500 + c))));
	});
}

// An island's blocks, in the style of today's island: snow on the top (its two ends with their edges), rock under it
// with lit and shadowed edges where a neighbour column is shorter, roots and jutting stones hanging below, and scenery
// standing on level ground.
function islandBlocks(seed: number, island: Island, depth: readonly number[]): Block[] {
	const out: Block[] = [];
	const w = island.x1 - island.x0;
	const top = island.top;
	const put = (c: number, y: number, tile: TileId) => out.push({ x: island.x0 + c, y, tile, layer: "ground" });
	const solid = (c: number, y: number) => c >= 0 && c < w && y >= top[c] && y <= top[c] + depth[c];
	for (let c = 0; c < w; c++) {
		const t = top[c];
		put(c, t, c === 0 ? "snow-edge-l" : c === w - 1 ? "snow-edge-r" : "snow");
		const d = depth[c];
		for (let r = 1; r <= d; r++) {
			const y = t + r;
			const openL = !solid(c - 1, y);
			const openR = !solid(c + 1, y);
			let tile: TileId = r <= 2 ? "stone" : "stone-dark";
			if (r === d) tile = openL && !openR ? "stone-under-l" : openR && !openL ? "stone-under-r" : "stone-bottom";
			else if (openL) tile = "stone-edge-l";
			else if (openR) tile = "stone-edge-r";
			put(c, y, tile);
		}
		const h = rnd(seed, island.id, 600 + c);
		if (h < 0.06) put(c, t + d + 1, "stone-hang");
		else if (h < 0.18) {
			const n = 1 + Math.floor(rnd(seed, island.id, 700 + c) * 3);
			for (let k = 1; k <= n; k++) put(c, t + d + k, k === n ? "root-end" : "root");
		}
	}
	let free = 2; // the first column scenery may stand on, so nothing stands in another's cells
	for (let c = 2; c < w - 2; c++) {
		const y = top[c];
		if (c < free || top[c - 1] !== y || top[c + 1] !== y) continue;
		const s = rnd(seed, island.id, 800 + c);
		if (s < 0.05 && top[c - 2] === y && top[c + 2] === y) {
			put(c, y - 1, "trunk-base");
			for (const up of [2, 3]) {
				put(c - 1, y - up, "pine-l");
				put(c, y - up, "pine-c");
				put(c + 1, y - up, "pine-r");
			}
			put(c, y - 4, "pine-small");
			put(c, y - 5, "pine-tip");
			free = c + 4;
		} else if (s < 0.1) {
			put(c, y - 1, "trunk-base");
			put(c, y - 2, "pine-small");
			put(c, y - 3, "pine-small");
			put(c, y - 4, "pine-tip");
			free = c + 3;
		} else if (s < 0.16) {
			put(c, y - 1, "bush");
			free = c + 2;
		} else if (s < 0.26) {
			put(c, y - 1, "tuft");
			free = c + 2;
		} else if (s < 0.3) {
			put(c, y - 1, "grass");
			free = c + 2;
		}
	}
	return out;
}

const known = (gen: number) => {
	if (gen !== 1) throw new Error(`unknown generator version ${gen}`);
};

// The world for a seed made by generator version gen, with its first `count` islands (home first, then in the order
// they rise; count is clamped to 1 .. maxIslands(seed, gen)). The same three numbers always give the same world.
// Throws "unknown generator version <gen>" for a version it does not know.
export function generateWorld(seed: number, gen: number, count: number): WorldMap {
	known(gen);
	const places = layout(seed);
	const n = Math.max(1, Math.min(1 + places.length, Math.floor(count)));
	const islands: Island[] = [HOME_ISLAND];
	const ground: Block[] = homeGround();
	for (let i = 1; i < n; i++) {
		const p = places[i - 1];
		const w = p.x1 - p.x0;
		const island: Island = { id: i, x0: p.x0, x1: p.x1, ground: p.ground, top: tops(seed, i, w, p.ground), home: false };
		islands.push(island);
		ground.push(...islandBlocks(seed, island, depths(seed, i, w)));
	}
	return { seed, gen, islands, ground };
}

// How many islands this seed's world holds at most (4 to MAX_ISLANDS).
export function maxIslands(seed: number, gen: number): number {
	known(gen);
	return 1 + layout(seed).length;
}

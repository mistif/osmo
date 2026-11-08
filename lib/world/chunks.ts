// The world cut into chunks of 32 by 32 tiles (spec 3.3), so a frame walks only the blocks on screen. Each list of
// blocks is bucketed once and kept until the list changes (the world keeps its lists until a block is laid). The chunk
// bitmaps both painters keep live in one cache, chunkCache, so eviction and release behave the same in both.
import type { Block } from "./blueprints/types";
import { LAYER_ORDER, TILE } from "./blueprints/types";
import { zoomAt, type Camera, type View } from "./camera";
import { CHUNK } from "./map/types";
import { tileIndex } from "./tiles";

export type Bucket = { blocks: readonly Block[]; sig: string };
export const chunkKey = (cx: number, cy: number): number => cy * 4096 + cx;
const KEPT = new WeakMap<readonly Block[], ReadonlyMap<number, Bucket>>();
// FNV-1a over each block's place, tile and layer: two chunks with the same blocks sign the same.
function sign(blocks: readonly Block[]): string {
	let h = 0x811c9dc5;
	const mix = (n: number) => {
		h ^= n & 0xffff;
		h = Math.imul(h, 0x01000193) >>> 0;
	};
	for (const b of blocks) {
		mix(b.x);
		mix(b.y);
		mix(tileIndex(b.tile));
		mix(LAYER_ORDER.indexOf(b.layer));
	}
	return `${blocks.length}:${h.toString(16)}`;
}
export function bucket(blocks: readonly Block[]): ReadonlyMap<number, Bucket> {
	const hit = KEPT.get(blocks);
	if (hit) return hit;
	const lists = new Map<number, Block[]>();
	for (const b of blocks) {
		const k = chunkKey(Math.floor(b.x / CHUNK), Math.floor(b.y / CHUNK));
		const list = lists.get(k);
		if (list) list.push(b);
		else lists.set(k, [b]);
	}
	const out = new Map<number, Bucket>();
	for (const [k, list] of lists) out.set(k, { blocks: list, sig: sign(list) });
	KEPT.set(blocks, out);
	return out;
}
// The chunks the view touches at the camera's zoom now, `margin` chunks more all round (inclusive ranges; empty when
// the zoom is not above 0). The tiles level walks one chunk of margin; the chunk bitmaps take none.
export function chunkRange(c: Camera, v: View, now: number, margin = 1): { cx0: number; cx1: number; cy0: number; cy1: number } {
	const z = zoomAt(c, now);
	if (!(z > 0)) return { cx0: 0, cx1: -1, cy0: 0, cy1: -1 };
	const span = CHUNK * TILE;
	const hw = v.w / 2 / z;
	const hh = v.h / 2 / z;
	return {
		cx0: Math.floor((c.x - hw) / span) - margin,
		cx1: Math.floor((c.x + hw) / span) + margin,
		cy0: Math.max(0, Math.floor((c.y - hh) / span) - margin),
		cy1: Math.floor((c.y + hh) / span) + margin,
	};
}

export type ChunkStats = { made: number; baked: number; released: number; kept(): number };
export type ChunkCache<T> = {
	readonly keep: number;
	readonly stats: ChunkStats;
	// The kept bitmap for key at version: "kept" when it is there at this version; "baked" when bake made or redrew it
	// (only when mayBake); null when it is missing or stale and mayBake is false (nothing changes then).
	get(key: string, version: string, mayBake: boolean, bake: (t: T) => void): { t: T; state: "kept" | "baked" } | null;
	release(): void; // frees every kept bitmap
};
// An LRU of at most `keep` bitmaps: made when a key is first baked, freed (`free`) when the least recently drawn is
// evicted to make room, and all freed on release.
export function chunkCache<T>(keep: number, make: () => T, free: (t: T) => void): ChunkCache<T> {
	const kept = new Map<string, { version: string; t: T }>();
	const stats: ChunkStats = { made: 0, baked: 0, released: 0, kept: () => kept.size };
	return {
		keep,
		stats,
		get(key, version, mayBake, bake) {
			let hit = kept.get(key);
			if (hit && hit.version === version) {
				kept.delete(key);
				kept.set(key, hit);
				return { t: hit.t, state: "kept" };
			}
			if (!mayBake) return null;
			if (hit) kept.delete(key);
			else {
				if (kept.size >= keep) {
					const oldest = kept.entries().next();
					if (!oldest.done) {
						kept.delete(oldest.value[0]);
						free(oldest.value[1].t);
						stats.released++;
					}
				}
				hit = { version: "", t: make() };
				stats.made++;
			}
			bake(hit.t);
			hit.version = version;
			stats.baked++;
			kept.set(key, hit);
			return { t: hit.t, state: "baked" };
		},
		release() {
			for (const { t } of kept.values()) free(t);
			stats.released += kept.size;
			kept.clear();
		},
	};
}

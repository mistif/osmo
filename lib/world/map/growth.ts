// When another island rises (spec section 3.1): when RISE_SHARE of the usable surface is built.
import { RISE_SHARE, type Island, type Rect, type WorldMap } from "./types";

// The columns of an island a build may stand on: all but its two end columns.
export const usableColumns = (island: Island): number => Math.max(0, island.x1 - island.x0 - 2);
// The share (0 to 1) of every present island's usable columns that at least one of the rects covers.
export function builtShare(map: WorldMap, built: readonly Rect[]): number {
	let usable = 0;
	let covered = 0;
	for (const i of map.islands) {
		for (let x = i.x0 + 1; x < i.x1 - 1; x++) {
			usable++;
			if (built.some((r) => x >= r.x && x < r.x + r.w)) covered++;
		}
	}
	return usable === 0 ? 0 : covered / usable;
}
// True when another island should rise: fewer than max are present and builtShare is at least RISE_SHARE.
export const shouldRise = (map: WorldMap, built: readonly Rect[], max: number): boolean => map.islands.length < max && builtShare(map, built) >= RISE_SHARE;

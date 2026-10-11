// When another island rises (spec section 3.1): when RISE_SHARE of the usable surface is built. Task 0 stub; T1 builds it.
import type { Island, Rect, WorldMap } from "./types";

// The columns of an island a build may stand on: all but its two end columns.
export function usableColumns(island: Island): number {
	void island;
	throw new Error("not built: usableColumns");
}
// The share (0 to 1) of every present island's usable columns that at least one of the rects covers.
export function builtShare(map: WorldMap, built: readonly Rect[]): number {
	void [map, built];
	throw new Error("not built: builtShare");
}
// True when another island should rise: fewer than max are present and builtShare is at least RISE_SHARE.
export function shouldRise(map: WorldMap, built: readonly Rect[], max: number): boolean {
	void [map, built, max];
	throw new Error("not built: shouldRise");
}

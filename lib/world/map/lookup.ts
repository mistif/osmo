// Finding the ground in the big world (Task 0, complete): which island holds a column, and the row he stands on there.
import { TILE } from "../blueprints/types";
import type { Island, WorldMap } from "./types";

type Islands = Pick<WorldMap, "islands">;
// The island whose columns hold tile column tx (any number; its floor is taken), or null over open sky.
export function islandAt(map: Islands, tx: number): Island | null {
	const c = Math.floor(tx);
	return map.islands.find((i) => c >= i.x0 && c < i.x1) ?? null;
}
// The row he stands on at tile column tx (its top edge is his feet), or null over open sky.
export function surfaceAt(map: Islands, tx: number): number | null {
	const i = islandAt(map, tx);
	return i === null ? null : (i.top[Math.floor(tx) - i.x0] ?? null);
}
export const islandById = (map: Islands, id: number): Island | null => map.islands.find((i) => i.id === id) ?? null;
// A world px x to its tile column.
export const columnOf = (px: number): number => Math.floor(px / TILE);

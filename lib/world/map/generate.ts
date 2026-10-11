// The world generator (spec section 3.1), pure and versioned. Task 0 stub; T1 builds it.
import type { WorldMap } from "./types";

// The world for a seed made by generator version gen, with its first `count` islands (home first, then in the order
// they rise; count is clamped to 1 .. maxIslands(seed, gen)). The same three numbers always give the same world.
// Throws "unknown generator version <gen>" for a version it does not know.
export function generateWorld(seed: number, gen: number, count: number): WorldMap {
	void [seed, gen, count];
	throw new Error("not built: generateWorld");
}
// How many islands this seed's world holds at most (4 to MAX_ISLANDS).
export function maxIslands(seed: number, gen: number): number {
	void [seed, gen];
	throw new Error("not built: maxIslands");
}

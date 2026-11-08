// Where Osmo stands in the dev page's recipe preview (app/dev/world/recipe-preview.tsx): a tile beside the build, on
// whichever side has ground, else on the build's own floor. Pure.
import { TILE, type Block } from "../blueprints/types";
import type { Island } from "../map/types";
import type { Compiled } from "./types";

export type Stand = { x: number; y: number }; // his feet, world px

// A tile to the right of the build (one clear column between), else the same to the left, at the height of the island's
// top in that column: the first side the island covers. With ground on neither side (or no island), on the build's own
// floor: the lowest floor row of its blocks, at the block nearest the middle column; a build with no floor block has its
// bottom edge in the middle.
export function standBeside(c: Compiled, island: Island | undefined, laid: readonly Block[]): Stand {
	if (island) {
		for (const col of [c.x + c.w + 1, c.x - 2]) {
			if (col < island.x0 || col >= island.x1) continue;
			return { x: col * TILE + TILE / 2, y: (island.top[col - island.x0] ?? island.ground) * TILE };
		}
	}
	const middle = c.x + Math.floor(c.w / 2);
	const floors = laid.filter((b) => b.layer === "floor");
	if (floors.length === 0) return { x: middle * TILE + TILE / 2, y: (c.y + c.h) * TILE };
	const row = Math.max(...floors.map((b) => b.y));
	const best = floors.filter((b) => b.y === row).reduce((a, b) => (Math.abs(b.x - middle) < Math.abs(a.x - middle) ? b : a));
	return { x: best.x * TILE + TILE / 2, y: best.y * TILE };
}

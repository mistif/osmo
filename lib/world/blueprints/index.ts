import { LAYER_ORDER, TILE, type Block, type Blueprint, type Layer } from "./types";

// Every block of a blueprint in laying order: by layer, then bottom row first, then left to right.
export function blocksOf(bp: Blueprint): Block[] {
	const cells: Block[] = [];
	for (const grid of [bp.map, bp.decor]) {
		grid.forEach((row, y) => {
			[...row].forEach((ch, x) => {
				if (ch === ".") return;
				const entry = bp.legend[ch];
				if (!entry) throw new Error(`${bp.room}: no legend entry for "${ch}" at ${x},${y}`);
				cells.push({ x: bp.x + x, y: bp.y + y, tile: entry.tile, layer: entry.layer });
			});
		});
	}
	const rank = (l: Layer) => LAYER_ORDER.indexOf(l);
	return cells.sort((a, b) => rank(a.layer) - rank(b.layer) || b.y - a.y || a.x - b.x);
}

export const ISLAND_LEFT = 8; // tile columns of the island's two ends
export const ISLAND_RIGHT = 55;
// Where he stands to lay a block (world px): under it, but never off the island's ends.
export const standX = (b: Block): number => (Math.min(ISLAND_RIGHT - 1, Math.max(ISLAND_LEFT + 1, b.x)) + 0.5) * TILE;
export const REST_X = (47 + 0.5) * TILE; // the bench by the lantern (island.ts)
export const START_X = (32 + 0.5) * TILE; // the hall's door

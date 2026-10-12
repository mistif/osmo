import { LAYER_ORDER, TILE, type Block, type Blueprint, type Layer, type Legend } from "./types";

// A footprint's three parts, which a blueprint has too: the structure, what hangs on it, and the letters' tiles.
export type Cells = { map: readonly string[]; decor: readonly string[]; legend: Legend };
// Every block of a footprint with its top-left at tile (x0, y0), in laying order: by layer, then bottom row first, then
// left to right. name labels the error for a letter missing from the legend.
export function cellsOf(fp: Cells, x0: number, y0: number, name: string): Block[] {
	const cells: Block[] = [];
	for (const grid of [fp.map, fp.decor]) {
		grid.forEach((row, y) => {
			[...row].forEach((ch, x) => {
				if (ch === ".") return;
				const entry = fp.legend[ch];
				if (!entry) throw new Error(`${name}: no legend entry for "${ch}" at ${x},${y}`);
				cells.push({ x: x0 + x, y: y0 + y, tile: entry.tile, layer: entry.layer });
			});
		});
	}
	const rank = (l: Layer) => LAYER_ORDER.indexOf(l);
	return cells.sort((a, b) => rank(a.layer) - rank(b.layer) || b.y - a.y || a.x - b.x);
}

// Every block of a blueprint in laying order.
export const blocksOf = (bp: Blueprint): Block[] => cellsOf(bp, bp.x, bp.y, bp.room);

export const ISLAND_LEFT = 3; // tile columns of the island's two ends
export const ISLAND_RIGHT = 60;
// Where he stands to lay a block (world px): under it, but never off the island's ends.
export const standX = (b: Block): number => (Math.min(ISLAND_RIGHT - 1, Math.max(ISLAND_LEFT + 1, b.x)) + 0.5) * TILE;
export const START_X = (32 + 0.5) * TILE; // the hall's door, and the yard in front of it (Talk's place)
// At night he sits on the hall's step at its door, between its two lanterns (phase 2 moved him off the old bench,
// which the workshop now covers).
export const REST_X = START_X;

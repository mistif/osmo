// Today's island in the big world, and the balloon dock beside it (spec sections 3.1 and 4.6). Task 0, complete.
import { blocksOf } from "../blueprints";
import { ISLAND } from "../blueprints/island";
import { TILE, type Block } from "../blueprints/types";
import type { TileId } from "../tiles";
import { HOME_DX, HOME_DY, type Deck, type Island } from "./types";

export const shiftBlocks = (blocks: readonly Block[], dx: number, dy: number): Block[] => blocks.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }));
// Today's island moved by the home offset: columns 448 to 505, its snow row on 86.
export const homeGround = (): Block[] => shiftBlocks(blocksOf(ISLAND), HOME_DX, HOME_DY);
export const HOME_TOP = 86;
export const HOME_ISLAND: Island = { id: 0, x0: 448, x1: 506, ground: HOME_TOP, top: Array.from({ length: 58 }, () => HOME_TOP), home: true };
// A world px x or y of today's small world, in the big world.
export const homePx = (x: number): number => x + HOME_DX * TILE;
export const homePy = (y: number): number => y + HOME_DY * TILE;

// The balloon dock (phase 2): four boards off the island's east end (its last column is 505), level with its snow row so
// he walks onto them, on a strut against the rock, with a mooring post at the island's edge. The far board (DOCK_END_X)
// is left clear above: a rope bridge east of home starts there (bridgeEnd), so the dock is the first stretch of that
// walk, and the rules count the dock's boards as land (T6's ruleWorldOf, given DOCK_DECK). Static ground, never laid or
// saved; added to the ground only when BUILDS is on.
export const DOCK_BOARD_X = 508; // the column he stands on to board
export const DOCK_END_X = 509; // the far board
export const DOCK_BLOCKS: readonly Block[] = [
	{ x: 506, y: 86, tile: "bridge-board", layer: "ground" },
	{ x: 507, y: 86, tile: "bridge-board", layer: "ground" },
	{ x: 508, y: 86, tile: "bridge-board", layer: "ground" },
	{ x: 509, y: 86, tile: "bridge-board", layer: "ground" },
	{ x: 506, y: 87, tile: "post", layer: "ground" },
	{ x: 506, y: 85, tile: "post", layer: "ground" },
];
export const DOCK_DECK: Deck = { x0: 506, x1: 510, rows: [86, 86, 86, 86], from: 0, to: 0 };

// Where a rope bridge meets an island (spec 4.6): the cell its post stands on. An island's end column on its top row,
// except home's east end, where the bridge starts from the dock's far board.
export function bridgeEnd(island: Island, side: "east" | "west"): { x: number; y: number } {
	if (side === "west") return { x: island.x0, y: island.top[0] };
	return island.home ? { x: DOCK_END_X, y: HOME_TOP } : { x: island.x1 - 1, y: island.top[island.top.length - 1] };
}

// The balloon, drawn from tiles placed around the bottom centre of its basket (world px): the envelope's nine cells (48
// by 48, half again his height) high above, two ropes from its throat down to the basket's rim, and the basket, a full
// cell deep, drawn after him so he stands in it with its rim at his waist. His feet are on the basket's bottom, so it
// stands at the same height moored and ridden (RIDE_FEET 0).
export const BALLOON_ENVELOPE: readonly { tile: TileId; dx: number; dy: number }[] = ([
	"balloon-1", "balloon-2", "balloon-3", "balloon-4", "balloon-5", "balloon-6", "balloon-7", "balloon-8", "balloon-9",
] as const).map((tile, n) => ({ tile, dx: -24 + (n % 3) * TILE, dy: -96 + Math.floor(n / 3) * TILE }));
export const BALLOON_BASKET: { tile: TileId; dx: number; dy: number } = { tile: "basket-full", dx: -8, dy: -16 };
// From just inside the ring at the throat (the envelope's row 46) down to the rim.
export const BALLOON_ROPES: readonly { x: number; top: number; bottom: number }[] = [
	{ x: -6, top: -50, bottom: -16 },
	{ x: 5, top: -50, bottom: -16 },
];
export const RIDE_FEET = 0;

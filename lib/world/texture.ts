// The polish pass's texture and light rules for the renderer (render.ts), kept pure so they are tested without
// drawing: which variant of a tile a cell shows, which tiles are lit after dark, which blocks cast a one-row shadow on
// the wall below them, where lanterns and doors spill light on the ground, and the forge's breathing glow. None of it
// changes a blueprint or what is saved: the blocks keep their base tiles, and the choice is made where they are drawn.
import { GROUND_Y, TILE, type Block } from "./blueprints/types";
import type { TileId } from "./tiles";

// --- Variants: a fixed hash of the cell's tile position picks the tile, so the same cell always shows the same one
// and the 16 px repeat stops showing on long walls and the island's top. Each variant in about one cell in six. The
// free-will walls have one variant each: their pair's second is the base itself.
const VARIANTS: Partial<Record<TileId, readonly [TileId, TileId]>> = {
	brick: ["brick-2", "brick-3"],
	stone: ["stone-2", "stone-3"],
	snow: ["snow-2", "snow-3"],
	"plank-wall": ["plank-wall-2", "plank-wall"],
	"stone-wall": ["stone-wall-2", "stone-wall"],
};
export const VARIANT_SHARE = 1 / 6;
export function cellHash(x: number, y: number): number {
	let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x3c6e, 0x165667b1);
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function variantOf(id: TileId, x: number, y: number): TileId {
	const v = VARIANTS[id];
	if (!v) return id;
	const h = cellHash(x, y);
	return h < VARIANT_SHARE ? v[0] : h < 2 * VARIANT_SHARE ? v[1] : id;
}

// --- After dark (from LIT_FROM): the windows, the library's bookcase windows and the observatory's dome are lit. ---
export const LIT_FROM = 0.5;
const LIT: Partial<Record<TileId, TileId>> = {
	window: "window-lit",
	"window-top": "window-top-lit",
	"shelf-window": "shelf-window-lit",
	"dome-l": "dome-l-lit",
	dome: "dome-lit",
	"dome-r": "dome-r-lit",
};
export const litOf = (id: TileId, dark: number): TileId => (dark >= LIT_FROM ? (LIT[id] ?? id) : id);

// --- Shadows: a block of CASTERS darkens the top world pixel row of the block right below it, when that block is a
// wall (RECEIVERS): under the eaves' timber, under a window's sill, under the bookcase window's sill. The free-will
// walls and back walls receive it too. ---
const CASTERS: ReadonlySet<TileId> = new Set<TileId>(["beam-h", "window", "shelf-window"]);
const RECEIVERS: ReadonlySet<TileId> = new Set<TileId>(["brick", "brick-dark", "pillar", "plank-wall", "stone-wall", "back-wood", "back-stone"]);
export const SHADOW_ALPHA = 0.3;
export const SHADOW_COLOR = "#0b0d12";
// The blocks that receive a shadow on their top row, from the blocks laid so far. A cell can hold two blocks (a
// banner or a lantern hangs on a wall): the wall is the one that receives it.
export function shadowed(laid: readonly Block[]): Block[] {
	const walls = new Map<string, Block>();
	for (const b of laid) if (RECEIVERS.has(b.tile)) walls.set(`${b.x},${b.y}`, b);
	const out: Block[] = [];
	for (const b of laid) {
		if (!CASTERS.has(b.tile)) continue;
		const below = walls.get(`${b.x},${b.y + 1}`);
		if (below) out.push(below);
	}
	return out;
}

// --- Light on the ground: after dark each lantern and each door spills a soft ellipse of warm light on the ground
// under it (the snow's top edge, where he stands). World px; strength is at full dark. ---
export type Pool = { x: number; y: number; rx: number; ry: number; strength: number };
const POOLS: Partial<Record<TileId, { rx: number; ry: number; strength: number }>> = {
	lantern: { rx: 26, ry: 5, strength: 0.34 },
	door: { rx: 20, ry: 4, strength: 0.26 },
};
// floorY: the world px y of the ground's top edge under a block. The small world's is its one snow row; the big world
// passes its surface (T2).
export function poolsOf(blocks: readonly Block[], floorY: (b: Block) => number = () => GROUND_Y * TILE): Pool[] {
	const out: Pool[] = [];
	for (const b of blocks) {
		const p = POOLS[b.tile];
		if (p) out.push({ x: (b.x + 0.5) * TILE, y: floorY(b) + 1, ...p });
	}
	return out;
}

// --- The forge's glow breathes: its strength swings FORGE_BREATH either way over FORGE_BREATH_MS. Smooth while the
// loop draws frames; on the 3 s tick it is sampled, so it simply sits a little brighter or dimmer each time. ---
export const FORGE_BREATH = 0.18;
export const FORGE_BREATH_MS = 2400;
export const forgeBreath = (now: number): number =>
	Number.isFinite(now) ? 1 + FORGE_BREATH * Math.sin((2 * Math.PI * now) / FORGE_BREATH_MS) : 1;

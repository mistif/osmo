// Getting about the big world (spec sections 3.4 and 4.6), pure: the balloon's path, where he boards and lands, the
// bridges' decks, the floor under his feet, and the next leg toward a place on another island.
import { TILE, type Block } from "../blueprints/types";
import { pickIndex } from "../build/util";
import { DOCK_BOARD_X, HOME_TOP } from "../map/home";
import { islandAt, islandById, surfaceAt } from "../map/lookup";
import type { BalloonPath, Deck, Island, Leg, WorldMap, WorldPt } from "../map/types";

export const BALLOON_SPEED = 192; // world px per second: 12 tiles
type Islands = Pick<WorldMap, "islands">;
// The trip from `from` to `to`: up in a gentle arc (at least four tiles, else a sixth of the way) and down again, at
// BALLOON_SPEED along the climb, the run and the descent, never shorter than a second.
export function balloonPath(from: WorldPt, to: WorldPt): BalloonPath {
	const dx = Math.abs(to.x - from.x);
	const dy = Math.abs(to.y - from.y);
	const rise = Math.max(4 * TILE, Math.hypot(dx, dy) / 6);
	return { from, to, top: Math.min(from.y, to.y) - rise, ms: Math.max(1000, Math.round(((dx + dy + 2 * rise) / BALLOON_SPEED) * 1000)) };
}
// Where the balloon is ms into its path (clamped to the path), and whether it has landed.
export function pathAt(p: BalloonPath, ms: number): { x: number; y: number; done: boolean } {
	const t = p.ms > 0 && Number.isFinite(ms) ? Math.min(1, Math.max(0, ms / p.ms)) : 1;
	const s = t * t * (3 - 2 * t);
	const mid = (p.from.y + p.to.y) / 2;
	const y = p.from.y + (p.to.y - p.from.y) * s - (mid - p.top) * 4 * s * (1 - s);
	return { x: p.from.x + (p.to.x - p.from.x) * s, y, done: t >= 1 };
}
const centre = (i: Island) => (i.x0 + i.x1) / 2;
// Where the balloon sets him down on an island: three columns in from its end facing `from`, on its top.
export function landingOf(island: Island, from: Island): WorldPt {
	const col = centre(from) < centre(island) ? island.x0 + 3 : island.x1 - 4;
	return { x: (col + 0.5) * TILE, y: island.top[col - island.x0] * TILE };
}
// Where he boards on an island: home's dock (DOCK_BOARD_X), or another island's landing spot facing home.
export const boardingOf = (island: Island, home: Island): WorldPt =>
	island.home ? { x: (DOCK_BOARD_X + 0.5) * TILE, y: HOME_TOP * TILE } : landingOf(island, home);
// A finished bridge's deck from its blocks: the top board row of each column it spans.
export function deckOf(blocks: readonly Block[], from: number, to: number): Deck {
	const boards = blocks.filter((b) => b.tile === "bridge-board");
	const x0 = Math.min(...boards.map((b) => b.x));
	const x1 = Math.max(...boards.map((b) => b.x)) + 1;
	const rows: number[] = [];
	for (let x = x0; x < x1; x++) {
		const here = boards.filter((b) => b.x === x).map((b) => b.y);
		rows.push(here.length > 0 ? Math.min(...here) : (rows[rows.length - 1] ?? 0));
	}
	return { x0, x1, rows, from, to };
}
// World px x to the world px y of his feet there (an island's top, or a deck), or null over open sky.
export function floorAt(map: Islands, decks: readonly Deck[]): (px: number) => number | null {
	return (px) => {
		const c = Math.floor(px / TILE);
		const s = surfaceAt(map, c);
		if (s !== null) return s * TILE;
		const d = decks.find((k) => c >= k.x0 && c < k.x1);
		return d ? d.rows[c - d.x0] * TILE : null;
	};
}
// World px x to the island under it, or null over a deck or the sky.
export const islandOfPx = (map: Islands) => (px: number): number | null => islandAt(map, Math.floor(px / TILE))?.id ?? null;
// Whether decks join island a to island b, through any chain of them.
function linked(decks: readonly Deck[], a: number, b: number): boolean {
	const seen = new Set([a]);
	const queue = [a];
	while (queue.length > 0) {
		const i = queue.pop() as number;
		for (const d of decks) {
			const other = d.from === i ? d.to : d.to === i ? d.from : null;
			if (other !== null && !seen.has(other)) {
				seen.add(other);
				queue.push(other);
			}
		}
	}
	return seen.has(b);
}
// The next leg from where he is to a place (world px x) on an island: walk when decks join the two islands (or they are
// one), else walk to the boarding spot and then board.
export function nextLeg(map: Islands, decks: readonly Deck[], from: { island: number; x: number }, to: { island: number; x: number }): Leg {
	if (from.island === to.island || linked(decks, from.island, to.island)) return { kind: "walk", x: to.x };
	const here = islandById(map, from.island);
	const there = islandById(map, to.island);
	const home = islandById(map, 0);
	if (!here || !there || !home) return { kind: "walk", x: from.x };
	const b = boardingOf(here, home);
	if (Math.abs(from.x - b.x) >= 0.5) return { kind: "walk", x: b.x };
	return { kind: "board", path: balloonPath(b, landingOf(there, here)), island: to.island };
}
// Where he stands to lay a block: the island under its column (the nearest island for a bridge block) and a world px x
// kept off that island's two end columns.
export function standFor(b: Block, map: Islands): { island: number; x: number } {
	const gap = (i: Island) => Math.min(Math.abs(b.x - i.x0), Math.abs(b.x - (i.x1 - 1)));
	const i = islandAt(map, b.x) ?? [...map.islands].sort((p, q) => gap(p) - gap(q))[0];
	return { island: i.id, x: (Math.min(i.x1 - 2, Math.max(i.x0 + 1, b.x)) + 0.5) * TILE };
}
// Where he waits when the budget is dry (spec 4.7): by one of his builds on the island (spots: their world px x), or a
// spot of the island, changing with the slot; world px x.
export function idleSpot(map: Islands, spots: readonly number[], island: number, slot: number, seed: number): number {
	const i = islandById(map, island);
	if (!i) return spots[0] ?? 0;
	const lo = (i.x0 + 1) * TILE;
	const hi = (i.x1 - 1) * TILE - 1;
	if (spots.length > 0) {
		const s = spots[pickIndex(seed, slot, spots.length)] + (pickIndex(seed, slot + 1, 5) - 2) * 12;
		return Math.min(hi, Math.max(lo, s));
	}
	return (i.x0 + 1 + pickIndex(seed, slot, Math.max(1, i.x1 - i.x0 - 2)) + 0.5) * TILE;
}

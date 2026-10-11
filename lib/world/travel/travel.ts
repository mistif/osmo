// Getting about the big world (spec sections 3.4 and 4.6), pure: the balloon's path, where he boards and lands, the
// bridges' decks, the floor under his feet, and the next leg toward a place on another island. Task 0 stub; T10 builds it.
import type { Block } from "../blueprints/types";
import type { BalloonPath, Deck, Island, Leg, WorldMap, WorldPt } from "../map/types";

export const BALLOON_SPEED = 192; // world px per second: 12 tiles
type Islands = Pick<WorldMap, "islands">;
export function balloonPath(from: WorldPt, to: WorldPt): BalloonPath {
	void [from, to];
	throw new Error("not built: balloonPath");
}
// Where the balloon is ms into its path (clamped to the path), and whether it has landed.
export function pathAt(p: BalloonPath, ms: number): { x: number; y: number; done: boolean } {
	void [p, ms];
	throw new Error("not built: pathAt");
}
// Where the balloon sets him down on an island: three columns in from its end facing `from`, on its top.
export function landingOf(island: Island, from: Island): WorldPt {
	void [island, from];
	throw new Error("not built: landingOf");
}
// Where he boards on an island: home's dock (DOCK_BOARD_X), or another island's landing spot facing home.
export function boardingOf(island: Island, home: Island): WorldPt {
	void [island, home];
	throw new Error("not built: boardingOf");
}
// A finished bridge's deck from its blocks: the top board row of each column it spans.
export function deckOf(blocks: readonly Block[], from: number, to: number): Deck {
	void [blocks, from, to];
	throw new Error("not built: deckOf");
}
// World px x to the world px y of his feet there (an island's top, or a deck), or null over open sky.
export function floorAt(map: Islands, decks: readonly Deck[]): (px: number) => number | null {
	void [map, decks];
	throw new Error("not built: floorAt");
}
// World px x to the island under it, or null over a deck or the sky.
export function islandOfPx(map: Islands): (px: number) => number | null {
	void map;
	throw new Error("not built: islandOfPx");
}
// The next leg from where he is to a place (world px x) on an island: walk when decks join the two islands (or they are
// one), else walk to the boarding spot and then board.
export function nextLeg(map: Islands, decks: readonly Deck[], from: { island: number; x: number }, to: { island: number; x: number }): Leg {
	void [map, decks, from, to];
	throw new Error("not built: nextLeg");
}
// Where he stands to lay a block: the island under its column (the nearest island for a bridge block) and a world px x
// kept off that island's two end columns.
export function standFor(b: Block, map: Islands): { island: number; x: number } {
	void [b, map];
	throw new Error("not built: standFor");
}
// Where he waits when the budget is dry (spec 4.7): by one of his builds on the island (spots: their world px x), or a
// spot of the island, changing with the slot; world px x.
export function idleSpot(map: Islands, spots: readonly number[], island: number, slot: number, seed: number): number {
	void [map, spots, island, slot, seed];
	throw new Error("not built: idleSpot");
}

import { describe, expect, it } from "vitest";
import type { Block } from "../blueprints/types";
import { DOCK_DECK, HOME_ISLAND } from "../map/home";
import type { Island } from "../map/types";
import { BALLOON_SPEED, balloonPath, boardingOf, deckOf, floorAt, idleSpot, islandOfPx, landingOf, nextLeg, pathAt, standFor } from "./travel";

const flat = (id: number, x0: number, w: number, top: number): Island => ({ id, x0, x1: x0 + w, ground: top, top: Array.from({ length: w }, () => top), home: false });
const EAST = flat(1, 530, 100, 70);
const FAR = flat(2, 700, 100, 90);
const MAP = { islands: [HOME_ISLAND, EAST, FAR] };
const board = (x: number, y: number): Block => ({ x, y, tile: "bridge-board", layer: "floor" });

describe("the balloon (spec 4.6)", () => {
	const p = balloonPath({ x: 0, y: 1000 }, { x: 1920, y: 1000 });
	it("rises in a gentle arc, about 12 tiles a second", () => {
		expect(BALLOON_SPEED).toBe(192);
		expect(p).toEqual({ from: { x: 0, y: 1000 }, to: { x: 1920, y: 1000 }, top: 680, ms: 13333 });
		expect(pathAt(p, 0)).toEqual({ x: 0, y: 1000, done: false });
		expect(pathAt(p, p.ms / 2)).toEqual({ x: 960, y: 680, done: false });
		expect(pathAt(p, p.ms)).toEqual({ x: 1920, y: 1000, done: true });
		expect(pathAt(p, 99_999)).toEqual(pathAt(p, p.ms));
		expect(pathAt(p, Number.NaN).done).toBe(true);
	});
	it("rises at least four tiles over a short hop", () => {
		expect(balloonPath({ x: 0, y: 1000 }, { x: 100, y: 1000 }).top).toBe(936);
	});
	it("boards at home's dock and lands three columns in from the end that faces where it came from", () => {
		expect(boardingOf(HOME_ISLAND, HOME_ISLAND)).toEqual({ x: 508.5 * 16, y: 86 * 16 });
		expect(landingOf(EAST, HOME_ISLAND)).toEqual({ x: 533.5 * 16, y: 70 * 16 });
		expect(landingOf(HOME_ISLAND, EAST)).toEqual({ x: 502.5 * 16, y: 86 * 16 });
		expect(boardingOf(EAST, HOME_ISLAND)).toEqual(landingOf(EAST, HOME_ISLAND));
	});
});

describe("walking between islands (spec 3.4, 4.6)", () => {
	const bridge = deckOf([board(506, 86), board(507, 87), board(507, 86), board(508, 87), board(529, 71)], 0, 1);
	it("reads a finished bridge's deck: the top board of each column", () => {
		expect(bridge).toMatchObject({ x0: 506, x1: 530, from: 0, to: 1 });
		expect(bridge.rows.slice(0, 3)).toEqual([86, 86, 87]);
		expect(bridge.rows[23]).toBe(71);
	});
	it("puts his feet on an island's top, a deck, or nowhere over the sky", () => {
		const f = floorAt(MAP, [DOCK_DECK]);
		expect(f(470 * 16)).toBe(86 * 16);
		expect(f(507 * 16 + 3)).toBe(86 * 16);
		expect(f(520 * 16)).toBeNull();
		expect(f(560 * 16)).toBe(70 * 16);
		expect(islandOfPx(MAP)(560 * 16)).toBe(1);
		expect(islandOfPx(MAP)(520 * 16)).toBeNull();
	});
	it("walks when a bridge joins the islands, else walks to the boarding spot and boards", () => {
		const decks = [DOCK_DECK, { ...bridge, x0: 506, x1: 530 }];
		expect(nextLeg(MAP, decks, { island: 0, x: 7640 }, { island: 1, x: 9000 })).toEqual({ kind: "walk", x: 9000 });
		expect(nextLeg(MAP, [DOCK_DECK], { island: 0, x: 7640 }, { island: 1, x: 9000 })).toEqual({ kind: "walk", x: 508.5 * 16 });
		const leg = nextLeg(MAP, [DOCK_DECK], { island: 0, x: 508.5 * 16 }, { island: 2, x: 12000 });
		expect(leg.kind).toBe("board");
		if (leg.kind === "board") {
			expect(leg.island).toBe(2);
			expect(leg.path.from).toEqual({ x: 508.5 * 16, y: 86 * 16 });
			expect(leg.path.to).toEqual(landingOf(FAR, HOME_ISLAND));
		}
		expect(nextLeg(MAP, [], { island: 1, x: 9000 }, { island: 1, x: 9100 })).toEqual({ kind: "walk", x: 9100 });
	});
	it("stands to lay a block on that block's island, off its ends", () => {
		expect(standFor({ x: 600, y: 60, tile: "brick", layer: "walls" }, MAP)).toEqual({ island: 1, x: 600.5 * 16 });
		expect(standFor({ x: 530, y: 60, tile: "brick", layer: "walls" }, MAP)).toEqual({ island: 1, x: 531.5 * 16 });
		expect(standFor({ x: 515, y: 80, tile: "plank", layer: "floor" }, MAP)).toEqual({ island: 0, x: 504.5 * 16 });
	});
	it("waits by one of his builds when the budget is dry, the same spot for the same slot", () => {
		const spot = idleSpot(MAP, [560 * 16, 600 * 16], 1, 7, 42);
		expect(idleSpot(MAP, [560 * 16, 600 * 16], 1, 7, 42)).toBe(spot);
		expect(spot).toBeGreaterThanOrEqual(531 * 16);
		expect(spot).toBeLessThan(629 * 16);
		const bare = idleSpot(MAP, [], 2, 3, 42);
		expect(bare).toBeGreaterThanOrEqual(701 * 16);
		expect(bare).toBeLessThan(799 * 16);
	});
});

import { describe, expect, it } from "vitest";
import { newActor } from "../actor";
import { START_X } from "../blueprints";
import { CASTLE_BLOCKS } from "../blueprints/castle";
import { TILE } from "../blueprints/types";
import { poolsOf } from "../texture";
import { TILE_IDS, TILES } from "../tiles";
import { BALLOON_BASKET, BALLOON_ENVELOPE, BALLOON_ROPES, bridgeEnd, DOCK_BLOCKS, DOCK_BOARD_X, DOCK_DECK, DOCK_END_X, HOME_ISLAND, HOME_TOP, homeGround, homePx, homePy, RIDE_FEET, shiftBlocks } from "./home";
import { columnOf, islandAt, islandById, surfaceAt } from "./lookup";
import { BIG_H, BIG_W, HOME_DX, HOME_DY } from "./types";

describe("the home island in the big world", () => {
	it("is today's island moved by the offset: its left end on 448, its snow row on 86", () => {
		const g = homeGround();
		expect(g).toHaveLength(507);
		expect(Math.min(...g.map((b) => b.x))).toBe(448);
		expect(Math.max(...g.map((b) => b.x))).toBe(505);
		const snow = g.filter((b) => b.y === 86);
		expect(snow).toHaveLength(58);
		expect(snow.find((b) => b.x === 448)?.tile).toBe("snow-edge-l");
		expect(snow.find((b) => b.x === 505)?.tile).toBe("snow-edge-r");
		expect([HOME_DX, HOME_DY, HOME_TOP, BIG_W, BIG_H]).toEqual([445, 60, 86, 1024, 160]);
	});
	it("is island 0, flat at row 86", () => {
		expect(HOME_ISLAND).toEqual({ id: 0, x0: 448, x1: 506, ground: 86, top: Array.from({ length: 58 }, () => 86), home: true });
	});
	it("moves the castle's blocks and world px by the same offset", () => {
		expect(shiftBlocks(CASTLE_BLOCKS.hall, HOME_DX, HOME_DY).find((b) => b.tile === "door")).toMatchObject({ x: 477, y: 84 });
		expect(homePx(START_X)).toBe(7640);
		expect(homePy(26 * TILE)).toBe(86 * TILE);
	});
	it("puts the dock off the island's east end, level with its snow, its far board clear above for a bridge", () => {
		for (const b of DOCK_BLOCKS) {
			expect(b.x).toBeGreaterThanOrEqual(506);
			expect(b.x).toBeLessThanOrEqual(509);
			expect(b.layer).toBe("ground");
			expect(TILE_IDS).toContain(b.tile);
		}
		expect(DOCK_BLOCKS.filter((b) => b.y === 86 && b.tile === "bridge-board").map((b) => b.x)).toEqual([506, 507, 508, 509]);
		expect(DOCK_BLOCKS.filter((b) => b.x === DOCK_END_X && b.y < 86)).toEqual([]);
		expect(DOCK_BLOCKS.some((b) => b.tile === "rope")).toBe(false); // no loose rope in the air (the look pass)
		expect([DOCK_BOARD_X, DOCK_END_X]).toEqual([508, 509]);
		expect(DOCK_DECK).toEqual({ x0: 506, x1: 510, rows: [86, 86, 86, 86], from: 0, to: 0 });
		for (const c of [...BALLOON_ENVELOPE, BALLOON_BASKET]) expect(TILE_IDS).toContain(c.tile);
	});
	it("makes the balloon big enough for him: a 3 by 3 envelope over his head, a full-tile basket with its rim at his waist, the same height moored and ridden", () => {
		expect(BALLOON_ENVELOPE).toHaveLength(9);
		const xs = [...new Set(BALLOON_ENVELOPE.map((c) => c.dx))].sort((a, b) => a - b);
		const ys = [...new Set(BALLOON_ENVELOPE.map((c) => c.dy))].sort((a, b) => a - b);
		expect(xs).toEqual([-24, -8, 8]);
		expect(ys[1] - ys[0]).toBe(TILE);
		expect(ys[2] - ys[1]).toBe(TILE);
		expect(ys[2] + TILE).toBeLessThanOrEqual(-32 - 8); // its throat clears his head (32 px) with room for the ropes
		expect(BALLOON_BASKET).toMatchObject({ dx: -8, dy: -16 });
		const basket = TILES[BALLOON_BASKET.tile];
		expect(basket[0].replace(/\./g, "").length).toBeGreaterThan(8); // the rim on the cell's top row: 16 px over his feet
		expect(basket[15].replace(/\./g, "").length).toBeGreaterThan(8);
		expect(RIDE_FEET).toBe(0);
		for (const r of BALLOON_ROPES) expect([r.top, r.bottom]).toEqual([ys[2] + TILE - 2, -16]);
	});
	it("meets a rope bridge at an island's end column on its top row, and east of home at the dock's far board", () => {
		const east = { id: 1, x0: 530, x1: 630, ground: 70, top: Array.from({ length: 100 }, (_, i) => (i < 99 ? 70 : 71)), home: false };
		expect(bridgeEnd(HOME_ISLAND, "east")).toEqual({ x: 509, y: 86 });
		expect(bridgeEnd(HOME_ISLAND, "west")).toEqual({ x: 448, y: 86 });
		expect(bridgeEnd(east, "west")).toEqual({ x: 530, y: 70 });
		expect(bridgeEnd(east, "east")).toEqual({ x: 629, y: 71 });
	});
	it("pools lamp light on the floor it is given, and on the snow row by default", () => {
		const lamp = { x: 470, y: 83, tile: "lantern" as const, layer: "lanterns" as const };
		expect(poolsOf([lamp])[0].y).toBe(26 * TILE + 1);
		expect(poolsOf([lamp], () => 86 * TILE)[0]).toMatchObject({ x: 470.5 * TILE, y: 86 * TILE + 1 });
	});
	it("gives him a height and an island, the snow row and home by default", () => {
		expect(newActor(100, 0, 12)).toMatchObject({ y: 26 * TILE, island: 0, ride: null });
		expect(newActor(7640, 0, 12, { y: 86 * TILE, island: 0 })).toMatchObject({ x: 7640, y: 1376 });
	});
});

describe("finding the ground", () => {
	const east = { id: 1, x0: 520, x1: 600, ground: 70, top: Array.from({ length: 80 }, (_, i) => (i < 40 ? 70 : 72)), home: false };
	const map = { islands: [HOME_ISLAND, east] };
	it("finds the island under a column, and none over the sky", () => {
		expect(islandAt(map, 448)?.id).toBe(0);
		expect(islandAt(map, 505.9)?.id).toBe(0);
		expect(islandAt(map, 506)).toBeNull();
		expect(islandAt(map, 559)?.id).toBe(1);
		expect(islandById(map, 1)?.x0).toBe(520);
		expect(islandById(map, 7)).toBeNull();
	});
	it("gives the row he stands on, steps included", () => {
		expect(surfaceAt(map, 470)).toBe(86);
		expect(surfaceAt(map, 559)).toBe(70);
		expect(surfaceAt(map, 560)).toBe(72);
		expect(surfaceAt(map, 510)).toBeNull();
		expect(columnOf(8136)).toBe(508);
	});
});

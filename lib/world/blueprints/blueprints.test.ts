import { describe, expect, it } from "vitest";
import { SKY_TILES, TALLEST_TILES } from "../camera";
import { TILE_IDS, TILES } from "../tiles";
import { CASTLE, CASTLE_BLOCKS, DOOR_X } from "./castle";
import { HALL } from "./hall";
import { blocksOf, ISLAND_LEFT, ISLAND_RIGHT, REST_X, standX, START_X } from "./index";
import { ISLAND } from "./island";
import { CASTLE_ROOMS, GROUND_Y, LAYER_ORDER, TILE, WORLD_H, WORLD_W, type Blueprint, type CastleRoom } from "./types";

const ROOMS = CASTLE_ROOMS.filter((r) => r !== "hall");
const decor = (b: { layer: string }) => b.layer === "lanterns" || b.layer === "banners";
const key = (x: number, y: number) => `${x},${y}`;
const width = (bp: Blueprint) => bp.map[0].length;
// True when the room's map cell at world (x, y) is a tile with no transparent pixel.
const opaque = (bp: Blueprint, x: number, y: number): boolean => {
	const ch = bp.map[y - bp.y]?.[x - bp.x];
	const entry = ch && ch !== "." ? bp.legend[ch] : undefined;
	return entry !== undefined && !TILES[entry.tile].join("").includes(".");
};

describe.each([ISLAND, ...CASTLE_ROOMS.map((r) => CASTLE[r])])("the $room blueprint", (bp: Blueprint) => {
	it("is a rectangle, its decor the same size or empty, every letter in the legend", () => {
		const w = bp.map[0].length;
		for (const row of bp.map) expect(row.length).toBe(w);
		if (bp.decor.length > 0) {
			expect(bp.decor.length).toBe(bp.map.length);
			for (const row of bp.decor) expect(row.length).toBe(w);
		}
		for (const ch of [...bp.map.join(""), ...bp.decor.join("")]) if (ch !== ".") expect(bp.legend[ch], ch).toBeDefined();
		for (const entry of Object.values(bp.legend)) expect(TILE_IDS).toContain(entry.tile);
	});
	it("fits inside the world", () => {
		for (const b of blocksOf(bp)) {
			expect(b.x).toBeGreaterThanOrEqual(0);
			expect(b.x).toBeLessThan(WORLD_W);
			expect(b.y).toBeGreaterThanOrEqual(0);
			expect(b.y).toBeLessThan(WORLD_H);
		}
	});
});

describe("the hall", () => {
	const blocks = blocksOf(HALL);
	it("has 180 blocks, each laid exactly once", () => {
		expect(blocks).toHaveLength(180);
		expect(new Set(blocks.map((b) => `${b.x},${b.y},${decor(b) ? "decor" : "map"}`)).size).toBe(180);
	});
	it("counts each layer", () => {
		expect(LAYER_ORDER.map((l) => blocks.filter((b) => b.layer === l).length)).toEqual([0, 17, 99, 52, 4, 2, 2, 4]);
	});
	it("lays the floor, the walls upward, the roof, then windows, door, lanterns and banners", () => {
		const rank = blocks.map((b) => LAYER_ORDER.indexOf(b.layer));
		for (let i = 1; i < rank.length; i++) expect(rank[i]).toBeGreaterThanOrEqual(rank[i - 1]);
		for (const layer of LAYER_ORDER) {
			const ys = blocks.filter((b) => b.layer === layer).map((b) => b.y);
			for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThanOrEqual(ys[i - 1]);
		}
	});
	it("never lays a block in mid-air", () => {
		const placed = new Set<string>();
		for (const b of blocks) {
			if (!decor(b)) {
				const held = b.y + 1 === GROUND_Y || placed.has(key(b.x, b.y + 1)) || placed.has(key(b.x - 1, b.y)) || placed.has(key(b.x + 1, b.y));
				expect(held, `${b.tile} at ${b.x},${b.y}`).toBe(true);
				placed.add(key(b.x, b.y));
			}
		}
	});
	it("stands where it always stood, with its door at the centre (saved progress counts its blocks)", () => {
		expect([HALL.x, HALL.y, width(HALL), HALL.map.length]).toEqual([23, 11, 19, 15]);
		expect(blocks.filter((b) => b.layer === "floor").every((b) => b.y + 1 === GROUND_Y)).toBe(true);
		expect(blocks.find((b) => b.tile === "door")?.x).toBe(32);
		expect(START_X).toBe(32.5 * TILE);
	});
});

// The five rooms of phase 2. Their block counts are pinned, because saved progress counts blocks: change a room's map
// only before it ships, and re-pin here when you do.
const COUNTS: Readonly<Record<Exclude<CastleRoom, "hall">, number>> = {
	library: 84,
	workshop: 101,
	study: 57,
	gate: 67,
	observatory: 147,
};

describe.each(ROOMS)("the %s", (room) => {
	const bp = CASTLE[room];
	const blocks = CASTLE_BLOCKS[room];
	it("has its pinned number of blocks, each laid exactly once", () => {
		expect(blocks).toHaveLength(COUNTS[room]);
		expect(new Set(blocks.map((b) => `${b.x},${b.y},${decor(b) ? "decor" : "map"}`)).size).toBe(blocks.length);
	});
	it("lays the floor first, then the walls, the roof, windows, door, lanterns and banners", () => {
		const rank = blocks.map((b) => LAYER_ORDER.indexOf(b.layer));
		for (let i = 1; i < rank.length; i++) expect(rank[i]).toBeGreaterThanOrEqual(rank[i - 1]);
		expect(blocks[0].layer).toBe("floor");
		for (const layer of ["walls", "roof"] as const) expect(blocks.some((b) => b.layer === layer), layer).toBe(true);
		expect(blocks.some((b) => b.layer === "ground")).toBe(false);
	});
	it("never lays a block in mid-air (a wing may lean on the hall, which is always built first)", () => {
		const placed = new Set(CASTLE_BLOCKS.hall.filter((b) => !decor(b)).map((b) => key(b.x, b.y)));
		for (const b of blocks) {
			if (decor(b)) continue;
			const held = b.y + 1 === GROUND_Y || placed.has(key(b.x, b.y + 1)) || placed.has(key(b.x - 1, b.y)) || placed.has(key(b.x + 1, b.y));
			expect(held, `${b.tile} at ${b.x},${b.y}`).toBe(true);
			placed.add(key(b.x, b.y));
		}
	});
	it("hangs its lanterns and banners on its own walls", () => {
		const own = new Set(blocks.filter((b) => !decor(b)).map((b) => key(b.x, b.y)));
		for (const b of blocks.filter(decor)) expect(own.has(key(b.x, b.y)), `${b.tile} at ${b.x},${b.y}`).toBe(true);
	});
	it("stands on the island's snow, inside its ends, with one door on its floor", () => {
		expect(bp.y + bp.map.length).toBe(GROUND_Y);
		for (const b of blocks.filter((x) => x.layer === "floor")) expect(b.y + 1).toBe(GROUND_Y);
		for (const b of blocks) {
			expect(b.x).toBeGreaterThan(ISLAND_LEFT);
			expect(b.x).toBeLessThan(ISLAND_RIGHT);
		}
		const doors = blocks.filter((b) => b.tile === "door");
		expect(doors).toHaveLength(1);
		expect(doors[0].y).toBe(GROUND_Y - 2);
	});
	it("stays inside the sky the camera keeps over the hall", () => {
		expect(bp.y).toBeGreaterThanOrEqual(GROUND_Y - TALLEST_TILES - SKY_TILES);
	});
});

describe("the castle", () => {
	const all = CASTLE_ROOMS.flatMap((room) => CASTLE_BLOCKS[room]);
	it("never puts two rooms in one cell", () => {
		const cells = all.map((b) => `${b.x},${b.y},${decor(b) ? "decor" : "map"}`);
		expect(new Set(cells).size).toBe(cells.length);
	});
	it("runs gate, study, library, hall, workshop, observatory from west to east, with the doors where he stands", () => {
		const order = [...CASTLE_ROOMS].sort((a, b) => CASTLE[a].x - CASTLE[b].x);
		expect(order).toEqual(["gate", "study", "library", "hall", "workshop", "observatory"]);
		expect(DOOR_X).toEqual({ hall: 32, library: 21, workshop: 44, study: 13, gate: 7, observatory: 55 });
	});
	it("reads as one building: the row above the floor is wall from x 4 to x 59", () => {
		const row = new Set(all.filter((b) => b.y === GROUND_Y - 2 && !decor(b)).map((b) => b.x));
		for (let x = ISLAND_LEFT + 1; x < ISLAND_RIGHT; x++) expect(row.has(x), `x ${x}`).toBe(true);
	});
	it("has the observatory highest, and every other new room lower than the hall's peak", () => {
		const top = (room: CastleRoom) => Math.min(...CASTLE_BLOCKS[room].map((b) => b.y));
		for (const room of CASTLE_ROOMS) if (room !== "observatory") expect(top("observatory")).toBeLessThan(top(room));
		for (const room of ROOMS) if (room !== "observatory") expect(top(room)).toBeGreaterThan(top("hall"));
	});
});

describe("the island", () => {
	const ground = blocksOf(ISLAND);
	it("has snow along its whole top row, 58 wide since the look pass, with a flagstone path in it", () => {
		const top = ground.filter((b) => b.y === GROUND_Y);
		expect(top).toHaveLength(58);
		expect(top.every((b) => b.tile.startsWith("snow") || b.tile === "path")).toBe(true);
		expect(top.filter((b) => b.tile === "path").every((b) => b.x < HALL.x + 1)).toBe(true);
		expect(top.find((b) => b.x === ISLAND_LEFT)?.tile).toBe("snow-edge-l");
		expect(top.find((b) => b.x === ISLAND_RIGHT)?.tile).toBe("snow-edge-r");
	});
	it("has no bench or lantern post any more: he rests on the hall's step, between its two lanterns", () => {
		expect(ground.some((b) => b.tile === "bench" || b.tile === "lantern-post" || b.tile === "lantern")).toBe(false);
		expect(REST_X).toBe(START_X);
		const lanterns = CASTLE_BLOCKS.hall.filter((b) => b.tile === "lantern").map((b) => b.x);
		expect(Math.min(...lanterns)).toBeLessThan(REST_X / TILE);
		expect(Math.max(...lanterns)).toBeGreaterThan(REST_X / TILE);
	});
	it("is wider than the hall by a good margin on both sides, and tapers below", () => {
		expect(HALL.x - ISLAND_LEFT).toBeGreaterThanOrEqual(15);
		expect(ISLAND_RIGHT - (HALL.x + HALL.map[0].length - 1)).toBeGreaterThanOrEqual(15);
		const widthAt = (y: number) => ground.filter((b) => b.y === y && b.layer === "ground" && !b.tile.startsWith("root")).length;
		expect(widthAt(GROUND_Y + 1)).toBeGreaterThan(widthAt(GROUND_Y + 5));
		expect(widthAt(GROUND_Y + 5)).toBeGreaterThan(widthAt(GROUND_Y + 9));
	});
	it("keeps the scenery off the hall, and behind solid cells where another room will stand", () => {
		const scenery = ground.filter((b) => b.y < GROUND_Y);
		expect(scenery.length).toBeGreaterThan(20);
		for (const b of scenery) {
			expect(b.x < HALL.x || b.x >= HALL.x + width(HALL), `${b.tile} at ${b.x}`).toBe(true);
			for (const room of ROOMS) {
				const bp = CASTLE[room];
				const inside = b.x >= bp.x && b.x < bp.x + width(bp) && b.y >= bp.y && b.y < bp.y + bp.map.length;
				if (inside) expect(opaque(bp, b.x, b.y), `${b.tile} at ${b.x},${b.y} behind the ${room}`).toBe(true);
			}
		}
	});
	it("lets him stand only on the island", () => {
		expect(standX({ x: 0, y: 20, tile: "brick", layer: "walls" })).toBe((ISLAND_LEFT + 1.5) * TILE);
		expect(standX({ x: 99, y: 20, tile: "brick", layer: "walls" })).toBe((ISLAND_RIGHT - 0.5) * TILE);
		expect(standX({ x: 30, y: 20, tile: "brick", layer: "walls" })).toBe(30.5 * TILE);
	});
});

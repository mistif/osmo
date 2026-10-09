import { describe, expect, it } from "vitest";
import { TILE_IDS } from "../tiles";
import { HALL } from "./hall";
import { blocksOf, ISLAND_LEFT, ISLAND_RIGHT, REST_X, standX, START_X } from "./index";
import { ISLAND } from "./island";
import { GROUND_Y, LAYER_ORDER, TILE, WORLD_H, WORLD_W, type Blueprint } from "./types";

describe.each([ISLAND, HALL])("the $room blueprint", (bp: Blueprint) => {
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
	const decor = (b: { layer: string }) => b.layer === "lanterns" || b.layer === "banners";
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
		const key = (x: number, y: number) => `${x},${y}`;
		for (const b of blocks) {
			if (!decor(b)) {
				const held = b.y + 1 === GROUND_Y || placed.has(key(b.x, b.y + 1)) || placed.has(key(b.x - 1, b.y)) || placed.has(key(b.x + 1, b.y));
				expect(held, `${b.tile} at ${b.x},${b.y}`).toBe(true);
				placed.add(key(b.x, b.y));
			}
		}
	});
	it("stands on the island with its door at the centre", () => {
		expect(blocks.filter((b) => b.layer === "floor").every((b) => b.y + 1 === GROUND_Y)).toBe(true);
		expect(blocks.find((b) => b.tile === "door")?.x).toBe(32);
		expect(START_X).toBe(32.5 * TILE);
	});
});

describe("the island", () => {
	const ground = blocksOf(ISLAND);
	it("has snow along its whole top row", () => {
		const top = ground.filter((b) => b.y === GROUND_Y);
		expect(top).toHaveLength(48);
		expect(top.find((b) => b.x === ISLAND_LEFT)?.tile).toBe("snow-edge-l");
		expect(top.find((b) => b.x === ISLAND_RIGHT)?.tile).toBe("snow-edge-r");
	});
	it("has the bench and the lantern where he rests", () => {
		expect(ground.find((b) => b.tile === "bench")).toMatchObject({ x: 47, y: 25 });
		expect(ground.find((b) => b.tile === "lantern-post")).toMatchObject({ x: 49, y: 25 });
		expect(ground.find((b) => b.tile === "lantern")).toMatchObject({ x: 49, y: 24 });
		expect(REST_X).toBe(47.5 * TILE);
	});
	it("lets him stand only on the island", () => {
		expect(standX({ x: 0, y: 20, tile: "brick", layer: "walls" })).toBe((ISLAND_LEFT + 1.5) * TILE);
		expect(standX({ x: 99, y: 20, tile: "brick", layer: "walls" })).toBe((ISLAND_RIGHT - 0.5) * TILE);
		expect(standX({ x: 30, y: 20, tile: "brick", layer: "walls" })).toBe(30.5 * TILE);
	});
});

import { describe, expect, it } from "vitest";
import { generateWorld, maxIslands } from "./generate";
import { HOME_ISLAND, homeGround } from "./home";
import { BIG_H, BIG_W, MAX_ISLANDS, START_ISLANDS } from "./types";

const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 1);
const key = (b: { x: number; y: number; tile: string }) => `${b.x},${b.y},${b.tile}`;
const SCENERY = ["trunk-base", "pine-l", "pine-c", "pine-r", "pine-small", "pine-tip", "bush", "tuft", "grass"];

describe("the generator, version 1", () => {
	it("gives the same world for the same seed, version and count, and another for another seed", () => {
		expect(generateWorld(42, 1, 4)).toEqual(generateWorld(42, 1, 4));
		expect(generateWorld(42, 1, 4).islands).not.toEqual(generateWorld(43, 1, 4).islands);
	});
	it("keeps today's island at its offset, unchanged", () => {
		const w = generateWorld(42, 1, 4);
		expect(w.islands[0]).toEqual(HOME_ISLAND);
		expect(new Set(w.ground.filter((b) => b.x >= 448 && b.x < 506).map(key))).toEqual(new Set(homeGround().map(key)));
	});
	it("keeps the first islands when more have risen", () => {
		expect(generateWorld(42, 1, maxIslands(42, 1)).islands.slice(0, 4)).toEqual(generateWorld(42, 1, 4).islands);
	});
	it("clamps the count to 1 .. maxIslands, and refuses a version it does not know", () => {
		expect(generateWorld(42, 1, 0).islands).toHaveLength(1);
		expect(generateWorld(42, 1, 99).islands).toHaveLength(maxIslands(42, 1));
		expect(() => generateWorld(42, 2, 4)).toThrow("unknown generator version 2");
		expect(() => maxIslands(42, 0)).toThrow("unknown generator version 0");
	});
	it.each(SEEDS)("seed %i: 4 to 8 islands, 80 to 200 wide, 20 to 60 apart, 12 to 30 rows from home, inside the world", (seed) => {
		const max = maxIslands(seed, 1);
		expect(max).toBeGreaterThanOrEqual(START_ISLANDS);
		expect(max).toBeLessThanOrEqual(MAX_ISLANDS);
		const w = generateWorld(seed, 1, max);
		const byX = [...w.islands].sort((a, b) => a.x0 - b.x0);
		for (let k = 1; k < byX.length; k++) {
			const gap = byX[k].x0 - byX[k - 1].x1;
			expect(gap).toBeGreaterThanOrEqual(20);
			expect(gap).toBeLessThanOrEqual(60);
		}
		for (const i of w.islands.slice(1)) {
			expect(i.x1 - i.x0).toBeGreaterThanOrEqual(80);
			expect(i.x1 - i.x0).toBeLessThanOrEqual(200);
			expect(Math.abs(i.ground - 86)).toBeGreaterThanOrEqual(12);
			expect(Math.abs(i.ground - 86)).toBeLessThanOrEqual(30);
			expect(i.top).toHaveLength(i.x1 - i.x0);
			expect(i.x0).toBeGreaterThanOrEqual(2);
			expect(i.x1).toBeLessThanOrEqual(BIG_W - 2);
		}
		for (const b of w.ground) {
			expect(b.x >= 0 && b.x < BIG_W && b.y >= 0 && b.y < BIG_H, `${b.tile} at ${b.x},${b.y}`).toBe(true);
			expect(b.layer).toBe("ground");
		}
	});
	it.each(SEEDS)("seed %i: every top is walkable, with a level run of at least 24 at the ground row, snow on every column", (seed) => {
		const w = generateWorld(seed, 1, maxIslands(seed, 1));
		const snow = new Map(w.ground.filter((b) => b.tile.startsWith("snow")).map((b) => [`${b.x},${b.y}`, b.tile]));
		for (const i of w.islands.slice(1)) {
			let run = 1;
			let best = 0;
			for (let c = 0; c < i.top.length; c++) {
				expect(Math.abs(i.top[c] - i.ground)).toBeLessThanOrEqual(3);
				if (c > 0) {
					expect(Math.abs(i.top[c] - i.top[c - 1])).toBeLessThanOrEqual(2);
					run = i.top[c] === i.top[c - 1] ? run + 1 : 1;
				}
				if (i.top[c] === i.ground) best = Math.max(best, run);
				expect(snow.has(`${i.x0 + c},${i.top[c]}`), `column ${i.x0 + c}`).toBe(true);
			}
			expect(best).toBeGreaterThanOrEqual(24);
			expect(snow.get(`${i.x0},${i.top[0]}`)).toBe("snow-edge-l");
			expect(snow.get(`${i.x1 - 1},${i.top[i.top.length - 1]}`)).toBe("snow-edge-r");
		}
	});
	it("stands only scenery above an island's top", () => {
		const w = generateWorld(7, 1, 4);
		for (const i of w.islands.slice(1)) {
			const above = w.ground.filter((b) => b.x >= i.x0 && b.x < i.x1 && b.y < i.top[b.x - i.x0]);
			expect(above.length).toBeGreaterThan(0);
			for (const b of above) expect(SCENERY).toContain(b.tile);
		}
	});
});

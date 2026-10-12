import { describe, expect, it, vi } from "vitest";
import type { Block } from "./blueprints/types";
import { bucket, chunkCache, chunkKey, chunkRange } from "./chunks";

const b = (x: number, y: number, tile: Block["tile"] = "brick"): Block => ({ x, y, tile, layer: "walls" });
const cam = (x: number, y: number, z: number) => ({ x, y, from: z, to: z, at: 0, aimX: x, aimY: y, ox: 0, oy: 0, glideAt: Number.NEGATIVE_INFINITY });

describe("chunks", () => {
	it("groups a list by 32 by 32 tile chunk, each chunk in the list's own order, kept per list", () => {
		const list = [b(1, 1), b(40, 2), b(2, 1, "lantern"), b(33, 33)];
		const m = bucket(list);
		expect(m.get(chunkKey(0, 0))?.blocks).toEqual([b(1, 1), b(2, 1, "lantern")]);
		expect(m.get(chunkKey(1, 0))?.blocks).toEqual([b(40, 2)]);
		expect(m.get(chunkKey(1, 1))?.blocks).toEqual([b(33, 33)]);
		expect(bucket(list)).toBe(m);
	});
	it("signs each chunk by its contents, not just its count", () => {
		const one = bucket([b(1, 1)]).get(chunkKey(0, 0))?.sig;
		expect(bucket([b(1, 1)]).get(chunkKey(0, 0))?.sig).toBe(one);
		expect(bucket([b(2, 1)]).get(chunkKey(0, 0))?.sig).not.toBe(one);
		expect(bucket([b(1, 1, "stone")]).get(chunkKey(0, 0))?.sig).not.toBe(one);
	});
	it("finds the chunks the view touches, with the margin asked for", () => {
		expect(chunkRange(cam(7640, 1300, 1), { w: 1920, h: 1080 }, 0)).toEqual({ cx0: 12, cx1: 17, cy0: 0, cy1: 4 });
		expect(chunkRange(cam(7640, 1300, 1), { w: 1920, h: 1080 }, 0, 0)).toEqual({ cx0: 13, cx1: 16, cy0: 1, cy1: 3 });
		expect(chunkRange(cam(7640, 1300, 0), { w: 1920, h: 1080 }, 0)).toEqual({ cx0: 0, cx1: -1, cy0: 0, cy1: -1 });
	});
});

describe("the chunk cache both painters use (spec 3.3: released on eviction)", () => {
	const made = () => {
		let n = 0;
		return () => ({ n: n++ });
	};
	it("bakes once per version, keeps at most `keep`, and frees the least recently drawn", () => {
		const free = vi.fn();
		const c = chunkCache(2, made(), free);
		const bake = vi.fn();
		expect(c.get("a", "1", true, bake)?.state).toBe("baked");
		expect(c.get("a", "1", true, bake)?.state).toBe("kept");
		expect(bake).toHaveBeenCalledTimes(1);
		c.get("b", "1", true, bake);
		c.get("a", "1", true, bake); // "a" is now the most recently drawn
		c.get("c", "1", true, bake); // so "b" goes
		expect(free).toHaveBeenCalledTimes(1);
		expect(free).toHaveBeenCalledWith({ n: 1 });
		expect(c.stats).toMatchObject({ made: 3, baked: 3, released: 1 });
		expect(c.stats.kept()).toBe(2);
	});
	it("bakes a stale version again in its own bitmap, and nothing at all when it may not bake", () => {
		const free = vi.fn();
		const c = chunkCache(2, made(), free);
		const bake = vi.fn();
		const first = c.get("a", "1", true, bake);
		expect(c.get("a", "2", false, bake)).toBeNull();
		expect(c.get("z", "1", false, bake)).toBeNull();
		expect(c.stats).toMatchObject({ made: 1, baked: 1 });
		const again = c.get("a", "2", true, bake);
		expect(again).toEqual({ t: first?.t, state: "baked" });
		expect(c.stats).toMatchObject({ made: 1, baked: 2, released: 0 });
	});
	it("frees every kept bitmap on release", () => {
		const free = vi.fn();
		const c = chunkCache(4, made(), free);
		for (const k of ["a", "b", "c"]) c.get(k, "1", true, () => {});
		c.release();
		expect(free).toHaveBeenCalledTimes(3);
		expect(c.stats.kept()).toBe(0);
		expect(c.stats.made).toBe(c.stats.kept() + c.stats.released);
	});
});

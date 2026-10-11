import { describe, expect, it } from "vitest";
import { CHUNK_KEEP, CHUNK_PX, deviceRatio, lodOf } from "./lod";

describe("levels of detail", () => {
	it("stamps tiles from 1, draws chunk bitmaps from 1/4, the silhouette below", () => {
		expect([4, 3, 2, 1].map(lodOf)).toEqual(["tiles", "tiles", "tiles", "tiles"]);
		expect([0.999, 0.5, 0.25].map(lodOf)).toEqual(["chunks", "chunks", "chunks"]);
		expect([0.2499, 0.125, 1920 / 16384, 375 / 16384, 0, Number.NaN].map(lodOf)).toEqual(["far", "far", "far", "far", "far", "far"]);
	});
	it("uses a whole device pixel ratio of 1, 2 or 3", () => {
		expect([1, 1.25, 1.5, 2, 2.75, 4, 0.5, 0].map((r) => deviceRatio(r))).toEqual([1, 1, 2, 2, 3, 3, 1, 1]);
		expect(deviceRatio(undefined)).toBe(1);
		expect(deviceRatio(Number.NaN)).toBe(1);
		expect([CHUNK_PX, CHUNK_KEEP.desk, CHUNK_KEEP.phone]).toEqual([512, 48, 16]);
	});
});

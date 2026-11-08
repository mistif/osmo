import { describe, expect, it } from "vitest";
import { CASTLE_ROOMS } from "../blueprints/types";
import { castleAt, castleFootprint } from "../build/castle-sites";
import { builtShare, shouldRise, usableColumns } from "./growth";
import { HOME_ISLAND } from "./home";
import type { Island, WorldMap } from "./types";

const isl = (id: number, x0: number, w: number): Island => ({ id, x0, x1: x0 + w, ground: 60, top: Array.from({ length: w }, () => 60), home: id === 0 });
const map: WorldMap = { seed: 1, gen: 1, islands: [isl(0, 100, 102), isl(1, 300, 102)], ground: [] };

describe("when another island rises", () => {
	it("counts all but an island's two end columns as usable", () => {
		expect(usableColumns(isl(0, 100, 102))).toBe(100);
	});
	it("measures the share of usable columns some build covers, overlaps once, the sky not at all", () => {
		expect(builtShare(map, [])).toBe(0);
		expect(builtShare(map, [{ x: 101, y: 50, w: 50, h: 5 }, { x: 120, y: 40, w: 50, h: 5 }])).toBe(69 / 200);
		expect(builtShare(map, [{ x: 0, y: 0, w: 1024, h: 1 }])).toBe(1);
		expect(builtShare(map, [{ x: 250, y: 0, w: 40, h: 1 }])).toBe(0);
	});
	it("raises one at 80 per cent built, never past the most", () => {
		expect(shouldRise(map, [{ x: 101, y: 0, w: 100, h: 1 }, { x: 301, y: 0, w: 60, h: 1 }], 8)).toBe(true);
		expect(shouldRise(map, [{ x: 101, y: 0, w: 100, h: 1 }, { x: 301, y: 0, w: 59, h: 1 }], 8)).toBe(false);
		expect(shouldRise(map, [{ x: 0, y: 0, w: 1024, h: 1 }], 2)).toBe(false);
	});
	it("sees the finished castle fill the home island", () => {
		const home: WorldMap = { seed: 1, gen: 1, islands: [HOME_ISLAND], ground: [] };
		const rects = CASTLE_ROOMS.map((room) => {
			const at = castleAt(room);
			const fp = castleFootprint(room);
			return { x: at.x, y: at.y, w: fp.map[0].length, h: fp.map.length };
		});
		expect(builtShare(home, rects)).toBe(1);
	});
});

import { describe, expect, it } from "vitest";
import { snapshot } from "./png";
import { colours, gridProblems, rasterize } from "./raster";
import { TILE_IDS, TILES, tileIndex, type TileId } from "./tiles";

const ORDER = [
	"snow", "snow-edge-l", "snow-edge-r", "stone", "stone-dark", "stone-edge-l", "stone-edge-r", "stone-bottom",
	"root", "root-end", "grass", "brick", "brick-dark", "plank", "beam", "beam-h", "glass", "window", "window-top",
	"door", "door-top", "roof-left", "roof-right", "roof-flat", "roof-peak", "battlement", "lantern", "lantern-post",
	"banner", "banner-end", "step", "pillar", "bench", "cloud-l", "cloud-m", "cloud-r", "cloud-top", "cloud-small",
];
// Tiles with no transparent pixel.
const FILLED: TileId[] = [
	"snow", "stone", "stone-dark", "brick", "brick-dark", "plank", "beam-h", "glass", "window", "window-top",
	"door", "door-top", "roof-flat", "step", "pillar",
];
// Tiles whose whole surface must read as lit from the top left.
const LIT: TileId[] = ["snow", "stone", "stone-dark", "brick", "brick-dark", "plank", "beam-h", "roof-flat", "step", "pillar"];

const cols = colours();
const lum = (ch: string): number | null => {
	const c = cols[ch];
	return ch === "." || !c ? null : 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const mean = (chars: string[]) => {
	const v = chars.map(lum).filter((x): x is number => x !== null);
	return v.reduce((a, b) => a + b, 0) / v.length;
};

describe("the tiles", () => {
	it("are the 38 tiles in the fixed cell order", () => {
		expect([...TILE_IDS]).toEqual(ORDER);
		expect(Object.keys(TILES).sort()).toEqual([...ORDER].sort());
		expect(tileIndex("snow")).toBe(0);
		expect(tileIndex("step")).toBe(30);
		expect(tileIndex("cloud-small")).toBe(37);
	});
	it.each([...TILE_IDS])("%s is 16 by 16 in palette letters", (id) => {
		expect(gridProblems(TILES[id], 16, 16)).toEqual([]);
	});
	it("keeps Osmo's letters and the scarf out of the tiles, and draws something in each", () => {
		for (const id of TILE_IDS) {
			expect(TILES[id].join("")).toMatch(/^[a-zA-G.]+$/);
			expect(TILES[id].join("").replace(/\./g, "").length).toBeGreaterThan(20);
		}
	});
	it.each(FILLED)("%s has no transparent pixel", (id) => {
		expect(TILES[id].join("")).not.toContain(".");
	});
	it.each(LIT)("%s is lit from the top left", (id) => {
		const g = TILES[id];
		expect(mean([...g[0]])).toBeGreaterThanOrEqual(mean([...g[15]]));
		expect(mean(g.map((r) => r[0]))).toBeGreaterThanOrEqual(mean(g.map((r) => r[15])) - 2);
	});
	it("keeps the worked example exactly", () => {
		expect(TILES.step[0]).toBe("eddddddaedddddda");
		expect(TILES.step[8]).toBe("dddaeddddddaeddd");
		expect(TILES.step[15]).toBe("aaaaaaaaaaaaaaaa");
	});
	it("writes a contact sheet when WORLD_SNAPSHOT_DIR is set", () => {
		const bmp = rasterize(TILE_IDS.map((id) => TILES[id]), 16, 16, 4, cols);
		snapshot("tiles", bmp);
		expect(bmp.w).toBe(38 * 64);
	});
});

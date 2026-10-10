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
// Appended in the look pass, after the first 38, so their cells (and a tiles.png drawn for them) keep their places.
const ADDED = [
	"window-lit", "window-top-lit", "stone-under-l", "stone-under-r", "stone-hang", "trunk", "trunk-base", "pine-tip",
	"pine-small", "pine-l", "pine-c", "pine-r", "bush", "tuft", "path", "sign", "fence",
];
// Appended for the rooms (village phase 2), after the 55, so every earlier cell keeps its place.
const ROOMS = ["tower-cap", "shelf-window", "forge", "dome-l", "dome", "dome-r"];
// Appended in the polish pass, after the 61.
const POLISH = [
	"brick-2", "brick-3", "stone-2", "stone-3", "snow-2", "snow-3", "shelf-window-lit", "dome-l-lit", "dome-lit", "dome-r-lit",
];
// Tiles with no transparent pixel.
const FILLED: TileId[] = [
	"snow", "stone", "stone-dark", "brick", "brick-dark", "plank", "beam-h", "glass", "window", "window-top",
	"door", "door-top", "roof-flat", "step", "pillar", "shelf-window", "forge", "dome",
	"brick-2", "brick-3", "stone-2", "stone-3", "snow-2", "snow-3", "shelf-window-lit", "dome-lit",
];
// Tiles whose whole surface must read as lit from the top left.
const LIT: TileId[] = [
	"snow", "stone", "stone-dark", "brick", "brick-dark", "plank", "beam-h", "roof-flat", "step", "pillar",
	"brick-2", "brick-3", "stone-2", "stone-3", "snow-2", "snow-3",
];

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
	it("are the 38 tiles in the fixed cell order, then the look pass's, the rooms' and the polish pass's, appended", () => {
		expect([...TILE_IDS]).toEqual([...ORDER, ...ADDED, ...ROOMS, ...POLISH]);
		expect(Object.keys(TILES).sort()).toEqual([...ORDER, ...ADDED, ...ROOMS, ...POLISH].sort());
		expect(tileIndex("fence")).toBe(54);
		expect(tileIndex("tower-cap")).toBe(55);
		expect(tileIndex("dome-r")).toBe(60);
		expect(tileIndex("brick-2")).toBe(61);
		expect(tileIndex("dome-r-lit")).toBe(70);
		expect(tileIndex("snow")).toBe(0);
		expect(tileIndex("step")).toBe(30);
		expect(tileIndex("cloud-small")).toBe(37);
	});
	it.each([...TILE_IDS])("%s is 16 by 16 in palette letters", (id) => {
		expect(gridProblems(TILES[id], 16, 16)).toEqual([]);
	});
	it("keeps Osmo's letters and the scarf out of the tiles, and draws something in each", () => {
		for (const id of TILE_IDS) {
			expect(TILES[id].join("")).not.toMatch(/[H-QZ]/);
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
	it("lights the windows at night in the same frame as by day", () => {
		for (const [day, night] of [["window", "window-lit"], ["window-top", "window-top-lit"]] as const) {
			const d = TILES[day];
			const n = TILES[night];
			let same = 0;
			for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (d[y][x] === n[y][x]) same++;
			expect(same).toBeGreaterThan(128); // the stone round the glass is unchanged
			expect(n.join("")).toMatch(/[tuv]/); // and the glass is lamp light
		}
	});
	it("lays brick in grout darker than the stone's outline (polish pass)", () => {
		expect(lum("0") ?? 255).toBeLessThan(lum("a") ?? 0);
		const grout = TILES.brick.join("").split("0").length - 1;
		expect(grout).toBeGreaterThan(40); // every joint of the bond
		expect(TILES.brick.join("")).not.toContain("a");
		expect(TILES.brick[15]).toBe("0".repeat(16)); // the bed joint under the last course
	});
	it.each([
		["brick", "brick-2"], ["brick", "brick-3"], ["stone", "stone-2"], ["stone", "stone-3"], ["snow", "snow-2"], ["snow", "snow-3"],
	] as const)("%s's variant %s joins its neighbours as %s does, and is its own inside (polish pass)", (base, variant) => {
		const b = TILES[base];
		const v = TILES[variant];
		expect(v[0]).toBe(b[0]);
		expect(v[15]).toBe(b[15]);
		for (let y = 0; y < 16; y++) {
			expect(v[y][0], `${variant} ${y}`).toBe(b[y][0]);
			expect(v[y][15], `${variant} ${y}`).toBe(b[y][15]);
		}
		let differ = 0;
		for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if (v[y][x] !== b[y][x]) differ++;
		expect(differ).toBeGreaterThanOrEqual(12);
		expect(differ).toBeLessThanOrEqual(150); // still the same material
	});
	it("tells the two variants of each apart (polish pass)", () => {
		expect(TILES["brick-2"]).not.toEqual(TILES["brick-3"]);
		expect(TILES["stone-2"]).not.toEqual(TILES["stone-3"]);
		expect(TILES["snow-2"]).not.toEqual(TILES["snow-3"]);
	});
	it("lights the bookcase window and the dome at night in the same frame as by day (polish pass)", () => {
		for (const [day, night] of [["shelf-window", "shelf-window-lit"], ["dome-l", "dome-l-lit"], ["dome", "dome-lit"], ["dome-r", "dome-r-lit"]] as const) {
			const d = TILES[day];
			const n = TILES[night];
			let same = 0;
			for (let y = 0; y < 16; y++) {
				for (let x = 0; x < 16; x++) {
					if (d[y][x] === n[y][x]) same++;
					expect(n[y][x] === ".", `${night} ${x},${y}`).toBe(d[y][x] === "."); // the same outline against the sky
				}
			}
			expect(same, night).toBeGreaterThan(day === "dome" ? 40 : 96); // the frame, the cames, the rim are unchanged
			expect(n.join(""), night).toMatch(/[tuv]/); // lamp light behind the glass
			expect(n.join("").replace(/[^tuv]/g, "").length, night).toBeGreaterThan(day === "shelf-window" ? 20 : 30);
		}
	});
	it("keeps the worked example exactly", () => {
		expect(TILES.step[0]).toBe("eddddddaedddddda");
		expect(TILES.step[8]).toBe("dddaeddddddaeddd");
		expect(TILES.step[15]).toBe("aaaaaaaaaaaaaaaa");
	});
	it("writes a contact sheet when WORLD_SNAPSHOT_DIR is set", () => {
		const bmp = rasterize(TILE_IDS.map((id) => TILES[id]), 16, 16, 4, cols);
		snapshot("tiles", bmp);
		expect(bmp.w).toBe(TILE_IDS.length * 64);
	});
});

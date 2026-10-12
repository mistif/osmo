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
// Appended for the free-will builds (tiles-more.ts), after the 71.
const FREE_WILL = [
	"plank-wall", "stone-wall", "back-wood", "back-stone", "post", "shutter", "thatch-l", "thatch-r", "thatch-flat", "thatch-peak",
	"rope", "bridge-board", "leaves", "fruit-leaves", "hedge", "water", "water-top", "flowers", "soil", "glass-wall",
	"glass-roof-l", "glass-roof-r", "balloon-tl", "balloon-tr", "balloon-bl", "balloon-br", "basket", "bell", "awning", "sail",
	"statue", "arch", "rail", "plank-wall-2", "stone-wall-2",
];
// Appended in the free-will fix round, after the 106.
const FIX_ROUND = ["deck", "spire-l", "spire-r", "spire-l-hi", "spire-r-hi", "spire-peak"];
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
	it("are the 38 tiles in the fixed cell order, then the look pass's, the rooms', the polish pass's and the free-will tiles, appended", () => {
		expect([...TILE_IDS]).toEqual([...ORDER, ...ADDED, ...ROOMS, ...POLISH, ...FREE_WILL, ...FIX_ROUND]);
		expect(Object.keys(TILES).sort()).toEqual([...ORDER, ...ADDED, ...ROOMS, ...POLISH, ...FREE_WILL, ...FIX_ROUND].sort());
		expect(tileIndex("fence")).toBe(54);
		expect(tileIndex("tower-cap")).toBe(55);
		expect(tileIndex("dome-r")).toBe(60);
		expect(tileIndex("brick-2")).toBe(61);
		expect(tileIndex("dome-r-lit")).toBe(70);
		expect(tileIndex("plank-wall")).toBe(71);
		expect(tileIndex("stone-wall-2")).toBe(105);
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

describe("the free-will tiles (spec 4.5)", () => {
	const OPAQUE: TileId[] = ["deck", "plank-wall", "stone-wall", "back-wood", "back-stone", "leaves", "fruit-leaves", "hedge", "water", "water-top", "soil", "glass-wall", "thatch-flat", "plank-wall-2", "stone-wall-2"];
	const SEE_THROUGH: TileId[] = ["post", "rope", "bridge-board", "flowers", "balloon-tl", "balloon-tr", "balloon-bl", "balloon-br", "basket", "bell", "awning", "sail", "statue", "arch", "rail", "thatch-l", "thatch-r", "thatch-peak", "glass-roof-l", "glass-roof-r"];
	const LIT_NEW: TileId[] = ["plank-wall", "stone-wall", "back-wood", "back-stone", "hedge", "soil", "thatch-flat", "plank-wall-2", "stone-wall-2"];
	it("draws every one of them, none a placeholder box any more", () => {
		for (const id of FREE_WILL as TileId[]) {
			const g = TILES[id];
			const inside = new Set(g.slice(1, 15).map((r) => r.slice(1, 15)).join(""));
			expect(inside.size, `${id} is still one flat fill`).toBeGreaterThan(2);
		}
	});
	it.each(OPAQUE)("%s has no transparent pixel", (id) => {
		expect(TILES[id].join("")).not.toContain(".");
	});
	it.each(SEE_THROUGH)("%s lets the sky through somewhere", (id) => {
		expect(TILES[id].join("")).toContain(".");
	});
	it.each(LIT_NEW)("%s is lit from the top left", (id) => {
		const g = TILES[id];
		expect(mean([...g[0]])).toBeGreaterThanOrEqual(mean([...g[15]]));
		expect(mean(g.map((r) => r[0]))).toBeGreaterThanOrEqual(mean(g.map((r) => r[15])) - 2);
	});
	it("draws the back walls darker than the walls they stand behind", () => {
		expect(mean([...TILES["back-wood"].join("")])).toBeLessThan(mean([...TILES["plank-wall"].join("")]) - 15);
		expect(mean([...TILES["back-stone"].join("")])).toBeLessThan(mean([...TILES["stone-wall"].join("")]) - 15);
	});
	it("gives the thatch and the glass roof the shingle roof's outline, so they meet a wall the same way", () => {
		for (const [shingle, other] of [["roof-left", "thatch-l"], ["roof-right", "thatch-r"], ["roof-left", "glass-roof-l"], ["roof-right", "glass-roof-r"]] as const) {
			for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(TILES[other][y][x] === ".", `${other} ${x},${y}`).toBe(TILES[shingle][y][x] === ".");
		}
	});
	it("puts the water's bright line on top", () => {
		expect(mean([...TILES["water-top"][0]])).toBeGreaterThan(mean([...TILES.water[0]]));
	});
	it.each([["plank-wall", "plank-wall-2"], ["stone-wall", "stone-wall-2"]] as const)("%s's variant %s keeps its ring and differs inside", (base, variant) => {
		const b = TILES[base];
		const v = TILES[variant];
		expect(v[0]).toBe(b[0]);
		expect(v[15]).toBe(b[15]);
		for (let y = 0; y < 16; y++) {
			expect(v[y][0]).toBe(b[y][0]);
			expect(v[y][15]).toBe(b[y][15]);
		}
		let differ = 0;
		for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if (v[y][x] !== b[y][x]) differ++;
		expect(differ).toBeGreaterThanOrEqual(12);
		expect(differ).toBeLessThanOrEqual(150);
	});
	it("writes a contact sheet of the new tiles, and a few of them put together, when WORLD_SNAPSHOT_DIR is set", () => {
		snapshot("tiles-free-will", rasterize((FREE_WILL as TileId[]).map((id) => TILES[id]), 16, 16, 6, cols));
		// cells of tile ids (null: sky) to one picture, 16 px a cell
		const compose = (cells: (TileId | null)[][]): string[] =>
			cells.flatMap((row) => Array.from({ length: 16 }, (_, y) => row.map((id) => (id ? TILES[id][y] : ".".repeat(16))).join("")));
		const samples: Record<string, (TileId | null)[][]> = {
			cottage: [[null, null, "thatch-peak", null, null], [null, "thatch-l", "thatch-flat", "thatch-r", null], ["thatch-l", "thatch-flat", "thatch-flat", "thatch-flat", "thatch-r"], ["post", "plank-wall", "window-top", "plank-wall-2", "post"], ["post", "plank-wall", "window", "plank-wall", "post"], ["step", "step", "step", "step", "step"]],
			greenhouse: [[null, "glass-roof-l", "roof-peak", "glass-roof-r", null], ["glass-roof-l", "glass", "glass", "glass", "glass-roof-r"], ["post", "glass-wall", "glass-wall", "glass-wall", "post"], ["flowers", "flowers", null, "flowers", "flowers"], ["soil", "soil", "step", "soil", "soil"]],
			pond: [["stone-wall", "water-top", "water-top", "water-top", "stone-wall"], ["stone-wall", "water", "water", "water", "stone-wall-2"]],
			balloon: [["balloon-tl", "balloon-tr"], ["balloon-bl", "balloon-br"], [null, null], ["basket", null]],
			orchard: [["fruit-leaves", "leaves", "fruit-leaves", null, "hedge", "hedge"], ["leaves", "fruit-leaves", "leaves", null, "hedge", "hedge"], [null, "trunk", null, null, "rail", "rail"], [null, "trunk-base", null, "bell", "bridge-board", "bridge-board"]],
			stall: [["awning", "awning", "awning"], ["post", "back-wood", "post"], ["post", "back-wood", "post"], ["post", "back-stone", "post"]],
			gate: [["arch", "arch", "arch"], ["stone-wall", null, "stone-wall"], ["stone-wall", "statue", "stone-wall-2"], ["sail", "rope", "shutter"]],
		};
		for (const [name, cells] of Object.entries(samples)) snapshot(`sample-${name}`, rasterize([compose(cells)], cells[0].length * 16, cells.length * 16, 4, cols));
		expect(Object.keys(samples)).toHaveLength(7);
	});
});

import { describe, expect, it } from "vitest";
import { blocksOf } from "./blueprints";
import { CASTLE_BLOCKS } from "./blueprints/castle";
import { HALL } from "./blueprints/hall";
import { GROUND_Y, TILE } from "./blueprints/types";
import { cellHash, FORGE_BREATH, FORGE_BREATH_MS, forgeBreath, LIT_FROM, litOf, poolsOf, shadowed, VARIANT_SHARE, variantOf } from "./texture";

describe("variants by the cell", () => {
	it("are chosen the same way every time, and only for brick, stone and snow", () => {
		expect(variantOf("brick", 30, 20)).toBe(variantOf("brick", 30, 20));
		for (let x = 0; x < 64; x++) {
			expect(variantOf("window", x, 20)).toBe("window");
			expect(variantOf("stone-dark", x, 30)).toBe("stone-dark");
			expect(["snow", "snow-2", "snow-3"]).toContain(variantOf("snow", x, GROUND_Y));
		}
	});
	it("show each variant in about one cell in six, scattered, not in stripes", () => {
		const n = { base: 0, a: 0, b: 0 };
		for (let y = 0; y < 40; y++) {
			for (let x = 0; x < 64; x++) {
				const v = variantOf("brick", x, y);
				if (v === "brick") n.base++;
				else if (v === "brick-2") n.a++;
				else n.b++;
			}
		}
		const total = 64 * 40;
		expect(n.a / total).toBeGreaterThan(VARIANT_SHARE - 0.03);
		expect(n.a / total).toBeLessThan(VARIANT_SHARE + 0.03);
		expect(n.b / total).toBeGreaterThan(VARIANT_SHARE - 0.03);
		expect(n.b / total).toBeLessThan(VARIANT_SHARE + 0.03);
		// Along the island's 58-cell top, each variant shows a few times and never more than three in a row.
		const row = Array.from({ length: 58 }, (_, i) => variantOf("snow", 3 + i, GROUND_Y));
		expect(row.filter((v) => v === "snow-2").length).toBeGreaterThanOrEqual(3);
		expect(row.filter((v) => v === "snow-3").length).toBeGreaterThanOrEqual(3);
		let run = 1;
		for (let i = 1; i < row.length; i++) {
			run = row[i] !== "snow" && row[i] === row[i - 1] ? run + 1 : 1;
			expect(run).toBeLessThanOrEqual(3);
		}
	});
	it("hash a cell into 0..1", () => {
		for (const [x, y] of [[0, 0], [63, 39], [-5, 7], [1e6, 3]]) {
			expect(cellHash(x, y)).toBeGreaterThanOrEqual(0);
			expect(cellHash(x, y)).toBeLessThan(1);
		}
	});
});

describe("lit after dark", () => {
	it("lights the windows, the bookcase windows and the dome from LIT_FROM, and nothing else", () => {
		expect(litOf("window", LIT_FROM)).toBe("window-lit");
		expect(litOf("window-top", 1)).toBe("window-top-lit");
		expect(litOf("shelf-window", 1)).toBe("shelf-window-lit");
		expect([litOf("dome-l", 1), litOf("dome", 1), litOf("dome-r", 1)]).toEqual(["dome-l-lit", "dome-lit", "dome-r-lit"]);
		expect([litOf("lamp-room-l", 1), litOf("lamp-room", 1), litOf("lamp-room-r", 1)]).toEqual(["lamp-room-l-lit", "lamp-room-lit", "lamp-room-r-lit"]);
		expect(litOf("shelf-window", LIT_FROM - 0.01)).toBe("shelf-window");
		expect(litOf("brick", 1)).toBe("brick");
	});
});

describe("shadows under the eaves and sills", () => {
	it("fall on the wall under the hall's eaves timber and under each window, not under a window's top half", () => {
		const hall = blocksOf(HALL);
		const got = shadowed(hall);
		const at = (x: number, y: number) => hall.find((b) => b.x === x && b.y === y);
		for (const b of got) expect(["brick", "brick-dark", "pillar"]).toContain(b.tile);
		// The beam runs x 25 to 39 at y 18 over the wall: every cell of the wall's top row is shadowed.
		for (let x = 25; x <= 39; x++) expect(got.some((b) => b.x === x && b.y === 19), `${x}`).toBe(true);
		// Under each window (its lower tile at y 21) the brick at y 22.
		expect(got.some((b) => b.x === 28 && b.y === 22)).toBe(true);
		expect(got.some((b) => b.x === 36 && b.y === 22)).toBe(true);
		// Under the window's top half lies its lower half, which takes no shadow.
		expect(at(28, 21)?.tile).toBe("window");
		expect(got.some((b) => b.x === 28 && b.y === 21)).toBe(false);
	});
	it("fall under the library's bookcase window only where brick is below it", () => {
		const library = CASTLE_BLOCKS.library;
		const shelves = library.filter((b) => b.tile === "shelf-window");
		expect(shelves.length).toBeGreaterThan(0);
		for (const b of shadowed(library)) expect(b.tile).not.toBe("shelf-window");
	});
	it("need the wall below to be laid", () => {
		expect(shadowed([{ x: 5, y: 5, tile: "beam-h", layer: "walls" }])).toEqual([]);
	});
});

describe("light on the ground", () => {
	it("pools under each lantern and door, on the snow's top edge, wider than tall", () => {
		const pools = poolsOf(blocksOf(HALL));
		expect(pools).toHaveLength(3);
		for (const p of pools) {
			expect(p.y).toBe(GROUND_Y * TILE + 1);
			expect(p.rx).toBeGreaterThan(3 * p.ry);
		}
		expect(pools.map((p) => p.x).sort((a, b) => a - b)).toEqual([31.5 * TILE, 32.5 * TILE, 33.5 * TILE]);
	});
});

describe("the forge breathing", () => {
	it("swings its glow by FORGE_BREATH either way over FORGE_BREATH_MS", () => {
		expect(forgeBreath(0)).toBe(1);
		expect(forgeBreath(FORGE_BREATH_MS / 4)).toBeCloseTo(1 + FORGE_BREATH, 6);
		expect(forgeBreath((3 * FORGE_BREATH_MS) / 4)).toBeCloseTo(1 - FORGE_BREATH, 6);
		expect(forgeBreath(Number.NaN)).toBe(1);
	});
});

describe("the free-will walls (spec 4.5)", () => {
	it("show their variant in about one cell in six, by the cell", () => {
		let n = 0;
		for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) if (variantOf("plank-wall", x, y) === "plank-wall-2") n++;
		expect(n / (64 * 40)).toBeGreaterThan(VARIANT_SHARE - 0.03);
		expect(n / (64 * 40)).toBeLessThan(VARIANT_SHARE + 0.03);
		expect(["stone-wall", "stone-wall-2"]).toContain(variantOf("stone-wall", 3, 4));
		expect(variantOf("back-wood", 3, 4)).toBe("back-wood");
	});
	it("take the eaves' shadow on their top row", () => {
		for (const wall of ["plank-wall", "stone-wall", "back-wood", "back-stone"] as const) {
			const laid = [{ x: 5, y: 9, tile: "beam-h" as const, layer: "walls" as const }, { x: 5, y: 10, tile: wall, layer: "walls" as const }];
			expect(shadowed(laid), wall).toHaveLength(1);
		}
	});
});

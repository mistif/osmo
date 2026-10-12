import { describe, expect, it } from "vitest";
import { LAYER_ORDER } from "../blueprints/types";
import { snapshot } from "../png";
import { colours, rasterize } from "../raster";
import { TILE_IDS, TILES, type TileId } from "../tiles";
import { PARTS } from "./parts";
import { roofRows, rowsAt } from "./util";

const IDS = [
	"floor-step", "floor-boards", "storey-brick", "storey-stone", "storey-wood", "storey-open-wood", "storey-open-stone", "storey-glass", "beam-balcony", "door-oak",
	"decor-shutter", "roof-tile-gable", "roof-thatch-gable", "roof-slate-spire", "roof-glass-gable", "roof-dome", "crown-battlement", "roof-awning", "chimney-brick", "top-lamp",
	"top-bell-loft", "top-sails", "top-well-roof", "top-statue", "arch-span", "gate-posts", "stair-flight", "decor-lantern", "decor-banner", "decor-bell",
	"side-bed", "side-fence", "side-tree-fruit", "side-tree-pine", "side-bench", "side-lamp-post", "side-dock", "bed-row", "walk-lamps", "pond-basin",
	"well-ring", "plinth-row", "orchard-row", "bridge-span", "bridge-anchor", "storey-shaft", "side-sign",
	// the fix round's
	"storey-shrine", "loft-posts",
];
// The rows a part shows at width w (row parts and roofs), or its own grid.
const shown = (p: (typeof PARTS)[number], w: number): string[] =>
	p.fit === "row" ? rowsAt(p.map, w + 2 * (p.overhang ?? 0)) : p.fit === "fixed" ? [...p.map] : roofRows(p.map[0], w, p.fit);

describe("the parts library (spec 4.1)", () => {
	it("has the planned 47 parts and the fix round's, each once, in every group", () => {
		expect(PARTS.map((p) => p.id)).toEqual(IDS);
		for (const g of ["structure", "tops", "additions", "around", "travel"]) expect(PARTS.some((p) => p.group === g), g).toBe(true);
	});
	it.each(PARTS.map((p) => [p.id, p] as const))("%s is a well-formed grid with plain words for a name", (_, p) => {
		expect(p.name).toMatch(/^[a-z][a-z -]{0,29}$/);
		for (const ch of p.map.join("")) if (ch !== ".") expect(p.legend[ch], `${p.id} letter ${ch}`).toBeDefined();
		for (const e of Object.values(p.legend)) {
			expect(TILE_IDS).toContain(e.tile);
			expect(LAYER_ORDER).toContain(e.layer);
			expect(e.layer).not.toBe("ground");
		}
		if (p.fit === "fixed") for (const row of p.map) expect(row.length).toBe(p.map[0].length);
		if (p.fit === "row") expect(() => rowsAt(p.map, 9)).not.toThrow();
		if (p.id === "roof-dome") for (const w of [3, 5, 7]) expect(shown(p, w)[0], `the dome's top at ${w}`).toMatch(/^\.*<=>\.*$/);
		if (p.fit === "gable" || p.fit === "spire") {
			expect(p.map).toHaveLength(1);
			expect(p.map[0]).toHaveLength(p.fit === "spire" && p.map[0].length === 6 ? 6 : 4);
		}
	});
	it("gives each role the shape the compiler needs", () => {
		for (const p of PARTS) {
			const [w, h] = [p.map[0].length, p.map.length];
			if (p.role === "door") {
				expect([w, h]).toEqual([1, 2]);
				expect([p.legend[p.map[0]].tile, p.legend[p.map[1]].tile]).toEqual(["door-top", "door"]);
			}
			if (p.role === "decor") {
				expect(w).toBe(1);
				expect(h).toBeLessThanOrEqual(2);
				for (const r of p.map) expect(["lanterns", "banners"]).toContain(p.legend[r].layer);
			}
			if (p.role === "chimney" || p.role === "anchor") expect(w).toBe(1);
			if (p.role === "span") expect([p.fit, h]).toEqual(["row", 2]);
			if (p.role === "floor") expect([p.fit, h]).toEqual(["row", 1]);
			if (p.role === "side" || p.role === "top" || p.role === "door" || p.role === "decor" || p.role === "chimney" || p.role === "anchor") expect(p.fit).toBe("fixed");
			if (p.id.startsWith("storey-")) expect(h).toBe(4);
			if (p.role === "decor" || p.role === "door") expect(p.material).toBeNull();
			if (p.role === "storey" && p.id.startsWith("storey-") && p.id !== "storey-open-wood" && p.id !== "storey-open-stone" && p.id !== "storey-shrine") {
				for (const width of [5, 7, 9, 11]) {
					const rows = shown(p, width);
					for (const r of rows.map((x) => x.slice(1, -1))) expect(r, `${p.id} at ${width}`).toBe([...r].reverse().join("")); // windows sit evenly between the caps
				}
			}
		}
	});
	it("hangs no lantern or banner in a part's map (decor goes in the decor grid; a lamp in a map is a window)", () => {
		for (const p of PARTS) if (p.role !== "decor") for (const e of Object.values(p.legend)) expect(["lanterns", "banners"], p.id).not.toContain(e.layer);
	});
	it("writes every part to a picture when WORLD_SNAPSHOT_DIR is set", () => {
		const cols = colours();
		for (const p of PARTS) {
			const rows = shown(p, 7);
			const grid = rows.flatMap((row) => Array.from({ length: 16 }, (_, y) => [...row].map((ch) => (ch === "." ? ".".repeat(16) : TILES[p.legend[ch].tile as TileId][y])).join("")));
			snapshot(`part-${p.id}`, rasterize([grid], rows[0].length * 16, rows.length * 16, 3, cols));
		}
		expect(PARTS).toHaveLength(IDS.length);
	});
});

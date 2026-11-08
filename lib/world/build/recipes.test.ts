import { describe, expect, it } from "vitest";
import { cellsOf } from "../blueprints";
import { litOf } from "../texture";
import { compile } from "./compile";
import { PARTS } from "./parts";
import { RECIPES } from "./recipes";
import { SEED_KINDS, type Material, type Recipe } from "./types";
import { chooseVariation } from "./variation";

const byId = new Map(PARTS.map((p) => [p.id, p]));
const fits = (id: string, m: Material) => {
	const p = byId.get(id);
	return p !== undefined && (p.material === null || p.material === m);
};
// The most rows a recipe can stack at any of its widths: each tier's tallest part at its most count, roofs over the span
// they are given, fixed tops narrowing the span; a chimney stands on a slope, inside the roof's own height.
function tallest(r: Recipe): number {
	if (r.site === "bridge") return 0;
	let worst = 0;
	for (let w = r.width[0]; w <= r.width[1]; w++) {
		if (w % 2 === 0) continue;
		let h = 0;
		let span = w;
		for (const t of r.tiers) {
			let best = 0;
			let next = span;
			for (const id of t.parts) {
				const p = byId.get(id);
				if (!p || t.role === "chimney") continue;
				const one = p.fit === "gable" ? Math.ceil(span / 2) : p.fit === "spire" ? 2 * Math.ceil(span / 2) : p.map.length;
				const all = one * (t.count ? t.count[1] : 1);
				if (all > best) {
					best = all;
					next = p.fit === "fixed" ? p.map[0].length : p.fit === "row" ? span : 1;
				}
			}
			h += best;
			span = next;
		}
		worst = Math.max(worst, h);
	}
	return worst;
}

describe("the twenty seed recipes (spec 4.2)", () => {
	it("are the twenty the spec names, in its order", () => {
		expect(RECIPES.map((r) => r.id)).toEqual([...SEED_KINDS]);
		expect(RECIPES.map((r) => r.name)).toEqual([
			"cottage", "tower", "lantern walk", "garden", "well", "rope bridge", "windmill", "bell tower", "greenhouse", "market stall",
			"shrine", "pond with a dock", "watchtower", "stone stair", "arch gate", "statue", "small lighthouse", "workshop shed", "belvedere", "orchard",
		]);
		for (const r of RECIPES) {
			expect(r.kind).toBe(r.id);
			expect(r.fixed).toBeUndefined();
		}
	});
	it.each(RECIPES.map((r) => [r.id, r] as const))("%s names parts that exist, fit their tiers and every material it allows", (_, r) => {
		expect(r.materials.length).toBeGreaterThan(0);
		expect(r.name.length).toBeLessThanOrEqual(60);
		let odd = false;
		for (let w = r.width[0]; w <= r.width[1]; w++) if (w % 2 === 1) odd = true;
		expect(odd).toBe(true);
		for (const t of r.tiers) {
			for (const id of t.parts) expect(byId.get(id)?.role, `${r.id} ${t.slot} ${id}`).toBe(t.role);
			if (!t.optional) for (const m of r.materials) expect(t.parts.some((id) => fits(id, m)), `${r.id} ${t.slot} ${m}`).toBe(true);
		}
		for (const id of r.doors) expect(byId.get(id)?.role).toBe("door");
		for (const id of r.decor.parts) expect(byId.get(id)?.role).toBe("decor");
		for (const id of r.sides.parts) expect(byId.get(id)?.role).toBe("side");
		if (r.doors.length > 0) expect(r.tiers.some((t) => t.role === "storey")).toBe(true);
		if (r.site === "bridge") expect(r.tiers.map((t) => t.role).sort()).toEqual(["anchor", "span"]);
		if (r.tiers.some((t) => t.role === "chimney")) expect(r.tiers.findIndex((t) => t.role === "roof")).toBeLessThan(r.tiers.findIndex((t) => t.role === "chimney"));
	});
	it("puts the light and the watch at cliff edges, the garden beside a house, the bridge between islands", () => {
		const site = (id: string) => RECIPES.find((r) => r.id === id)?.site;
		expect([site("lighthouse"), site("watchtower"), site("garden"), site("rope-bridge"), site("cottage")]).toEqual(["cliff", "cliff", "beside", "bridge", "level"]);
	});
	it("holds a roof over a balcony up on posts, never on the rail (the look pass)", () => {
		for (const r of RECIPES) {
			const at = r.tiers.findIndex((t) => t.parts.includes("beam-balcony"));
			const roof = r.tiers.findIndex((t, k) => k > at && t.role === "roof");
			if (at < 0 || roof < 0) continue;
			const between = r.tiers.slice(at + 1, roof);
			expect(between.some((t) => !t.optional && (t.parts.includes("loft-posts") || t.role === "top")), r.id).toBe(true);
		}
	});
	it("keeps the glowing dome for the belvedere, never the shrine (it was the loudest thing at night)", () => {
		const roofs = (id: string) => RECIPES.find((r) => r.id === id)?.tiers.filter((t) => t.role === "roof").flatMap((t) => t.parts) ?? [];
		expect(roofs("shrine")).not.toContain("roof-dome");
		expect(roofs("shrine").length).toBeGreaterThan(0);
		expect(roofs("belvedere")).toContain("roof-dome");
	});
	it("builds the lighthouse as one, not a second bell tower (the hand checks): a slim striped shaft, a railed gallery, a glazed lamp room lit at night, its cap", () => {
		const r = RECIPES.find((x) => x.id === "lighthouse");
		if (!r) throw new Error("no lighthouse");
		for (let seed = 0; seed < 20; seed++) {
			const c = compile(r, chooseVariation(r, PARTS, seed), { kind: "ground", island: 1, x: 100, w: 40, ground: 60, cliff: "left" }, PARTS);
			const bs = cellsOf(c.footprint, c.x, c.y, c.recipe);
			const rows = Array.from({ length: c.h }, (_, i) => bs.filter((b) => b.y === c.y + i).sort((a, b) => a.x - b.x).map((b) => b.tile));
			expect(rows.slice(0, 5), `seed ${seed}`).toEqual([
				["lamp-cap-peak"],
				["lamp-cap-l", "lamp-cap", "lamp-cap-r"],
				["lamp-room-l", "lamp-room", "lamp-room-r"],
				["rail", "gallery-rail", "gallery-rail", "gallery-rail", "rail"],
				["deck", "deck", "deck", "deck", "deck"],
			]);
			for (const t of rows[2]) expect(litOf(t, 1), t).not.toBe(t);
			expect(rows[rows.length - 1]).toEqual(["step", "step", "step", "step", "step"]);
			const shaft = rows.slice(5, -1);
			for (const row of shaft) expect(row).toHaveLength(3);
			const bands = shaft.map((row) => (row.some((t) => t.startsWith("light-red")) ? "R" : row.some((t) => t.startsWith("light-white")) ? "W" : "?")).join("");
			expect(bands, `seed ${seed}`).toMatch(/^(RRWW){3,4}$/); // three or four storeys, taller than any bell tower's shaft is wide by far
		}
	});
	it("builds the arch gate five wide, so its one arch spans the three cells between its posts", () => {
		expect(RECIPES.find((r) => r.id === "arch-gate")?.width).toEqual([5, 5]);
	});
	it("can never stack higher than 24 rows (spec 4.3)", () => {
		for (const r of RECIPES) expect(tallest(r), r.id).toBeLessThanOrEqual(24);
	});
});

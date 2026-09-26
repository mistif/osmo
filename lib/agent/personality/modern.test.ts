import { describe, expect, it } from "vitest";
import { assemble, resolve, sanitizeGenome } from "./assemble";
import { DONORS } from "./donors";
import { MODERN_DONORS, MODERN_ORGANS } from "./modern";

const modern = (id: string) => MODERN_DONORS.has(id);

describe("a modern Osmo", () => {
	it("lists only real donors, enough of them for variety", () => {
		const ids = new Set(DONORS.map((d) => d.id));
		for (const id of MODERN_DONORS) expect(ids.has(id), id).toBe(true);
		expect(MODERN_DONORS.size).toBeGreaterThanOrEqual(10);
	});

	it("takes his voice, humor, slang and quirks only from present-day donors", () => {
		for (let seed = 1; seed <= 500; seed++) {
			const g = assemble(seed);
			for (const organ of MODERN_ORGANS) expect(modern(g.donors[organ]), `seed ${seed}, ${organ}`).toBe(true);
		}
	});

	it("still lets any of the 100 donors give him a heart and a brain", () => {
		const hearts = new Set<string>();
		const brains = new Set<string>();
		for (let seed = 1; seed <= 500; seed++) {
			const g = assemble(seed);
			hearts.add(g.donors.heart);
			brains.add(g.donors.brain);
		}
		expect([...hearts].some((id) => !modern(id))).toBe(true);
		expect(hearts.size).toBeGreaterThan(60);
		expect(brains.size).toBeGreaterThan(60);
	});

	it("moves an Osmo saved with a dated voice to his seed's modern pick, keeping his heart and brain", () => {
		const dated = DONORS.find((d) => !modern(d.id))!.id;
		const saved = { seed: 42, donors: { heart: dated, brain: dated, voice: dated, humor: dated, slang: dated, quirks: dated } };
		const g = sanitizeGenome(saved)!;
		expect(g.donors.heart).toBe(dated);
		expect(g.donors.brain).toBe(dated);
		for (const organ of MODERN_ORGANS) expect(g.donors[organ]).toBe(assemble(42).donors[organ]);
	});

	it("falls back to a present-day voice when a saved donor no longer exists", () => {
		const p = resolve({ seed: 3, donors: { heart: "ghost", brain: "ghost", voice: "ghost", humor: "ghost", slang: "ghost", quirks: "ghost" } });
		for (const organ of MODERN_ORGANS) {
			const donor = DONORS.find((d) => d.name === p.names![organ])!;
			expect(modern(donor.id), organ).toBe(true);
		}
	});
});

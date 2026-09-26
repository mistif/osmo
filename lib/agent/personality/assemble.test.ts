import { describe, expect, it } from "vitest";
import { BASELINE, DEFAULT_WEIGHTS, ORGANS, VALUES, defaultState } from "../state";
import { adoptGenome, assemble, mergedLexicon, newSeed, resolve, sanitizeGenome } from "./assemble";
import type { Donor } from "./types";
import { goodDonor } from "./fixtures";

const roster: Donor[] = Array.from({ length: 12 }, (_, i) =>
	goodDonor({
		id: `the-donor-${i}`,
		name: `The Donor ${i}`,
		heart: { baseline: { joy: (i % 5) * 0.05 - 0.1 }, reactivity: 0.7 + i * 0.05 },
		brain: { honesty: 1 + i, kindness: 1, fairness: 1, loyalty: 1, harm: 1 },
		slang: {
			lexicon: { [`word${i}`]: `meaning ${i}`, shared: i === 0 ? "first meaning" : "other meaning", yeet: "throw", sus: "odd" },
			says: ["No cap.", "Fr fr."],
		},
	}),
);

describe("assemble", () => {
	it("is deterministic and picks a real donor for every organ", () => {
		const a = assemble(123, roster);
		expect(assemble(123, roster)).toEqual(a);
		expect(a.seed).toBe(123);
		for (const organ of ORGANS) expect(roster.some((d) => d.id === a.donors[organ])).toBe(true);
	});

	it("gives varied donors across seeds, and different donors per organ within one Osmo", () => {
		const genomes = Array.from({ length: 40 }, (_, seed) => assemble(seed, roster));
		expect(new Set(genomes.map((g) => g.donors.heart)).size).toBeGreaterThan(5);
		expect(genomes.some((g) => new Set(Object.values(g.donors)).size > 1)).toBe(true);
	});

	it("normalizes a negative or huge seed into a 32-bit unsigned integer", () => {
		expect(assemble(-1, roster).seed).toBe(4294967295);
		expect(newSeed()).toBeGreaterThanOrEqual(0);
		expect(Number.isInteger(newSeed())).toBe(true);
	});
});

describe("resolve", () => {
	it("gives the neutral Osmo for a null genome", () => {
		const p = resolve(null, roster);
		expect(p.genome).toBeNull();
		expect(p.names).toBeNull();
		expect(p.baseline).toEqual(BASELINE);
		expect(p.reactivity).toBe(1);
		expect(p.weights).toEqual(DEFAULT_WEIGHTS);
		expect(p.humor.style).toBe("none");
	});

	it("builds the personality from the organs' donors", () => {
		const genome = { seed: 1, donors: { heart: "the-donor-3", brain: "the-donor-5", voice: "the-donor-1", humor: "the-donor-2", slang: "the-donor-4", quirks: "the-donor-6" } };
		const p = resolve(genome, roster);
		expect(p.baseline.joy).toBeCloseTo(0.55 + ((3 % 5) * 0.05 - 0.1), 5);
		expect(p.reactivity).toBeCloseTo(0.7 + 3 * 0.05, 5);
		expect(p.names?.heart).toBe("The Donor 3");
		expect(VALUES.reduce((s, v) => s + p.weights[v], 0)).toBeCloseTo(1, 6);
		expect(p.weights.honesty).toBeGreaterThan(p.weights.kindness); // donor 5 favors honesty
	});

	it("clamps baselines to 0.05..0.85", () => {
		const wild = [goodDonor({ heart: { baseline: { joy: 0.4, sadness: -0.4 }, reactivity: 1 } })];
		const p = resolve({ seed: 1, donors: Object.fromEntries(ORGANS.map((o) => [o, wild[0].id])) as never }, wild);
		expect(p.baseline.joy).toBeLessThanOrEqual(0.85);
		expect(p.baseline.sadness).toBeGreaterThanOrEqual(0.05);
	});

	it("falls back deterministically for an unknown donor id", () => {
		const genome = { seed: 9, donors: { heart: "nobody", brain: "nobody", voice: "nobody", humor: "nobody", slang: "nobody", quirks: "nobody" } };
		expect(resolve(genome, roster)).toEqual(resolve(genome, roster));
		expect(roster.some((d) => d.name === resolve(genome, roster).names?.heart)).toBe(true);
	});
});

describe("sanitizeGenome", () => {
	it("returns null for missing or garbage genomes", () => {
		for (const bad of [null, undefined, 5, "x", [], {}, { seed: "no" }, { seed: NaN, donors: {} }]) {
			expect(sanitizeGenome(bad, roster)).toBeNull();
		}
	});

	it("keeps valid ids and replaces unknown ones deterministically", () => {
		const g = sanitizeGenome({ seed: 5, donors: { heart: "the-donor-2", brain: "ghost" } }, roster)!;
		expect(g.donors.heart).toBe("the-donor-2");
		for (const organ of ORGANS) expect(roster.some((d) => d.id === g.donors[organ])).toBe(true);
		expect(sanitizeGenome({ seed: 5, donors: { brain: "ghost" } }, roster)).toEqual(
			sanitizeGenome({ seed: 5, donors: { brain: "ghost" } }, roster),
		);
	});
});

describe("adoptGenome", () => {
	const genome = assemble(3, roster);

	it("gives a brand-new Osmo the donor's resting mood and moral weights", () => {
		const s = adoptGenome(defaultState(), genome, { resetWeights: false }, roster);
		const p = resolve(genome, roster);
		expect(s.genome).toEqual(genome);
		expect(s.activations).toEqual(p.baseline);
		expect(s.weights).toEqual(p.weights);
	});

	it("keeps an existing user's learned moral weights", () => {
		const learned = { ...defaultState(), weights: { honesty: 0.4, kindness: 0.2, fairness: 0.2, loyalty: 0.1, harm: 0.1 } };
		expect(adoptGenome(learned, genome, { resetWeights: false }, roster).weights).toEqual(learned.weights);
	});

	it("resets the weights when asked (a re-roll)", () => {
		const learned = { ...defaultState(), weights: { honesty: 0.4, kindness: 0.2, fairness: 0.2, loyalty: 0.1, harm: 0.1 } };
		expect(adoptGenome(learned, genome, { resetWeights: true }, roster).weights).toEqual(resolve(genome, roster).weights);
	});

	it("does not disturb a mood that is not at rest", () => {
		const upset = { ...defaultState(), activations: { ...BASELINE, anger: 0.8 } };
		expect(adoptGenome(upset, genome, { resetWeights: false }, roster).activations.anger).toBe(0.8);
	});
});

describe("mergedLexicon", () => {
	it("merges every donor's words, the earliest donor winning conflicts", () => {
		const lexicon = mergedLexicon(roster);
		expect(lexicon.word0).toBe("meaning 0");
		expect(lexicon.word11).toBe("meaning 11");
		expect(lexicon.shared).toBe("first meaning");
	});
});

import { describe, expect, it } from "vitest";
import { mergedLexicon } from "./assemble";
import { DONORS } from "./donors";
import { COMMON_WORDS, validateDonor, validateRoster } from "./validate";
import { DONOR_FAMILIES } from "./types";

describe("the full roster", () => {
	it("has exactly 100 donors, 10 in each of the 10 families", () => {
		expect(DONORS).toHaveLength(100);
		for (const family of DONOR_FAMILIES) expect(DONORS.filter((d) => d.family === family)).toHaveLength(10);
	});

	it("is valid: complete organs, unique ids and names, no conflicting slang", () => {
		expect(DONORS.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(DONORS)).toEqual([]);
	});

	it("never turns ordinary English into slang", () => {
		for (const word of Object.keys(mergedLexicon(DONORS))) expect(COMMON_WORDS.has(word), word).toBe(false);
	});

	it("gives a rich merged slang dictionary", () => {
		expect(Object.keys(mergedLexicon(DONORS)).length).toBeGreaterThan(200);
	});

	it("covers a wide range of voices and humor styles", () => {
		expect(new Set(DONORS.map((d) => d.humor.style)).size).toBe(5);
		expect(DONORS.some((d) => d.voice.formality > 0.8)).toBe(true);
		expect(DONORS.some((d) => d.voice.formality < 0.2)).toBe(true);
		expect(DONORS.some((d) => d.heart.reactivity > 1.3)).toBe(true);
		expect(DONORS.some((d) => d.heart.reactivity < 0.8)).toBe(true);
	});
});

import { describe, expect, it } from "vitest";
import { isKnownWord, WORD_LIST, wordRank } from "./words";

describe("the word list", () => {
	it("holds about 47,000 plain lowercase words, most common first", () => {
		expect(WORD_LIST.length).toBeGreaterThan(45000);
		expect(WORD_LIST.length).toBeLessThan(50001);
		expect(WORD_LIST.every((w) => /^[a-z]+$/.test(w))).toBe(true);
		expect(WORD_LIST[0]).toBe("you");
		expect(wordRank("the")).toBeLessThan(wordRank("platypus"));
	});

	it("knows rare real words but not typos or new slang", () => {
		for (const w of ["jiggle", "gloomy", "suicidal", "platypus", "ephemeral", "pizza"]) expect(isKnownWord(w), w).toBe(true);
		for (const w of ["thnaks", "myslef", "sda", "rizz"]) expect(isKnownWord(w), w).toBe(false);
	});

	it("ranks unknown words after every known one", () => {
		expect(wordRank("qwzxv")).toBe(WORD_LIST.length);
	});
});

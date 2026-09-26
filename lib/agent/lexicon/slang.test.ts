import { describe, expect, it } from "vitest";
import { mergedLexicon } from "../personality/assemble";
import { normalize, SLANG } from "../talk";
import { PURE_SLANG, PURE_SLANG_IN_WORD_LIST, WORD_SLANG } from "./slang";
import { isKnownWord } from "./words";

describe("the slang lists", () => {
	it("keeps pure slang out of ordinary English, apart from a checked allowlist", () => {
		for (const word of Object.keys(PURE_SLANG)) {
			if (isKnownWord(word)) expect(PURE_SLANG_IN_WORD_LIST.has(word), word).toBe(true);
		}
		for (const word of PURE_SLANG_IN_WORD_LIST) expect(Object.hasOwn(PURE_SLANG, word), word).toBe(true);
	});

	it("never repeats slang Osmo already had", () => {
		const donor = mergedLexicon();
		for (const word of Object.keys(PURE_SLANG)) {
			expect(Object.hasOwn(SLANG, word), word).toBe(false);
			expect(Object.hasOwn(donor, word), word).toBe(false);
			expect(Object.hasOwn(WORD_SLANG, word), word).toBe(false);
		}
	});

	it("uses one lowercase token and a short plain meaning", () => {
		for (const [word, meaning] of Object.entries({ ...PURE_SLANG, ...WORD_SLANG })) {
			expect(/^[a-z0-9]+$/.test(word), word).toBe(true);
			expect(/^[a-z ]+$/.test(meaning) && meaning.split(" ").length <= 6, `${word}: ${meaning}`).toBe(true);
		}
		expect(Object.keys(PURE_SLANG).length).toBeGreaterThanOrEqual(180);
		expect(Object.keys(WORD_SLANG).length).toBeGreaterThanOrEqual(60);
	});

	it("rewrites pure slang but never slang that is also a normal word", () => {
		expect(normalize("istg im hangry")).toBe("i swear to god i am hungry and angry");
		expect(normalize("lowk tired")).toBe("kind of tired");
		expect(normalize("I ate pizza")).toBe("i ate pizza");
		expect(normalize("that movie was mid")).toBe("that movie was mid");
	});
});

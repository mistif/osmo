import { describe, expect, it } from "vitest";
import { createCorrector, typoCost, type SpellConfig } from "./spelling";

// A tiny, fully controlled vocabulary, so each rule can be tested on its own.
const vocab = ["you", "your", "our", "the", "thanks", "what", "have", "home", "sad", "sea", "pizza", "pita", "myself", "feeling", "slurx"];
const other = ["how", "are", "i", "am", "is", "name", "a", "dog", "kill", "want", "to"];
const config: SpellConfig = {
	known: (w) => vocab.includes(w) || other.includes(w),
	candidates: vocab,
	rank: (w) => (vocab.includes(w) ? 100 : 50000),
	phrases: ["how are you", "what is your name", "i am feeling"],
	slotWords: new Set(["sad"]),
	banned: new Set(["slurx"]),
};
const fix = createCorrector(config);

describe("typoCost", () => {
	it("makes typo-shaped slips cheap", () => {
		expect(typoCost("teh", "the", 1)).toBeCloseTo(0.6);
		expect(typoCost("piza", "pizza", 1)).toBeCloseTo(0.6);
		expect(typoCost("thsnks", "thanks", 1)).toBeCloseTo(0.6);
		expect(typoCost("hame", "have", 1)).toBeCloseTo(1);
		expect(typoCost("abc", "xyz", 1)).toBe(Infinity);
	});
});

describe("createCorrector", () => {
	it("fixes a short word only when the phrase around it makes it clear", () => {
		expect(fix(["how", "are", "yuo"])).toEqual(["how", "are", "you"]);
		expect(fix(["gur"])).toEqual(["gur"]);
	});

	it("prefers a feeling where a feeling is expected", () => {
		expect(fix(["i", "am", "sda"])).toEqual(["i", "am", "sad"]);
	});

	it("leaves a tie alone, and lets the recent conversation break it", () => {
		expect(fix(["i", "hame"])).toEqual(["i", "hame"]);
		expect(fix(["i", "hame"], { recent: ["home"] })).toEqual(["i", "home"]);
	});

	it("never changes known, protected or non-letter words", () => {
		expect(fix(["the", "sea"])).toEqual(["the", "sea"]);
		expect(fix(["how", "are", "yuo"], { protect: new Set(["yuo"]) })).toEqual(["how", "are", "yuo"]);
		expect(fix(["2day"])).toEqual(["2day"]);
	});

	it("never offers a banned word as a guess", () => {
		expect(fix(["slurz"])).toEqual(["slurz"]);
	});
});

describe("the user's own words", () => {
	it("never changes a word the user has used enough, and reads a typo of it as that word", () => {
		const personal = new Map([["valo", 2]]);
		expect(fix(["valo"], { personal })).toEqual(["valo"]);
		expect(fix(["vlao"], { personal })).toEqual(["valo"]);
	});

	it("ignores a word used only once", () => {
		expect(fix(["vlao"], { personal: new Map([["valo", 1]]) })).toEqual(["vlao"]);
	});
});

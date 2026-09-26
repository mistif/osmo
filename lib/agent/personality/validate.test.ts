import { describe, expect, it } from "vitest";
import { goodDonor } from "./fixtures";
import { COMMON_WORDS, validateDonor, validateRoster } from "./validate";

describe("validateDonor", () => {
	it("accepts a well-formed donor", () => {
		expect(validateDonor(goodDonor())).toEqual([]);
	});

	it("rejects bad ids and names", () => {
		expect(validateDonor(goodDonor({ id: "Bad Id" }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ name: "Test Donor" }))).not.toEqual([]);
	});

	it("rejects out-of-range numbers", () => {
		expect(validateDonor(goodDonor({ heart: { baseline: { joy: 0.9 }, reactivity: 1 } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ heart: { baseline: {}, reactivity: 2 } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ voice: { ...goodDonor().voice, warmth: 1.5 } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ quirks: { phrases: ["Hi there.", "Hello."], rate: 0.9 } }))).not.toEqual([]);
	});

	it("rejects humor that does not match its style", () => {
		expect(validateDonor(goodDonor({ humor: { style: "none", level: 0.5, lines: [] } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ humor: { style: "dry", level: 0.5, lines: ["Only one."] } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ humor: { style: "none", level: 0, lines: [] } }))).toEqual([]);
	});

	it("rejects slang words that are ordinary English or not single tokens", () => {
		expect(COMMON_WORDS.has("fine")).toBe(true);
		const withWord = (word: string) =>
			goodDonor({ slang: { lexicon: { [word]: "ok", bussin: "good", yeet: "throw", sus: "odd" }, says: ["No cap.", "Fr fr."] } });
		expect(validateDonor(withWord("fine"))).not.toEqual([]);
		expect(validateDonor(withWord("two words"))).not.toEqual([]);
		expect(validateDonor(withWord("Upper"))).not.toEqual([]);
	});

	it("rejects words the Task 5 review found in ordinary use", () => {
		for (const word of ["lease", "fare", "knead", "espresso", "syllabus", "deposit", "stacks", "compost", "yarn", "triage"]) {
			expect(COMMON_WORDS.has(word)).toBe(true);
			expect(
				validateDonor(goodDonor({ slang: { lexicon: { [word]: "ok", bussin: "good", yeet: "throw", sus: "odd" }, says: ["No cap.", "Fr fr."] } })),
			).not.toEqual([]);
		}
	});

	it("accepts a -0.1 delta on a 0.15 baseline but rejects -0.11", () => {
		expect(validateDonor(goodDonor({ heart: { baseline: { fear: -0.1 }, reactivity: 1 } }))).toEqual([]);
		expect(validateDonor(goodDonor({ heart: { baseline: { fear: -0.11 }, reactivity: 1 } }))).not.toEqual([]);
	});

	it("rejects pet names that talk down to the user", () => {
		for (const opener of ["Hey, squirt.", "Listen up, kiddo.", "Okay, little one.", "Come in, sweetheart.", "Oh, my darling.", "Sit down, dear.", "Evening, small friend."]) {
			expect(validateDonor(goodDonor({ voice: { ...goodDonor().voice, openers: [opener, "Hello there."] } })), opener).not.toEqual([]);
		}
		expect(validateDonor(goodDonor({ slang: { ...goodDonor().slang, says: ["Got it, squirt.", "Sure."] } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ quirks: { phrases: ["Dearest, listen.", "Fine."], rate: 0.1 } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ humor: { style: "dry", level: 0.5, lines: ["Honey never spoils.", "Oh dear me, what a day.", "Fine then."] } }))).toEqual([]);
	});

	it("rejects lines that do not read as sentences or are too long", () => {
		expect(validateDonor(goodDonor({ quirks: { phrases: ["no punctuation", "Fine."], rate: 0.1 } }))).not.toEqual([]);
		expect(validateDonor(goodDonor({ voice: { ...goodDonor().voice, elaboration: "x".repeat(130) + "." } }))).not.toEqual([]);
	});
});

describe("validateRoster", () => {
	it("accepts distinct donors", () => {
		expect(validateRoster([goodDonor(), goodDonor({ id: "the-other", name: "The Other" })])).toEqual([]);
	});

	it("rejects duplicate ids, duplicate names and conflicting slang meanings", () => {
		expect(validateRoster([goodDonor(), goodDonor()])).not.toEqual([]);
		const conflict = goodDonor({
			id: "the-other",
			name: "The Other",
			slang: { lexicon: { bussin: "very bad", yeet: "throw", sus: "odd", rizz: "charm" }, says: ["No cap.", "Fr fr."] },
		});
		expect(validateRoster([goodDonor(), conflict]).join(" ")).toMatch(/bussin/);
	});
});

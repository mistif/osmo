import { describe, expect, it } from "vitest";
import { learnFact, learnSlang } from "./facts";

describe("learnFact", () => {
	it("does not treat feelings or descriptions as a name", () => {
		expect(learnFact("im sad")).toBeNull();
		expect(learnFact("I'm sad")).toBeNull();
		expect(learnFact("I am tired")).toBeNull();
		expect(learnFact("it is boring")).toBeNull();
		expect(learnFact("it's raining")).toBeNull();
	});

	it("learns a name from explicit phrases", () => {
		expect(learnFact("my name is gur")).toEqual({ key: "name", value: "gur" });
		expect(learnFact("call me Gur")).toEqual({ key: "name", value: "Gur" });
	});

	it("accepts a correction that starts with no/actually", () => {
		expect(learnFact("no my name is gur")).toEqual({ key: "name", value: "gur" });
		expect(learnFact("No, my name is Gur")).toEqual({ key: "name", value: "Gur" });
		expect(learnFact("actually my dog is Rex")).toEqual({ key: "dog", value: "Rex" });
	});

	it("still learns other facts and preferences", () => {
		expect(learnFact("remember that my dog is Rex")).toEqual({ key: "dog", value: "Rex" });
		expect(learnFact("I like pizza")).toEqual({ key: "likes", value: "pizza" });
	});

	it("ignores ordinary chat", () => {
		expect(learnFact("hello")).toBeNull();
		expect(learnFact("")).toBeNull();
	});
});

describe("learnFact: bare I'm <Name> (review fix)", () => {
	it("learns a capitalized single-word name", () => {
		expect(learnFact("I'm Gur")).toEqual({ key: "name", value: "Gur" });
		expect(learnFact("im Gur")).toEqual({ key: "name", value: "Gur" });
		expect(learnFact("im sad")).toBeNull();
		expect(learnFact("I am Alex")).toEqual({ key: "name", value: "Alex" });
	});

	it("does not learn a feeling, however it is capitalized", () => {
		expect(learnFact("I'm Sad")).toBeNull();
		expect(learnFact("I'm sad")).toBeNull();
		expect(learnFact("I am Tired.")).toBeNull();
	});
});

describe("learnSlang", () => {
	it("learns 'X means Y' and its variants", () => {
		expect(learnSlang("bet means okay")).toEqual({ word: "bet", meaning: "okay" });
		expect(learnSlang("when i say fam i mean friend")).toEqual({ word: "fam", meaning: "friend" });
		expect(learnSlang("fam is slang for friend")).toEqual({ word: "fam", meaning: "friend" });
		expect(learnSlang('"Bet" means "ok, sounds good"')).toEqual({ word: "bet", meaning: "ok, sounds good" });
	});

	it("ignores ordinary sentences that happen to contain 'means'", () => {
		for (const text of ["that means a lot", "it means nothing", "what does bet mean", "my name is gur", "bet means", "hello"]) {
			expect(learnSlang(text), text).toBeNull();
		}
	});
});

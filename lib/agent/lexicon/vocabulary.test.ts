import { describe, expect, it } from "vitest";
import { normalize, unfamiliarWords } from "../talk";
import { learnFromMessage, learnWords } from "./vocabulary";

describe("learning the user's vocabulary", () => {
	it("counts each unfamiliar word once per message", () => {
		expect(learnWords({}, ["valo", "valo", "nala"])).toEqual({ valo: 1, nala: 1 });
		expect(learnWords({ valo: 1 }, ["valo"])).toEqual({ valo: 2 });
	});

	it("only learns words Osmo doesn't know and wouldn't correct", () => {
		expect(unfamiliarWords("gg valo tonight with nala")).toEqual(["valo", "nala"]);
		expect(unfamiliarWords("my freind is here")).toEqual([]);
		expect(unfamiliarWords("i have 3 cats and a dog")).toEqual([]);
		expect(unfamiliarWords("zq")).toEqual([]);
	});

	it("makes a word the user's own after two messages", () => {
		let vocab = {};
		for (const text of ["valo later?", "more valo"]) vocab = learnWords(vocab, unfamiliarWords(text));
		expect(normalize("vlao tonight", {}, { personal: new Map(Object.entries(vocab)) })).toBe("valo tonight");
	});
});

describe("learning from one message", () => {
	it("reads a typo of the user's own word as that word, instead of learning the typo", () => {
		expect(learnFromMessage("vlao?", { valo: 2 })).toEqual({ valo: 3 });
	});

	it("returns only the counts that changed", () => {
		expect(learnFromMessage("nala and valo tonight", { valo: 2, other: 5 })).toEqual({ nala: 1, valo: 3 });
		expect(learnFromMessage("hello there", { valo: 2 })).toEqual({});
	});
});

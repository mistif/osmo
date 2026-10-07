import { describe, expect, it } from "vitest";
import { clean, matchOne, only } from "./match";

describe("only", () => {
	it("accepts a plain object with exactly these keys", () => {
		expect(only({ text: "a", at: "b" }, ["text", "at"])).toBe(true);
		expect(only({ at: "b", text: "a" }, ["text", "at"])).toBe(true);
		expect(only({}, [])).toBe(true);
	});
	it("refuses extra keys, missing keys and anything that is not a plain object", () => {
		expect(only({ text: "a", at: "b", more: 1 }, ["text", "at"])).toBe(false);
		expect(only({ text: "a" }, ["text", "at"])).toBe(false);
		expect(only({ text: "a" }, [])).toBe(false);
		for (const v of [null, undefined, "text", 5, true, [], ["text"]]) expect(only(v, ["text"])).toBe(false);
	});
});

describe("clean", () => {
	it("turns control characters into spaces, joins runs of spaces and trims", () => {
		expect(clean("  call\tDad\nat\u0000nine\u007f  now  ", 200)).toBe("call Dad at nine now");
	});
	it("cuts to the limit without splitting a character", () => {
		expect(clean("x".repeat(300), 200)).toHaveLength(200);
		expect(clean("ab\uD83D\uDE00cd", 3)).toBe("ab\uD83D\uDE00");
		expect(clean("abc   def", 4)).toBe("abc");
	});
	it("gives an empty string for anything that is not text", () => {
		for (const v of [5, null, undefined, {}, [], true]) expect(clean(v, 10)).toBe("");
		expect(clean("   \n ", 10)).toBe("");
	});
});

describe("matchOne", () => {
	const rows = [
		{ id: "a", text: "Call Dad about the boat" },
		{ id: "b", text: "Buy milk" },
		{ id: "c", text: "Call the dentist" },
	];
	it("returns the one row that holds every word, in any case", () => {
		expect(matchOne(rows, "dad BOAT")).toEqual({ ok: true, row: rows[0] });
		expect(matchOne(rows, "milk")).toEqual({ ok: true, row: rows[1] });
	});
	it("asks for more when several match", () => {
		expect(matchOne(rows, "call")).toEqual({ ok: false, say: "I found 2 like that. Please say a little more." });
	});
	it("says so when none match, or when no word was given", () => {
		expect(matchOne(rows, "dad dentist")).toEqual({ ok: false, say: "I could not find one like that." });
		expect(matchOne([], "milk")).toEqual({ ok: false, say: "I could not find one like that." });
		expect(matchOne(rows, "   ")).toEqual({ ok: false, say: "Please say a little more." });
	});
});

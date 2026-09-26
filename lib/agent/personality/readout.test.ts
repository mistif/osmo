import { describe, expect, it } from "vitest";
import { assemble, resolve } from "./assemble";
import { afterReroll, describeMadeOf, isAskMadeOf, isConfirmRoll, parseReroll, REROLL_PROMPT } from "./readout";

describe("describeMadeOf", () => {
	it("names the donor of every organ", () => {
		const p = resolve(assemble(12));
		const text = describeMadeOf(p);
		for (const name of Object.values(p.names!)) expect(text).toContain(name);
		expect(text).toMatch(/^I was assembled from several donors\./);
	});

	it("admits it has no personality yet when neutral", () => {
		expect(describeMadeOf(resolve(null))).toMatch(/don't have a personality/);
	});
});

describe("commands", () => {
	it("recognizes questions about what Osmo is made of", () => {
		for (const text of ["what are you made of", "What are you made of?", "who are you really", "tell me about your personality"]) {
			expect(isAskMadeOf(text), text).toBe(true);
		}
		for (const text of ["hello", "what is your name", "what are you doing"]) expect(isAskMadeOf(text), text).toBe(false);
	});

	it("parses re-roll requests with an optional seed", () => {
		expect(parseReroll("roll a new osmo")).toEqual({});
		expect(parseReroll("Roll a new Osmo!")).toEqual({});
		expect(parseReroll("roll a new osmo with seed 42")).toEqual({ seed: 42 });
		expect(parseReroll("reroll")).toEqual({});
		for (const text of ["roll a dice", "hello", "yes, roll"]) expect(parseReroll(text), text).toBeNull();
	});

	it("only 'yes, roll' confirms", () => {
		for (const text of ["yes, roll", "Yes roll", "yes, roll it!", "yes roll it"]) expect(isConfirmRoll(text), text).toBe(true);
		for (const text of ["yes", "roll", "no", "yes please", "sure"]) expect(isConfirmRoll(text), text).toBe(false);
	});

	it("explains the consequences and says who he is afterwards", () => {
		expect(REROLL_PROMPT).toContain('"yes, roll"');
		expect(REROLL_PROMPT).toMatch(/memories/);
		const p = resolve(assemble(3));
		expect(afterReroll(p)).toMatch(/^Done\./);
		expect(afterReroll(p)).toContain(p.names!.heart);
	});
});

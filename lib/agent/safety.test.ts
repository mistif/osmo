import { describe, expect, it } from "vitest";
import { CRISIS_REPLY, isCrisis } from "./safety";

describe("isCrisis", () => {
	it("recognizes talk of suicide and self-harm, however it is written", () => {
		for (const text of [
			"i want to kill myself",
			"I'm going to kill myself",
			"kms",
			"i want to die",
			"i dont want to be alive anymore",
			"thinking about suicide",
			"i feel suicidal",
			"i want to end my life",
			"i keep hurting myself",
			"everyone would be better off without me",
			"i want to unalive myself",
		]) {
			expect(isCrisis(text), text).toBe(true);
		}
	});

	it("does not fire on ordinary sentences", () => {
		for (const text of ["this homework is killing me", "i could kill for a pizza", "i am dying to see it", "hi", "kill the lights"]) {
			expect(isCrisis(text), text).toBe(false);
		}
	});

	it("answers with care and a way to reach a real person", () => {
		expect(CRISIS_REPLY).toMatch(/112|911/);
		expect(CRISIS_REPLY).toMatch(/988/);
		expect(CRISIS_REPLY).not.toMatch(/rephrase|another way|teach me/i);
	});
});

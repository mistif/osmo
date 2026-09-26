import { describe, expect, it } from "vitest";
import { charDelay, speechBeat } from "./speech";

describe("speechBeat", () => {
	it("makes vowels louder than consonants, and consonants louder than spaces", () => {
		expect(speechBeat("a", "h").voice).toBeGreaterThan(speechBeat("t", "h").voice);
		expect(speechBeat("t", "h").voice).toBeGreaterThan(speechBeat(" ", "h").voice);
	});

	it("falls silent on punctuation and asks for a pause", () => {
		for (const mark of [".", ",", "!", "?", ";", ":"]) {
			const beat = speechBeat(mark, "d");
			expect(beat.voice).toBe(0);
			expect(beat.pause).toBeGreaterThan(0);
		}
		expect(speechBeat("!", "d").pause).toBeGreaterThan(speechBeat(",", "d").pause);
	});

	it("marks the start of each word, and only the start", () => {
		expect(speechBeat("H", undefined).wordStart).toBe(true);
		expect(speechBeat("o", "H").wordStart).toBe(false);
		expect(speechBeat("w", " ").wordStart).toBe(true);
		expect(speechBeat("w", ",").wordStart).toBe(true);
		expect(speechBeat(" ", "i").wordStart).toBe(false);
		expect(speechBeat(".", "i").wordStart).toBe(false);
	});

	it("keeps every loudness within 0..1 and copes with odd characters", () => {
		for (const ch of ["a", "Z", "7", " ", "!", "é", "😀", "\n", ""]) {
			const { voice, pause } = speechBeat(ch, "x");
			expect(voice).toBeGreaterThanOrEqual(0);
			expect(voice).toBeLessThanOrEqual(1);
			expect(Number.isFinite(pause)).toBe(true);
		}
	});
});

describe("charDelay", () => {
	it("talks faster when the mood is aroused and slower when it is low", () => {
		expect(charDelay(40, 1.2)).toBeLessThan(charDelay(40, 3.2));
		expect(charDelay(40, 3.2)).toBeLessThan(charDelay(40, 6));
	});

	it("never takes long over a very long reply, but never goes below a readable floor", () => {
		expect(charDelay(400, 3.2)).toBe(12);
		expect(charDelay(1, 1.2)).toBeGreaterThanOrEqual(12);
		expect(charDelay(1, 6)).toBeLessThanOrEqual(66);
	});

	it("handles zero and NaN lengths without producing NaN", () => {
		expect(Number.isFinite(charDelay(0, 3.2))).toBe(true);
		expect(Number.isFinite(charDelay(10, Number.NaN))).toBe(true);
	});
});

import { describe, expect, it } from "vitest";
import { speakable } from "../chat/speakable";
import { CHARACTER, characterLines, isAskNewOsmo, NEW_OSMO_REPLY } from "./character";
import { moodPosition } from "./heart";
import { EMOTIONS, VALUES } from "./state";

const PET = /\b(sir|madam|boss|buddy|mate|dude|champ|squirt|kiddo|sweetheart|darling|dear)\b/i;
const { openers } = CHARACTER.voice;
const { lines } = CHARACTER.humor;
const { phrases } = CHARACTER.quirks;

describe("CHARACTER sheet", () => {
	it("has the sheet's counts and sizes", () => {
		expect(openers.length).toBeGreaterThanOrEqual(8);
		expect(openers.length).toBeLessThanOrEqual(10);
		expect(lines.length).toBeGreaterThanOrEqual(10);
		expect(lines.length).toBeLessThanOrEqual(12);
		expect(phrases.length).toBeGreaterThanOrEqual(6);
		expect(phrases.length).toBeLessThanOrEqual(8);
		for (const o of openers) expect(o.length, o).toBeLessThanOrEqual(30);
		for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(120);
	});

	it("is speakable, capitalised and stopped, with no apostrophe, exclamation or pet name", () => {
		for (const line of [...openers, ...lines, ...phrases, ...characterLines(), NEW_OSMO_REPLY]) {
			expect(speakable(line), line).toBe(line);
			expect(line, line).toMatch(/^[A-Z]/);
			expect(line, line).toMatch(/[.?]$/);
			expect(line, line).not.toMatch(/['’!]/);
			expect(line, line).not.toMatch(PET);
		}
	});

	it("rests where spec 2.8 says", () => {
		for (const e of EMOTIONS) {
			expect(CHARACTER.baseline[e], e).toBeGreaterThanOrEqual(0.05);
			expect(CHARACTER.baseline[e], e).toBeLessThanOrEqual(0.85);
		}
		expect(CHARACTER.reactivity).toBe(0.75);
		expect(CHARACTER.voice.formality).toBe(0.8);
		const [v, a, d] = moodPosition(CHARACTER.baseline);
		expect(v).toBeCloseTo(0.304, 2);
		expect(a).toBeCloseTo(0.142, 2);
		expect(d).toBeCloseTo(0.126, 2);
		expect(VALUES.reduce((sum, k) => sum + CHARACTER.weights[k], 0)).toBeCloseTo(1, 5);
	});
});

describe("isAskNewOsmo", () => {
	it("catches the old commands and nothing else", () => {
		for (const t of ["roll a new osmo", "Roll me a new Osmo.", "re-roll", "reroll osmo", "make new osmo", "please roll a new osmo with seed 42"]) {
			expect(isAskNewOsmo(t), t).toBe(true);
		}
		for (const t of ["yes, roll", "roll the dice", "I want a new job", "tell me about osmo"]) expect(isAskNewOsmo(t), t).toBe(false);
	});
});

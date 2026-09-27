import { describe, expect, it } from "vitest";
import { displayVoiceName, isMaleVoice, pickVoice, wordEnd } from "./voices";

const v = (name: string, lang: string, localService = true) => ({ name, lang, localService });

describe("pickVoice", () => {
	it("prefers an on-device British male voice", () => {
		const list = [v("Samantha", "en-US"), v("Google UK English Male", "en-GB", false), v("Daniel", "en-GB"), v("Microsoft David", "en-US")];
		expect(pickVoice(list)?.name).toBe("Daniel");
	});

	it("takes any on-device British voice before an American man", () => {
		const list = [v("Microsoft David - English (United States)", "en-US"), v("Microsoft Hazel - English (United Kingdom)", "en-GB")];
		expect(pickVoice(list)?.name).toBe("Microsoft Hazel - English (United Kingdom)");
	});

	it("takes an on-device American man next", () => {
		const list = [v("Microsoft Zira", "en-US"), v("Microsoft David", "en-US"), v("Google UK English Male", "en-GB", false)];
		expect(pickVoice(list)?.name).toBe("Microsoft David");
	});

	it("falls back to any on-device English voice", () => {
		expect(pickVoice([v("Google UK English Male", "en-GB", false), v("Microsoft Zira", "en-US")])?.name).toBe("Microsoft Zira");
	});

	it("uses a network voice only when nothing on the device speaks English", () => {
		expect(pickVoice([v("Microsoft Bengt", "sv-SE"), v("Google UK English Male", "en-GB", false)])?.name).toBe("Google UK English Male");
	});

	it("reads Android's underscore language tags", () => {
		expect(pickVoice([v("en-us-x-sfg", "en_US"), v("en-gb-x-rjs", "en_GB")])?.name).toBe("en-gb-x-rjs");
	});

	it("returns null without an English voice", () => {
		expect(pickVoice([v("Microsoft Bengt", "sv-SE")])).toBeNull();
		expect(pickVoice([])).toBeNull();
	});
});

describe("isMaleVoice", () => {
	it.each([
		["Google UK English Male", true],
		["Google UK English Female", false],
		["Microsoft George - English (United Kingdom)", true],
		["Daniel", true],
		["Samantha", false],
		["Markus", false],
	])("%s → %s", (name, male) => expect(isMaleVoice(name)).toBe(male));
});

describe("wordEnd", () => {
	it("finds where the word starting at a position ends", () => {
		expect(wordEnd("Good evening, sir.", 5)).toBe(13);
		expect(wordEnd("Hi", 0)).toBe(2);
	});

	it("moves on by one at the end of the text", () => {
		expect(wordEnd("Hi", 2)).toBe(3);
	});
});

describe("displayVoiceName", () => {
	it.each([
		["Microsoft George - English (United Kingdom)", "Microsoft George"],
		["Microsoft Ryan Online (Natural) - English (United Kingdom)", "Microsoft Ryan Online"],
		["Daniel", "Daniel"],
		["Google UK English Male", "Google UK English Male"],
	])("%s → %s", (name, shown) => expect(displayVoiceName(name)).toBe(shown));
});

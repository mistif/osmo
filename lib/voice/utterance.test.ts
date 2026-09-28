import { describe, expect, it } from "vitest";
import { heardEnough, messageFrom, SILENCE_MS, spokenSeconds } from "./utterance";

describe("messageFrom", () => {
	it.each([
		["Osmo, what's the time?", "what's the time?"],
		["ozmo tell me a story", "tell me a story"],
		["Oz mo, how are you", "how are you"],
		["hey Osmo what's up", "what's up"],
		["Osmo", ""],
		["Osmo.", ""],
		["  osmo!  ", ""],
		["what's the time", "what's the time"],
		["I like Osmo", "I like Osmo"],
		["osmosis is a process", "osmosis is a process"],
	])("%j → %j", (heard, message) => expect(messageFrom(heard)).toBe(message));
});

describe("heardEnough", () => {
	it("waits until the words have stopped changing for a second", () => {
		expect(heardEnough(null, 5000)).toBe(false);
		expect(heardEnough(1000, 1000 + SILENCE_MS - 1)).toBe(false);
		expect(heardEnough(1000, 1000 + SILENCE_MS)).toBe(true);
	});
});

describe("spokenSeconds", () => {
	it("estimates about 2.5 words a second, and zero for nothing said", () => {
		expect(spokenSeconds("yes")).toBeCloseTo(0.4);
		expect(spokenSeconds("and what about tomorrow")).toBeCloseTo(1.6);
		expect(spokenSeconds("  ")).toBe(0);
	});
});

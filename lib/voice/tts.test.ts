import { describe, expect, it } from "vitest";
import {
	cacheKey,
	evictions,
	GRAVE_STRENGTH,
	GRAVE_VALENCE,
	INSTRUCTIONS_VERSION,
	speechTone,
	TONE_INSTRUCTIONS,
	TTS_SPEED,
	TTS_VOICE,
	wordsSpokenBy,
	wordSpans,
} from "./tts";

describe("speechTone", () => {
	it("is composed for an ordinary mood", () => {
		expect(speechTone(0, 0.5)).toBe("composed");
		expect(speechTone(0.8, 1)).toBe("composed");
	});

	it("is grave only when the mood is clearly negative and strongly felt", () => {
		expect(speechTone(-0.9, 0.9)).toBe("grave");
		// Negative, but barely felt: he stays composed.
		expect(speechTone(-0.9, 0.4)).toBe("composed");
		// Strongly felt, but not negative.
		expect(speechTone(0.2, 0.9)).toBe("composed");
	});

	it("treats the thresholds themselves as grave", () => {
		expect(speechTone(GRAVE_VALENCE, GRAVE_STRENGTH)).toBe("grave");
		expect(speechTone(GRAVE_VALENCE + 0.01, GRAVE_STRENGTH)).toBe("composed");
		expect(speechTone(GRAVE_VALENCE, GRAVE_STRENGTH - 0.01)).toBe("composed");
	});

	it("stays composed on numbers that aren't numbers", () => {
		expect(speechTone(Number.NaN, 0.9)).toBe("composed");
		expect(speechTone(-0.9, Number.NaN)).toBe("composed");
		expect(speechTone(Number.NEGATIVE_INFINITY, 1)).toBe("composed");
	});

	it("has an instruction for each tone, and the grave one is not the composed one", () => {
		expect(TONE_INSTRUCTIONS.composed.length).toBeGreaterThan(0);
		expect(TONE_INSTRUCTIONS.grave).not.toBe(TONE_INSTRUCTIONS.composed);
	});

	it("never asks for a flat or slow delivery, which is what sounds robotic", () => {
		expect(TONE_INSTRUCTIONS.composed).not.toMatch(/\bslower\b|\bmeasured\b/i);
	});

	it("still asks for the variation that keeps him from going flat", () => {
		// This is what buys the life in his voice. Pace is a separate dial (TTS_SPEED), and losing
		// this line while slowing him down is how he ends up sounding robotic again.
		for (const instruction of Object.values(TONE_INSTRUCTIONS)) {
			expect(instruction).toMatch(/never flat/i);
		}
		expect(TONE_INSTRUCTIONS.composed).toMatch(/variation in pitch and emphasis/i);
	});

	it("does not rush him", () => {
		// JARVIS "never rushes". 1.15 was tried on 2026-09-30 and rejected by ear on 2026-10-08:
		// it was a wrong fix for flatness, which the wording above handles instead.
		expect(TTS_SPEED).toBeLessThanOrEqual(1.05);
		expect(TTS_SPEED).toBeGreaterThanOrEqual(0.9);
	});
});

describe("cacheKey", () => {
	it("is the same for the same words in the same tone", () => {
		expect(cacheKey("Good evening.", "composed")).toBe(cacheKey("Good evening.", "composed"));
	});

	it("differs by text and by tone", () => {
		expect(cacheKey("Good evening.", "composed")).not.toBe(cacheKey("Good night.", "composed"));
		expect(cacheKey("Good evening.", "composed")).not.toBe(cacheKey("Good evening.", "grave"));
	});

	it("carries what the audio depends on, so a change to any of it misses the old audio", () => {
		const key = cacheKey("Good evening.", "composed");
		expect(key).toContain(String(INSTRUCTIONS_VERSION));
		expect(key).toContain(TTS_VOICE);
		expect(key).toContain("Good evening.");
	});
});

describe("evictions", () => {
	const entry = (key: string, usedAt: number, bytes = 10) => ({ key, bytes, usedAt });

	it("keeps everything while both limits are met", () => {
		expect(evictions([entry("a", 1), entry("b", 2)], 10, 1000)).toEqual([]);
	});

	it("drops the longest unused first when there are too many", () => {
		const entries = [entry("new", 30), entry("old", 10), entry("mid", 20)];
		expect(evictions(entries, 2, 1000)).toEqual(["old"]);
		expect(evictions(entries, 1, 1000)).toEqual(["old", "mid"]);
	});

	it("drops until it is under the size limit too", () => {
		const entries = [entry("a", 1, 100), entry("b", 2, 100), entry("c", 3, 100)];
		expect(evictions(entries, 100, 250)).toEqual(["a"]);
		expect(evictions(entries, 100, 150)).toEqual(["a", "b"]);
	});

	it("can drop everything if one clip is bigger than the whole budget", () => {
		expect(evictions([entry("huge", 1, 999)], 100, 10)).toEqual(["huge"]);
	});

	it("leaves the caller's list alone", () => {
		const entries = [entry("new", 30), entry("old", 10)];
		evictions(entries, 1, 1000);
		expect(entries.map((e) => e.key)).toEqual(["new", "old"]);
	});
});

describe("wordSpans", () => {
	it("finds each word", () => {
		expect(wordSpans("Hello there")).toEqual([
			{ start: 0, end: 5 },
			{ start: 6, end: 11 },
		]);
	});

	it("keeps punctuation with its word", () => {
		expect(wordSpans("I'm well, thanks.")).toEqual([
			{ start: 0, end: 3 },
			{ start: 4, end: 9 },
			{ start: 10, end: 17 },
		]);
	});

	it("ignores the space around the words", () => {
		expect(wordSpans("  hi  ")).toEqual([{ start: 2, end: 4 }]);
		expect(wordSpans("")).toEqual([]);
		expect(wordSpans("   ")).toEqual([]);
	});
});

describe("wordsSpokenBy", () => {
	const spans = wordSpans("Hello there");

	it("has said nothing at the start and everything at the end", () => {
		expect(wordsSpokenBy(spans, 11, 0)).toBe(0);
		expect(wordsSpokenBy(spans, 11, 1)).toBe(2);
	});

	it("counts a word once the audio has passed it", () => {
		expect(wordsSpokenBy(spans, 11, 0.5)).toBe(1);
	});

	it("never runs past the end or before the start", () => {
		expect(wordsSpokenBy(spans, 11, 2)).toBe(2);
		expect(wordsSpokenBy(spans, 11, -1)).toBe(0);
		expect(wordsSpokenBy(spans, 11, Number.NaN)).toBe(0);
	});

	it("says nothing for no words", () => {
		expect(wordsSpokenBy([], 0, 1)).toBe(0);
	});
});

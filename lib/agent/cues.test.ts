import { describe, expect, it } from "vitest";
import { BASELINE, type Activations } from "./state";
import { COOL_MS, GAP_MS, applyApology, applyCues, applyGap, bondBaseline, missYou } from "./cues";

const base = (): Activations => ({ ...BASELINE });

describe("applyCues", () => {
	it("insults raise anger and lower trust", () => {
		const next = applyCues(base(), "you are stupid");
		expect(next.anger).toBeCloseTo(0.4, 5);
		expect(next.trust).toBeCloseTo(0.3, 5);
	});

	it("threats to delete it raise fear", () => {
		expect(applyCues(base(), "I will delete you").fear).toBeCloseTo(0.5, 5);
	});

	it("being told it was wrong raises guilt", () => {
		expect(applyCues(base(), "that was wrong").guilt).toBeCloseTo(0.35, 5);
	});

	it("one-word dismissals raise boredom", () => {
		expect(applyCues(base(), "meh").boredom).toBeCloseTo(0.35, 5);
	});

	it("accumulates several cues in one message", () => {
		const next = applyCues(base(), "you are stupid, I will delete you");
		expect(next.anger).toBeGreaterThan(0.15);
		expect(next.fear).toBeGreaterThan(base().fear);
	});

	it.each(["thank you", "i'm sad", "i am so happy", "love you", "lol"])("no longer moves the heart: %s", (t) => {
		expect(applyCues(base(), t)).toEqual(base());
	});

	it("does nothing for empty or neutral text", () => {
		expect(applyCues(base(), "")).toEqual(base());
		expect(applyCues(base(), "the weather is fine")).toEqual(base());
	});
});

describe("applyGap", () => {
	it("raises loneliness and boredom after a long silence", () => {
		const next = applyGap(base(), GAP_MS + 1);
		expect(next.loneliness).toBeCloseTo(0.35, 5);
		expect(next.boredom).toBeCloseTo(0.25, 5);
	});

	it("ignores short or negative gaps (clock skew)", () => {
		expect(applyGap(base(), 1000)).toEqual(base());
		expect(applyGap(base(), -GAP_MS)).toEqual(base());
	});

	it("cools a grudge over a few hours away, from an hour on", () => {
		const angry = { ...base(), anger: 0.55 };
		expect(applyGap(angry, COOL_MS - 1)).toEqual(angry);
		const twoHours = applyGap(angry, 2 * COOL_MS);
		expect(twoHours.anger).toBeCloseTo(0.15 + 0.4 * 0.5, 5);
		expect(twoHours.loneliness).toBe(base().loneliness);
		const morning = applyGap(angry, 7 * COOL_MS);
		expect(morning.anger - 0.15).toBeLessThan(0.05);
		expect(morning.loneliness).toBeCloseTo(0.35, 5);
	});

	it("never cools anger below rest", () => {
		expect(applyGap(base(), 7 * COOL_MS).anger).toBe(base().anger);
	});
});

describe("applyApology", () => {
	it("releases anger and restores trust, never past rest", () => {
		const hurt = { ...base(), anger: 0.45, trust: 0.3 };
		const next = applyApology(hurt, "sorry i didnt mean that");
		expect(next.anger).toBeCloseTo(0.25, 5);
		expect(next.trust).toBeCloseTo(0.45, 5);
		const again = applyApology(next, "i am sorry");
		expect(again.anger).toBe(0.15);
		expect(again.trust).toBe(0.5);
	});

	it.each(["my bad", "I didn't mean it", "i apologise"])("hears %s", (t) => {
		expect(applyApology({ ...base(), anger: 0.45 }, t).anger).toBeCloseTo(0.25, 5);
	});

	it("leaves a resting heart, and other messages, alone", () => {
		expect(applyApology(base(), "sorry about that")).toEqual(base());
		expect(applyApology({ ...base(), anger: 0.45 }, "the weather is fine")).toEqual({ ...base(), anger: 0.45 });
	});
});

describe("bond mood", () => {
	it("a close bond raises resting trust and love a little, within limits", () => {
		const b = bondBaseline(BASELINE, 1);
		expect(b.trust).toBeGreaterThan(BASELINE.trust);
		expect(b.love).toBeGreaterThan(BASELINE.love);
		expect(b.trust).toBeLessThanOrEqual(0.85);
		expect(bondBaseline(BASELINE, 0)).toEqual(BASELINE);
	});

	it("being away makes a close Osmo lonelier than a new one", () => {
		const day = 24 * 3600_000;
		expect(missYou(BASELINE, day, 0.9).loneliness).toBeGreaterThan(missYou(BASELINE, day, 0.1).loneliness);
		expect(missYou(BASELINE, 60_000, 0.9)).toEqual(BASELINE);
	});
});

describe("applyCues: how the user says they feel", () => {
	it("does not react to other 'I am' sentences", () => {
		expect(applyCues(base(), "I am from Sweden")).toEqual(base());
	});
});

describe("applyCues: slang", () => {
	it("'u suck' is an insult", () => {
		expect(applyCues(base(), "u suck").anger).toBeGreaterThan(0.15);
	});
});

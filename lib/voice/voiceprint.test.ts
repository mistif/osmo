import { describe, expect, it } from "vitest";
import { averagePrint, bestScore, cosine, judge, judgement, LEAN_THRESHOLD, MATCH_THRESHOLD, MODEL_ID, outliers } from "./voiceprint";

describe("cosine", () => {
	it("scores direction, not length", () => {
		expect(cosine([1, 0], [5, 0])).toBeCloseTo(1);
		expect(cosine([1, 0], [-2, 0])).toBeCloseTo(-1);
		expect(cosine([1, 0], [0, 3])).toBeCloseTo(0);
	});

	it("returns -1 for vectors that can't be compared", () => {
		expect(cosine([1, 0], [1, 0, 0])).toBe(-1);
		expect(cosine([0, 0], [1, 0])).toBe(-1);
		expect(cosine([], [])).toBe(-1);
	});
});

describe("averagePrint", () => {
	it("averages directions, so a loud reading doesn't outweigh a quiet one", () => {
		const print = averagePrint([[2, 0], [0, 5]]);
		expect(print[0]).toBeCloseTo(Math.SQRT1_2);
		expect(print[1]).toBeCloseTo(Math.SQRT1_2);
	});

	it("is empty for no readings", () => {
		expect(averagePrint([])).toEqual([]);
	});
});

describe("outliers", () => {
	it("finds the reading that doesn't sound like the rest", () => {
		expect(outliers([[1, 0.05, 0], [1, 0, 0.05], [1, 0.02, 0.02], [1, 0.03, 0], [0, 1, 0]])).toEqual([4]);
	});

	it("finds none when all readings agree, or when there is only one", () => {
		expect(outliers([[1, 0], [1, 0.1], [1, -0.1]])).toEqual([]);
		expect(outliers([[1, 0]])).toEqual([]);
	});
});

describe("bestScore", () => {
	it("takes the closest of several voiceprints from this model", () => {
		const prints = [
			{ model: MODEL_ID, embedding: [0, 1] },
			{ model: MODEL_ID, embedding: [1, 0.1] },
		];
		expect(bestScore([1, 0], prints)).toBeCloseTo(cosine([1, 0], [1, 0.1]));
	});

	it("never compares voiceprints from another model", () => {
		expect(bestScore([1, 0], [{ model: "some-older-model", embedding: [1, 0] }])).toBe(-1);
	});

	it("is -1 with no voiceprints at all", () => {
		expect(bestScore([1, 0], [])).toBe(-1);
	});
});

describe("judge", () => {
	it("is Gur at or above the confident line", () => {
		expect(judge({ score: MATCH_THRESHOLD, speechSeconds: 3, ownerSoFar: false })).toBe("you");
		expect(judge({ score: 0.9, speechSeconds: 3, ownerSoFar: false })).toBe("you");
	});

	it("leans toward Gur between the lean line and the confident line while only his voice is on the device", () => {
		expect(LEAN_THRESHOLD).toBeLessThan(MATCH_THRESHOLD);
		expect(judge({ score: LEAN_THRESHOLD, speechSeconds: 3, ownerSoFar: false })).toBe("you");
		expect(judge({ score: MATCH_THRESHOLD - 0.01, speechSeconds: 3, ownerSoFar: false })).toBe("you");
	});

	it("is someone else below the lean line", () => {
		expect(judge({ score: LEAN_THRESHOLD - 0.01, speechSeconds: 3, ownerSoFar: false })).toBe("guest");
		expect(judge({ score: 0.0, speechSeconds: 3, ownerSoFar: false })).toBe("guest");
	});

	it("counts no reading (-1) as Gur: the worst failure is the owner being answered as a stranger", () => {
		expect(judge({ score: -1, speechSeconds: 3, ownerSoFar: false })).toBe("you");
	});

	it("falls back to the confident line once a second voice has been enrolled", () => {
		expect(judge({ score: 0.4, speechSeconds: 3, ownerSoFar: false, secondVoice: true })).toBe("guest");
		expect(judge({ score: MATCH_THRESHOLD, speechSeconds: 3, ownerSoFar: false, secondVoice: true })).toBe("you");
		expect(judge({ score: -1, speechSeconds: 3, ownerSoFar: false, secondVoice: true })).toBe("guest");
	});

	it("never leans, and never trusts a missing reading, when the device holds none of Gur's voiceprints", () => {
		expect(judge({ score: 0.4, speechSeconds: 3, ownerSoFar: false, ownerPrints: false })).toBe("guest");
		expect(judge({ score: -1, speechSeconds: 3, ownerSoFar: false, ownerPrints: false })).toBe("guest");
	});

	it("keeps a short follow-up Gur's once he has been recognized", () => {
		expect(judge({ score: 0.1, speechSeconds: 1, ownerSoFar: true })).toBe("you");
	});

	it("judges a full-sentence follow-up again", () => {
		expect(judge({ score: 0.1, speechSeconds: 2, ownerSoFar: true })).toBe("guest");
	});

	it("never carries over before Gur has been recognized", () => {
		expect(judge({ score: 0.1, speechSeconds: 1, ownerSoFar: false })).toBe("guest");
	});
});

describe("judgement", () => {
	it("names why, and which line applied", () => {
		expect(judgement({ score: 0.8, speechSeconds: 3, ownerSoFar: false })).toEqual({ speaker: "you", verdict: "match", threshold: MATCH_THRESHOLD });
		expect(judgement({ score: 0.4, speechSeconds: 3, ownerSoFar: false })).toEqual({ speaker: "you", verdict: "lean", threshold: LEAN_THRESHOLD });
		expect(judgement({ score: -1, speechSeconds: 3, ownerSoFar: false })).toEqual({ speaker: "you", verdict: "no-reading", threshold: LEAN_THRESHOLD });
		expect(judgement({ score: 0.1, speechSeconds: 1, ownerSoFar: true })).toEqual({ speaker: "you", verdict: "carry-over", threshold: LEAN_THRESHOLD });
		expect(judgement({ score: 0.1, speechSeconds: 3, ownerSoFar: false })).toEqual({ speaker: "guest", verdict: "guest", threshold: LEAN_THRESHOLD });
	});

	it("reports the confident line as the one applied when a second voice is enrolled", () => {
		expect(judgement({ score: 0.4, speechSeconds: 3, ownerSoFar: false, secondVoice: true })).toEqual({ speaker: "guest", verdict: "guest", threshold: MATCH_THRESHOLD });
	});
});

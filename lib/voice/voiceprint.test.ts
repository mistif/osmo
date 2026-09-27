import { describe, expect, it } from "vitest";
import { averagePrint, bestScore, cosine, judge, MATCH_THRESHOLD, MODEL_ID, outliers } from "./voiceprint";

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
	it("is Gur at or above the threshold, and someone else below it", () => {
		expect(judge({ score: MATCH_THRESHOLD, speechSeconds: 3, ownerSoFar: false })).toBe("you");
		expect(judge({ score: MATCH_THRESHOLD - 0.01, speechSeconds: 3, ownerSoFar: false })).toBe("guest");
		expect(judge({ score: -1, speechSeconds: 3, ownerSoFar: false })).toBe("guest");
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

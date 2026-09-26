import { describe, expect, it } from "vitest";
import { emptyBond } from "./bond/bond";
import { BASELINE, DEFAULT_WEIGHTS, VALUES, defaultState, sanitizeState } from "./state";

const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

describe("defaultState", () => {
	it("returns independent copies", () => {
		const a = defaultState();
		a.activations.joy = 0;
		a.coupling.sadness.boredom = 0;
		const b = defaultState();
		expect(b.activations.joy).toBe(BASELINE.joy);
		expect(b.coupling.sadness.boredom).toBe(0.3);
	});
});

describe("sanitizeState", () => {
	it("returns defaults for null, primitives and empty objects", () => {
		expect(sanitizeState(null)).toEqual(defaultState());
		expect(sanitizeState(42)).toEqual(defaultState());
		expect(sanitizeState({})).toEqual(defaultState());
	});

	it("repairs NaN, wrong types and out-of-range activations", () => {
		const s = sanitizeState({ activations: { joy: NaN, sadness: 5, anger: "x", fear: -3 } });
		expect(s.activations.joy).toBe(BASELINE.joy);
		expect(s.activations.sadness).toBe(1);
		expect(s.activations.anger).toBe(BASELINE.anger);
		expect(s.activations.fear).toBe(0);
	});

	it("re-normalizes weights and keeps them positive", () => {
		const s = sanitizeState({ weights: { honesty: 0, kindness: 0, fairness: 0, loyalty: 0, harm: 0 } });
		for (const v of VALUES) expect(s.weights[v]).toBeGreaterThan(0);
		expect(sum(s.weights)).toBeCloseTo(1, 6);
		expect(sanitizeState({ weights: { honesty: Infinity } }).weights.honesty).toBeLessThan(1);
	});

	it("keeps valid coupling and drops bogus entries", () => {
		const s = sanitizeState({
			coupling: { sadness: { boredom: 0.5, nonsense: 1, joy: Infinity, fear: 9 }, notAnEmotion: { joy: 1 } },
		});
		expect(s.coupling.sadness.boredom).toBe(0.5);
		expect(s.coupling.sadness).not.toHaveProperty("nonsense");
		expect(s.coupling.sadness.joy).toBe(-0.4); // default kept when the stored value is invalid
		expect(s.coupling.sadness.fear).toBe(0.8); // clamped
	});

	it("clamps outlook", () => {
		expect(sanitizeState({ outlook: 7 }).outlook).toBe(1);
		expect(sanitizeState({ outlook: "bad" }).outlook).toBe(0);
	});

	it("drops junk associations and history but keeps valid ones", () => {
		const s = sanitizeState({
			associations: {
				loss: { count: 3, tendencies: { sadness: 0.3, bogus: 1, joy: NaN } },
				broken: { count: "x", tendencies: {} },
				alsoBroken: null,
			},
			history: [{ id: "t1", valence: "tragic" }, { id: 5, valence: "happy" }, { id: "x", valence: "meh" }, null],
		});
		expect(s.associations.loss).toEqual({ count: 3, tendencies: { sadness: 0.3 } });
		expect(s.associations).not.toHaveProperty("broken");
		expect(s.associations).not.toHaveProperty("alsoBroken");
		expect(s.history).toEqual([{ id: "t1", valence: "tragic" }]);
	});

	it("leaves defaults for weights when weights are absent", () => {
		expect(sanitizeState({}).weights).toEqual(DEFAULT_WEIGHTS);
	});
});

describe("state: bond", () => {
	it("a default state has a fresh bond", () => {
		expect(defaultState().bond).toEqual(emptyBond());
	});

	it("sanitizeState keeps a saved bond and repairs a broken one", () => {
		const saved = { ...emptyBond(), messages: 4, days: 2, lastDay: "2026-09-24", metAt: "2026-09-23T10:00:00.000Z" };
		expect(sanitizeState({ bond: saved }).bond).toEqual(saved);
		expect(sanitizeState({ bond: "nonsense" }).bond).toEqual(emptyBond());
		expect(sanitizeState({}).bond).toEqual(emptyBond());
	});
});

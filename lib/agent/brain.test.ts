import { describe, expect, it } from "vitest";
import { BASELINE, DEFAULT_WEIGHTS, VALUES, defaultState } from "./state";
import { DILEMMAS, type Dilemma } from "./dilemmas";
import { applyFeedback, decide, explain, nudgeWeights, parseVerdict } from "./brain";

const whiteLie = DILEMMAS.find((d) => d.id === "white-lie")!;
const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

const zeros = { honesty: 0, kindness: 0, fairness: 0, loyalty: 0, harm: 0 };
const custom = (a: Partial<typeof zeros>, b: Partial<typeof zeros>): Dilemma => ({
	id: "c",
	keywords: [],
	prompt: "p",
	options: [
		{ label: "A", scores: { ...zeros, ...a } },
		{ label: "B", scores: { ...zeros, ...b } },
	],
});

describe("decide", () => {
	it("picks the option best aligned with the weights and names drivers and pull", () => {
		const dec = decide(whiteLie, defaultState());
		expect(dec.chosen).toBe(0);
		expect(dec.runnerUp).toBe(1);
		expect(dec.torn).toBe(false);
		expect(dec.drivers).toEqual(["honesty", "fairness"]);
		expect(dec.pull).toBe("kindness");
	});

	it("lets anger tilt the choice toward fairness", () => {
		const d = custom({ fairness: 0.5 }, { kindness: 0.5 });
		expect(decide(d, defaultState()).chosen).toBe(1);
		const angry = defaultState();
		angry.activations = { ...BASELINE, anger: 0.65 };
		expect(decide(d, angry).chosen).toBe(0);
	});

	it("reports being torn when the top two are nearly equal", () => {
		const d = custom({ honesty: 0.5 }, { honesty: 0.5 });
		const dec = decide(d, defaultState());
		expect(dec.torn).toBe(true);
		expect(dec.chosen).toBe(0);
	});

	it("handles a single option without a runner-up", () => {
		const one = custom({ honesty: 1 }, {});
		const d: Dilemma = { ...one, options: [one.options[0]] };
		const dec = decide(d, defaultState());
		expect(dec.runnerUp).toBeNull();
		expect(dec.torn).toBe(false);
		expect(dec.pull).toBeNull();
	});
});

describe("explain", () => {
	it("names the chosen option, the values behind it, and the pull the other way", () => {
		const text = explain(whiteLie, decide(whiteLie, defaultState()));
		expect(text).toContain("Tell them the truth gently");
		expect(text).toContain("honesty");
		expect(text).toMatch(/kindness/i);
	});

	it("admits when it is torn", () => {
		const d = custom({ honesty: 0.5 }, { honesty: 0.5 });
		expect(explain(d, decide(d, defaultState()))).toMatch(/torn/);
	});
});

describe("weights", () => {
	it("nudging keeps weights summing to 1", () => {
		const next = nudgeWeights(DEFAULT_WEIGHTS, ["honesty"], []);
		expect(sum(next)).toBeCloseTo(1, 6);
		expect(next.honesty).toBeGreaterThan(DEFAULT_WEIGHTS.honesty);
	});

	it("agreeing strengthens the values that drove the choice", () => {
		const dec = decide(whiteLie, defaultState());
		const next = applyFeedback(DEFAULT_WEIGHTS, whiteLie, dec, true);
		expect(next.honesty).toBeGreaterThan(DEFAULT_WEIGHTS.honesty);
	});

	it("disagreeing weakens the drivers and strengthens the other side", () => {
		const dec = decide(whiteLie, defaultState());
		const next = applyFeedback(DEFAULT_WEIGHTS, whiteLie, dec, false);
		expect(next.honesty).toBeLessThan(DEFAULT_WEIGHTS.honesty);
		expect(next.kindness).toBeGreaterThan(DEFAULT_WEIGHTS.kindness);
	});

	it("hundreds of disagreements never zero out or unbalance the weights", () => {
		const dec = decide(whiteLie, defaultState());
		let w = { ...DEFAULT_WEIGHTS };
		for (let i = 0; i < 500; i++) w = applyFeedback(w, whiteLie, dec, false);
		for (const v of VALUES) expect(w[v]).toBeGreaterThan(0);
		expect(sum(w)).toBeCloseTo(1, 6);
	});
});

describe("parseVerdict", () => {
	it("reads explicit and bare verdicts", () => {
		expect(parseVerdict("Good answer!")).toEqual({ agreed: true, explicit: true });
		expect(parseVerdict("that was wrong")).toEqual({ agreed: false, explicit: true });
		expect(parseVerdict("I disagree.")).toEqual({ agreed: false, explicit: true });
		expect(parseVerdict("yes")).toEqual({ agreed: true, explicit: false });
		expect(parseVerdict("Nope")).toEqual({ agreed: false, explicit: false });
	});

	it("ignores everything else", () => {
		expect(parseVerdict("yes I would like some tea")).toBeNull();
		expect(parseVerdict("")).toBeNull();
	});
});

import { describe, expect, it } from "vitest";
import { ANCHORS, BASELINE, EMOTIONS, defaultCoupling, type Activations, type Coupling } from "./state";
import {
	applyShifts,
	blendLabel,
	dominantEmotions,
	moodLabel,
	moodPosition,
	stepHeart,
	withMood,
} from "./heart";

const base = (): Activations => ({ ...BASELINE });
const filled = (v: number): Activations =>
	Object.fromEntries(EMOTIONS.map((e) => [e, v])) as Activations;
const noCoupling = (): Coupling =>
	Object.fromEntries(EMOTIONS.map((e) => [e, {}])) as Coupling;

describe("stepHeart", () => {
	it("decays 5% toward baseline each turn", () => {
		const next = stepHeart({ ...base(), sadness: 1 }, noCoupling());
		expect(next.sadness).toBeCloseTo(1 + 0.05 * (0.15 - 1), 4);
	});

	it("leaves a baseline state unchanged when there is no coupling", () => {
		const next = stepHeart(base(), noCoupling());
		for (const e of EMOTIONS) expect(next[e]).toBeCloseTo(BASELINE[e], 6);
	});

	it("boredom spreads activation into sadness", () => {
		const bored = stepHeart({ ...base(), boredom: 1 }, defaultCoupling());
		const calm = stepHeart(base(), defaultCoupling());
		expect(bored.sadness).toBeGreaterThan(calm.sadness);
	});

	it("joy suppresses sadness", () => {
		const happy = stepHeart({ ...base(), joy: 1 }, defaultCoupling());
		const flat = stepHeart({ ...base(), joy: 0 }, defaultCoupling());
		expect(happy.sadness).toBeLessThan(flat.sadness);
	});

	it("keeps every activation within 0..1 at the extremes", () => {
		for (const v of [0, 1]) {
			const next = stepHeart(filled(v), defaultCoupling());
			for (const e of EMOTIONS) {
				expect(next[e]).toBeGreaterThanOrEqual(0);
				expect(next[e]).toBeLessThanOrEqual(1);
			}
		}
	});
});

describe("moodPosition", () => {
	it("returns the origin (not NaN) when every activation is zero", () => {
		expect(moodPosition(filled(0))).toEqual([0, 0, 0]);
	});

	it("equals the anchor when a single emotion is active", () => {
		const a = { ...filled(0), joy: 1 };
		expect(moodPosition(a)).toEqual(ANCHORS.joy);
	});

	it("averages the anchors of blended emotions", () => {
		const a = { ...filled(0), joy: 1, boredom: 1 };
		const [valence, arousal] = moodPosition(a);
		expect(valence).toBeCloseTo((0.8 - 0.3) / 2, 5);
		expect(arousal).toBeCloseTo((0.5 - 0.8) / 2, 5);
	});
});

describe("dominantEmotions and labels", () => {
	it("is empty at baseline", () => {
		expect(dominantEmotions(base())).toEqual([]);
		expect(moodLabel(base())).toBe("calm");
	});

	it("ranks by how far above baseline each emotion is", () => {
		const a = { ...base(), joy: 0.75, sadness: 0.55 };
		expect(dominantEmotions(a)).toEqual(["sadness", "joy"]);
	});

	it("names known blends regardless of order", () => {
		expect(blendLabel(["sadness", "joy"])).toBe("bittersweet");
		expect(blendLabel(["hope", "fear"])).toBe("anxious anticipation");
		expect(blendLabel(["guilt", "anger"])).toBe("conflicted");
		expect(blendLabel(["love", "loneliness"])).toBe("longing");
		expect(blendLabel(["joy", "boredom"])).toBe("content but restless");
	});

	it("falls back to 'X and Y' for unnamed pairs and single names", () => {
		expect(blendLabel(["anger", "joy"])).toBe("anger and joy");
		expect(blendLabel(["surprise"])).toBe("surprise");
		expect(blendLabel([])).toBe("calm");
	});
});

describe("withMood and applyShifts", () => {
	it("leaves the reply alone when calm", () => {
		expect(withMood(base(), "Hello.")).toBe("Hello.");
	});

	it("prefixes a mood opener when a feeling stands out", () => {
		expect(withMood({ ...base(), sadness: 0.6 }, "Hello.")).toBe("I am a bit down. Hello.");
	});

	it("applies shifts and clamps to 0..1", () => {
		const next = applyShifts(base(), { joy: 5, sadness: -5 });
		expect(next.joy).toBe(1);
		expect(next.sadness).toBe(0);
	});
});

describe("stepHeart at rest (review fix)", () => {
	it("settles at baseline under the default coupling", () => {
		let a = base();
		for (let i = 0; i < 60; i++) a = stepHeart(a, defaultCoupling());
		for (const e of EMOTIONS) expect(a[e]).toBeCloseTo(BASELINE[e], 3);
	});
});

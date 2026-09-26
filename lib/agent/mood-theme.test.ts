import { describe, expect, it } from "vitest";
import { BASELINE, EMOTIONS, type Activations } from "./state";
import { moodTheme } from "./mood-theme";

const base = (): Activations => ({ ...BASELINE });
const zero = (): Activations => Object.fromEntries(EMOTIONS.map((e) => [e, 0])) as Activations;

describe("moodTheme", () => {
	it("is calm, with a slow breath, at baseline", () => {
		const t = moodTheme(base());
		expect(t.tone).toBe("calm");
		expect(t.pulseSeconds).toBeGreaterThan(2.5);
		expect(t.pulseSeconds).toBeLessThan(4.5);
		expect(t.colorA).toMatch(/^hsl\(/);
		expect(t.colorB).toMatch(/^hsl\(/);
	});

	it("speeds the pulse up for high-arousal moods and slows it for low-arousal ones", () => {
		const calm = moodTheme(base()).pulseSeconds;
		expect(moodTheme({ ...base(), fear: 0.9 }).pulseSeconds).toBeLessThan(calm);
		expect(moodTheme({ ...base(), boredom: 0.9, sadness: 0.6 }).pulseSeconds).toBeGreaterThan(calm);
	});

	it("names the dominant emotion as the tone and colors the aura from it", () => {
		const sad = moodTheme({ ...base(), sadness: 0.7 });
		const fear = moodTheme({ ...base(), fear: 0.7 });
		expect(sad.tone).toBe("sadness");
		expect(fear.tone).toBe("fear");
		expect(sad.colorA).not.toBe(fear.colorA);
		expect(sad.colorA).not.toBe(moodTheme(base()).colorA);
	});

	it("uses the second emotion for the second color, and still differs when there is only one", () => {
		const two = moodTheme({ ...base(), sadness: 0.7, loneliness: 0.5 });
		expect(two.colorA).not.toBe(two.colorB);
		const one = moodTheme({ ...base(), anger: 0.7 });
		expect(one.colorA).not.toBe(one.colorB);
	});

	it("makes the glow stronger as the feeling gets stronger, within 0.35..1", () => {
		const mild = moodTheme({ ...base(), sadness: 0.3 }).strength;
		const strong = moodTheme({ ...base(), sadness: 0.95 }).strength;
		expect(mild).toBeGreaterThanOrEqual(0.35);
		expect(strong).toBeGreaterThan(mild);
		expect(strong).toBeLessThanOrEqual(1);
		expect(moodTheme(base()).strength).toBe(0.35);
	});

	it("reports valence: positive when joyful, negative when sad", () => {
		expect(moodTheme({ ...zero(), joy: 1 }).valence).toBeGreaterThan(0);
		expect(moodTheme({ ...zero(), sadness: 1 }).valence).toBeLessThan(0);
	});

	it("never produces NaN, even with every activation at zero", () => {
		const t = moodTheme(zero());
		expect(Number.isFinite(t.pulseSeconds)).toBe(true);
		expect(Number.isFinite(t.strength)).toBe(true);
		for (const c of [t.colorA, t.colorB, t.base]) expect(c).not.toMatch(/NaN/);
	});
});

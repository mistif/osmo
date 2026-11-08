import { describe, expect, it } from "vitest";
import { BASELINE, EMOTIONS, defaultState, type Activations } from "../state";
import { applyCues } from "../cues";
import { applyEvent, type StoryEvent } from "../events";
import { applyShifts, dominantEmotions, moodLabel, stepHeart } from "../heart";
import { moodTheme } from "../mood-theme";
import { feelingPhrase } from "../talk";
import { decide } from "../brain";
import { DILEMMAS } from "../dilemmas";

const base = (): Activations => ({ ...BASELINE });
const gloomy: Activations = { ...BASELINE, sadness: 0.45, joy: 0.35 };
const noCoupling = Object.fromEntries(EMOTIONS.map((e) => [e, {}])) as ReturnType<typeof defaultState>["coupling"];

describe("a different baseline", () => {
	it("stepHeart decays toward the given baseline", () => {
		const next = stepHeart({ ...base(), sadness: 0.9 }, noCoupling, gloomy);
		expect(next.sadness).toBeCloseTo(0.9 + 0.05 * (0.45 - 0.9), 5);
	});

	it("a resting state at the new baseline looks calm, but is not calm against the old one", () => {
		expect(dominantEmotions(gloomy, 3, gloomy)).toEqual([]);
		expect(moodLabel(gloomy, gloomy)).toBe("calm");
		expect(dominantEmotions(gloomy)).toContain("sadness");
		expect(feelingPhrase(gloomy, gloomy)).toBe("calm");
		expect(moodTheme(gloomy, gloomy).tone).toBe("calm");
		expect(moodTheme(gloomy).tone).toBe("sadness");
	});

	it("the brain's mood tilt is measured against the given baseline", () => {
		const d = DILEMMAS.find((x) => x.id === "white-lie")!;
		const angryByDefault = { ...defaultState(), activations: { ...base(), anger: 0.65 } };
		const restingAnger: Activations = { ...base(), anger: 0.65 };
		const a = decide(d, angryByDefault);
		const b = decide(d, angryByDefault, restingAnger);
		expect(b.scores[0]).not.toBe(a.scores[0]); // the same anger is no tilt when it is his resting level
	});
});

describe("reactivity scale", () => {
	it("scales shifts, cues and event effects", () => {
		expect(applyShifts(base(), { joy: 0.2 }, 0.5).joy).toBeCloseTo(base().joy + 0.1, 5);
		expect(applyCues(base(), "you are stupid", 2).anger).toBeCloseTo(base().anger + 0.5, 5);
		const event: StoryEvent = { id: "x", kind: "k", valence: "tragic", text: "t", shifts: { sadness: 0.2 } };
		expect(applyEvent(defaultState(), event, 0.5).activations.sadness).toBeCloseTo(base().sadness + 0.1, 5);
		expect(applyEvent(defaultState(), event).activations.sadness).toBeCloseTo(base().sadness + 0.2, 5);
	});
});

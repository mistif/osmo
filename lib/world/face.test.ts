import { describe, expect, it } from "vitest";
import { CHARACTER } from "../agent/character";
import type { Activations, Emotion, Mood } from "../agent/state";
import { bearing, TIRED_SPEED, WALK_SPEED } from "./face";

const base = CHARACTER.baseline;
const feel = (d: Partial<Activations> = {}, mood: Mood | null = null) => ({ activations: { ...base, ...d }, mood });
const cause = (tone: Emotion, at: number): Mood => ({ pad: [0, 0, 0], at, causes: [{ tone, because: "x", at }] });
const NOW = 1_800_000_000_000;

describe("his face and pace", () => {
	it("is attentive at rest, warm when glad, at the normal pace", () => {
		expect(bearing(feel(), NOW, 12)).toEqual({ face: "attentive", speed: WALK_SPEED });
		expect(bearing(feel({ joy: base.joy + 0.2 }), NOW, 12).face).toBe("warm");
		expect(bearing(feel({ love: base.love + 0.3 }), NOW, 12).face).toBe("warm");
	});
	it("puts Gur first: fear or sadness gives the attentive face even when glad", () => {
		expect(bearing(feel({ joy: base.joy + 0.3, fear: base.fear + 0.2 }), NOW, 12).face).toBe("attentive");
		expect(bearing(feel({ joy: base.joy + 0.3, sadness: base.sadness + 0.2 }), NOW, 12).face).toBe("attentive");
	});
	it("is tired and slower when bored or late", () => {
		expect(bearing(feel({ boredom: base.boredom + 0.3 }), NOW, 12)).toEqual({ face: "tired", speed: TIRED_SPEED });
		expect(bearing(feel(), NOW, 23.5)).toEqual({ face: "tired", speed: TIRED_SPEED });
		expect(bearing(feel(), NOW, 4.9).face).toBe("tired");
		expect(bearing(feel(), NOW, 5).face).toBe("attentive");
	});
	it("reads a fresh fear or sadness in the newest cause, and ignores an old one", () => {
		expect(bearing(feel({ joy: base.joy + 0.2 }, cause("sadness", NOW - 60_000)), NOW, 12).face).toBe("attentive");
		expect(bearing(feel({ joy: base.joy + 0.2 }, cause("sadness", NOW - 2 * 3_600_000)), NOW, 12).face).toBe("warm");
	});
});

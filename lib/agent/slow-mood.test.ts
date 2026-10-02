import { describe, expect, it } from "vitest";
import { CHARACTER } from "./character";
import { moodPosition } from "./heart";
import type { Vec3 } from "./state";
import { HALF_LIFE_MS, causeFor, moodWords, nudgeMood, relaxMood, slowEmotion } from "./slow-mood";
const T = moodPosition(CHARACTER.baseline);
const at = (pad: Vec3, t = 0) => ({ pad, at: t, causes: [] });
const away = (m: ReturnType<typeof at>, ms: number) => Math.hypot(...relaxMood(m, ms).pad.map((v, i) => v - T[i]));
describe("slow mood", () => {
	it("halves its distance from rest every 12 hours", () => {
		const m = at([T[0] - 0.4, T[1], T[2]]);
		expect([away(m, HALF_LIFE_MS), away(m, 2 * HALF_LIFE_MS)]).toEqual([expect.closeTo(0.2, 5), expect.closeTo(0.1, 5)]);
	});
	it("counts a backwards clock as no time, starts null at rest, drops causes over 36 hours", () => {
		expect(relaxMood(at([0, 0, 0], 1000), 0).pad).toEqual([0, 0, 0]);
		expect(relaxMood(null, 50)).toEqual({ pad: T, at: 50, causes: [] });
		const m = { ...at(T), causes: [{ tone: "love" as const, because: "old", at: 0 }, { tone: "trust" as const, because: "new", at: 40 * 3_600_000 }] };
		expect(relaxMood(m, 40 * 3_600_000).causes.map((c) => c.because)).toEqual(["new"]);
		expect([causeFor(m, "love", 1000), causeFor(m, "joy", 1000), causeFor(m, "love", 40 * 3_600_000)]).toEqual(["old", null, null]);
	});
	it("nudges 15% toward the feelings, and names the direction of a clear drift", () => {
		expect(nudgeMood(at([0, 0, 0]), { ...CHARACTER.baseline }).pad[0]).toBeCloseTo(0.15 * T[0], 5);
		const drift = at([T[0] + 0.1, T[1] + 0.05, T[2] + 0.05]);
		expect([slowEmotion(at(T), CHARACTER.baseline), slowEmotion(drift, CHARACTER.baseline)]).toEqual([null, "joy"]);
		expect(slowEmotion(drift, CHARACTER.baseline, ["joy"])).not.toBe("joy");
	});
});

describe("moodWords", () => {
	it("says nothing at rest or when resting, and an adjective for a clear drift", () => {
		expect([moodWords(null), moodWords(at(T))]).toEqual(["", ""]);
		expect(moodWords(at([T[0] + 0.1, T[1] + 0.05, T[2] + 0.05]))).toBe("happy");
	});
});

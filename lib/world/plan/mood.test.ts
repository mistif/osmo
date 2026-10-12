import { describe, expect, it } from "vitest";
import { CHARACTER } from "../../agent/character";
import { moodPosition } from "../../agent/heart";
import type { Mood } from "../../agent/state";
import { MOOD_RECIPES, moodOf } from "./mood";

const NOW = Date.UTC(2026, 9, 11, 12);
// The slow mood at rest (no drift), so only the newest cause speaks.
const cause = (tone: Mood["causes"][number]["tone"], at = NOW - 60_000): Mood => ({ pad: moodPosition(CHARACTER.baseline), at: NOW, causes: [{ tone, because: "test", at }] });
const at = (mood: Mood | null, over: Partial<{ awayMs: number; hour: number }> = {}) => moodOf({ mood, now: NOW, awayMs: 0, hour: 14, ...over });

describe("the mood he builds from (spec 5.3)", () => {
	it("reads Gur's long absence first", () => {
		expect(at(cause("joy"), { awayMs: 3 * 86_400_000 })).toBe("missing");
	});
	it("reads lonely or low, tired, bright and curious from the newest cause when the slow mood is at rest", () => {
		expect(at(cause("loneliness"))).toBe("low");
		expect(at(cause("sadness"))).toBe("low");
		expect(at(cause("boredom"))).toBe("tired");
		expect(at(cause("joy"))).toBe("bright");
		expect(at(cause("hope"))).toBe("bright");
		expect(at(cause("surprise"))).toBe("curious");
		expect(at(cause("anger"))).toBe("calm");
		expect(at(null)).toBe("calm");
	});
	it("is tired late at night unless low, and forgets a cause older than 36 hours", () => {
		expect(at(cause("joy"), { hour: 23.5 })).toBe("tired");
		expect(at(cause("sadness"), { hour: 2 })).toBe("low");
		expect(at(cause("joy", NOW - 37 * 3_600_000))).toBe("calm");
	});
	it("leans each mood toward the spec's builds", () => {
		expect(MOOD_RECIPES).toEqual({
			low: ["lantern-walk", "garden", "shrine"], bright: ["tower", "bell-tower", "lighthouse"], tired: ["well", "statue", "garden"],
			calm: ["belvedere", "orchard", "pond"], curious: [], missing: [],
		});
	});
});

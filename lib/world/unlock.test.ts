import { describe, expect, it } from "vitest";
import { cleanCounts, NO_COUNTS, openRooms, type VillageCounts } from "./unlock";

const open = (counts: Partial<VillageCounts>, settingsOpened = false) => openRooms({ counts: { ...NO_COUNTS, ...counts }, settingsOpened });

describe("unlocking", () => {
	it("opens only the hall on day one", () => {
		expect(open({})).toEqual(["hall"]);
	});
	it("opens the library for the first fact or the first note", () => {
		expect(open({ memories: 1 })).toEqual(["hall", "library"]);
		expect(open({ notes: 1 })).toEqual(["hall", "library"]);
	});
	it("opens the workshop for the first thing he made, the gate for the first reminder", () => {
		expect(open({ things: 1 })).toEqual(["hall", "workshop"]);
		expect(open({ reminders: 2 })).toEqual(["hall", "gate"]);
	});
	it("opens the study for the first idea or goal, which nothing counts until the shell's phase B", () => {
		expect(open({ ideas: 1 })).toEqual(["hall", "study"]);
		expect(open({ goals: 1 })).toEqual(["hall", "study"]);
	});
	it("opens the observatory once Settings has been opened in the new shell", () => {
		expect(open({}, true)).toEqual(["hall", "observatory"]);
	});
	it("lists every open room in spec order, however they opened", () => {
		expect(open({ reminders: 1, things: 3, memories: 9, goals: 1 }, true)).toEqual(["hall", "library", "workshop", "study", "gate", "observatory"]);
	});
	it("reads a count that is not a whole number of at least one as none", () => {
		expect(cleanCounts({ memories: Number.NaN, notes: -3, things: "4", reminders: Infinity, ideas: 2.9, goals: undefined })).toEqual({
			memories: 0, notes: 0, things: 0, reminders: 0, ideas: 2, goals: 0,
		});
		expect(open({ memories: Number.NaN, notes: -1, things: 0.5 })).toEqual(["hall"]);
	});
});

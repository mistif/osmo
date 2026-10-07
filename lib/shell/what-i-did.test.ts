import { describe, expect, it } from "vitest";
import { describeAction, sanitizeActionRow, type ActionRow } from "./what-i-did";

const now = new Date(2026, 9, 7, 12).getTime();
const at = new Date(2026, 9, 8, 9, 12).toISOString();
const row = (over: Partial<ActionRow> = {}): ActionRow => ({
	id: 1,
	at,
	surface: "room",
	status: "done",
	summary: "Reminder set for Friday 10 October at 09:00",
	...over,
});

describe("describeAction", () => {
	it("writes the day, time, surface, status word and summary", () => {
		expect(describeAction(row(), now)).toBe(
			"Thursday 8 October, 09:12, in the room: done. Reminder set for Friday 10 October at 09:00.",
		);
	});

	it("gives each status a plain word", () => {
		const words: Record<string, string> = {
			done: "done",
			failed: "could not do it",
			refused: "not allowed",
			cancelled: "cancelled",
			expired: "expired",
		};
		for (const [status, word] of Object.entries(words)) {
			expect(describeAction(row({ status }), now)).toContain(`: ${word}.`);
		}
	});

	it("speaks each surface", () => {
		expect(describeAction(row({ surface: "room" }), now)).toContain("in the room");
		expect(describeAction(row({ surface: "telegram" }), now)).toContain("from Telegram");
		expect(describeAction(row({ surface: "cron" }), now)).toContain("by the timer");
		expect(describeAction(row({ surface: "confirm" }), now)).toContain("after your yes");
	});

	it("reads a waiting row as Waiting for your yes", () => {
		const line = describeAction(row({ status: "waiting" }), now);
		expect(line.startsWith("Waiting for your yes")).toBe(true);
		expect(line).toContain("Reminder set for");
	});

	it("adds the year only when it differs", () => {
		expect(describeAction(row(), now)).not.toContain("2026");
		expect(describeAction(row({ at: new Date(2025, 0, 2, 10).toISOString() }), now)).toContain("January 2025");
	});

	it("does not double an ending full stop", () => {
		expect(describeAction(row({ summary: "Done already." }), now)).toMatch(/Done already\.$/);
	});

	it("never throws on an unknown status, an unknown surface or an invalid date", () => {
		expect(() => describeAction(row({ status: "odd", surface: "odd", at: "nonsense", summary: "" }), now)).not.toThrow();
		expect(describeAction(row({ status: "odd", surface: "odd", at: "nonsense", summary: "Did a thing" }), now)).toBe("Did a thing.");
		expect(describeAction(row({ at: "nonsense" }), now)).toContain("in the room: done.");
		expect(describeAction(row({ status: "waiting", at: "", surface: "", summary: "" }), now)).toBe("Waiting for your yes.");
		expect(describeAction(row({ status: "failed", at: "", surface: "", summary: "" }), now)).toBe("Could not do it.");
	});

	it("never writes an exclamation mark of its own", () => {
		expect(describeAction(row({ summary: "" }), now)).not.toContain("!");
	});
});

describe("sanitizeActionRow", () => {
	it("keeps a good row and rejects junk", () => {
		expect(sanitizeActionRow({ id: 3, at, surface: "room", status: "done", summary: "x" })).toEqual({
			id: 3, at, surface: "room", status: "done", summary: "x",
		});
		expect(sanitizeActionRow(null)).toBeNull();
		expect(sanitizeActionRow({ at })).toBeNull();
		expect(sanitizeActionRow({ id: 2, summary: 5 })?.summary).toBe("");
	});
});

import { describe, expect, it } from "vitest";
import { dueLine, sanitizeNote, sanitizeReminder } from "./reminders-notes";

const NOW = Date.parse("2026-10-07T12:00:00Z");

describe("sanitizeReminder and sanitizeNote", () => {
	it("keep a well-formed row and drop anything else", () => {
		expect(sanitizeReminder({ id: "r1", text: "Call Dad", due_at: "2026-10-08T09:00:00Z", extra: 1 })).toEqual({ id: "r1", text: "Call Dad", due_at: "2026-10-08T09:00:00Z", missed: false });
		expect(sanitizeReminder({ id: "r1", text: "Call Dad", due_at: "2026-10-08T09:00:00Z", status: "missed" })).toEqual({ id: "r1", text: "Call Dad", due_at: "2026-10-08T09:00:00Z", missed: true });
		expect(sanitizeReminder({ id: 5, text: "x", due_at: "2026-10-08T09:00:00Z" })).toBeNull();
		expect(sanitizeReminder({ id: "r1", text: "x", due_at: "not a date" })).toBeNull();
		expect(sanitizeReminder(null)).toBeNull();
		expect(sanitizeNote({ id: "n1", text: "Milk", created_at: "2026-10-01T09:00:00Z" })).toEqual({ id: "n1", text: "Milk", created_at: "2026-10-01T09:00:00Z" });
		expect(sanitizeNote({ id: "n1", text: 7, created_at: "2026-10-01T09:00:00Z" })).toBeNull();
		expect(sanitizeNote("nope")).toBeNull();
	});
});

describe("dueLine", () => {
	it("says the weekday, day, month and time", () => {
		const line = dueLine("2026-10-08T09:00:00", NOW);
		expect(line).toMatch(/^Thursday 8 October, \d{2}:\d{2}$/);
	});

	it("adds the year when it is not this year", () => {
		expect(dueLine("2027-01-05T09:00:00", NOW)).toMatch(/^Tuesday 5 January 2027, \d{2}:\d{2}$/);
	});

	it("is empty for a bad date", () => {
		expect(dueLine("whenever", NOW)).toBe("");
	});
});

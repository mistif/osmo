import { describe, expect, it } from "vitest";
import { localToUtc, speak, todayLine, validDue } from "./time";

const STO = "Europe/Stockholm";
const DAY = 86_400_000;

describe("localToUtc", () => {
	it("converts a local time in the zone to the UTC instant", () => {
		expect(localToUtc("2026-10-08T09:00", STO)).toBe(Date.UTC(2026, 9, 8, 7, 0)); // summer time, +2
		expect(localToUtc("2026-12-08T09:00", STO)).toBe(Date.UTC(2026, 11, 8, 8, 0)); // winter time, +1
		expect(localToUtc("2026-11-02T09:00", "America/New_York")).toBe(Date.UTC(2026, 10, 2, 14, 0)); // DST ended on the 1st
		expect(localToUtc("2026-10-08T09:00", "UTC")).toBe(Date.UTC(2026, 9, 8, 9, 0));
	});

	it("settles either side of a DST change", () => {
		// Stockholm: clocks went back on 2026-10-25 at 03:00 local, forward on 2026-03-29.
		expect(localToUtc("2026-10-24T23:30", STO)).toBe(Date.UTC(2026, 9, 24, 21, 30));
		expect(localToUtc("2026-10-25T08:00", STO)).toBe(Date.UTC(2026, 9, 25, 7, 0));
		expect(localToUtc("2026-03-29T08:00", STO)).toBe(Date.UTC(2026, 2, 29, 6, 0));
	});

	it("gives null for a local time the clocks skipped, and keeps the hour after it", () => {
		expect(localToUtc("2027-03-14T02:30", "America/New_York")).toBeNull(); // 02:00 became 03:00
		expect(localToUtc("2027-03-28T02:30", STO)).toBeNull(); // 02:00 became 03:00
		expect(localToUtc("2027-03-14T03:30", "America/New_York")).toBe(Date.UTC(2027, 2, 14, 7, 30)); // EDT, -4
		expect(localToUtc("2027-03-28T03:30", STO)).toBe(Date.UTC(2027, 2, 28, 1, 30)); // CEST, +2
		expect(localToUtc("2027-03-14T01:30", "America/New_York")).toBe(Date.UTC(2027, 2, 14, 6, 30)); // EST, -5
		expect(validDue("2027-03-28T02:30", STO, Date.UTC(2027, 0, 1))).toBeNull();
	});

	it("still takes the repeated hour when the clocks go back", () => {
		expect(localToUtc("2026-10-25T02:30", STO)).not.toBeNull();
	});

	it("gives null for anything that is not a real local time", () => {
		for (const bad of ["2026-02-30T09:00", "2026-10-08T24:00", "2026-10-08T09:60", "2026-13-01T09:00", "2026-10-08 09:00", "2026-10-08T09:00:00", "tomorrow", "", "2026-10-08"]) {
			expect(localToUtc(bad, STO), bad).toBeNull();
		}
		expect(localToUtc("2026-10-08T09:00", "Mars/Base")).toBeNull();
		expect(localToUtc("2026-10-08T09:00", "")).toBeNull();
	});
});

describe("validDue", () => {
	const now = Date.UTC(2026, 9, 7, 12, 0);
	it("accepts a future time within a year", () => {
		expect(validDue("2026-10-08T09:00", STO, now)).toBe(Date.UTC(2026, 9, 8, 7, 0));
		expect(validDue("2026-10-07T14:01", STO, now)).toBe(Date.UTC(2026, 9, 7, 12, 1));
	});
	it("rejects the past, exactly now, and more than 366 days ahead", () => {
		expect(validDue("2026-10-07T08:00", STO, now)).toBeNull();
		expect(validDue("2026-10-07T14:00", STO, now)).toBeNull(); // exactly now
		expect(validDue("2026-10-07T14:00", STO, now - 1)).not.toBeNull();
		const last = validDue("2027-10-08T14:00", "UTC", Date.UTC(2026, 9, 7, 14, 0)); // 366 days
		expect(last).toBe(Date.UTC(2026, 9, 7, 14, 0) + 366 * DAY);
		expect(validDue("2027-10-09T14:00", "UTC", Date.UTC(2026, 9, 7, 14, 0))).toBeNull(); // 367 days
	});
	it("rejects what localToUtc rejects", () => {
		expect(validDue("tomorrow", STO, now)).toBeNull();
		expect(validDue("2026-10-08T09:00", "Mars/Base", now)).toBeNull();
	});
});

describe("speak and todayLine", () => {
	it("writes the weekday, the date and the 24-hour time in the zone", () => {
		expect(speak(Date.UTC(2026, 9, 8, 7, 0), STO)).toMatch(/^Thursday,? 8 October at 09:00$/);
		expect(speak(Date.UTC(2026, 9, 14, 21, 5), STO)).toMatch(/^Wednesday,? 14 October at 23:05$/);
		expect(speak(Date.UTC(2026, 9, 7, 22, 30), STO)).toMatch(/^Thursday,? 8 October at 00:30$/); // past midnight there
	});
	it("gives today's date and time in the zone, UTC when there is none or it is unknown", () => {
		const now = Date.UTC(2026, 9, 7, 22, 30);
		expect(todayLine(now, STO)).toMatch(/Thursday,? 8 October 2026,? 00:30/);
		expect(todayLine(now, null)).toMatch(/Wednesday,? 7 October 2026,? 22:30/);
		expect(todayLine(now, "Mars/Base")).toMatch(/Wednesday,? 7 October 2026,? 22:30/);
	});
});

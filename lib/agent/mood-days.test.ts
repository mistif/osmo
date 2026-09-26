import { describe, expect, it } from "vitest";
import { dayName, foldMood, sanitizeMoodDay, strongestPhrase, weekSeries, type MoodDay } from "./mood-days";

describe("foldMood", () => {
	it("starts a fresh row for a new day", () => {
		expect(foldMood(null, "2026-09-26", 0.4, "hope")).toEqual({
			day: "2026-09-26",
			valence: 0.4,
			strongest: "hope",
			tally: { hope: 1 },
			samples: 1,
		});
	});

	it("keeps a running average and tallies the strongest emotion", () => {
		let row = foldMood(null, "2026-09-26", 0.6, "joy");
		row = foldMood(row, "2026-09-26", 0, "calm");
		row = foldMood(row, "2026-09-26", 0.3, "calm");
		expect(row.samples).toBe(3);
		expect(row.valence).toBeCloseTo(0.3);
		expect(row.tally).toEqual({ joy: 1, calm: 2 });
		expect(row.strongest).toBe("calm");
	});

	it("keeps the current strongest on a tie", () => {
		let row = foldMood(null, "2026-09-26", 0, "joy");
		row = foldMood(row, "2026-09-26", 0, "sadness");
		expect(row.strongest).toBe("joy");
	});

	it("never carries yesterday's numbers into a new day", () => {
		const yesterday = foldMood(null, "2026-09-25", -0.8, "sadness");
		expect(foldMood(yesterday, "2026-09-26", 0.2, "calm")).toEqual({
			day: "2026-09-26",
			valence: 0.2,
			strongest: "calm",
			tally: { calm: 1 },
			samples: 1,
		});
	});
});

describe("weekSeries", () => {
	const row = (day: string, valence: number, strongest = "calm"): MoodDay => ({ day, valence, strongest, tally: { [strongest]: 1 }, samples: 1 });

	it("returns the last 7 local days, oldest first, with gaps as null", () => {
		const series = weekSeries([row("2026-09-21", 0.1), row("2026-09-26", 0.5, "hope")], "2026-09-26");
		expect(series.map((d) => d.day)).toEqual([
			"2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26",
		]);
		expect(series[0]).toEqual({ day: "2026-09-20", valence: null, strongest: null });
		expect(series[1]).toEqual({ day: "2026-09-21", valence: 0.1, strongest: "calm" });
		expect(series[6]).toEqual({ day: "2026-09-26", valence: 0.5, strongest: "hope" });
	});

	it("crosses month and year boundaries on local days", () => {
		expect(weekSeries([], "2026-03-02").map((d) => d.day)[0]).toBe("2026-02-24");
		expect(weekSeries([], "2027-01-03").map((d) => d.day)[0]).toBe("2026-12-28");
	});

	it("ignores rows outside the window", () => {
		expect(weekSeries([row("2026-09-01", 0.9)], "2026-09-26").every((d) => d.valence === null)).toBe(true);
	});
});

describe("wording and sanitizing", () => {
	it("phrases the strongest emotion", () => {
		expect(strongestPhrase("hope")).toBe("mostly hopeful");
		expect(strongestPhrase("calm")).toBe("mostly calm");
		expect(strongestPhrase("loneliness")).toBe("mostly lonely");
		expect(strongestPhrase("unknown")).toBe("mostly calm");
	});

	it("names a local day without UTC drift", () => {
		expect(dayName("2026-09-22")).toBe("Tuesday");
		expect(dayName("2026-09-27")).toBe("Sunday");
	});

	it("repairs rows read from the database", () => {
		expect(sanitizeMoodDay(null)).toBeNull();
		expect(sanitizeMoodDay({ day: "2026-09-26", valence: "x" })).toBeNull();
		expect(sanitizeMoodDay({ day: "2026-09-26", valence: 0.2, strongest: "hope", tally: { hope: 2 }, samples: 2 })).toEqual({
			day: "2026-09-26", valence: 0.2, strongest: "hope", tally: { hope: 2 }, samples: 2,
		});
		expect(sanitizeMoodDay({ day: "2026-09-26", valence: 0.2, strongest: "hope", tally: "bad", samples: -3 })).toEqual({
			day: "2026-09-26", valence: 0.2, strongest: "hope", tally: {}, samples: 0,
		});
	});
});

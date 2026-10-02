import { describe, expect, it } from "vitest";
import { emptyBond, type Bond } from "../agent/bond/bond";
import { shortDate, storyLines } from "./story";

const now = new Date(2026, 8, 30, 12).getTime();

describe("shortDate", () => {
	it("writes a short local date, adding the year only when it differs", () => {
		expect(shortDate(new Date(2026, 8, 24, 10).toISOString(), now)).toBe("24 Sep");
		expect(shortDate(new Date(2025, 0, 2, 10).toISOString(), now)).toBe("2 Jan 2025");
	});
});

describe("storyLines", () => {
	it("tells the milestones in order, as past-tense sentences", () => {
		const at = (d: number) => new Date(2026, 8, d, 10).toISOString();
		const bond: Bond = {
			...emptyBond(),
			milestones: [
				{ id: "friend", at: at(29) },
				{ id: "met", at: at(24) },
				{ id: "name", at: at(24) },
			],
		};
		expect(storyLines(bond, now)).toEqual([
			{ id: "met", date: "24 Sep", text: "We met" },
			{ id: "name", date: "24 Sep", text: "You told me your name" },
			{ id: "friend", date: "29 Sep", text: "I came to think of you as a friend" },
		]);
		expect(storyLines(emptyBond(), now)).toEqual([]);
	});
});

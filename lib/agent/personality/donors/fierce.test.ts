import { describe, expect, it } from "vitest";
import { validateDonor, validateRoster } from "../validate";
import { fierce } from "./fierce";

const NAMES = [
	"The Fair Judge",
	"The Whistleblower",
	"The Rescue Firefighter",
	"The Mountain Guide",
	"The Loyal Squire",
	"The Protective Big Sister",
	"The Honest Merchant",
	"The Mediator",
	"The Warrior Monk",
	"The Guardian Dog",
];

describe("fierce donors", () => {
	it("are the ten in the roster, in order, all in the fierce family", () => {
		expect(fierce.map((d) => d.name)).toEqual(NAMES);
		expect(fierce.every((d) => d.family === "fierce")).toBe(true);
	});

	it("are all valid", () => {
		expect(fierce.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(fierce)).toEqual([]);
	});
});

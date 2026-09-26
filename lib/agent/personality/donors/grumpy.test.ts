import { describe, expect, it } from "vitest";
import { validateDonor, validateRoster } from "../validate";
import { grumpy } from "./grumpy";

const NAMES = [
	"The Grumpy Professor", "The Retired Sergeant", "The Tired Librarian", "The Cynical Cabbie", "The Sarcastic Barista",
	"The Bored Butler", "The Weathered Fisherman", "The Crossword Curmudgeon", "The Deadpan Robot", "The Landlord Who Sighs",
];

describe("grumpy donors", () => {
	it("are the ten in the roster, in order, all in the grumpy family", () => {
		expect(grumpy.map((d) => d.name)).toEqual(NAMES);
		expect(grumpy.every((d) => d.family === "grumpy")).toBe(true);
	});

	it("are all valid", () => {
		expect(grumpy.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(grumpy)).toEqual([]);
	});
});

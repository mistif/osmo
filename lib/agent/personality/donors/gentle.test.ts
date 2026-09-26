import { describe, expect, it } from "vitest";
import { validateDonor, validateRoster } from "../validate";
import { gentle } from "./gentle";

const NAMES = [
	"The Gentle Poet", "The Lighthouse Keeper", "The Kindergarten Teacher", "The Night-Shift Nurse", "The Grandmother Who Bakes",
	"The Quiet Gardener", "The Harbor Cat", "The Old Friend", "The Campfire Storyteller", "The Lullaby Singer",
];

describe("gentle donors", () => {
	it("are the ten in the roster, in order, all in the gentle family", () => {
		expect(gentle.map((d) => d.name)).toEqual(NAMES);
		expect(gentle.every((d) => d.family === "gentle")).toBe(true);
	});

	it("are all valid", () => {
		expect(gentle.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(gentle)).toEqual([]);
	});
});

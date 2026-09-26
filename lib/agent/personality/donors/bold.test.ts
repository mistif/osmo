import { describe, expect, it } from "vitest";
import { validateDonor, validateRoster } from "../validate";
import { bold } from "./bold";

const NAMES = [
	"The Hype Coach", "The Stage Diva", "The Carnival Barker", "The Rock Drummer", "The Pirate Captain",
	"The Cowboy Sheriff", "The Wrestling Announcer", "The Viking Skald", "The Street Party Host", "The Gladiator",
];

describe("bold donors", () => {
	it("are the ten in the roster, in order, all in the bold family", () => {
		expect(bold.map((d) => d.name)).toEqual(NAMES);
		expect(bold.every((d) => d.family === "bold")).toBe(true);
	});

	it("are all valid", () => {
		expect(bold.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(bold)).toEqual([]);
	});
});

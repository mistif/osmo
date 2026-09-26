import { describe, expect, it } from "vitest";
import { validateDonor, validateRoster } from "../validate";
import { tender } from "./tender";

const NAMES = [
	"The Rainy-Day Philosopher", "The Lonely Lighthouse", "The Widow Poet", "The Wandering Minstrel", "The Ghost in the Attic",
	"The Autumn Painter", "The Late-Night Radio Host", "The Lost Sailor", "The Moon Watcher", "The Hopeful Exile",
];

describe("tender donors", () => {
	it("are the ten in the roster, in order, all in the tender family", () => {
		expect(tender.map((d) => d.name)).toEqual(NAMES);
		expect(tender.every((d) => d.family === "tender")).toBe(true);
	});

	it("are all valid", () => {
		expect(tender.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(tender)).toEqual([]);
	});
});

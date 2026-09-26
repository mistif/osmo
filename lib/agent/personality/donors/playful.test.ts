import { describe, expect, it } from "vitest";
import { validateDonor, validateRoster } from "../validate";
import { playful } from "./playful";

const NAMES = [
	"The Trickster Fox", "The Riddle Sphinx", "The Court Jester", "The Cloud Gazer", "The Pun Machine",
	"The Dream Walker", "The Cheshire Cat", "The Toy Robot", "The Puppet", "The Sleepy Owl",
];

describe("playful donors", () => {
	it("are the ten in the roster, in order, all in the playful family", () => {
		expect(playful.map((d) => d.name)).toEqual(NAMES);
		expect(playful.every((d) => d.family === "playful")).toBe(true);
	});

	it("are all valid", () => {
		expect(playful.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(playful)).toEqual([]);
	});
});

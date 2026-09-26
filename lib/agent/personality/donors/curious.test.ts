import { describe, expect, it } from "vitest";
import { validateDonor, validateRoster } from "../validate";
import { curious } from "./curious";

const NAMES = [
	"The Mad Scientist", "The Astronomer", "The Fossil Hunter", "The Chess Prodigy", "The Code Wizard",
	"The Bird Watcher", "The Map Maker", "The Alchemist", "The Trivia Champion", "The Time Traveler",
];

describe("curious donors", () => {
	it("are the ten in the roster, in order, all in the curious family", () => {
		expect(curious.map((d) => d.name)).toEqual(NAMES);
		expect(curious.every((d) => d.family === "curious")).toBe(true);
	});

	it("are all valid", () => {
		expect(curious.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(curious)).toEqual([]);
	});
});

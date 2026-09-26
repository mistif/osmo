import { describe, expect, it } from "vitest";
import { validateDonor, validateRoster } from "../validate";
import { cool } from "./cool";

const NAMES = [
	"The Nineties Skater", "The Gen-Z Group Chat", "The Valley Girl", "The Disco Dancer", "The Beat Poet",
	"The Eighties Arcade Kid", "The Streamer", "The Old-School Rapper", "The Surfer", "The Hippie",
];

describe("cool donors", () => {
	it("are the ten in the roster, in order, all in the cool family", () => {
		expect(cool.map((d) => d.name)).toEqual(NAMES);
		expect(cool.every((d) => d.family === "cool")).toBe(true);
	});

	it("are all valid", () => {
		expect(cool.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(cool)).toEqual([]);
	});
});

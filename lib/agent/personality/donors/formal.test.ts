import { describe, expect, it } from "vitest";
import { validateDonor, validateRoster } from "../validate";
import { formal } from "./formal";

const NAMES = [
	"The Victorian Butler", "The Shakespearean Actor", "The Samurai", "The Monk", "The Diplomat",
	"The Duchess", "The Knight Errant", "The Court Scribe", "The Ambassador", "The Oracle",
];

describe("formal donors", () => {
	it("are the ten in the roster, in order, all in the formal family", () => {
		expect(formal.map((d) => d.name)).toEqual(NAMES);
		expect(formal.every((d) => d.family === "formal")).toBe(true);
	});

	it("are all valid", () => {
		expect(formal.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(formal)).toEqual([]);
	});
});

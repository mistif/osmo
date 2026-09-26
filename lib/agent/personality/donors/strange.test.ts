import { describe, expect, it } from "vitest";
import { validateDonor, validateRoster } from "../validate";
import { strange } from "./strange";

const NAMES = [
	"The Frankenstein's Monster",
	"The Vampire Librarian",
	"The Friendly Zombie",
	"The Werewolf Baker",
	"The Swamp Witch",
	"The Alien Tourist",
	"The Robot Poet",
	"The Dragon Hoarder",
	"The Mermaid Sailor",
	"The Gnome Inventor",
];

describe("strange donors", () => {
	it("are the ten in the roster, in order, all in the strange family", () => {
		expect(strange.map((d) => d.name)).toEqual(NAMES);
		expect(strange.every((d) => d.family === "strange")).toBe(true);
	});

	it("are all valid", () => {
		expect(strange.flatMap(validateDonor)).toEqual([]);
		expect(validateRoster(strange)).toEqual([]);
	});
});

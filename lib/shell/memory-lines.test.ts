import { describe, expect, it } from "vitest";
import { cleanEditedValue, groupMemory, memoryLine } from "./memory-lines";

describe("memoryLine", () => {
	it("speaks each kind of memory in Osmo's first person, keeping the editable value separate", () => {
		expect(memoryLine({ key: "name", value: "Gur" })).toEqual({
			key: "name", group: "about", sentence: "You told me your name is Gur.", lead: "You told me your name is", value: "Gur",
		});
		expect(memoryLine({ key: "likes", value: "pizza" }).sentence).toBe("You told me you like pizza.");
		expect(memoryLine({ key: "dog", value: "Nala" }).sentence).toBe("You told me your dog is Nala.");
		expect(memoryLine({ key: "slang:bet", value: "okay" })).toMatchObject({
			group: "words", sentence: 'You taught me that "bet" means okay.', lead: 'You taught me that "bet" means',
		});
		expect(memoryLine({ key: "meaning:zorp blat", value: "a kind of snack" })).toMatchObject({
			group: "explained", sentence: 'You explained that "zorp blat" means a kind of snack.',
		});
	});

	it("drops one trailing mark from the sentence only, keeping the stored value as it is", () => {
		expect(memoryLine({ key: "dog", value: "Nala." }).sentence).toBe("You told me your dog is Nala.");
		expect(memoryLine({ key: "likes", value: "pizza!" }).sentence).toBe("You told me you like pizza.");
		expect(memoryLine({ key: "likes", value: "pizza?" }).sentence).toBe("You told me you like pizza.");
		expect(memoryLine({ key: "dog", value: "Nala." }).value).toBe("Nala.");
		expect(memoryLine({ key: "likes", value: "pizza!" }).value).toBe("pizza!");
	});
});

describe("groupMemory", () => {
	it("groups facts, with the name first in About you", () => {
		const groups = groupMemory([
			{ key: "dog", value: "Nala" },
			{ key: "slang:bet", value: "okay" },
			{ key: "name", value: "Gur" },
			{ key: "meaning:zorp", value: "a snack" },
		]);
		expect(groups.about.map((l) => l.key)).toEqual(["name", "dog"]);
		expect(groups.words.map((l) => l.key)).toEqual(["slang:bet"]);
		expect(groups.explained.map((l) => l.key)).toEqual(["meaning:zorp"]);
		expect(groupMemory([])).toEqual({ about: [], words: [], explained: [] });
	});
});

describe("cleanEditedValue", () => {
	it("trims, and treats an empty edit as a cancel", () => {
		expect(cleanEditedValue("  Nala  ")).toBe("Nala");
		expect(cleanEditedValue("   ")).toBeNull();
		expect(cleanEditedValue("")).toBeNull();
	});
});

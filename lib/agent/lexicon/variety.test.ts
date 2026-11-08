import { describe, expect, it } from "vitest";
import { vary } from "./variety";

describe("vary", () => {
	it("rotates words from its sets by turn, keeping capitals", () => {
		expect(vary("That sounds difficult.", 0)).toBe("That sounds difficult.");
		expect(vary("That sounds difficult.", 1)).toBe("That sounds hard.");
		expect(vary("Understood. What is next?", 1)).toBe("Very well. What is next?");
		expect(vary("I'm glad you're feeling good.", 1)).toBe("I'm pleased you're feeling good.");
	});

	it("never touches quotes, other words, or words the user used", () => {
		expect(vary('Say "yes, roll" and it is difficult.', 1)).toBe('Say "yes, roll" and it is hard.');
		expect(vary("That sounds difficult.", 1, new Set(["difficult"]))).toBe("That sounds difficult.");
		expect(vary("I'm feeling happy.", 3)).toBe("I'm feeling happy.");
	});
});

describe("vary keeps fixed phrases whole", () => {
	it("never turns 'a great deal' into something else", () => {
		for (let turn = 0; turn < 4; turn++) expect(vary("That means a great deal. I care about you too.", turn)).toBe("That means a great deal. I care about you too.");
	});
});

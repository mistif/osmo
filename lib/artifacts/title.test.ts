import { describe, expect, it } from "vitest";
import { cleanTitle, partialTitle } from "./title";

describe("partialTitle", () => {
	it("needs a complete first line", () => {
		expect(partialTitle("// title: Tip splitter")).toBeNull();
		expect(partialTitle("// title: Tip splitter\nimport")).toBe("Tip splitter");
		expect(partialTitle("")).toBeNull();
		expect(partialTitle("import x\n")).toBeNull();
	});
	it("cleans what it finds", () => {
		expect(partialTitle("// title: <b>Hi</b>\nx")).toBe("b Hi b");
	});
});
describe("cleanTitle", () => {
	it("keeps letters, digits and spaces only", () => {
		expect(cleanTitle("<b>Hi</b> there! \u{1F600}")).toBe("b Hi b there");
	});
	it("allows at most five words and sixty characters", () => {
		expect(cleanTitle("one two three four five six seven")).toBe("one two three four five");
		const long = cleanTitle(`${"a".repeat(40)} ${"b".repeat(40)}`);
		expect(long !== null && long.length <= 60).toBe(true);
	});
	it("is null when nothing is left", () => {
		expect(cleanTitle("")).toBeNull();
		expect(cleanTitle("!!! \u{1F600}")).toBeNull();
	});
});

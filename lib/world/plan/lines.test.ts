import { describe, expect, it } from "vitest";
import { SEED_KINDS } from "../build/types";
import { LINES } from "./lines";

describe("his lines when no model writes one (spec 5.4)", () => {
	it.each([...SEED_KINDS])("%s has one line in his register", (kind) => {
		const line = LINES[kind];
		expect(line.startsWith("I ")).toBe(true);
		expect(line.length).toBeLessThanOrEqual(140);
		expect(line).toMatch(/^[A-Za-z ,.]+$/); // no exclamation mark, no emoji, no symbol
		expect(line).not.toMatch(/\b(I'm|I've|I'll|don't|can't|won't|it's)\b/i);
		expect(line).not.toMatch(/remember|Gur/);
		expect(line.endsWith(".")).toBe(true);
	});
	it("says the spec's own example for the belvedere", () => {
		expect(LINES.belvedere).toBe("I wanted somewhere to sit and watch the east island.");
	});
});

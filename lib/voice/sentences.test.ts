import { describe, expect, it } from "vitest";
import { GAP_AFTER, MAX_SPEAK_CHARS, splitSentences } from "./sentences";

const texts = (input: string) => splitSentences(input).map((c) => c.text);

describe("splitSentences", () => {
	it("splits a reply into sentences", () => {
		expect(texts("I'm doing well, thank you. How are you?")).toEqual(["I'm doing well, thank you.", "How are you?"]);
	});

	it("keeps the punctuation with its own sentence", () => {
		expect(texts("Stop. Go! Why?")).toEqual(["Stop.", "Go!", "Why?"]);
	});

	it("gives every chunk offsets that index back into the source exactly", () => {
		const source = "I'm here and ready to help. What are you working on?";
		for (const chunk of splitSentences(source)) {
			expect(source.slice(chunk.start, chunk.end)).toBe(chunk.text);
		}
	});

	it("pauses longer after a question or an exclamation than after a full stop", () => {
		const [statement, question] = splitSentences("That's fine. Is it?");
		expect(statement.gapMs).toBe(GAP_AFTER["."]);
		expect(question.gapMs).toBe(0);
		expect(GAP_AFTER["?"]).toBeGreaterThan(GAP_AFTER["."]);
	});

	it("never leaves a gap after the last sentence", () => {
		const chunks = splitSentences("One. Two. Three.");
		expect(chunks.at(-1)?.gapMs).toBe(0);
		expect(chunks.length).toBe(3);
	});

	it("does not split on an abbreviation", () => {
		expect(texts("Mr. Holmes is here. Ask him.")).toEqual(["Mr. Holmes is here.", "Ask him."]);
		expect(texts("Bring tea, biscuits, etc. Then sit.")).toEqual(["Bring tea, biscuits, etc.", "Then sit."]);
		expect(texts("That is, e.g. this one.")).toEqual(["That is, e.g. this one."]);
	});

	it("does not split inside a decimal number", () => {
		expect(texts("It costs 3.50 today.")).toEqual(["It costs 3.50 today."]);
	});

	it("treats an unpunctuated reply as one chunk", () => {
		const chunks = splitSentences("just so");
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toMatchObject({ text: "just so", start: 0, end: 7, gapMs: 0 });
	});

	it("handles several marks in a row as one ending", () => {
		expect(texts("Really?! I doubt it.")).toEqual(["Really?!", "I doubt it."]);
	});

	it("has nothing to say for empty or blank text", () => {
		expect(splitSentences("")).toEqual([]);
		expect(splitSentences("   \n ")).toEqual([]);
	});

	it("trims the whitespace between sentences out of the chunks", () => {
		expect(texts("One.    Two.")).toEqual(["One.", "Two."]);
	});

	it("splits a sentence that is too long for one request, at a word boundary", () => {
		const long = `${"word ".repeat(120).trim()}.`;
		const chunks = splitSentences(long);
		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) {
			expect(chunk.text.length).toBeLessThanOrEqual(MAX_SPEAK_CHARS);
			expect(chunk.text).not.toMatch(/^\s|\s$/);
		}
		// Every character of the sentence still gets spoken, in order.
		expect(chunks.map((c) => c.text).join(" ")).toBe(long);
	});

	it("keeps offsets exact even when it splits a long sentence", () => {
		const long = `${"alpha ".repeat(100).trim()}.`;
		for (const chunk of splitSentences(long)) {
			expect(long.slice(chunk.start, chunk.end)).toBe(chunk.text);
		}
	});
});

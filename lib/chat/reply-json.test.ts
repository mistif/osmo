import { describe, expect, it } from "vitest";
import { parseModelOutput } from "./reply-json";
const json = (o: object) => JSON.stringify({ reply: "I am sorry to hear that.", crisis: false, tone: ["worried"], intensity: 2, about: "someone_close", wants: "listen", note: "", ...o });
describe("parseModelOutput", () => {
	it("reads the JSON shape", () => {
		const r = parseModelOutput(json({}));
		expect(r).toMatchObject({ reply: "I am sorry to hear that.", crisis: false });
		expect(r?.detection).toMatchObject({ tone: ["worried"], intensity: 2 });
	});
	it.each([["the field", json({ crisis: true })], ["the old word in the reply", json({ reply: "CRISIS" })], ["Crisis. in the reply", json({ reply: "**Crisis.**" })]])("flags a crisis from %s", (_n, t) =>
		expect(parseModelOutput(t)?.crisis).toBe(true));
	it("strips the FEELING line, even when its JSON is bad", () => {
		const good = parseModelOutput('That sounds hard.\nFEELING: {"tone":["sad"],"intensity":2}');
		expect(good).toMatchObject({ reply: "That sounds hard.", crisis: false });
		expect(good?.detection).toMatchObject({ tone: ["sad"] });
		expect(parseModelOutput("That sounds hard.\nFEELING: {oops")).toEqual({ reply: "That sounds hard.", crisis: false, detection: null });
	});
	it("finds the FEELING line anywhere, at its last occurrence, not only as the last line", () => {
		const inline = parseModelOutput('That sounds hard. FEELING: {"tone":["sad"],"intensity":2}');
		expect(inline).toMatchObject({ reply: "That sounds hard.", crisis: false });
		expect(inline?.detection).toMatchObject({ tone: ["sad"], intensity: 2 });
		const twice = parseModelOutput('The word FEELING: is odd. FEELING: {"tone":["sad"],"intensity":2}');
		expect(twice).toMatchObject({ reply: "The word FEELING: is odd." });
		expect(twice?.detection).toMatchObject({ tone: ["sad"] });
	});
	it("never speaks the FEELING JSON, and keeps the speech after it", () => {
		for (const text of ['That sounds hard. FEELING: {"tone":["sad"],"intensity":2} I am here.', 'That sounds hard.\nFEELING: {"tone":["sad"],"intensity":2}\nI am here.']) {
			const r = parseModelOutput(text);
			expect(r?.reply, text).toBe("That sounds hard. I am here.");
			expect(r?.detection, text).toMatchObject({ tone: ["sad"], intensity: 2 });
		}
	});
	it("reads a FEELING line in any case or markdown, with a fence or a stop after its JSON", () => {
		for (const text of [
			'That sounds hard.\nFeeling: {"tone":["sad"],"intensity":2}',
			'That sounds hard.\nfeeling:{"tone":["sad"],"intensity":2}',
			'That sounds hard.\n**FEELING:** {"tone":["sad"],"intensity":2}',
			'That sounds hard.\n**Feeling**: {"tone":["sad"],"intensity":2}.',
			'That sounds hard.\nFEELING: ```json\n{"tone":["sad"],"intensity":2}\n```',
			'That sounds hard.\nFEELING: {"tone":["sad"],"intensity":2,"note":"a } and a \\" inside"}',
		]) {
			const r = parseModelOutput(text);
			expect(r?.reply, text).toBe("That sounds hard.");
			expect(r?.detection, text).toMatchObject({ tone: ["sad"], intensity: 2 });
		}
	});
	it("leaves a lower-case feeling that isn't followed by JSON in the reply", () => {
		expect(parseModelOutput("My feeling: you deserve a rest.")).toEqual({ reply: "My feeling: you deserve a rest.", crisis: false, detection: null });
	});
	it("drops only the line of a FEELING with no JSON, and everything after JSON that never closes", () => {
		expect(parseModelOutput("That sounds hard.\nFEELING: sad\nI am here.")).toEqual({ reply: "That sounds hard. I am here.", crisis: false, detection: null });
		expect(parseModelOutput('That sounds hard.\nFEELING: {"tone":["sad"], "note":"I am')).toEqual({ reply: "That sounds hard.", crisis: false, detection: null });
	});
	it("gives null for half a JSON reply cut off before a FEELING marker", () => {
		expect(parseModelOutput('{"reply":"That sounds hard. FEELING: x')).toBeNull();
		expect(parseModelOutput('Sure. {"reply":"Hi"} FEELING: {"tone":["sad"]}')).toBeNull();
		expect(parseModelOutput('That sounds hard. FEELING: {"tone":["sad"]} {"reply":"Hi"}')).toBeNull();
	});
	it("gives null for text that holds a JSON object after other words", () => {
		expect(parseModelOutput('Here: {"reply":"Hi."}')).toBeNull();
		expect(parseModelOutput('Sure.\n{ "tone": ["sad"] }')).toBeNull();
	});
	it.each([["broken JSON", '{"reply":"Hel'], ["a fenced block", "```json\n" + json({}) + "\n```"], ["an object with no reply", '{"tone":["sad"]}']])("gives null for %s", (_n, t) =>
		expect(parseModelOutput(t)).toBeNull());
	it("still speaks plain text, including text that is valid JSON by itself", () => {
		expect(parseModelOutput("Hello there.")).toEqual({ reply: "Hello there.", crisis: false, detection: null });
		expect(parseModelOutput("56")).toEqual({ reply: "56", crisis: false, detection: null });
		expect(parseModelOutput("CRISIS")).toMatchObject({ crisis: true });
	});
});

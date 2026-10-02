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
	it.each([["broken JSON", '{"reply":"Hel'], ["a fenced block", "```json\n" + json({}) + "\n```"], ["an object with no reply", '{"tone":["sad"]}']])("gives null for %s", (_n, t) =>
		expect(parseModelOutput(t)).toBeNull());
	it("still speaks plain text, including text that is valid JSON by itself", () => {
		expect(parseModelOutput("Hello there.")).toEqual({ reply: "Hello there.", crisis: false, detection: null });
		expect(parseModelOutput("56")).toEqual({ reply: "56", crisis: false, detection: null });
		expect(parseModelOutput("CRISIS")).toMatchObject({ crisis: true });
	});
});

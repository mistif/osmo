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
		expect(parseModelOutput("That sounds hard.\nFEELING: {oops")).toEqual({ reply: "That sounds hard.", crisis: false, detection: null, action: null });
	});
	it("finds the FEELING line anywhere, at its last occurrence, not only as the last line", () => {
		const inline = parseModelOutput('That sounds hard. FEELING: {"tone":["sad"],"intensity":2}');
		expect(inline).toMatchObject({ reply: "That sounds hard.", crisis: false });
		expect(inline?.detection).toMatchObject({ tone: ["sad"], intensity: 2 });
		const twice = parseModelOutput('The word FEELING: is odd. FEELING: {"tone":["sad"],"intensity":2}');
		expect(twice).toMatchObject({ reply: "The word FEELING: is odd." });
		expect(twice?.detection).toMatchObject({ tone: ["sad"] });
	});
	it("never speaks the FEELING JSON, even with text after it", () => {
		for (const text of ['That sounds hard. FEELING: {"tone":["sad"],"intensity":2} I am here.', 'That sounds hard.\nFEELING: {"tone":["sad"],"intensity":2}\nTake your time.']) {
			const r = parseModelOutput(text);
			expect(r?.reply, text).toBe("That sounds hard.");
			expect(r?.detection, text).toBeNull();
		}
	});
	it("gives null for text that holds a JSON object after other words", () => {
		expect(parseModelOutput('Here: {"reply":"Hi."}')).toBeNull();
		expect(parseModelOutput('Sure.\n{ "tone": ["sad"] }')).toBeNull();
	});
	it.each([["broken JSON", '{"reply":"Hel'], ["a fenced block", "```json\n" + json({}) + "\n```"], ["an object with no reply", '{"tone":["sad"]}']])("gives null for %s", (_n, t) =>
		expect(parseModelOutput(t)).toBeNull());
	it("still speaks plain text, including text that is valid JSON by itself", () => {
		expect(parseModelOutput("Hello there.")).toEqual({ reply: "Hello there.", crisis: false, detection: null, action: null });
		expect(parseModelOutput("56")).toEqual({ reply: "56", crisis: false, detection: null, action: null });
		expect(parseModelOutput("CRISIS")).toMatchObject({ crisis: true });
	});
	it("reads the action of a JSON turn", () => {
		const action = { name: "reminder_set", args: '{"text":"x"}' };
		expect(parseModelOutput(json({ action }))?.action).toEqual(action);
	});
	it.each([["null", json({ action: null })], ["missing", json({})]])("gives no action when it is %s", (_n, t) =>
		expect(parseModelOutput(t)).toMatchObject({ reply: "I am sorry to hear that.", action: null }));
	it.each([["args that is not a string", { name: "x", args: { a: 1 } }], ["an empty name", { name: "", args: "{}" }], ["a bare string", "reminder_set"], ["an array", [{ name: "x", args: "{}" }]]])("gives no action for %s", (_n, action) =>
		expect(parseModelOutput(json({ action }))).toMatchObject({ reply: "I am sorry to hear that.", action: null }));
	it("never reads an action from the FEELING or plain branches, even when the text mentions one", () => {
		expect(parseModelOutput('Done, I will remind you. FEELING: {"action":{"name":"reminder_set","args":"{}"}}')).toMatchObject({ reply: "Done, I will remind you.", action: null });
		expect(parseModelOutput("I will use reminder_set for that.")).toMatchObject({ reply: "I will use reminder_set for that.", action: null });
	});
});

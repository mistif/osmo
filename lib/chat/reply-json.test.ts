import { describe, expect, it } from "vitest";
import { isJsonTurn, ownWords, parseModelOutput } from "./reply-json";
const json = (o: object) => JSON.stringify({ reply: "I am sorry to hear that.", crisis: false, tone: ["worried"], intensity: 2, about: "someone_close", wants: "listen", note: "", ...o });
describe("parseModelOutput", () => {
	it("reads the JSON shape", () => {
		const r = parseModelOutput(json({}));
		expect(r).toMatchObject({ reply: "I am sorry to hear that.", crisis: false });
		expect(r?.detection).toMatchObject({ tone: ["worried"], intensity: 2 });
	});
	it.each([["the field", json({ crisis: true })], ["the old word in the reply", json({ reply: "CRISIS" })], ["Crisis. in the reply", json({ reply: "**Crisis.**" })]])("flags a crisis from %s", (_n, t) =>
		expect(parseModelOutput(t)?.crisis).toBe(true));
	it("leaves the bare word inside a JSON turn's sentence to the handler, which knows what the turn may copy", () =>
		expect(parseModelOutput(json({ reply: "You have the CRISIS comms checklist at nine." }))?.crisis).toBe(false));
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
		expect(parseModelOutput("My feeling: you deserve a rest.")).toEqual({ reply: "My feeling: you deserve a rest.", crisis: false, detection: null, action: null });
	});
	it("drops only the line of a FEELING with no JSON, and everything after JSON that never closes", () => {
		expect(parseModelOutput("That sounds hard.\nFEELING: sad\nI am here.")).toEqual({ reply: "That sounds hard. I am here.", crisis: false, detection: null, action: null });
		expect(parseModelOutput('That sounds hard.\nFEELING: {"tone":["sad"], "note":"I am')).toEqual({ reply: "That sounds hard.", crisis: false, detection: null, action: null });
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
describe("ownWords", () => {
	const ARGS = '{"text":"CRISIS comms"}';
	it("is every key and string of a whole JSON turn but its action's args, which copy Gur's words, when actions were offered", () => {
		const own = ownWords(json({ note: "CRISIS", action: { name: "reminder_set", args: ARGS } }), true) ?? [];
		expect(own).toContain("CRISIS");
		expect(own).toContain("note");
		expect(own).toContain("action");
		expect(own).toContain("reminder_set");
		expect(own.join(" ")).not.toContain("comms");
	});
	it("keeps the args when no action was offered", () => {
		expect(ownWords(json({ action: { name: "reminder_set", args: ARGS } }), false)).toContain(ARGS);
	});
	it("holds each string as written and as read, so a newline, tab or backspace written before a word is kept apart from it", () => {
		const own = ownWords('{"reply":"I hear you.\\nCRISIS","note":"\\u0009CRISIS","extra":"\\bCRISIS"}', true) ?? [];
		for (const word of ["I hear you.\\nCRISIS", "I hear you.\nCRISIS", "\\u0009CRISIS", "\tCRISIS", "\\bCRISIS", "\bCRISIS"]) expect(own, JSON.stringify(word)).toContain(word);
	});
	it("holds every copy of a doubled key, which JSON.parse would keep only the last of", () => {
		expect(ownWords('{"reply":"I am worried. CRISIS","crisis":false,"note":"","reply":"I am worried."}', true)).toContain("I am worried. CRISIS");
		expect(ownWords('{"reply":"ok","crisis":false,"note":"CRISIS","note":""}', true)).toContain("CRISIS");
	});
	it("leaves out only the args of the action read, never its name, its other keys, args that are not a string, or args elsewhere", () => {
		const kept: [string, string][] = [
			["a name", json({ action: { name: "CRISIS", args: "{}" } })],
			["an action that is a string", json({ action: "CRISIS" })],
			["another key in the action", json({ action: { name: "reminder_list", args: "{}", why: "CRISIS" } })],
			["args that are an object", json({ action: { name: "note", args: { text: "CRISIS" } } })],
			["the first of two actions", `{"reply":"ok","action":{"name":"a","args":"CRISIS"},"action":{"name":"a","args":"{}"}}`],
			["the first of two args", `{"reply":"ok","action":{"name":"a","args":"CRISIS","args":"{}"}}`],
			["args nested elsewhere", json({ action: { name: "a", args: "CRISIS" }, extra: { action: { name: "a", args: "CRISIS" } } })],
		];
		for (const [label, text] of kept) expect(ownWords(text, true), label).toContain("CRISIS");
	});
	it("is null for text that is not one whole JSON object", () => {
		for (const t of ['{"reply":"I am here wi', "CRISIS", 'Done. FEELING: {"tone":[]}', "[1]"]) expect(ownWords(t, true), t).toBeNull();
	});
});
describe("isJsonTurn", () => {
	it("is true only for text that is one whole JSON object", () => {
		expect(isJsonTurn(json({}))).toBe(true);
		expect(isJsonTurn(`  ${json({ crisis: true })}
`)).toBe(true);
		for (const t of ['{"reply":"I am here wi', '"CRISIS"', "CRISIS", "[1]", "56", 'Done. FEELING: {"tone":[]}', ""]) expect(isJsonTurn(t), t).toBe(false);
	});
});

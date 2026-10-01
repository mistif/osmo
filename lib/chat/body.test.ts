import { describe, expect, it } from "vitest";
import { CRISIS_CAUSE, newSession, prepareTurn, type TurnFacts } from "../agent/mind";
import { adoptGenome, assemble } from "../agent/personality/assemble";
import { CRISIS_REPLY } from "../agent/safety";
import { defaultState } from "../agent/state";
import type { MemoryFact } from "../facts";
import { chatBody, fitMemory, modelHistory, type RoomLine } from "./body";
import { checkBody } from "./request";
import { LIMITS } from "./types";

const user = (text: string): RoomLine => ({ role: "user", text });
const agent = (text: string): RoomLine => ({ role: "agent", text });
const guest = (line: RoomLine): RoomLine => ({ ...line, speaker: "guest" });
const GREETING = agent("Hello, I'm Osmo. How can I help?");
const fact = (key: string, value = `value of ${key}`): MemoryFact => ({ key, value });

// A real personality and this turn's real facts, as the room has them.
const osmo = () => adoptGenome(defaultState(), assemble(42), { resetWeights: false });
const turnFacts = (): TurnFacts =>
	prepareTurn(osmo(), newSession(), "the weather is fine", { now: 1_000_000, lastAt: null, uuid: () => "id-1", userName: "Gur" }).facts;
const input = (over: Partial<Parameters<typeof chatBody>[0]> = {}): Parameters<typeof chatBody>[0] => ({
	text: "what should I cook tonight",
	messages: [GREETING, user("hi"), agent("Good evening.")],
	memory: [fact("name", "Gur")],
	facts: turnFacts(),
	state: osmo(),
	math: null,
	...over,
});

describe("modelHistory", () => {
	it("keeps Gur's conversation, oldest first, as plain lines", () => {
		expect(modelHistory([GREETING, user("hi"), agent("Good evening.")])).toEqual([
			{ role: "agent", text: "Hello, I'm Osmo. How can I help?" },
			{ role: "user", text: "hi" },
			{ role: "agent", text: "Good evening." },
		]);
	});

	it("leaves out a guest's lines and Osmo's replies to them", () => {
		const history = modelHistory([
			user("hi"),
			agent("Good evening."),
			guest(user("the secret password is banana")),
			guest(agent("Hello. I don't believe we've met.")),
			user("ok"),
			agent("Very well."),
		]);
		expect(history.map((line) => line.text)).toEqual(["hi", "Good evening.", "ok", "Very well."]);
		expect(history.every((line) => !("speaker" in line))).toBe(true);
	});

	it("leaves out a crisis line of Gur's with Osmo's reply to it", () => {
		const history = modelHistory([user("hi"), agent("Good evening."), user("i want to kill myself"), agent("I hear you."), user("ok"), agent("Very well.")]);
		expect(history.map((line) => line.text)).toEqual(["hi", "Good evening.", "ok", "Very well."]);
	});

	it("leaves out a line of Osmo's that quotes a crisis message", () => {
		const history = modelHistory([user("what did i just say"), agent('You just said "i want to kill myself".'), user("ok"), agent("Very well.")]);
		expect(history.map((line) => line.text)).toEqual(["what did i just say", "ok", "Very well."]);
	});

	it("leaves out the crisis reply with the line before it, a crisis the model flagged", () => {
		const history = modelHistory([user("hi"), agent("Good evening."), user("everything feels pointless"), agent(CRISIS_REPLY), user("ok"), agent("Very well.")]);
		expect(history.map((line) => line.text)).toEqual(["hi", "Good evening.", "ok", "Very well."]);
	});

	it("leaves out a line of Gur's with no reply of its own", () => {
		// A turn cut short by a crisis: its line is saved just before the crisis pair.
		const aborted = modelHistory([
			user("hi"),
			agent("Good evening."),
			user("tell me about stars"),
			user("i want to kill myself"),
			agent(CRISIS_REPLY),
			user("ok"),
			agent("Very well."),
		]);
		expect(aborted.map((line) => line.text)).toEqual(["hi", "Good evening.", "ok", "Very well."]);
		// Nothing came after it at all.
		expect(modelHistory([user("hi"), agent("Good evening."), user("are you there")]).map((line) => line.text)).toEqual(["hi", "Good evening."]);
	});

	it("leaves out a recall that quotes a line the model flagged, which the crisis check missed", () => {
		// "jag vill inte leva längre" ("I don't want to live any more") isn't caught by isCrisis; the model flagged it.
		const history = modelHistory([
			user("hi"),
			agent("Good evening."),
			user("jag vill inte leva längre"),
			agent(CRISIS_REPLY),
			user("what were we talking about"),
			agent('You just said "what were we talking about", and before that "jag vill inte leva längre".'),
			user("ok"),
			agent("Very well."),
		]);
		expect(history.map((line) => line.text)).toEqual(["hi", "Good evening.", "what were we talking about", "ok", "Very well."]);
	});

	it("leaves out a recall that quotes a line with no reply of its own, and keeps one that quotes an answered line", () => {
		const history = modelHistory([
			user("tell me about stars"),
			user("i want to kill myself"),
			agent(CRISIS_REPLY),
			user("what did i say"),
			agent('You just said "what did i say", and before that "tell me about stars".'),
			user("the weather is fine"),
			agent("Good to hear."),
			user("what did i say"),
			agent('You just said "what did i say", and before that "the weather is fine".'),
		]);
		expect(history.map((line) => line.text)).toEqual([
			"what did i say",
			"the weather is fine",
			"Good to hear.",
			"what did i say",
			'You just said "what did i say", and before that "the weather is fine".',
		]);
	});

	it("leaves out a line of Osmo's that gives the crisis cause as his reason", () => {
		const history = modelHistory([
			user("how are you feeling"),
			agent(`I'm feeling sad. I believe it's because ${CRISIS_CAUSE}. Thank you for asking.`),
			user("ok"),
			agent("Very well."),
		]);
		expect(history.map((line) => line.text)).toEqual(["how are you feeling", "ok", "Very well."]);
	});

	it("keeps the last 20 lines once the crisis lines are out", () => {
		const pairs = (from: number, to: number) =>
			Array.from({ length: to - from }, (_, i) => [user(`message ${from + i}`), agent(`reply ${from + i}`)]).flat();
		const history = modelHistory([...pairs(0, 12), user("i want to kill myself"), agent(CRISIS_REPLY), ...pairs(12, 13)]);
		expect(history).toHaveLength(LIMITS.history);
		expect(history[0]).toEqual({ role: "user", text: "message 3" });
		expect(history.at(-1)).toEqual({ role: "agent", text: "reply 12" });
		expect(history.some((line) => line.text === CRISIS_REPLY)).toBe(false);
	});

	it("cuts a long line to 2000 characters, never inside an emoji", () => {
		const [long, beforeEmoji, short] = modelHistory([user("a".repeat(2500)), agent("b".repeat(1999) + "😀c"), user("ok"), agent("Very well.")]);
		expect(long.text).toBe("a".repeat(2000));
		expect(beforeEmoji.text).toBe("b".repeat(1999));
		expect(short).toEqual({ role: "user", text: "ok" });
	});
});

describe("fitMemory", () => {
	it("cuts each key and value to 300 characters", () => {
		expect(fitMemory([fact("k".repeat(400), "v".repeat(500))])).toEqual([fact("k".repeat(300), "v".repeat(300))]);
	});

	it("keeps up to 200 facts as they are", () => {
		const memory = Array.from({ length: 200 }, (_, i) => fact(`fact ${i}`));
		expect(fitMemory(memory)).toEqual(memory);
	});

	it("keeps the newest 200 of more", () => {
		const memory = Array.from({ length: 250 }, (_, i) => fact(`fact ${i}`));
		const fitted = fitMemory(memory);
		expect(fitted).toHaveLength(LIMITS.facts);
		expect(fitted[0].key).toBe("fact 50");
		expect(fitted.at(-1)?.key).toBe("fact 249");
	});

	it("always keeps Gur's name, dropping the oldest other fact instead", () => {
		const memory = [fact("name", "Gur"), ...Array.from({ length: 250 }, (_, i) => fact(`fact ${i}`))];
		const fitted = fitMemory(memory);
		expect(fitted).toHaveLength(LIMITS.facts);
		expect(fitted[0]).toEqual(fact("name", "Gur"));
		expect(fitted[1].key).toBe("fact 51");
		expect(fitted.at(-1)?.key).toBe("fact 249");
	});

	it("leaves the newest 200 alone when the name is among them", () => {
		const memory = [...Array.from({ length: 250 }, (_, i) => fact(`fact ${i}`)), fact("name", "Gur")];
		const fitted = fitMemory(memory);
		expect(fitted).toEqual(memory.slice(-LIMITS.facts));
	});
});

describe("chatBody", () => {
	it("is null without a personality, so code answers", () => {
		expect(chatBody(input({ state: defaultState() }))).toBeNull();
	});

	it("is null for a message over 2000 characters, counted after trimming", () => {
		expect(chatBody(input({ text: "a".repeat(2001) }))).toBeNull();
		expect(chatBody(input({ text: `  ${"a".repeat(2000)}  ` }))?.text).toBe("a".repeat(2000));
	});

	it("sends the trimmed message, the filtered history, the fitted memory and his persona", () => {
		const state = osmo();
		const messages = [GREETING, user("hi"), agent("Good evening."), guest(user("psst")), guest(agent("Hello."))];
		const memory = [fact("name", "Gur"), fact("sister", "Maya")];
		const body = chatBody(input({ text: "  what should I cook tonight ", messages, memory, state }));
		expect(body).not.toBeNull();
		expect(body?.text).toBe("what should I cook tonight");
		expect(body?.history).toEqual(modelHistory(messages));
		expect(body?.memory).toEqual(fitMemory(memory));
		expect(body?.persona).toEqual({ genome: state.genome, weights: state.weights, outlook: state.outlook });
	});

	it("cuts the facts' strings to 200 characters and keeps the rest as they are", () => {
		const facts = { ...turnFacts(), feeling: "f".repeat(250), cause: "c".repeat(250), userName: "n".repeat(250) };
		const body = chatBody(input({ facts }));
		expect(body?.facts).toEqual({ ...facts, feeling: "f".repeat(200), cause: "c".repeat(200), userName: "n".repeat(200) });
	});

	it("never sends the crisis cause", () => {
		expect(chatBody(input({ facts: { ...turnFacts(), cause: CRISIS_CAUSE } }))?.facts.cause).toBeNull();
		expect(chatBody(input({ facts: { ...turnFacts(), cause: "you told me you were lonely" } }))?.facts.cause).toBe("you told me you were lonely");
	});

	it("never sends a negative time away", () => {
		expect(chatBody(input({ facts: { ...turnFacts(), awayMs: -5_000 } }))?.facts.awayMs).toBe(0);
		expect(chatBody(input({ facts: { ...turnFacts(), awayMs: 5_000 } }))?.facts.awayMs).toBe(5_000);
	});

	it("hands the model the exact result of Gur's arithmetic", () => {
		expect(chatBody(input({ math: 444 }))?.hint).toEqual({ math: 444 });
		expect(chatBody(input({ math: 0 }))?.hint).toEqual({ math: 0 });
		const plain = chatBody(input({ math: null }));
		expect(plain).not.toBeNull();
		expect(plain).not.toHaveProperty("hint");
	});

	it("gives a body the route takes, even from an old long message and long facts", () => {
		const long = Array.from({ length: 30 }, (_, i) => [user(`${i} ${"a".repeat(2500)}`), agent("b".repeat(3000))]).flat();
		const memory = [fact("name", "Gur"), ...Array.from({ length: 260 }, (_, i) => fact(`fact ${i} ${"k".repeat(400)}`, "v".repeat(400)))];
		const facts = { ...turnFacts(), cause: "c".repeat(500) };
		const body = chatBody(input({ messages: long, memory, facts, math: 12 }));
		expect(body).not.toBeNull();
		const checked = checkBody(JSON.parse(JSON.stringify(body)));
		expect(checked.ok).toBe(true);
		expect(body?.history).toHaveLength(LIMITS.history);
		expect(body?.memory).toHaveLength(LIMITS.facts);
		expect(body?.memory[0]).toEqual(fact("name", "Gur"));
	});
});

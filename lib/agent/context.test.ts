import { describe, expect, it } from "vitest";
import { learnFact } from "../facts";
import {
	answersPendingLearning,
	askedForName,
	justLearnedName,
	nameAnswer,
	nameCorrection,
	nameFromAnswer,
	nameFromHistory,
	recallReply,
	taughtMeanings,
	turnView,
	wantsRecall,
} from "./context";
import { newSession, processTurn } from "./mind";
import { defaultState } from "./state";

describe("askedForName", () => {
	it("knows when Osmo's last message asked for the user's name", () => {
		expect(askedForName("My name is Osmo. What's yours?")).toBe(false);
		expect(askedForName("I don't know your name yet. What should I call you?")).toBe(true);
		expect(askedForName("Hey! How are you doing today?")).toBe(false);
		expect(askedForName(undefined)).toBe(false);
	});

	it("counts only code's own name questions, as the reply's last sentence", () => {
		for (const text of [
			"I'm Osmo. What should I call you?",
			"I am Osmo. What should I call you?",
			"Good to see you again. I'm Osmo. What should I call you?",
			"I looked back but couldn't find it. What's your name?",
			"I looked back but could not find it. What is your name?",
		]) {
			expect(askedForName(text), text).toBe(true);
		}
		for (const text of [
			"I like jazz. What's yours?",
			"Deep blue, I'd say. What's yours?",
			"And you are?",
			"What should I call you? I'd like to know.",
			"What's your name? Mine is Osmo.",
		]) {
			expect(askedForName(text), text).toBe(false);
		}
	});
});

describe("nameAnswer", () => {
	it("reads the answer to code's name question while no name is known", () => {
		expect(nameAnswer("Green", "I'm Osmo. What should I call you?", null)).toBe("Green");
		expect(nameAnswer("its gur", "I looked back but couldn't find it. What's your name?", null)).toBe("Gur");
	});

	it("saves nothing after a model's 'What's yours?'", () => {
		expect(nameAnswer("Green", "I like jazz. What's yours?", null)).toBeNull();
	});

	it("saves nothing once a name is known, even right after 'What's your name?'", () => {
		expect(nameAnswer("Linda", "Lovely to meet your friend. What's your name?", "Gur")).toBeNull();
		expect(nameAnswer("Linda", "I'm Osmo. What should I call you?", "Gur")).toBeNull();
	});
});

describe("nameFromAnswer", () => {
	it("pulls a name out of a short answer", () => {
		expect(nameFromAnswer("Gur")).toBe("Gur");
		expect(nameFromAnswer("its Gur")).toBe("Gur");
		expect(nameFromAnswer("it's gur")).toBe("Gur");
		expect(nameFromAnswer("im Gur")).toBe("Gur");
		expect(nameFromAnswer("my name is gur!")).toBe("Gur");
		expect(nameFromAnswer("call me Sam")).toBe("Sam");
	});

	it("refuses things that are not names", () => {
		for (const text of ["im sad", "why do you want to know?", "i do not want to say that right now", "no", "good"]) {
			expect(nameFromAnswer(text), text).toBeNull();
		}
	});
});

describe("justLearnedName", () => {
	it("reads the name in code's own sentences", () => {
		const said: [string, string][] = [
			["Nice to meet you, Gu! I'll remember that.", "Gu"],
			["I'm Osmo. And you're Gu, I remember.", "Gu"],
			["I'm Osmo. And you're Gu, I remember. Slay.", "Gu"],
			["I am Osmo. And you are Gu, I remember.", "Gu"],
			["Your name is Gu.", "Gu"],
			["I'm Osmo. And you're Anna Maria Lopez, I remember.", "Anna Maria Lopez"],
			["Nice to meet you, Mary-Jane O'Neil! I'll remember that.", "Mary-Jane O'Neil"],
			["Your name is José.", "José"],
			["Nice to meet you, Åsa! I'll remember that.", "Åsa"],
			["Your name is Åsa.", "Åsa"],
			["I'm Osmo. And you're Åsa Öberg, I remember.", "Åsa Öberg"],
			["Your name is גור.", "גור"],
		];
		for (const [text, name] of said) {
			expect(justLearnedName(text), text).toBe(name);
		}
	});

	it("reads 'And you're X, I remember.' after a welcome back", () => {
		for (const text of [
			"Welcome back. I'm Osmo. And you're Gur, I remember.",
			"Welcome back, Gur. The place is better with you in it. I'm Osmo. And you're Gur, I remember.",
			"Good to see you again, Gur. I am Osmo. And you are Gur, I remember.",
		]) {
			expect(justLearnedName(text), text).toBe("Gur");
		}
		// The real thing: "what's your name" after 21 hours away, from an Osmo who has met Gur before.
		const now = 1_000_000_000_000;
		const state = { ...defaultState(), bond: { ...defaultState().bond, messages: 5, days: 1, lastDay: "2001-09-08", metAt: "2001-09-08T00:00:00.000Z" } };
		const reply = processTurn(state, newSession(), "what's your name", { now, lastAt: now - 21 * 3600_000, uuid: () => "id", seed: 5, userName: "Gur" }).reply!;
		expect(reply).toMatch(/^(?:Welcome back|Good to see you again|Good to have you back|There you are), Gur\./);
		expect(justLearnedName(reply)).toBe("Gur");
	});

	it("never reads a model's words or the memory listing", () => {
		for (const text of [
			"Nice to meet you, Maya!",
			"Nice to meet you, Maya! Your sister sounds lovely.",
			"Here's what I remember. Your name is Gur. Your sister is Maya.",
			"Noted. Your name is gur.",
			"Your name is Gur, and your sister is Maya.",
			"Your name is Gur Ratzin The Very Tall.",
			"Hey! What's up?",
		]) {
			expect(justLearnedName(text), text).toBeNull();
		}
		expect(justLearnedName(undefined)).toBeNull();
	});
});

describe("names read from what Osmo said", () => {
	const LISTING = "Here's what I remember. Your name is Gur. Your sister is Maya.";

	it("never takes 'no its Mia' after the memory listing as a correction", () => {
		expect(nameCorrection("no its Mia", LISTING)).toBeNull();
		expect(nameFromHistory([{ role: "agent", text: LISTING }, { role: "user", text: "no its Mia" }])).toBeNull();
	});

	it("never takes a model's 'Nice to meet you, Maya!' as the user's name", () => {
		expect(nameCorrection("no its Mia", "Nice to meet you, Maya!")).toBeNull();
		expect(
			nameFromHistory([
				{ role: "user", text: "my sister Maya is here" },
				{ role: "agent", text: "Nice to meet you, Maya!" },
				{ role: "user", text: "whats my name" },
			]),
		).toBeNull();
	});

	it("says a saved three-word name, or 'my name is Gur.', back in words it reads again", () => {
		const ask = (userName: string) =>
			processTurn(defaultState(), newSession(), "what's your name", { now: 1_000_000, lastAt: null, uuid: () => "id", seed: 5, userName }).reply!;
		expect(justLearnedName(ask("anna maria lopez"))).toBe("Anna maria lopez");
		const saved = learnFact("my name is Gur.");
		expect(saved).toEqual({ key: "name", value: "Gur" });
		expect(justLearnedName(ask(saved!.value))).toBe("Gur");
		expect(askedForName(ask(saved!.value))).toBe(false);
	});
});

describe("nameFromHistory", () => {
	it("ignores an answer to a model's 'What's yours?'", () => {
		expect(
			nameFromHistory([
				{ role: "agent", text: "I like jazz. What's yours?" },
				{ role: "user", text: "Green" },
			]),
		).toBeNull();
	});

	it("ignores answers to a name question once it has found a name", () => {
		expect(
			nameFromHistory([
				{ role: "agent", text: "I'm Osmo. What should I call you?" },
				{ role: "user", text: "gur" },
				{ role: "agent", text: "Nice to meet you, Gur! I'll remember that." },
				{ role: "user", text: "my friend is here" },
				{ role: "agent", text: "Hello to your friend. What's your name?" },
				{ role: "user", text: "Linda" },
			]),
		).toBe("Gur");
		expect(
			nameFromHistory([
				{ role: "user", text: "call me Gur" },
				{ role: "agent", text: "Lovely to meet your friend. What's your name?" },
				{ role: "user", text: "Linda" },
			]),
		).toBe("Gur");
	});

	it("still takes a correction or a stated name after it has found one", () => {
		expect(
			nameFromHistory([
				{ role: "agent", text: "Nice to meet you, Gu! I'll remember that." },
				{ role: "user", text: "no its Gur" },
			]),
		).toBe("Gur");
		expect(
			nameFromHistory([
				{ role: "user", text: "im Gur" },
				{ role: "agent", text: "Good to meet you." },
				{ role: "user", text: "call me Sam" },
			]),
		).toBe("Sam");
	});
});

describe("recall", () => {
	it("recognizes questions about what was said before", () => {
		expect(wantsRecall("what did i just say")).toBe(true);
		expect(wantsRecall("what were we talking about")).toBe(true);
		expect(wantsRecall("do u remember what i said")).toBe(true);
		expect(wantsRecall("what did you say")).toBe(false);
	});

	it("quotes the user's own recent messages, newest first", () => {
		const history = [
			{ role: "agent" as const, text: "Hi! I'm Osmo." },
			{ role: "user" as const, text: "hi" },
			{ role: "agent" as const, text: "Hey!" },
			{ role: "user" as const, text: "im in class" },
		];
		expect(recallReply(history)).toBe('You just said "im in class", and before that "hi".');
		expect(recallReply([{ role: "agent", text: "Hi" }])).toMatch(/haven't said anything/);
	});
});

describe("answersPendingLearning", () => {
	it("takes a plain statement as the explanation Osmo asked for", () => {
		expect(answersPendingLearning("a kind of snack from finland")).toBe(true);
		expect(answersPendingLearning("it means a dog")).toBe(true);
	});

	it("never takes a new question as the explanation", () => {
		for (const text of ["what does serendipity mean", "why do you ask?", "define petrichor", "whats a platypus"]) {
			expect(answersPendingLearning(text), text).toBe(false);
		}
	});
});

describe("taughtMeanings", () => {
	it("uses only taught slang and explained terms, never ordinary facts", () => {
		const memory = [
			{ key: "dog", value: "Nala" },
			{ key: "name", value: "Gur" },
			{ key: "slang:bet", value: "okay" },
			{ key: "meaning:zorp blat", value: "a kind of snack" },
		];
		expect(taughtMeanings(memory)).toEqual({ bet: "okay", "zorp blat": "a kind of snack" });
	});
});

describe("names that look like typos", () => {
	it("keeps a name even when it is close to a real word", () => {
		// The typo guesser would read these as "jason", "maiden" and "bye".
		expect(nameFromAnswer("Jaxson")).toBe("Jaxson");
		expect(nameFromAnswer("its Kaiden")).toBe("Kaiden");
		expect(nameFromAnswer("its Byee")).toBe("Byee");
	});
});

describe("turnView", () => {
	const memory = [
		{ key: "name", value: "Gur" },
		{ key: "slang:bet", value: "Okay" },
		{ key: "meaning:zorp", value: "a snack" },
	];
	const vocabulary = { zenko: 3 };
	const messages = [
		{ role: "agent" as const, text: "What should I call you?" },
		{ role: "user" as const, text: "gur" },
		{ role: "agent" as const, text: "Nice to meet you, Gur!" },
		{ role: "user" as const, text: "the secret password is banana", speaker: "guest" as const },
		{ role: "agent" as const, text: "Hello. I don't believe we've met.", speaker: "guest" as const },
	];

	it("gives the owner their memory, name, slang and words, and reads only their own conversation", () => {
		const view = turnView(messages, memory, vocabulary, false);
		expect(view.memory).toBe(memory);
		expect(view.userName).toBe("Gur");
		expect(view.slang).toEqual({ bet: "okay" });
		expect(view.vocabulary).toBe(vocabulary);
		expect(view.history).toHaveLength(3);
		expect(view.lastAgentText).toBe("Nice to meet you, Gur!");
		expect(view.recent).toContain("gur");
		expect(view.recent).not.toContain("banana");
	});

	it("gives a guest nothing of the owner's", () => {
		const view = turnView(messages, memory, vocabulary, true);
		expect(view.memory).toEqual([]);
		expect(view.userName).toBeNull();
		expect(view.slang).toEqual({});
		expect(view.vocabulary).toEqual({});
		expect(view.history).toEqual([]);
		expect(view.lastAgentText).toBeUndefined();
		expect(view.recent).toEqual([]);
	});

	it("reads a name saved with a closing mark without it", () => {
		for (const value of ["Gur.", "Gur!", "Gur?!", "Gur, "]) {
			expect(turnView(messages, [{ key: "name", value }], vocabulary, false).userName, value).toBe("Gur");
		}
	});
});

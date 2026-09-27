import { describe, expect, it } from "vitest";
import { answersPendingLearning, askedForName, nameFromAnswer, recallReply, taughtMeanings, turnView, wantsRecall } from "./context";

describe("askedForName", () => {
	it("knows when Osmo's last message asked for the user's name", () => {
		expect(askedForName("My name is Osmo. What's yours?")).toBe(true);
		expect(askedForName("I don't know your name yet. What should I call you?")).toBe(true);
		expect(askedForName("Hey! How are you doing today?")).toBe(false);
		expect(askedForName(undefined)).toBe(false);
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
});

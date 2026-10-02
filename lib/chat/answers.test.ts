import { describe, expect, it } from "vitest";
import { justLearnedName } from "../agent/context";
import { learnFact } from "../facts";
import { agentKnowledge, answerFromMemory, calculateMath, describeFact, findUnknownTopic, isBuiltInTopic } from "./answers";

// The four entries that change when the AI conversation is on, with today's words and the words when it's on.
const OFF: Record<string, string> = {
	"local agent": "an assistant that runs in your browser, using its built-in knowledge and what you teach it",
	"internet access": "used only to look up word definitions from Datamuse and Wiktionary, and only the word itself is sent",
	"conversation learning": "when the agent does not know a topic, it asks the user to explain it and saves that explanation",
	internet: "a worldwide network of connected computer networks; this agent uses it only to look up word definitions",
};
const ON: Record<string, string> = {
	"local agent": "an assistant that runs in your browser, while an OpenAI model writes its everyday replies",
	"internet access":
		"used to look up word definitions from Datamuse and Wiktionary, and to have an OpenAI model write its everyday replies, so your messages, what it remembers of you and your recent chat are sent to OpenAI",
	"conversation learning":
		"when the agent does not know a topic, an OpenAI model answers it; if the model can't be reached, the agent asks the user to explain it and saves that explanation",
	internet:
		"a worldwide network of connected computer networks; this agent uses it to look up word definitions and to have an OpenAI model write its everyday replies, which sends your messages, what it remembers of you and your recent chat to OpenAI",
};
const KEYS = [
	"local agent",
	"internet access",
	"memory",
	"math",
	"conversation learning",
	"history",
	"ancient egypt",
	"roman empire",
	"industrial revolution",
	"world war ii",
	"democracy",
	"scientific method",
	"gravity",
	"evolution",
	"dna",
	"solar system",
	"earth",
	"computer",
	"artificial intelligence",
	"internet",
];
const valueOf = (aiOn: boolean, key: string) => agentKnowledge(aiOn).find((fact) => fact.key === key)?.value;

describe("agentKnowledge", () => {
	it("keeps today's list and words while the AI conversation is off", () => {
		expect(agentKnowledge(false).map((fact) => fact.key)).toEqual(KEYS);
		for (const key of Object.keys(OFF)) {
			expect(valueOf(false, key), key).toBe(OFF[key]);
		}
		expect(valueOf(false, "gravity")).toBe("the attractive force between objects with mass; it keeps people on Earth and planets in orbit");
	});

	it("says what writes his everyday replies, and what is sent, once it is on", () => {
		for (const key of Object.keys(ON)) {
			expect(valueOf(true, key), key).toBe(ON[key]);
			expect(valueOf(true, key), key).toMatch(/OpenAI model/);
		}
		for (const key of ["internet access", "internet"]) {
			expect(valueOf(true, key), key).toMatch(/your messages, what it remembers of you and your recent chat/);
		}
		expect(valueOf(true, "conversation learning")).toMatch(/can't be reached, the agent asks the user to explain it/);
	});

	it("changes only those four values, never a key", () => {
		const off = agentKnowledge(false);
		const on = agentKnowledge(true);
		expect(on.map((fact) => fact.key)).toEqual(KEYS);
		off.forEach((fact, i) => {
			if (!(fact.key in ON)) expect(on[i], fact.key).toEqual(fact);
		});
	});
});

describe("isBuiltInTopic", () => {
	it("matches a built-in key exactly, whether the AI conversation is on or off", () => {
		for (const term of ["gravity", "history", "internet", "local agent", "world war ii"]) {
			expect(isBuiltInTopic(term), term).toBe(true);
		}
		for (const term of ["earthquake", "Gravity", "gravity waves", "photosynthesis"]) {
			expect(isBuiltInTopic(term), term).toBe(false);
		}
	});
});

describe("describeFact", () => {
	it("says each kind of fact as a sentence, never an internal key", () => {
		const cases: [{ key: string; value: string }, string][] = [
			[{ key: "name", value: "Gur" }, "Your name is Gur."],
			[{ key: "slang:bet", value: "okay" }, 'You use "bet" to mean okay.'],
			[{ key: "meaning:zorp blat", value: "a kind of snack" }, '"zorp blat" means a kind of snack.'],
			[{ key: "meaning:a:b", value: "x" }, '"a:b" means x.'],
			[{ key: "likes", value: "pizza" }, "You like pizza."],
			[{ key: "sister", value: "Maya" }, "Your sister is Maya."],
		];
		for (const [fact, sentence] of cases) {
			expect(describeFact(fact), fact.key).toBe(sentence);
		}
	});

	it("says a value saved with a closing mark without it", () => {
		expect(describeFact({ key: "name", value: "Gur." })).toBe("Your name is Gur.");
		expect(describeFact({ key: "dog", value: "Rex!" })).toBe("Your dog is Rex.");
	});
});

describe("answerFromMemory", () => {
	const memory = [
		{ key: "name", value: "Gur" },
		{ key: "slang:bet", value: "okay" },
		{ key: "meaning:zorp blat", value: "a kind of snack" },
		{ key: "likes", value: "pizza" },
		{ key: "sister", value: "Maya" },
	];

	it("lists what he remembers, or says he knows nothing yet", () => {
		const listing =
			'Here\'s what I remember. Your name is Gur. You use "bet" to mean okay. "zorp blat" means a kind of snack. You like pizza. Your sister is Maya.';
		expect(answerFromMemory("What do you know about me?", memory, 0)).toBe(listing);
		expect(answerFromMemory("list my memories", memory, 0)).toBe(listing);
		expect(answerFromMemory("what do you know about me", [], 0)).toBe("I don't know anything about you yet.");
	});

	it("answers from an explained term and from a remembered fact", () => {
		expect(answerFromMemory("what does zorp blat mean", memory, 0)).toBe("In your usage, zorp blat means a kind of snack.");
		expect(answerFromMemory("what's my name", memory, 0)).toBe("Your name is Gur.");
		expect(answerFromMemory("how is my sister", memory, 0)).toBe("Your sister is Maya.");
		// His own name answers only a question about his own name.
		expect(answerFromMemory("what's my sister's name", memory, 0)).toBe("Your sister is Maya.");
	});

	it("answers from a fact saved with a closing mark without it", () => {
		const marked = [
			{ key: "name", value: "Gur." },
			{ key: "dog", value: "Rex!" },
		];
		expect(answerFromMemory("what's my name", marked, 0)).toBe("Your name is Gur.");
		expect(answerFromMemory("how is my dog", marked, 0)).toBe("Your dog is Rex.");
		expect(answerFromMemory("what do you know about me", marked, 0)).toBe("Here's what I remember. Your name is Gur. Your dog is Rex.");
	});

	it("asks the owner for a name it doesn't have, but never a guest", () => {
		expect(answerFromMemory("whats my name", [], 0)).toBe("I don't know your name yet. What should I call you?");
		expect(answerFromMemory("whats my name", [], 0, true)).toBe("I'm afraid I don't know your name.");
	});

	it("answers from his built-in knowledge, in today's words unless the AI conversation is on", () => {
		expect(answerFromMemory("tell me about gravity", [], 0)).toBe(
			"About gravity: the attractive force between objects with mass; it keeps people on Earth and planets in orbit.",
		);
		expect(answerFromMemory("do you have internet access", [], 0)).toBe(`About internet access: ${OFF["internet access"]}.`);
		expect(answerFromMemory("do you have internet access", [], 0, false, false)).toBe(`About internet access: ${OFF["internet access"]}.`);
		expect(answerFromMemory("do you have internet access", [], 0, false, true)).toBe(`About internet access: ${ON["internet access"]}.`);
		expect(answerFromMemory("are you a local agent", [], 0, false, true)).toBe(`About local agent: ${ON["local agent"]}.`);
		expect(answerFromMemory("how do you use the internet", [], 0, false, true)).toBe(`About internet: ${ON.internet}.`);
	});

	it("falls back one step per exchange, without the offer to learn for a guest", () => {
		expect(answerFromMemory("blorp", [], 0)).toBe("I'm not sure I follow. Could you rephrase that?");
		expect(answerFromMemory("blorp", [], 2)).toBe("I didn't quite catch that. Could you say it another way?");
		expect(answerFromMemory("blorp", [], 6)).toBe(
			"I don't recognize that. If it's a word I haven't learned, tell me what it means.",
		);
		expect(answerFromMemory("blorp", [], 6, true)).toBe("I don't recognize that, I'm afraid. Could you put it another way?");
		expect(answerFromMemory("why is the sky purple?", [], 0)).toBe(
			"That's a good question, but I don't have an answer yet. Could you ask it another way?",
		);
		expect(answerFromMemory("why is the sky purple?", [], 2)).toBe("I'm afraid that's beyond me for now. Could you try a simpler question?");
	});

	it("says a saved name back in words the name code reads, but not in the listing", () => {
		const saved = learnFact("my name is Gur.")!;
		expect(justLearnedName(answerFromMemory("what's my name", [saved], 0))).toBe("Gur");
		expect(justLearnedName(answerFromMemory("what do you know about me", [saved, { key: "sister", value: "Maya" }], 0))).toBeNull();
	});
});

describe("findUnknownTopic", () => {
	const memory = [
		{ key: "meaning:zorp", value: "a snack" },
		{ key: "slang:bet", value: "okay" },
		{ key: "dog", value: "Nala" },
	];

	it("finds a topic he neither remembers nor knows", () => {
		expect(findUnknownTopic("what is photosynthesis?", memory)).toBe("photosynthesis");
		expect(findUnknownTopic("Tell me about Quantum Physics.", memory)).toBe("quantum physics");
		expect(findUnknownTopic("explain blockchain", memory)).toBe("blockchain");
		expect(findUnknownTopic("who is Ada Lovelace", memory)).toBe("ada lovelace");
	});

	it("leaves personal questions, remembered terms and built-in topics alone", () => {
		for (const text of [
			"what is my name",
			"what's your favorite color",
			"who is you",
			"what is gravity",
			"what is zorp",
			"what is bet",
			"what is dog food",
			"hello",
		]) {
			expect(findUnknownTopic(text, memory), text).toBeNull();
		}
	});
});

describe("calculateMath", () => {
	it("works out arithmetic, percentages, powers and parentheses", () => {
		const cases: [string, number][] = [
			["2+2", 4],
			["what is 2 + 2 * 3", 8],
			["calculate (2+3)*4", 20],
			["2^3^2", 512],
			["50%", 0.5],
			["200*10%", 20],
			["-3+5", 2],
			["2*-3", -6],
			["10/4", 2.5],
			["1.5*2", 3],
			["what is 2+2?", 4],
			["solve 3*(4+5)=", 27],
			["What is 7 - 10", -3],
			["5", 5],
		];
		for (const [text, result] of cases) {
			expect(calculateMath(text), text).toBe(result);
		}
	});

	it("gives null for anything that isn't a finite sum", () => {
		for (const text of ["1/0", "(2+3", "2+", "2..3", "hello", "what is 2 apples", ""]) {
			expect(calculateMath(text), text).toBeNull();
		}
	});
});

import { describe, expect, it } from "vitest";
import { BASELINE, defaultState, type Activations } from "./state";
import { causeOf, fallbackReply, feelingPhrase, normalize, parse, respond, SLANG } from "./talk";
import { mergedLexicon } from "./personality/assemble";

const base = (): Activations => ({ ...BASELINE });
const stateWith = (over: Partial<Activations>) => ({ ...defaultState(), activations: { ...base(), ...over } });

describe("normalize", () => {
	it("expands slang and contractions into plain words", () => {
		expect(normalize("hi im sad")).toBe("hi i am sad");
		expect(normalize("why are u feeling sad?")).toBe("why are you feeling sad");
		expect(normalize("I can't, it's fine!")).toBe("i cannot it is fine");
		expect(normalize("idk thx")).toBe("i do not know thanks");
		expect(normalize("What's up?")).toBe("what is up");
		expect(normalize("You’re great")).toBe("you are great");
	});

	it("copes with empty and punctuation-only input", () => {
		expect(normalize("")).toBe("");
		expect(normalize("?!?")).toBe("");
	});
});

describe("parse", () => {
	it("splits a greeting from the rest of the sentence", () => {
		const p = parse("hi im sad");
		expect(p.greeted).toBe(true);
		expect(p.intent).toEqual({ type: "userFeeling", feeling: "sad", positive: false });
	});

	it("recognizes questions about Osmo's feelings, however they are spelled", () => {
		expect(parse("why are u feeling sad").intent.type).toBe("askWhyFeeling");
		expect(parse("why do you feel like that?").intent.type).toBe("askWhyFeeling");
		expect(parse("how are you feeling").intent.type).toBe("askFeeling");
		expect(parse("how are you?").intent.type).toBe("howAreYou");
		expect(parse("hi how are you").intent.type).toBe("howAreYou");
	});

	it("recognizes the everyday intents", () => {
		expect(parse("hello").intent.type).toBe("greeting");
		expect(parse("whats your name").intent.type).toBe("askName");
		expect(parse("what can you do").intent.type).toBe("askAbilities");
		expect(parse("thx").intent.type).toBe("thanks");
		expect(parse("sorry").intent.type).toBe("apology");
		expect(parse("you are so smart").intent.type).toBe("compliment");
		expect(parse("bye").intent.type).toBe("farewell");
	});

	it("reads how the user feels", () => {
		expect(parse("i feel really tired").intent).toEqual({ type: "userFeeling", feeling: "tired", positive: false });
		expect(parse("I'm great").intent).toEqual({ type: "userFeeling", feeling: "great", positive: true });
	});

	it("reads casual ways of saying how the user is", () => {
		expect(parse("im doin good").intent).toEqual({ type: "userFeeling", feeling: "good", positive: true });
		expect(parse("im swell im in class right now").intent).toEqual({ type: "userFeeling", feeling: "swell", positive: true });
		expect(parse("i am doing well").intent).toEqual({ type: "userFeeling", feeling: "well", positive: true });
		expect(parse("im feelin alright").intent).toEqual({ type: "userFeeling", feeling: "alright", positive: true });
	});

	it("understands texting shorthand, missing apostrophes and stretched words", () => {
		expect(normalize("thats gr8 tbh")).toBe("that is great to be honest");
		expect(normalize("ur so smart")).toBe("you are so smart");
		expect(normalize("ur name")).toBe("your name");
		expect(normalize("heyyy im goood")).toBe("hey i am good");
		expect(normalize("sooo tired")).toBe("so tired");
		expect(normalize("chillin rn wbu")).toBe("chill right now how about you");
		expect(normalize("gtg cya")).toBe("got to go see you");
	});

	it("answers a feeling said on its own, the way people reply to 'how are you'", () => {
		expect(parse("good").intent).toEqual({ type: "userFeeling", feeling: "good", positive: true });
		expect(parse("pretty good hbu").intent).toEqual({ type: "userFeeling", feeling: "good", positive: true });
		expect(parse("good thx").intent).toEqual({ type: "userFeeling", feeling: "good", positive: true });
		expect(parse("sooo tired").intent).toEqual({ type: "userFeeling", feeling: "tired", positive: false });
		expect(parse("not bad").intent).toEqual({ type: "userFeeling", feeling: "okay", positive: true });
		expect(parse("meh").intent).toEqual({ type: "userFeeling", feeling: "okay", positive: true });
	});

	it("reads loosely worded small talk", () => {
		expect(parse("hey how r u doin today").intent.type).toBe("howAreYou");
		expect(parse("hows life").intent.type).toBe("howAreYou");
		expect(parse("how have u been lol").intent.type).toBe("howAreYou");
		expect(parse("ur so smart").intent.type).toBe("compliment");
		expect(parse("wats ur name").intent.type).toBe("askName");
		expect(parse("gtg").intent.type).toBe("farewell");
		expect(parse("fair enough").intent.type).toBe("ack");
		expect(parse("heyy how u doin").intent.type).toBe("howAreYou");
		expect(parse("nm u").intent.type).toBe("ack");
		expect(parse("pretty tired ngl").intent).toEqual({ type: "userFeeling", feeling: "tired", positive: false });
		expect(parse("honestly kinda stressed").intent).toEqual({ type: "userFeeling", feeling: "stressed", positive: false });
		expect(parse("im chillin").intent).toEqual({ type: "userFeeling", feeling: "chill", positive: true });
		expect(parse("thanx").intent.type).toBe("thanks");
	});

	it("recognizes questions about where Osmo comes from", () => {
		for (const text of ["whats your story", "where do u come from", "tell me about yourself", "are you a bot", "how were you made"]) {
			expect(parse(text).intent.type, text).toBe("askOrigin");
		}
		expect(parse("what are you doing").intent.type).toBe("askActivity");
	});

	it("notices when the user is frustrated that Osmo did not understand", () => {
		for (const text of [
			"what part of that didnt u understand",
			"you dont understand",
			"what do you mean",
			"huh?",
			"are you even listening",
		]) {
			expect(parse(text).intent.type, text).toBe("misunderstood");
		}
	});

	it("leaves everything else for the rest of the chat", () => {
		for (const text of ["i am not sad", "my name is gur", "what is 2+2", "why are you so slow", "", "the weather is fine"]) {
			expect(parse(text).intent.type).toBe("unknown");
		}
	});
});

describe("feelingPhrase", () => {
	it("is 'calm' at baseline", () => {
		expect(feelingPhrase(base())).toBe("calm");
	});

	it("uses adjectives, not emotion nouns", () => {
		expect(feelingPhrase({ ...base(), sadness: 0.5 })).toBe("sad");
		expect(feelingPhrase({ ...base(), sadness: 0.5, loneliness: 0.4 })).toBe("sad and lonely");
	});

	it("keeps named blends", () => {
		expect(feelingPhrase({ ...base(), joy: 0.85, sadness: 0.5 })).toBe("bittersweet");
	});
});

describe("respond", () => {
	const reply = (text: string, over: { state?: ReturnType<typeof defaultState>; cause?: string | null; turn?: number; userName?: string | null } = {}) =>
		respond(parse(text), { state: over.state ?? defaultState(), cause: over.cause ?? null, turn: over.turn ?? 0, userName: over.userName });

	it("answers a sad user with sympathy and a greeting when they greeted", () => {
		const r = reply("hi im sad");
		expect(r).toMatch(/^Hello\./);
		expect(r).toMatch(/sorry/i);
		expect(r).toContain("sad");
	});

	it("explains its own feeling from real state and the recorded cause", () => {
		const r = reply("why are u feeling sad", { state: stateWith({ sadness: 0.5 }), cause: "you told me you were sad" });
		expect(r).toContain("I'm feeling sad");
		expect(r).toContain("because you told me you were sad");
	});

	it("does not invent a feeling when calm", () => {
		expect(reply("why are you feeling sad")).toMatch(/calm/);
	});

	it("uses the user's name when it knows it", () => {
		expect(reply("hello", { userName: "Gur" })).toContain("Gur");
		expect(reply("what is your name", { userName: "Gur" })).toMatch(/Osmo.*Gur/);
	});

	it("never prefixes a stuck mood opener", () => {
		const r = reply("hello", { state: stateWith({ sadness: 0.6 }) });
		expect(r).not.toMatch(/^I'm a bit down\./);
	});

	it("returns proper sentences for every intent, with varied wording", () => {
		const inputs = ["hello", "bye", "how are you", "how are you feeling", "why are you feeling sad", "what is your name", "what can you do", "thanks", "sorry", "you are awesome", "im sad", "im happy"];
		for (const text of inputs) {
			for (const turn of [0, 1]) {
				const r = reply(text, { turn, state: stateWith({ sadness: 0.5 }), cause: "of what you shared with me" });
				expect(r).toMatch(/^[A-Z]/);
				expect(r).toMatch(/[.!?]$/);
			}
		}
		expect(reply("thanks", { turn: 0 })).not.toBe(reply("thanks", { turn: 1 }));
	});

	it("returns null for unknown intents", () => {
		expect(reply("my name is gur")).toBeNull();
	});
});

describe("causeOf and fallbackReply", () => {
	it("records why a feeling started", () => {
		expect(causeOf(parse("im sad").intent)).toBe("you told me you were sad");
		expect(causeOf(parse("hello").intent)).toBeNull();
	});

	it("does not repeat the same fallback on consecutive turns, and answers questions differently", () => {
		const said = [0, 1, 2, 3].map((t) => fallbackReply(t, "hmm whatever"));
		for (let i = 1; i < said.length; i++) expect(said[i]).not.toBe(said[i - 1]);
		expect(fallbackReply(0, "why is the sky blue?")).toMatch(/question|ask/i);
		expect(said.filter((s) => /means/.test(s)).length).toBeLessThanOrEqual(1);
	});

	it("asks for clarification instead of a bare 'I do not know'", () => {
		const r = fallbackReply(0);
		expect(r).toMatch(/again|different way|what do you mean|not sure/i);
		expect(r).not.toMatch(/I do not know that yet/);
	});
});

describe("respond: names", () => {
	it("capitalizes the user's name however they typed it", () => {
		const r = respond(parse("hello"), { state: defaultState(), cause: null, turn: 0, userName: "gur" });
		expect(r).toContain("Gur");
		expect(r).not.toContain("gur");
	});
});

describe("slang, typos and more of how people talk", () => {
	it("understands common slang and abbreviations", () => {
		expect(normalize("hru")).toBe("how are you");
		expect(normalize("ngl im tired rn")).toBe("not gonna lie i am tired right now");
		expect(normalize("nvm")).toBe("never mind");
		expect(normalize("bruh im sad")).toBe("i am sad");
		expect(normalize("wyd")).toBe("what are you doing");
	});

	it("applies words the user taught it, ahead of the built-in list", () => {
		expect(normalize("bet", { bet: "okay" })).toBe("okay");
		expect(parse("fam", { fam: "friend" }).intent.type).toBe("unknown");
		expect(parse("hi fam im sad", { fam: "friend" }).intent.type).toBe("userFeeling");
	});

	it("reads slang questions and greetings", () => {
		for (const text of ["hru", "hbu", "sup", "wassup", "how about you"]) expect(parse(text).intent.type).toBe("howAreYou");
		expect(parse("wyd").intent.type).toBe("askActivity");
	});

	it("recognizes laughter, affection, being made, and stepping away", () => {
		expect(parse("lol").intent.type).toBe("laughter");
		expect(parse("haha").intent.type).toBe("laughter");
		expect(parse("ily").intent.type).toBe("affection");
		expect(parse("i love you").intent.type).toBe("affection");
		expect(parse("well i made you today so im happy").intent.type).toBe("creator");
		expect(parse("brb").intent.type).toBe("brb");
	});

	it("asks the user to go on when a sentence is unfinished", () => {
		expect(parse("you are").intent.type).toBe("incomplete");
		expect(parse("i am").intent.type).toBe("incomplete");
	});

	it("understands feelings the user credits to Osmo, even with a typo", () => {
		expect(parse("talking to you has made me happ").intent).toEqual({ type: "feelingFromOsmo", feeling: "happy", positive: true });
		expect(parse("you make me feel better").intent).toEqual({ type: "feelingFromOsmo", feeling: "better", positive: true });
	});

	it("reads slang and misspelled feelings", () => {
		expect(parse("im feeling gutted").intent).toEqual({ type: "userFeeling", feeling: "gutted", positive: false });
		expect(parse("im stoked").intent).toEqual({ type: "userFeeling", feeling: "stoked", positive: true });
		expect(parse("i am hapy").intent).toEqual({ type: "userFeeling", feeling: "happy", positive: true });
		expect(parse("aw im happy now tho").intent.type).toBe("userFeeling");
	});

	it("acknowledges bare acknowledgements but leaves yes/no to the dilemma flow", () => {
		for (const text of ["cool", "ok", "bet", "ikr"]) expect(parse(text).intent.type).toBe("ack");
		for (const text of ["yes", "no", "yeah", "nope", "i am from sweden"]) expect(parse(text).intent.type).toBe("unknown");
	});

	it("replies to every new intent in proper sentences", () => {
		for (const text of ["lol", "ily", "brb", "cool", "wyd", "well i made you", "you are", "talking to you made me happy", "talking to you made me sad"]) {
			for (const turn of [0, 1]) {
				const r = respond(parse(text), { state: defaultState(), cause: null, turn });
				expect(r, text).toMatch(/^[A-Z]/);
				expect(r, text).toMatch(/[.!?]$/);
			}
		}
	});

	it("sometimes tells the user how to teach it a word when it is lost, without nagging every time", () => {
		const said = [0, 1, 2, 3].map((t) => fallbackReply(t));
		expect(said.some((s) => /means/.test(s))).toBe(true);
		expect(said.every((s) => /means/.test(s))).toBe(false);
	});
});

describe("insults", () => {
	it("recognizes insults, in slang too", () => {
		for (const text of ["you suck", "u suck", "you are stupid", "shut up", "i hate you", "you are useless"]) {
			expect(parse(text).intent.type, text).toBe("insult");
		}
		expect(parse("you are smart").intent.type).toBe("compliment");
	});

	it("answers with hurt and an offer to do better, not with a shrug", () => {
		for (const turn of [0, 1]) {
			const r = respond(parse("you suck"), { state: defaultState(), cause: null, turn });
			expect(r).toMatch(/^[A-Z]/);
			expect(r).toMatch(/[.!?]$/);
			expect(r).not.toMatch(/didn't catch|not sure I understood/);
		}
	});
});

describe("donor slang is understood", () => {
	it("reads a donor word as its plain meaning, but built-in and taught words still win", () => {
		const entry = Object.entries(mergedLexicon()).find(([w]) => !(w in SLANG));
		expect(entry).toBeDefined();
		const [word, meaning] = entry!;
		expect(normalize(word)).toBe(meaning);
		expect(normalize(word, { [word]: "taught" })).toBe("taught");
		expect(normalize("hru")).toBe("how are you");
	});

	it("does not rewrite ordinary sentences", () => {
		expect(normalize("I am fine and that is cool")).toBe("i am fine and that is cool");
	});
});

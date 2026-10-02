import { describe, expect, it } from "vitest";
import { askedForName } from "./context";
import { defaultState } from "./state";
import { fallbackReply, GUEST_NO_NOTES, parse, respond } from "./talk";

// Anything Osmo says himself is composed and professional: no slang, internet shorthand or emoji.
const CASUAL = /\b(?:lol|lmao|ngl|fr|tbh|bet|gonna|wanna|kinda|yo|yeah|nah|oof|wild|stoked|dude|bro|cool cool|wanna)\b|\p{Extended_Pictographic}/iu;
const SAMPLES = [
	"hi", "bye", "how are you", "what are you doing", "how are you feeling", "who are you", "what can you do", "thanks",
	"sorry", "you are smart", "you suck", "that was rude", "send nudes", "/help", "lol", "i love you", "i made you", "brb",
	"ok", "you are", "where are you from", "what do you mean", "you make me happy", "you make me sad", "im happy", "im sad",
];

describe("Osmo's voice", () => {
	it("stays professional in every conversation reply", () => {
		for (const text of SAMPLES) {
			for (let turn = 0; turn < 4; turn++) {
				const reply = respond(parse(text), { state: defaultState(), cause: null, turn, userName: turn % 2 ? "Gur" : null });
				expect(reply, text).not.toBeNull();
				expect(reply!, `${text} @${turn}`).not.toMatch(CASUAL);
				expect(reply!, text).toMatch(/^[A-Z]/);
			}
		}
	});

	it("keeps fallbacks professional", () => {
		for (let turn = 0; turn < 6; turn++) {
			expect(fallbackReply(turn, "blah blah"), `${turn}`).not.toMatch(CASUAL);
			expect(fallbackReply(turn, "why is the sky blue?"), `${turn}`).not.toMatch(CASUAL);
		}
	});

	it("still asks for the user's name in a way the name flow recognizes", () => {
		expect(askedForName(respond(parse("who are you"), { state: defaultState(), cause: null, turn: 0 })!)).toBe(true);
	});
});

describe("Osmo never repeats profanity or slang back", () => {
	it("answers the feeling without echoing a crude or slangy word", () => {
		const state = defaultState();
		for (const [text, word] of [
			["i feel shitty", "shitty"],
			["im pissed", "pissed"],
			["im feeling dope", "dope"],
			["i am cooked", "cooked"],
			["im so salty", "salty"],
		]) {
			for (let turn = 0; turn < 2; turn++) {
				const reply = respond(parse(text), { state, cause: null, turn })!;
				expect(reply, text).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
				expect(reply, text).toMatch(/sorry|glad|good to hear|difficult/i);
			}
		}
		expect(respond(parse("im gloomy"), { state, cause: null, turn: 0 })).toMatch(/gloomy/);
	});
});

describe("Osmo with a guest", () => {
	it("never promises a guest he'll remember what they teach him", () => {
		for (let turn = 0; turn < 8; turn++) {
			const reply = fallbackReply(turn, "blah blah", true);
			expect(reply, `${turn}`).not.toMatch(/remember|tell me what it means/i);
			expect(reply, `${turn}`).not.toMatch(CASUAL);
		}
		expect([0, 1, 2, 3].some((turn) => /tell me what it means/.test(fallbackReply(turn, "blah blah")))).toBe(true);
	});

	it("tells a guest plainly that he keeps notes only for his owner", () => {
		expect(GUEST_NO_NOTES).toMatch(/^[A-Z].*\.$/);
		expect(GUEST_NO_NOTES).not.toMatch(CASUAL);
		expect(GUEST_NO_NOTES).not.toMatch(/I'll remember/);
	});
});

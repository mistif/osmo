import { describe, expect, it } from "vitest";
import { askedForName, nameCorrection, nameFromHistory, wantsNameFromChat } from "./context";
import { NEW_OSMO_REPLY } from "./character";
import { newSession, processTurn, type Session } from "./mind";
import { defaultState, type AgentState } from "./state";
import { fallbackReply } from "./talk";

// Replays the real conversation saved in Supabase on 2026-09-24, one test per thing that went wrong.
const ctx = () => ({ now: 1_000_000, lastAt: null, uuid: () => "id" });
const say = (text: string, state: AgentState = defaultState(), session: Session = newSession()) =>
	processTurn(state, session, text, ctx());
const PET_NAMES = /\b(squirt|kiddo|little one|sweetheart|darling|dear|sir|madam|boss|buddy|mate|dude|champ)\b/i;
const JUST_MET_GU = "Good to meet you, Gu.";

describe("the Supabase chat log, replayed", () => {
	it("never talks down to the user", () => {
		const state = defaultState();
		for (const text of ["who are you", "bet", "hi", "thanks", "lol", "how are you"]) {
			for (let turn = 0; turn < 6; turn++) {
				const r = processTurn(state, { ...newSession(), turns: turn }, text, ctx());
				expect(r.reply ?? "", text).not.toMatch(PET_NAMES);
			}
		}
	});

	it("answers 'who are you' and asks for the user's name back", () => {
		const r = say("who are you");
		expect(r.reply).toContain("Osmo");
		expect(askedForName(r.reply!)).toBe(true);
	});

	it("treats a slur or a misspelled insult as an insult", () => {
		for (const text of ["your a retard", "ur a retard", "you're a moron", "u r so dumb", "fuck you", "stfu"]) {
			expect(say(text).reply, text).toMatch(/harsh|civil|bothering/i);
		}
	});

	it("owns it when told he was rude", () => {
		for (const text of [
			"you just started this conversation off really rudely",
			"that was rude",
			"you were so rude",
			"why are you being rude",
		]) {
			expect(say(text).reply, text).toMatch(/apolog/i);
		}
		for (const text of ["my boss was really rude today", "he talked to me rudely"]) {
			expect(say(text).reply ?? "", text).not.toMatch(/apolog|came across as rude|my best start/i);
		}
	});

	it("sets a boundary on sexual messages instead of asking to rephrase", () => {
		for (const text of ["im going to fuck you raw", "send nudes", "i want to have sex with you"]) {
			const r = say(text).reply;
			expect(r, text).toMatch(/(?:won't|will not) engage/i);
			expect(r, text).not.toMatch(/another way|rephrase/i);
		}
		expect(say("fuck you").reply).not.toMatch(/(?:won't|will not) engage/i);
	});

	it("explains there are no slash commands and says what he can do", () => {
		expect(say("/restart").reply).toMatch(/slash commands/i);
		expect(say("/help").reply).not.toMatch(/roll|donor|personality/i);
	});

	it("answers 'roll a new osmo' with one line and keeps no offer open", () => {
		const r = say("roll a new osmo");
		expect(r.reply).toBe(NEW_OSMO_REPLY);
		expect(r.session).not.toHaveProperty("awaitingReroll");
		expect(processTurn(r.state, r.session, "yes, roll", ctx()).reply ?? "").not.toMatch(/Done|roll/i);
	});

	it("still gives the crisis reply to 'i want to kill myself'", () => {
		expect(say("i want to kill myself").reply).toMatch(/988|112/);
	});

	it("takes a name correction straight after learning a name", () => {
		expect(nameCorrection("gur", JUST_MET_GU)).toBe("Gur");
		expect(nameCorrection("i meant gur", JUST_MET_GU)).toBe("Gur");
		expect(nameCorrection("no its Gur", JUST_MET_GU)).toBe("Gur");
		expect(nameCorrection("cool", JUST_MET_GU)).toBeNull();
		expect(nameCorrection("pizza", JUST_MET_GU)).toBeNull();
		expect(nameCorrection("gur", "Hey! What's up?")).toBeNull();
	});

	it("takes a correction whenever he has just said the (wrong) saved name back", () => {
		expect(nameCorrection("i meant gur", "I'm Osmo. And you're Gu, I remember.")).toBe("Gur");
		expect(nameCorrection("no its gur", "I'm Osmo. And you're Gu, I remember. Slay.")).toBe("Gur");
		expect(nameCorrection("its gur", "Your name is Gu.")).toBe("Gur");
		expect(nameCorrection("lol", "Your name is Gu.")).toBeNull();
	});

	it("finds a name the user already gave earlier in the chat", () => {
		const log = [
			{ role: "user" as const, text: "whats my name" },
			{ role: "agent" as const, text: "I do not know your name yet. What should I call you?" },
			{ role: "user" as const, text: "its Gur" },
			{ role: "agent" as const, text: "Lol, you lost me. Run that by me again?" },
		];
		expect(nameFromHistory(log)).toBe("Gur");
		expect(nameFromHistory([{ role: "user", text: "im Gur" }])).toBe("Gur");
		expect(nameFromHistory([{ role: "user", text: "im so sad" }])).toBeNull();
		expect(wantsNameFromChat("cant u see in the chat my name")).toBe(true);
		expect(wantsNameFromChat("i already told you my name")).toBe(true);
		expect(wantsNameFromChat("whats the weather like")).toBe(false);
	});

	it("asks politely to rephrase when he doesn't follow", () => {
		expect(say("do it jiggle when you walk").reply).toBeNull();
		const lines = [0, 1, 2, 3].map((t) => fallbackReply(t, "do it jiggle when you walk"));
		for (const line of lines) expect(line).not.toMatch(/Could you put it another way\?|say it more simply/);
		expect(lines[0]).toMatch(/not sure I follow/i);
	});
});

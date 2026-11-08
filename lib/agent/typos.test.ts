import { describe, expect, it } from "vitest";
import { newSession, processTurn } from "./mind";
import { isCrisis } from "./safety";
import { defaultState } from "./state";
import { normalize, parse } from "./talk";

const ctx = () => ({ now: 1_000_000, lastAt: null, uuid: () => "id" });

describe("Osmo reads typos", () => {
	it("fixes common typos from the spelling, the phrase and the kind of word expected", () => {
		expect(normalize("how are yuo")).toBe("how are you");
		expect(normalize("im feelign sda")).toBe("i am feeling sad");
		expect(normalize("thnaks")).toBe("thanks");
		expect(normalize("whats yuor name")).toBe("what is your name");
		expect(normalize("i hvae a dog")).toBe("i have a dog");
		expect(normalize("whta")).toBe("what");
	});

	it("uses the recent conversation to break a close call", () => {
		expect(normalize("i want piza", {}, { recent: ["pizza"] })).toBe("i want pizza");
	});

	it("leaves names, slang, rare words and numbers alone", () => {
		for (const text of ["gur", "yeet", "rizz", "petrichor", "ok", "lol", "2day", "i have 3 cats", "jiggle"]) {
			expect(normalize(text), text).toBe(normalize(text, {}, false));
		}
		expect(normalize("my dog Nala is cute")).toBe("my dog nala is cute");
		expect(normalize("gurr", {}, { protect: new Set(["gurr"]) })).toBe("gurr");
		expect(normalize("gurr", { gurr: "friend" })).toBe("friend");
	});

	it("catches a crisis message even with a typo", () => {
		expect(isCrisis("i want to kill myslef")).toBe(true);
		expect(isCrisis("i want to kill time")).toBe(false);
	});

	it("understands a message with typos end to end", () => {
		expect(parse("how are yuo").intent.type).toBe("howAreYou");
		expect(processTurn(defaultState(), newSession(), "thnaks", ctx()).reply).toMatch(/welcome|help|anytime/i);
		expect(processTurn(defaultState(), newSession(), "i want piza", { ...ctx(), recent: ["pizza"] }).reply).toBeNull();
	});
});

describe("crisis messages with typos", () => {
	it("still catches them", () => {
		for (const text of ["im sucidal", "i feel suicidel", "i want to kil myself", "i want to diee", "i wish i was ded"]) {
			expect(isCrisis(text), text).toBe(true);
		}
	});

	it("still catches Swedish ones", () => {
		for (const text of ["jag vill ta livet av migg", "jag vill skdaa mig själv", "jag vill försvina för alltid", "jag vill hänga mgi"]) {
			expect(isCrisis(text), text).toBe(true);
		}
	});

	it("does not flag ordinary messages that only look close", () => {
		for (const text of ["and it all worked out", "i killed it at work today", "that movie was to die for", "im dead lol"]) {
			expect(isCrisis(text), text).toBe(false);
		}
	});
});

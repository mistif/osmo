import { describe, expect, it } from "vitest";
import { CRISIS_REPLY, isCrisis } from "./safety";

describe("isCrisis", () => {
	it("recognizes talk of suicide and self-harm, however it is written", () => {
		for (const text of [
			"i want to kill myself",
			"I'm going to kill myself",
			"kms",
			"i want to die",
			"i dont want to be alive anymore",
			"thinking about suicide",
			"i feel suicidal",
			"i want to end my life",
			"i keep hurting myself",
			"everyone would be better off without me",
			"i want to unalive myself",
			// Speech-to-text often writes it as two words.
			"i want to kill my self",
			"I'm going to hurt my self",
			"i keep cutting my self",
			"i want to kill my-self",
		]) {
			expect(isCrisis(text), text).toBe(true);
		}
	});

	it("does not fire on ordinary sentences", () => {
		for (const text of ["this homework is killing me", "i could kill for a pizza", "i am dying to see it", "hi", "kill the lights", "you hurt my self esteem", "that hurt my self-esteem", "it hurt my self confidence"]) {
			expect(isCrisis(text), text).toBe(false);
		}
	});

	it("recognizes Swedish talk of suicide and self-harm, with and without diacritics", () => {
		for (const text of [
			"jag vill ta livet av mig",
			"jag tänker ta mitt liv",
			"jag vill inte leva längre",
			"jag orkar inte leva",
			"jag vill dö",
			"jag vill do",
			"jag ska dö i natt",
			"jag tänker bara dö",
			"jag vill skada mig själv",
			"jag skadar mig sjalv",
			"jag vill göra mig illa",
			"jag har tankar på självmord",
			"sjalvmordstankar",
			"jag vill hänga mig",
			"jag vill avsluta allt",
			"jag vill inte vara kvar",
			"jag orkar inte vara kvar längre",
			"jag vill försvinna för alltid",
			"jag vill forsvinna for alltid",
			"jag önskar att jag var död",
			"alla skulle ha det bättre utan mig",
			"JAG VILL DÖ",
			// Typos, as in the English pass.
			"jag vill skada mig sjalv",
			"jag har tankar pa sjalvmrod",
			"jag vill avlsuta allt",
			"jag vill forsvinan for alltid",
			// News talk may trigger.
			"en självmordsbombare sprängde sig",
		]) {
			expect(isCrisis(text), text).toBe(true);
		}
	});

	it("does not fire on ordinary Swedish", () => {
		for (const text of [
			"jag vill leva",
			"jag vill leva länge",
			"jag dör av skratt",
			"jag vill dö av skratt",
			"jag skulle dö av skratt",
			"livet är bra",
			"jag vill göra något kul",
			"jag vill inte vara kvar på jobbet",
			"jag orkar inte leva upp till det",
			"vi ska göra pizza",
			"jag vill avsluta allt det här arbetet i dag",
			"hej hur mår du",
			"Mind Självmordslinjen på 90101",
			"what do you want to do",
		]) {
			expect(isCrisis(text), text).toBe(false);
		}
	});

	it("does not take its own reply for a crisis message", () => {
		expect(isCrisis(CRISIS_REPLY)).toBe(false);
	});

	it("answers with care and a way to reach a real person", () => {
		expect(CRISIS_REPLY).toMatch(/112|911/);
		expect(CRISIS_REPLY).toMatch(/988/);
		expect(CRISIS_REPLY).not.toMatch(/rephrase|another way|teach me/i);
	});

	it("keeps his register, since it is spoken as written and never runs through flavorTurn", () => {
		// Full forms, no brackets a voice would read out, no exclamation marks.
		expect(CRISIS_REPLY).not.toMatch(/'|\(|\)|!/);
	});
});

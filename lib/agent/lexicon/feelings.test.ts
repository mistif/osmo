import { describe, expect, it } from "vitest";
import { newSession, processTurn } from "../mind";
import { defaultState } from "../state";
import { NEGATIVE_FEELINGS, parse, POSITIVE_FEELINGS } from "../talk";
import { FEELING_SYNONYMS, feelingFor, withBaseFeelings } from "./feelings";

const ctx = () => ({ now: 1_000_000, lastAt: null, uuid: () => "id" });

describe("the feelings thesaurus", () => {
	it("maps about 300 single words, each to a feeling talk.ts knows, never to itself", () => {
		const known = [...NEGATIVE_FEELINGS, ...POSITIVE_FEELINGS];
		expect(Object.keys(FEELING_SYNONYMS).length).toBeGreaterThanOrEqual(300);
		for (const [word, base] of Object.entries(FEELING_SYNONYMS)) {
			expect(/^[a-z]+$/.test(word), word).toBe(true);
			expect(known, `${word} -> ${base}`).toContain(base);
			expect(known, word).not.toContain(word);
		}
	});

	it("looks words up safely and can swap them for their feeling", () => {
		expect(feelingFor("gloomy")).toBe("sad");
		expect(feelingFor("constructor")).toBeNull();
		expect(withBaseFeelings("im so gloomy and Furious")).toBe("im so sad and angry");
	});
});

describe("Osmo understands thesaurus feelings", () => {
	it("keeps the user's word and takes good or bad news from the mapped feeling", () => {
		expect(parse("im gloomy").intent).toEqual({ type: "userFeeling", feeling: "gloomy", positive: false });
		expect(parse("i feel ecstatic").intent).toEqual({ type: "userFeeling", feeling: "ecstatic", positive: true });
		expect(parse("furious").intent).toEqual({ type: "userFeeling", feeling: "furious", positive: false });
	});

	it("replies with the user's word", () => {
		expect(processTurn(defaultState(), newSession(), "im gloomy", ctx()).reply).toMatch(/sorry you're feeling gloomy/i);
	});

	it("moves his mood like the base feeling would", () => {
		const gloomy = processTurn(defaultState(), newSession(), "im gloomy", ctx()).state.activations.sadness;
		const sad = processTurn(defaultState(), newSession(), "im sad", ctx()).state.activations.sadness;
		expect(gloomy).toBeCloseTo(sad, 5);
	});
});

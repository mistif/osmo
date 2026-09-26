import { describe, expect, it } from "vitest";
import { DONORS } from "../personality/donors";
import { MODERN_DONORS } from "../personality/modern";
import { emptyBond, type Bond } from "./bond";
import {
	closenessReply,
	isAskCloseness,
	isAskMet,
	metReply,
	milestoneLine,
	sharedMemory,
	slangJoke,
	spokenDate,
	welcomeBack,
} from "./lines";

const SPEAKABLE = /^[A-Za-z0-9 ,.'!?-]+$/;
const bondWith = (over: Partial<Bond>): Bond => ({ ...emptyBond(), ...over });

describe("welcomeBack", () => {
	it("gets warmer with the stage and uses the name only past stranger", () => {
		expect(welcomeBack("stranger", "Gur", 0)).toBe("Welcome back.");
		expect(welcomeBack("acquaintance", "Gur", 0)).toContain("Gur");
		expect(welcomeBack("oldFriend", "Gur", 0)).toContain("missing you");
		expect(welcomeBack("friend", null, 0)).not.toMatch(/,\s*\./);
	});

	it("capitalizes a name stored in lowercase", () => {
		for (let t = 0; t < 2; t++) {
			expect(welcomeBack("acquaintance", "gur", t)).toContain("Gur");
			expect(welcomeBack("oldFriend", "mary jane", t)).toContain("Mary Jane");
		}
	});
});

describe("milestoneLine", () => {
	it("speaks for shared milestones and stays quiet for met and name", () => {
		expect(milestoneLine("met")).toBeNull();
		expect(milestoneLine("name")).toBeNull();
		expect(milestoneLine("firstFeeling")).toMatch(/remember/);
		expect(milestoneLine("friend")).toMatch(/friend/);
	});
});

describe("sharedMemory", () => {
	it("recalls a milestone that actually happened, or nothing", () => {
		expect(sharedMemory(emptyBond(), 0)).toBeNull();
		const b = bondWith({ milestones: [{ id: "name", at: "2026-09-24T10:00:00.000Z" }] });
		expect(sharedMemory(b, 0)).toMatch(/your name/);
	});
});

describe("slangJoke", () => {
	// Every donor that can supply the slang organ (see assemble.ts poolFor).
	const SLANG_POOL = DONORS.filter((d) => MODERN_DONORS.has(d.id)).map((d) => d.id);
	const ABBREVIATION = /\b(?:ngl|gg|lol|fr|tbh|rn|imo|smh|idk|omg)\b/i;
	// Three of a letter in a row, or a doubled letter ending a word ("slayy").
	const STRETCHED = /([a-z])\1\1|([a-z])\2\b/i;

	it("frames genuine slang as a knowing joke, written out as words", () => {
		const line = slangJoke("the-gen-z-group-chat", 0);
		expect(line).toMatch(/no cap|slay|hits different/);
		expect(line).toMatch(/expression|told the phrase|would say/);
	});

	it("makes no joke for a donor whose phrases are not really slang, or an unknown donor", () => {
		for (const id of ["the-pun-machine", "the-trivia-champion", "no-such-donor"]) expect(slangJoke(id, 0), id).toBeNull();
	});

	it("every possible joke, for every donor in the slang pool, is plain and speakable", () => {
		expect(SLANG_POOL.length).toBe(MODERN_DONORS.size);
		let jokes = 0;
		for (const id of SLANG_POOL) {
			// 3 phrases by 3 frames at most, so 30 turns reach every combination.
			for (let t = 0; t < 30; t++) {
				const line = slangJoke(id, t);
				if (line === null) continue;
				jokes++;
				expect(line, id).not.toMatch(ABBREVIATION);
				expect(line, id).not.toMatch(STRETCHED);
				expect(line, id).toMatch(/^[A-Za-z ,.'!?-]+$/);
			}
		}
		expect(jokes).toBeGreaterThan(0);
	});

	it("reaches every frame with every phrase", () => {
		const lines = new Set(Array.from({ length: 30 }, (_, t) => slangJoke("the-gen-z-group-chat", t)));
		for (const frame of [/as I believe the expression goes/, /I am told the phrase is/, /Some would say/]) {
			for (const phrase of [/no cap\.$/, /slay\.$/]) expect([...lines].some((l) => frame.test(l!) && phrase.test(l!)), `${frame} ${phrase}`).toBe(true);
		}
	});
});

describe("closeness commands", () => {
	it("recognizes the questions", () => {
		for (const t of ["how close are we", "How close are we?", "are we friends", "how well do you know me"]) expect(isAskCloseness(t), t).toBe(true);
		for (const t of ["when did we meet", "when did we first meet?", "how long have we known each other"]) expect(isAskMet(t), t).toBe(true);
		expect(isAskCloseness("are we there yet")).toBe(false);
	});

	it("only takes 'are we friends' or 'are we close' as the whole question", () => {
		for (const t of ["are we close?", "Are we friends?!", "are we close"]) expect(isAskCloseness(t), t).toBe(true);
		for (const t of ["are we close to done?", "are we friends with them", "are we close to the station"]) expect(isAskCloseness(t), t).toBe(false);
	});

	it("answers with the real counts", () => {
		const b = bondWith({ days: 9, messages: 120, shared: 6, metAt: "2026-09-01T10:00:00.000Z" });
		expect(closenessReply(b)).toMatch(/friends/);
		expect(closenessReply(b)).toMatch(/9 different days/);
	});

	it("on the first day, says we have spoken today", () => {
		const first = closenessReply(bondWith({ days: 1, messages: 1 }));
		expect(first).toMatch(/We have spoken today\./);
		expect(first).not.toMatch(/1 day/);
		expect(closenessReply(bondWith({ days: 1, messages: 3, shared: 1 }))).toMatch(/We have spoken today, and you have told me a little about yourself\./);
	});

	it("says when they met, in words", () => {
		const now = new Date(2026, 8, 30).getTime();
		expect(spokenDate("2026-09-24T10:00:00.000Z", now)).toBe("the 24th of September");
		expect(spokenDate("2025-01-02T10:00:00.000Z", now)).toBe("the 2nd of January 2025");
		expect(metReply(bondWith({ metAt: "2026-09-24T10:00:00.000Z" }), now)).toBe("We first spoke on the 24th of September.");
		expect(metReply(emptyBond(), now)).toMatch(/just now|only just/);
	});

	it("every line is speakable", () => {
		const b = bondWith({ days: 40, messages: 500, shared: 20, metAt: "2026-08-01T10:00:00.000Z", milestones: [{ id: "name", at: "2026-08-02T10:00:00.000Z" }] });
		const now = new Date(2026, 8, 30).getTime();
		for (const line of [closenessReply(b), metReply(b, now), welcomeBack("oldFriend", "Gur", 1), sharedMemory(b, 0) ?? ""]) {
			expect(line).toMatch(SPEAKABLE);
		}
	});
});

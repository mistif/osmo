import { describe, expect, it } from "vitest";
import { emptyBond, type Bond } from "./bond";
import {
	closenessReply,
	isAskCloseness,
	isAskMet,
	metReply,
	milestoneLine,
	sharedMemory,
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
		expect(milestoneLine("firstFeeling")).toMatch(/matters/);
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

import { describe, expect, it } from "vitest";
import { defaultState } from "./state";
import { newSession, processTurn } from "./mind";
import { emptyBond } from "./bond/bond";
import { DILEMMAS } from "./dilemmas";
import { GUEST_DILEMMA, GUEST_NO_CHANGES, GUEST_PRIVATE } from "../voice/guest";

type Ctx = { now: number; lastAt: number | null; guest: boolean; userName: string | null };
const ctx = (o: Partial<Ctx> = {}) => ({ now: 1_000_000, lastAt: null, uuid: () => "id-1", guest: true, ...o });
const knownBond = { ...emptyBond(), metAt: "2026-09-01T10:00:00.000Z", messages: 40, days: 9, lastDay: "2026-09-20", nameKnown: true };
const withBond = () => ({ ...defaultState(), bond: knownBond });

describe("processTurn for someone who isn't Gur", () => {
	it("keeps the bond private", () => {
		expect(processTurn(withBond(), newSession(), "how close are we", ctx()).reply).toBe(GUEST_PRIVATE);
		expect(processTurn(withBond(), newSession(), "when did we meet", ctx()).reply).toBe(GUEST_PRIVATE);
	});

	it("can't re-roll him, even straight after Gur was offered one", () => {
		const offer = processTurn(defaultState(), newSession(), "roll a new osmo", ctx());
		expect(offer.reply).toBe(GUEST_NO_CHANGES);
		expect(offer.session.awaitingReroll).toBeNull();
		const waiting = { ...newSession(), awaitingReroll: { seed: 5 } };
		expect(processTurn(defaultState(), waiting, "yes, roll", ctx()).reply).toBe(GUEST_NO_CHANGES);
		expect(processTurn(defaultState(), waiting, "yes", ctx()).reply ?? "").not.toMatch(/yes, roll/);
	});

	it("doesn't answer Gur's pending dilemma with a yes", () => {
		const pending = { logId: "l", dilemmaId: DILEMMAS[0].id, decision: { chosen: 0 } } as never;
		const r = processTurn(defaultState(), { ...newSession(), pending }, "yes", ctx());
		expect(r.effects).toEqual([]);
		expect(r.state.weights).toEqual(defaultState().weights);
	});

	it("keeps dilemmas for Gur", () => {
		const r = processTurn(defaultState(), newSession(), "give me a dilemma", ctx());
		expect(r.reply).toBe(GUEST_DILEMMA);
		expect(r.effects).toEqual([]);
	});

	it("leaves the bond exactly as it was", () => {
		const r = processTurn(withBond(), newSession(), "i feel really happy today", ctx());
		expect(r.state.bond).toEqual(knownBond);
	});

	it("hears news without promising to remember it, and records nothing", () => {
		const r = processTurn(defaultState(), newSession(), "my dog died today", ctx());
		expect(r.reply ?? "").not.toMatch(/remember/i);
		expect(r.effects).toEqual([]);
	});

	it("still answers talk of suicide with care", () => {
		expect(processTurn(defaultState(), newSession(), "i want to kill myself", ctx()).reply).toMatch(/988/);
	});

	it("gets no welcome back and never hears Gur's name", () => {
		const r = processTurn(withBond(), newSession(), "hello", ctx({ lastAt: 0, now: 3 * 86_400_000, userName: null }));
		expect(r.reply ?? "").not.toMatch(/welcome back|good to see you again|good to have you back|there you are/i);
		expect(r.reply ?? "").not.toMatch(/gur/i);
	});

	it("changes nothing for Gur himself", () => {
		expect(processTurn(withBond(), newSession(), "how close are we", ctx({ guest: false })).reply).not.toBe(GUEST_PRIVATE);
	});

	it("never says why he feels the way he does, even after Gur told him something painful", () => {
		const after = processTurn(defaultState(), newSession(), "i want to kill myself", ctx({ guest: false }));
		for (const ask of ["how are you feeling", "why are you sad", "why do you feel that way"]) {
			const r = processTurn(after.state, after.session, ask, ctx());
			expect(r.reply ?? "").not.toMatch(/because|hurting|told me|shared with me/i);
		}
	});

	it("is never welcomed back", () => {
		const r = processTurn(withBond(), { ...newSession(), turns: 2 }, "hello", ctx());
		expect(r.reply ?? "").not.toMatch(/welcome back|good to see you|good to have you back|there you are/i);
	});
});

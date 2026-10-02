import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, defaultState } from "./state";
import { newSession, processTurn } from "./mind";
import { emptyBond } from "./bond/bond";
import { milestoneLine } from "./bond/lines";
import { CHARACTER, NEW_OSMO_REPLY } from "./character";

const ctx = (o: Partial<{ now: number; lastAt: number | null }> = {}) => ({
	now: 1_000_000,
	lastAt: null,
	uuid: () => "id-1",
	...o,
});

describe("processTurn: heart", () => {
	it("falls through (null reply, no effects) for ordinary chat", () => {
		const r = processTurn(defaultState(), newSession(), "the weather is fine", ctx());
		expect(r.reply).toBeNull();
		expect(r.effects).toEqual([]);
	});

	it("thanks raise joy", () => {
		const r = processTurn(defaultState(), newSession(), "thank you!", ctx());
		expect(r.state.activations.joy).toBeGreaterThan(0.6);
	});

	it("a long silence raises loneliness", () => {
		const r = processTurn(defaultState(), newSession(), "hello", ctx({ lastAt: 0, now: 8 * 3600_000 }));
		expect(r.state.activations.loneliness).toBeGreaterThan(defaultState().activations.loneliness);
	});
});

describe("processTurn: safety", () => {
	it("answers talk of suicide with care, even while a dilemma is waiting for yes or no", () => {
		const pending = { logId: "l", dilemmaId: "d", decision: { chosen: 0 } } as never;
		const r = processTurn(defaultState(), { ...newSession(), pending }, "i want to kill myself", ctx());
		expect(r.reply).toMatch(/988/);
		expect(r.effects).toEqual([]);
	});
});

describe("processTurn: several things in one message", () => {
	it("answers each part instead of only one", () => {
		const r = processTurn(defaultState(), newSession(), "im good u seem to be doing well and i made you", ctx());
		expect(r.reply).toMatch(/glad you(?:'re| are) feeling good|nice to hear/i);
		expect(r.reply).toMatch(/You made me/);
		// Only the last part keeps its closing question, so Osmo doesn't ask two things at once.
		expect(r.reply).not.toMatch(/good day\?|going well\?/);
	});

	it("does not answer a greeting separately from the question after it", () => {
		const r = processTurn(defaultState(), newSession(), "hi, how are you", ctx());
		expect(r.reply).not.toMatch(/How are you doing today\?.*How are you/);
	});
});

describe("processTurn: told events and arguments", () => {
	it("responds to a tragic event with sympathy and logs it", () => {
		const r = processTurn(defaultState(), newSession(), "my dog died today", ctx());
		expect(r.reply).toMatch(/sorry/i);
		expect(r.effects).toHaveLength(1);
		expect(r.effects[0]).toMatchObject({ type: "event", event: { valence: "tragic" } });
		expect(r.state.history).toHaveLength(1);
	});

	it("takes both sides of a mixed message", () => {
		const r = processTurn(defaultState(), newSession(), "my dog died but I got the job", ctx());
		expect(r.effects.map((e) => e.type === "event" && e.event.valence).sort()).toEqual(["happy", "tragic"]);
	});

	it("nudges outlook a little when argued with, without overriding it", () => {
		const r = processTurn(defaultState(), newSession(), "look on the bright side", ctx());
		expect(r.state.outlook).toBeGreaterThan(0);
		expect(r.state.outlook).toBeLessThan(0.05);
		expect(r.reply).not.toBeNull();
	});
});

describe("processTurn: stories", () => {
	it("feeds a happy then a tragic event and then states which way it leans", () => {
		let r = processTurn(defaultState(), newSession(), "tell me a story", ctx());
		expect(r.effects[0]).toMatchObject({ type: "event", event: { valence: "happy" } });
		r = processTurn(r.state, r.session, "tell me a story", ctx());
		expect(r.effects[0]).toMatchObject({ type: "event", event: { valence: "tragic" } });
		expect(r.reply).toMatch(/lean|undecided/);
	});
});

describe("processTurn: dilemmas", () => {
	it("poses a dilemma, decides, and asks whether the user agrees", () => {
		const r = processTurn(defaultState(), newSession(), "give me a dilemma", ctx());
		expect(r.reply).toContain("Do you agree?");
		expect(r.session.pending?.dilemmaId).toBe("trolley");
		expect(r.effects).toEqual([
			{ type: "dilemma", logId: "id-1", dilemmaId: "trolley", option: "Pull the lever" },
		]);
	});

	it("matches 'what would you do if' to a scenario by keyword", () => {
		const r = processTurn(defaultState(), newSession(), "what would you do if I found a wallet", ctx());
		expect(r.reply).toContain("wallet");
	});

	it("admits when it has no matching scenario", () => {
		const r = processTurn(defaultState(), newSession(), "what would you do if aliens landed", ctx());
		expect(r.reply).toMatch(/don't have a scenario/);
		expect(r.effects).toEqual([]);
		expect(r.session.pending).toBeNull();
	});

	it("learns from 'no' after a dilemma", () => {
		const asked = processTurn(defaultState(), newSession(), "give me a dilemma", ctx());
		const answered = processTurn(asked.state, asked.session, "no", ctx());
		expect(answered.effects).toEqual([{ type: "verdict", logId: "id-1", agreed: false }]);
		expect(answered.state.weights).not.toEqual(asked.state.weights);
		expect(answered.session.pending).toBeNull();
	});

	it("ignores a bare yes/no when no dilemma is pending", () => {
		for (const word of ["yes", "no"]) {
			const r = processTurn(defaultState(), newSession(), word, ctx());
			expect(r.reply).toBeNull();
			expect(r.effects).toEqual([]);
			expect(r.state.weights).toEqual(DEFAULT_WEIGHTS);
		}
	});

	it("accepts an explicit 'good answer' later, but not a bare 'no'", () => {
		const asked = processTurn(defaultState(), newSession(), "give me a dilemma", ctx());
		const moved = processTurn(asked.state, asked.session, "hello", ctx());
		expect(moved.session.pending).toBeNull();
		expect(moved.session.last).not.toBeNull();

		const bare = processTurn(moved.state, moved.session, "no", ctx());
		expect(bare.reply).toBeNull();

		const explicit = processTurn(moved.state, moved.session, "good answer", ctx());
		expect(explicit.effects).toEqual([{ type: "verdict", logId: "id-1", agreed: true }]);
		expect(explicit.session.last).toBeNull();
	});
});

describe("processTurn: hypotheticals (review fix)", () => {
	it("does not log a hypothetical 'what would you do if' as a real event", () => {
		const r = processTurn(defaultState(), newSession(), "what would you do if someone died", ctx());
		expect(r.effects).toEqual([]);
		expect(r.reply).toMatch(/don't have a scenario/);
		expect(r.state.history).toEqual([]);
	});
});

describe("processTurn: dilemma trigger (review fix)", () => {
	it("does not pose a dilemma for an advice request that mentions the word", () => {
		const r = processTurn(defaultState(), newSession(), "give me advice on a dilemma I have", ctx());
		expect(r.reply).toBeNull();
		expect(r.effects).toEqual([]);
		expect(r.session.pending).toBeNull();
	});

	it("still poses one for the natural phrasings", () => {
		for (const text of ["give me a dilemma", "give me another dilemma", "another dilemma", "dilemma"]) {
			expect(processTurn(defaultState(), newSession(), text, ctx()).reply).toContain("Do you agree?");
		}
	});
});

describe("processTurn: conversation (talk layer)", () => {
	it("sympathizes when the user says they are sad, then can say why it feels sad", () => {
		const first = processTurn(defaultState(), newSession(), "hi im sad", ctx());
		expect(first.reply).toMatch(/sorry/i);
		expect(first.effects).toEqual([]);
		expect(first.session.cause).toBe("you told me you were sad");
		const second = processTurn(first.state, first.session, "why are u feeling sad", ctx());
		expect(second.reply).toContain("because you told me you were sad");
	});

	it("answers everyday small talk", () => {
		expect(processTurn(defaultState(), newSession(), "thanks", ctx()).reply).toMatch(/welcome|help|anytime/i);
		expect(processTurn(defaultState(), newSession(), "what is your name", ctx()).reply).toContain("Osmo");
	});

	it("knows the user's name when it is given", () => {
		const r = processTurn(defaultState(), newSession(), "hello", { ...ctx(), userName: "Gur" });
		expect(r.reply).toContain("Gur");
	});

	it("leaves facts, math and topics to the rest of the chat", () => {
		for (const text of ["my name is gur", "what is 2+2", "what is my name"]) {
			expect(processTurn(defaultState(), newSession(), text, ctx()).reply).toBeNull();
		}
	});
});

describe("processTurn: taught slang", () => {
	it("uses words the user taught it", () => {
		const r = processTurn(defaultState(), newSession(), "hi fam im sad", { ...ctx(), slang: { fam: "friend" } });
		expect(r.reply).toMatch(/sorry/i);
		const bet = processTurn(defaultState(), newSession(), "bet", { ...ctx(), slang: { bet: "thanks" } });
		expect(bet.reply).toMatch(/welcome|help|anytime/i);
	});

	it("reacts to slang for how are you", () => {
		expect(processTurn(defaultState(), newSession(), "hru", ctx()).reply).toMatch(/How are you/);
	});
});

import { DILEMMAS } from "./dilemmas";

describe("processTurn: flavor stays in the conversation layer", () => {
	it("never touches dilemma, story or fact text", () => {
		const state = defaultState();
		const dilemma = processTurn(state, newSession(), "give me a dilemma", ctx());
		expect(dilemma.reply!.startsWith(DILEMMAS[0].prompt)).toBe(true);
		expect(dilemma.reply!.endsWith("Do you agree?")).toBe(true);
		const story = processTurn(state, newSession(), "tell me a story", ctx());
		expect(story.reply!.startsWith("Two old friends meet again")).toBe(true);
	});

	it("still answers small talk", () => {
		const r = processTurn(defaultState(), newSession(), "thanks", ctx());
		expect(typeof r.reply).toBe("string");
		expect(r.reply!.length).toBeGreaterThan(0);
	});

	it("keeps a sad conversation free of jokes", () => {
		const r = processTurn(defaultState(), newSession(), "im so sad", ctx());
		expect(r.reply).toMatch(/sorry|hard/i);
	});
});

describe("processTurn: one character", () => {
	it("answers the old roll commands with one line and keeps no offer open", () => {
		for (const text of ["roll a new osmo", "re-roll", "make new osmo"]) {
			const r = processTurn(defaultState(), newSession(), text, ctx());
			expect(r.reply, text).toBe(NEW_OSMO_REPLY);
			expect(r.session).not.toHaveProperty("awaitingReroll");
			expect(r.state.weights).toEqual(defaultState().weights);
			expect(r.effects).toEqual([]);
		}
	});
	it("treats a following 'yes, roll' as ordinary conversation", () => {
		const first = processTurn(defaultState(), newSession(), "roll a new osmo", ctx());
		expect(processTurn(first.state, first.session, "yes, roll", ctx()).reply ?? "").not.toMatch(/Done|roll/i);
	});
	it("scales what he feels by the character's reactivity", () => {
		const anger = () => processTurn(defaultState(), newSession(), "you are stupid", ctx()).state.activations.anger;
		const steady = anger();
		const saved = CHARACTER.reactivity;
		try {
			CHARACTER.reactivity = 1.5;
			expect(anger()).toBeGreaterThan(steady);
		} finally {
			CHARACTER.reactivity = saved;
		}
	});
});

describe("processTurn: bond", () => {
	it("counts every ordinary message", () => {
		const r = processTurn(defaultState(), newSession(), "hello", ctx());
		expect(r.state.bond.messages).toBe(1);
		expect(r.state.bond.milestones.map((m) => m.id)).toContain("met");
	});

	it("never counts a crisis message", () => {
		const r = processTurn(defaultState(), newSession(), "i want to kill myself", ctx());
		expect(r.state.bond).toEqual(emptyBond());
	});

	it("counts a shared feeling and a told event", () => {
		expect(processTurn(defaultState(), newSession(), "im sad", ctx()).state.bond.shared).toBe(1);
		expect(processTurn(defaultState(), newSession(), "my dog died today", ctx()).state.bond.shared).toBe(1);
	});

	it("counts the name once it is known", () => {
		const r = processTurn(defaultState(), newSession(), "hello", { ...ctx(), userName: "Gur" });
		expect(r.state.bond.nameKnown).toBe(true);
	});

	it("insults never lower the bond", () => {
		let r = processTurn(defaultState(), newSession(), "hello", ctx());
		const before = r.state.bond;
		r = processTurn(r.state, r.session, "you are useless", ctx());
		expect(r.state.bond.messages).toBe(before.messages + 1);
		expect(r.state.bond.shared).toBeGreaterThanOrEqual(before.shared);
	});

	it("answers how close we are and when we met, from the real counts", () => {
		const close = processTurn(defaultState(), newSession(), "how close are we", ctx());
		expect(close.reply).toMatch(/We have spoken today\./);
		const met = processTurn(close.state, close.session, "when did we meet", ctx());
		expect(met.reply).toMatch(/^We first spoke on the /);
	});
});

describe("processTurn: bond in replies", () => {
	it("clears a milestone from the queue once it has been said", () => {
		const first = processTurn(defaultState(), newSession(), "im happy", ctx());
		expect(first.state.bond.toMention).toEqual([]);
		expect(first.reply).toContain(milestoneLine("firstFeeling"));
	});

	// The first-event and first-feeling lines only make sense in the turn itself, so they never wait in the queue.
	it("does not queue the first event after a tragic one, whose acknowledgement already promises to remember", () => {
		const r = processTurn(defaultState(), newSession(), "my dog died today", ctx());
		expect(r.state.bond.milestones.map((m) => m.id)).toContain("firstEvent");
		expect(r.state.bond.toMention).not.toContain("firstEvent");
		expect(r.reply).not.toContain(milestoneLine("firstEvent"));
	});

	it("thanks the user for a first happy event in the same reply, and clears it", () => {
		const r = processTurn(defaultState(), newSession(), "i got the job", ctx());
		expect(r.effects[0]).toMatchObject({ type: "event", event: { valence: "happy" } });
		expect(r.reply).toContain(milestoneLine("firstEvent"));
		expect(r.state.bond.toMention).not.toContain("firstEvent");
	});

	it("does not leave the first feeling queued after a sad feeling", () => {
		const r = processTurn(defaultState(), newSession(), "im sad", ctx());
		expect(r.reply).not.toContain(milestoneLine("firstFeeling"));
		expect(r.state.bond.toMention).not.toContain("firstFeeling");
		const later = processTurn(r.state, r.session, "thanks", ctx());
		expect(later.reply).not.toContain(milestoneLine("firstFeeling"));
	});

	it("does not bring up the first event later, on an unrelated reply", () => {
		const told = processTurn(defaultState(), newSession(), "my dog died today", ctx());
		const later = processTurn(told.state, told.session, "thanks", ctx());
		expect(later.reply).not.toContain(milestoneLine("firstEvent"));
	});

	it("welcomes back after a day away", () => {
		const first = processTurn(defaultState(), newSession(), "hello", ctx({ now: 0 }));
		const back = processTurn(first.state, first.session, "hello", ctx({ now: 25 * 3600_000, lastAt: 0 }));
		expect(back.reply).toMatch(/^Welcome back\./);
	});
});

import { describe, expect, it } from "vitest";
import { defaultState, type AgentState } from "./state";
import { CRISIS_CAUSE, newSession, prepareTurn, processTurn, type Session } from "./mind";
import { emptyBond, stageOf } from "./bond/bond";
import { moodLabel } from "./heart";
import { moodTheme } from "./mood-theme";
import { CHARACTER, NEW_OSMO_REPLY } from "./character";
import { CRISIS_REPLY } from "./safety";
import { GUEST_PRIVATE } from "../voice/guest";

type Ctx = { now: number; lastAt: number | null; guest: boolean; userName: string | null; recent: string[] };
const ctx = (o: Partial<Ctx> = {}) => ({ now: 1_000_000, lastAt: null, uuid: () => "id-1", ...o });
const knownBond = {
	...emptyBond(),
	metAt: "2026-09-01T10:00:00.000Z",
	messages: 40,
	days: 9,
	lastDay: "2026-09-20",
	nameKnown: true,
	milestones: [{ id: "days7" as const, at: "2026-09-08T10:00:00.000Z" }],
	toMention: ["days7" as const],
};
const withBond = (): AgentState => ({ ...defaultState(), bond: knownBond });

// A real pending dilemma, so a verdict has something to answer.
function afterDilemma(): { state: AgentState; session: Session } {
	const r = processTurn(defaultState(), newSession(), "give me a dilemma", ctx());
	return { state: r.state, session: r.session };
}

// The start of a turn that code answers on its own must be exactly what processTurn does.
function sameAsProcessTurn(state: AgentState, session: Session, text: string, c: ReturnType<typeof ctx>) {
	const { facts, processed, ...prepared } = prepareTurn(state, session, text, c);
	expect(facts).toBeDefined();
	expect(processed).toEqual(prepared);
	expect(prepared).toEqual(processTurn(state, session, text, c));
	return prepared;
}

describe("prepareTurn: replies code decides", () => {
	it("answers a crisis before anything else", () => {
		const r = sameAsProcessTurn(defaultState(), newSession(), "i want to kill myself", ctx());
		expect(r.reply).toBe(CRISIS_REPLY);
	});

	it("takes a verdict on a pending dilemma", () => {
		const { state, session } = afterDilemma();
		const r = sameAsProcessTurn(state, session, "yes", ctx());
		expect(r.effects.map((e) => e.type)).toEqual(["verdict"]);
	});

	it("answers the old roll command with the one line", () => {
		expect(sameAsProcessTurn(defaultState(), newSession(), "roll a new osmo", ctx()).reply).toBe(NEW_OSMO_REPLY);
	});

	it("answers how close you are, and when you met", () => {
		for (const text of ["how close are we", "when did we meet"]) {
			expect(sameAsProcessTurn(withBond(), newSession(), text, ctx()).reply).not.toBeNull();
		}
	});

	// A guest's turn leaves no trace: the same replies as processTurn, but the state and session handed
	// back are the ones passed in, so a caller can save them without saving anything of the guest's.
	it("keeps the guest gates, and hands back the state and session untouched", () => {
		const guest = ctx({ guest: true });
		const same = (state: AgentState, session: Session, text: string) => {
			const r = prepareTurn(state, session, text, guest);
			expect(r.reply).toBe(processTurn(state, session, text, guest).reply);
			expect(r.state).toBe(state);
			expect(r.session).toBe(session);
			expect(r.effects).toEqual([]);
			return r;
		};
		expect(same(withBond(), newSession(), "how close are we").reply).toBe(GUEST_PRIVATE);
		expect(same(withBond(), newSession(), "roll a new osmo").reply).toBe(NEW_OSMO_REPLY);
		const { state, session } = afterDilemma();
		same(state, session, "yes");
		expect(same(defaultState(), newSession(), "i want to kill myself").reply).toBe(CRISIS_REPLY);
		same(withBond(), newSession(), "the weather is fine");
	});

	it("decides life events, stories and dilemmas exactly as processTurn does", () => {
		for (const text of ["give me a dilemma", "tell me a story", "people are kind, you know"]) {
			const r = sameAsProcessTurn(withBond(), newSession(), text, ctx());
			expect(r.reply).not.toBeNull();
		}
	});
});

describe("prepareTurn: everything else is left to the conversation", () => {
	it("returns no reply, with the heart and bond already stepped", () => {
		const text = "the weather is fine";
		const r = prepareTurn(withBond(), newSession(), text, ctx());
		expect(r.reply).toBeNull();
		expect(r.effects).toEqual([]);
		expect(r.session.turns).toBe(1);
		expect(r.state.bond.messages).toBe(knownBond.messages + 1);
		expect(r.state.activations).toEqual(processTurn(withBond(), newSession(), text, ctx()).state.activations);
	});

	it("clears a pending question that isn't answered", () => {
		const { state, session } = afterDilemma();
		const r = prepareTurn(state, session, "the weather is fine", ctx());
		expect(r.reply).toBeNull();
		expect(r.session.pending).toBeNull();
	});

	it("leaves a guest's bond exactly as it was", () => {
		const r = prepareTurn(withBond(), newSession(), "i feel really happy today", ctx({ guest: true }));
		expect(r.state.bond).toEqual(knownBond);
	});

	it("steps the state and session as processTurn would have, so the next turn starts from the same place", () => {
		const text = "i feel so lonely today";
		const mine = prepareTurn(withBond(), newSession(), text, ctx());
		const theirs = processTurn(withBond(), newSession(), text, ctx());
		expect(mine.state.activations).toEqual(theirs.state.activations);
		expect(mine.state.bond.messages).toBe(theirs.state.bond.messages);
		expect(mine.session.turns).toBe(theirs.session.turns);
		expect(mine.session.cause).toBe(theirs.session.cause);
	});

	it("says a milestone once: the next turn doesn't offer it again", () => {
		const first = prepareTurn(withBond(), newSession(), "the weather is fine", ctx());
		expect(first.facts.milestone).toBe("days7");
		const second = prepareTurn(first.state, first.session, "and the coffee is good", ctx());
		// The next due milestone may come up, but never the one already said.
		expect(second.facts.milestone).not.toBe("days7");
		expect(second.state.bond.toMention).not.toContain("days7");
	});

	it("holds a milestone back on a heavy turn", () => {
		const r = prepareTurn(withBond(), newSession(), "my mom died last week", ctx());
		expect(r.facts.milestone).toBeNull();
		expect(r.state.bond.toMention).toContain("days7");
	});

	it("keeps the cause current", () => {
		const lonely = prepareTurn(withBond(), newSession(), "i feel so lonely today", ctx());
		expect(lonely.facts.cause).toBe(processTurn(withBond(), newSession(), "i feel so lonely today", ctx()).session.cause);
		expect(lonely.facts.cause).not.toBe(newSession().cause);
	});
});

describe("prepareTurn: the facts a prompt may use", () => {
	const session: Session = { ...newSession(), cause: "of what you shared with me", turns: 3 };

	it("gives Gur's facts to Gur", () => {
		const c = ctx({ userName: "Gur", lastAt: 1_000_000 - 5_000 });
		const r = prepareTurn(withBond(), session, "the weather is fine", c);
		const baseline = CHARACTER.baseline;
		expect(r.facts).toEqual({
			feeling: moodLabel(r.state.activations, baseline),
			tone: moodTheme(r.state.activations, baseline).tone,
			cause: "of what you shared with me",
			stage: stageOf(r.state.bond),
			milestone: "days7",
			heavy: false,
			awayMs: 5_000,
			userName: "Gur",
			turn: 3,
			gur: null,
		});
	});

	it("gives a guest how he feels, and nothing of Gur's", () => {
		const c = ctx({ guest: true, userName: "Gur", lastAt: 1_000_000 - 5_000 });
		const r = prepareTurn(withBond(), session, "the weather is fine", c);
		expect(r.facts).toMatchObject({ cause: null, stage: "stranger", milestone: null, awayMs: 0, userName: null, turn: 0 });
		expect(typeof r.facts.feeling).toBe("string");
	});

	it("marks a heavy turn, so the model adds no extras", () => {
		expect(prepareTurn(withBond(), session, "my mom died last week", ctx()).facts.heavy).toBe(true);
		expect(prepareTurn(withBond(), session, "you are useless", ctx()).facts.heavy).toBe(true);
		expect(prepareTurn(withBond(), session, "the weather is fine", ctx()).facts.heavy).toBe(false);
	});

	it("never hands a crisis cause to the model, on that turn or the next", () => {
		const crisis = prepareTurn(withBond(), session, "i want to kill myself", ctx());
		expect(crisis.session.cause).toBe(CRISIS_CAUSE);
		expect(crisis.facts.cause).toBeNull();
		const next = prepareTurn(crisis.state, crisis.session, "the weather is fine", ctx());
		expect(next.facts.cause).toBeNull();
		const feeling = prepareTurn(crisis.state, crisis.session, "i feel so lonely today", ctx());
		expect(feeling.facts.cause).not.toBeNull();
	});

	it("gives a guest in crisis no reason either", () => {
		const r = prepareTurn(withBond(), session, "i want to kill myself", ctx({ guest: true }));
		expect(r.reply).toBe(CRISIS_REPLY);
		expect(r.facts.cause).toBeNull();
	});
});

// The room calls prepareTurn once and shows `processed` when no model answers, so it has to be processTurn's result.
describe("prepareTurn: processed", () => {
	const same = (state: AgentState, session: Session, text: string, c: ReturnType<typeof ctx>) => {
		const r = prepareTurn(state, session, text, c);
		expect(r.processed).toEqual(processTurn(state, session, text, c));
		return r;
	};

	it("is processTurn's result when code decides the turn", () => {
		const crisis = same(withBond(), newSession(), "i want to kill myself", ctx());
		expect(crisis.processed.reply).toBe(CRISIS_REPLY);
		const roll = same(withBond(), newSession(), "roll a new osmo", ctx());
		expect(roll.processed.reply).toBe(NEW_OSMO_REPLY);
		const { state, session } = afterDilemma();
		expect(same(state, session, "yes", ctx()).processed.effects.map((e) => e.type)).toEqual(["verdict"]);
	});

	it("is processTurn's result on an open everyday turn, with its own effects", () => {
		for (const text of ["the weather is fine", "hello", "i feel so lonely today", "im good and i made you"]) {
			const r = same(withBond(), newSession(), text, ctx({ userName: "Gur", lastAt: 1_000_000 - 5_000 }));
			// processed is the rule-based answer; the prepared reply is left for the model.
			expect(r.reply).toBeNull();
			expect(r.effects).not.toBe(r.processed.effects);
		}
	});

	it("is processTurn's result for a guest, who leaves no trace", () => {
		const guest = ctx({ guest: true, userName: "Gur" });
		for (const text of ["hello", "how close are we", "roll a new osmo", "my mom died last week", "i want to kill myself"]) {
			const r = same(withBond(), newSession(), text, guest);
			expect(r.processed.effects).toEqual([]);
			expect(r.effects).toEqual([]);
		}
	});
});

// One parse, with the spell context (the words said lately), so a typo read as a feeling counts for the bond too. Before,
// the bond read the message without that context and could call it plain talk while the answer took it for a feeling.
describe("a typo'd feeling counts for the bond", () => {
	it("moves the message and feeling counters like \"im so grumpy today\" does", () => {
		const recent = ctx({ recent: ["grumpy"] });
		const clean = prepareTurn(withBond(), newSession(), "im so grumpy today", recent);
		const typo = prepareTurn(withBond(), newSession(), "im so gumpy today", recent);
		expect(clean.state.bond.messages).toBe(knownBond.messages + 1);
		expect(clean.state.bond.shared).toBe(knownBond.shared + 1);
		expect(typo.state.bond.messages).toBe(clean.state.bond.messages);
		expect(typo.state.bond.shared).toBe(clean.state.bond.shared);
		expect(typo.processed.state.bond.shared).toBe(clean.processed.state.bond.shared);
		expect(typo.processed).toEqual(processTurn(withBond(), newSession(), "im so gumpy today", recent));
	});
});

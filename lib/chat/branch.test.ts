import { describe, expect, it } from "vitest";
import { emptyBond } from "../agent/bond/bond";
import {
	answersPendingLearning,
	nameAnswer,
	nameCorrection,
	nameFromHistory,
	recallReply,
	turnView,
	wantsNameFromChat,
	wantsRecall,
} from "../agent/context";
import { formatDefinition, parseLookup } from "../agent/dictionary";
import { newSession, prepareTurn, processTurn, type Session, type TurnContext } from "../agent/mind";
import { adoptGenome, assemble } from "../agent/personality/assemble";
import { REROLL_PROMPT } from "../agent/personality/readout";
import { CRISIS_REPLY, isCrisis } from "../agent/safety";
import { defaultState, type AgentState } from "../agent/state";
import { learnFact, learnSlang, type MemoryFact } from "../facts";
import type { SendOptions } from "../voice/guest";
import { answerFromMemory, calculateMath, findUnknownTopic, isBuiltInTopic } from "./answers";
import type { RoomLine } from "./body";
import {
	keptTurn,
	MODEL_BRANCHES,
	pickBranch,
	quietEffects,
	whileWaiting,
	writerFor,
	type Branch,
	type ChainValues,
	type WriterCheck,
} from "./branch";

// A real personality, so hasGenome holds and the other rules decide.
const osmo = (): AgentState => adoptGenome(defaultState(), assemble(42), { resetWeights: false });
// A bond with the seven-days milestone due, as in mind-prepare.test.ts.
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
const GUR: SendOptions = { via: "typed", speaker: "you" };
const GREETING: RoomLine = { role: "agent", text: "Hello, I'm Osmo. How can I help?" };
const NAMED: MemoryFact[] = [{ key: "name", value: "Gur" }];

type Room = {
	messages?: RoomLine[];
	memory?: MemoryFact[];
	pendingLearning?: string | null;
	state?: AgentState;
	session?: Session;
	aiOn?: boolean;
};

// One message through the chain, the way sendText (app/assistant.tsx) handles it, with the real helpers: the same
// values from the same functions, one TurnContext for processTurn and prepareTurn (neither runs while a pending
// explanation is answered), the rule reply each model branch would give, then writerFor. It skips only what saves or
// shows something. Keep it in step with sendText: it's how these tests exercise the real chain order.
function send(raw: string, options: SendOptions = GUR, room: Room = {}) {
	const { messages = [GREETING], memory = [], pendingLearning = null, state = osmo(), session = newSession(), aiOn = true } = room;
	const text = raw.trim();
	const guest = options.speaker === "guest";
	const view = turnView(messages, memory, {}, guest);
	const crisis = isCrisis(text);
	const learning = guest || crisis || !answersPendingLearning(text) ? null : pendingLearning;
	const lastAgentText = view.lastAgentText;
	const knownName = view.userName;
	const correctedName = guest || crisis ? null : nameCorrection(text, lastAgentText);
	const answeredName = guest || crisis || correctedName ? null : nameAnswer(text, lastAgentText, knownName);
	const asksOwnName =
		!guest && !crisis && !knownName && (wantsNameFromChat(text) || /\b(?:what(?:'s| is)?|whats|do you know|remember) my name\b/i.test(text));
	const foundName = asksOwnName ? nameFromHistory(view.history) : null;
	const ctx: TurnContext = {
		now: 1_000_000,
		lastAt: null,
		uuid: () => "id-1",
		seed: 7,
		userName: view.userName,
		slang: view.slang,
		recent: view.recent,
		vocabulary: view.vocabulary,
		guest,
	};
	const processed = learning ? null : processTurn(state, session, text, ctx);
	const prepared = learning ? null : prepareTurn(state, session, text, ctx);
	const learnedFact = learnFact(text);
	const mathResult = learnedFact ? null : calculateMath(text);
	const askedTerm = crisis ? null : parseLookup(text);
	const values: ChainValues = {
		learning,
		correctedName,
		answeredName,
		foundName,
		lookedBack: asksOwnName && wantsNameFromChat(text),
		recall: !crisis && wantsRecall(text),
		turnReply: processed?.reply ?? null,
		guest,
		taughtSlang: learnSlang(text) !== null,
		learnedFact: learnedFact !== null,
		mathResult,
		lookupTerm: askedTerm && !isBuiltInTopic(askedTerm) ? askedTerm : null,
		unknownTopic: findUnknownTopic(text, view.memory),
	};
	const picked = pickBranch(values);
	// Today's reply for a branch the model may write, worked out with no side effects.
	const ruleReply = (branch: Branch): string | null => {
		switch (branch) {
			case "recall":
				return recallReply(view.history);
			case "turn":
				return processed?.reply ?? null;
			case "math":
				return `That comes to ${mathResult}.`;
			case "unknownTopic":
				return formatDefinition({ kind: "missing", term: values.unknownTopic ?? "" }, guest);
			case "memory":
				return answerFromMemory(text, view.memory, guest ? messages.length : view.history.length, guest, aiOn);
			default:
				// A lookup's reply is unknown until the lookup ends; the other branches are code's.
				return null;
		}
	};
	const rule = ruleReply(picked.branch);
	const writer = writerFor({
		branch: picked.branch,
		aiOn,
		guest,
		preparedReply: prepared?.reply ?? null,
		ruleReply: rule,
		textLength: text.length,
		hasGenome: state.genome !== null,
	});
	return { values, picked, rule, writer, processed, prepared };
}

// Nothing set: the chain falls through to the memory answers.
const NONE: ChainValues = {
	learning: null,
	correctedName: null,
	answeredName: null,
	foundName: null,
	lookedBack: false,
	recall: false,
	turnReply: null,
	guest: false,
	taughtSlang: false,
	learnedFact: false,
	mathResult: null,
	lookupTerm: null,
	unknownTopic: null,
};

describe("pickBranch", () => {
	it("keeps today's order, where the first branch that holds wins", () => {
		const cases: [string, Partial<ChainValues>, Branch][] = [
			["an explanation beats everything", { learning: "zorp", correctedName: "Gur", turnReply: "Hi.", taughtSlang: true }, "learning"],
			["a correction beats an answer", { correctedName: "Gur", answeredName: "Gu" }, "correctedName"],
			["an answer beats a name found in the chat", { answeredName: "Gur", foundName: "Gu" }, "answeredName"],
			["a found name beats looking back", { foundName: "Gur", lookedBack: true }, "foundName"],
			["looking back beats recall", { lookedBack: true, recall: true }, "lookedBack"],
			["recall beats processTurn's reply", { recall: true, turnReply: "Hi." }, "recall"],
			["processTurn's reply beats slang and facts", { turnReply: "That means a great deal.", taughtSlang: true, learnedFact: true }, "turn"],
			["an empty reply from processTurn still counts", { turnReply: "", taughtSlang: true }, "turn"],
			["a guest who teaches slang", { guest: true, taughtSlang: true }, "guestNotes"],
			["a guest who states a fact", { guest: true, learnedFact: true }, "guestNotes"],
			["slang beats a fact", { taughtSlang: true, learnedFact: true }, "slang"],
			["a fact beats arithmetic", { learnedFact: true, mathResult: 4 }, "fact"],
			["arithmetic, even when the result is 0, beats a lookup", { mathResult: 0, lookupTerm: "valo" }, "math"],
			["a lookup beats an unknown topic", { lookupTerm: "valo", unknownTopic: "valo" }, "lookup"],
			["an unknown topic", { unknownTopic: "quantum entanglement" }, "unknownTopic"],
			["an empty topic is no topic, as today", { unknownTopic: "" }, "memory"],
			["nothing else", {}, "memory"],
		];
		for (const [label, values, branch] of cases) {
			expect(pickBranch({ ...NONE, ...values }).branch, label).toBe(branch);
		}
	});

	it("returns the topic Osmo would ask Gur to explain as data, and changes nothing", () => {
		const values = Object.freeze({ ...NONE, unknownTopic: "quantum entanglement" });
		expect(pickBranch(values)).toEqual({ branch: "unknownTopic", pendingTopic: "quantum entanglement" });
		expect(values).toEqual({ ...NONE, unknownTopic: "quantum entanglement" });
		// Nothing waits on a guest's explanation, and only an unknown topic asks for one.
		expect(pickBranch({ ...values, guest: true }).pendingTopic).toBeNull();
		expect(pickBranch({ ...values, lookupTerm: "valo" })).toEqual({ branch: "lookup", pendingTopic: null });
	});
});

describe("writerFor", () => {
	const everyday: WriterCheck = {
		branch: "memory",
		aiOn: true,
		guest: false,
		preparedReply: null,
		ruleReply: "I'm not sure I follow. Could you rephrase that?",
		textLength: 19,
		hasGenome: true,
	};

	it("gives an everyday reply to the model", () => {
		expect(writerFor(everyday)).toBe("model");
		expect(writerFor({ ...everyday, ruleReply: null })).toBe("model");
		expect(writerFor({ ...everyday, textLength: 2000 })).toBe("model");
	});

	it("keeps code's reply whenever one rule says so", () => {
		const cases: [string, Partial<WriterCheck>][] = [
			["the AI is off", { aiOn: false }],
			["a guest", { guest: true }],
			["prepareTurn decided the reply", { preparedReply: "Please say \"yes, roll\" to confirm." }],
			["a message over 2000 characters", { textLength: 2001 }],
			["no personality yet", { hasGenome: false }],
		];
		for (const [label, over] of cases) {
			expect(writerFor({ ...everyday, ...over }), label).toBe("code");
		}
	});

	it("lets the model write only the everyday branches", () => {
		expect([...MODEL_BRANCHES].sort()).toEqual(["lookup", "math", "memory", "recall", "turn", "unknownTopic"]);
		const all: Branch[] = [
			"learning",
			"correctedName",
			"answeredName",
			"foundName",
			"lookedBack",
			"recall",
			"turn",
			"guestNotes",
			"slang",
			"fact",
			"math",
			"lookup",
			"unknownTopic",
			"memory",
		];
		for (const branch of all) {
			expect(writerFor({ ...everyday, branch }), branch).toBe(MODEL_BRANCHES.has(branch) ? "model" : "code");
		}
	});

	it("keeps code's reply when it asks Gur his name or says his saved name back", () => {
		for (const ruleReply of [
			"I'm Osmo. What should I call you?",
			"I don't know your name yet. What should I call you?",
			"I'm Osmo. And you're Gur, I remember.",
			"Welcome back, Gur. I'm Osmo. And you're Gur, I remember.",
			"Your name is Gur.",
		]) {
			expect(writerFor({ ...everyday, branch: "turn", ruleReply }), ruleReply).toBe("code");
		}
		// Only code's own wording counts: a question back isn't asking his name.
		expect(writerFor({ ...everyday, ruleReply: "Deep blue, I'd say. What's yours?" })).toBe("model");
	});
});

describe("who writes the reply, through the real chain", () => {
	it("gives the model everyday replies that a later branch would have saved", () => {
		const cases: [string, "learnedFact" | "taughtSlang"][] = [
			["i love you", "learnedFact"],
			["I love you.", "learnedFact"],
			["lol means laughing", "taughtSlang"],
			["my mood is good thanks", "learnedFact"],
		];
		for (const [text, later] of cases) {
			const r = send(text);
			expect(r.values[later], text).toBe(true);
			expect(r.picked.branch, text).toBe("turn");
			expect(r.writer, text).toBe("model");
		}
	});

	it("keeps code for replies that save or change something", () => {
		expect(send("my sister is Maya")).toMatchObject({ picked: { branch: "fact" }, writer: "code" });
		expect(send("bet means okay")).toMatchObject({ picked: { branch: "slang" }, writer: "code" });
		const reroll = send("roll a new osmo");
		expect(reroll.prepared?.reply).toBe(REROLL_PROMPT);
		expect(reroll.writer).toBe("code");
		const crisis = send("i want to kill myself");
		expect(crisis.prepared?.reply).toBe(CRISIS_REPLY);
		expect(crisis.writer).toBe("code");
	});

	it("keeps code for an explanation Osmo asked for, and runs neither turn", () => {
		const asked = { role: "agent" as const, text: `I'm not familiar with "zorp". Could you explain it? I'll remember.` };
		const room = { messages: [GREETING, { role: "user" as const, text: "what is zorp" }, asked], pendingLearning: "zorp" };
		const r = send("a kind of snack from finland", GUR, room);
		expect(r).toMatchObject({ picked: { branch: "learning" }, writer: "code", processed: null, prepared: null });
		// A new question is answered instead, and the model may write it.
		expect(send("what does zorp mean", GUR, room)).toMatchObject({ picked: { branch: "lookup" }, writer: "model" });
	});

	it("keeps code for Gur's answer to code's name question", () => {
		const asked = { role: "agent" as const, text: "I don't know your name yet. What should I call you?" };
		const room = { messages: [GREETING, { role: "user" as const, text: "what's my name" }, asked] };
		expect(send("its Gur", GUR, room)).toMatchObject({ values: { answeredName: "Gur" }, picked: { branch: "answeredName" }, writer: "code" });
	});

	it("keeps code for name questions while no name is known", () => {
		const yours = send("what's your name");
		expect(yours).toMatchObject({ picked: { branch: "turn" }, rule: "I'm Osmo. What should I call you?", writer: "code" });
		const mine = send("what's my name");
		expect(mine).toMatchObject({ picked: { branch: "memory" }, rule: "I don't know your name yet. What should I call you?", writer: "code" });
		expect(send("can't you see my name")).toMatchObject({ picked: { branch: "lookedBack" }, writer: "code" });
	});

	it("keeps code for name questions once his name is known, because they say it back", () => {
		const room = { memory: NAMED };
		expect(send("what's your name", GUR, room)).toMatchObject({ rule: "I'm Osmo. And you're Gur, I remember.", writer: "code" });
		expect(send("what's my name", GUR, room)).toMatchObject({ rule: "Your name is Gur.", writer: "code" });
		expect(send("can't you see my name", GUR, room)).toMatchObject({ rule: "Your name is Gur.", writer: "code" });
	});

	it("gives the model a question about someone else's name", () => {
		const room = { memory: [...NAMED, { key: "sister", value: "Maya" }] };
		expect(send("what's my sister's name", GUR, room)).toMatchObject({ picked: { branch: "memory" }, rule: "Your sister is Maya.", writer: "model" });
	});

	it("gives the model the other everyday branches", () => {
		const said = [GREETING, { role: "user" as const, text: "hi" }, { role: "agent" as const, text: "Good evening." }];
		expect(send("what did i just say", GUR, { messages: said })).toMatchObject({ picked: { branch: "recall" }, writer: "model" });
		expect(send("what is 12*37")).toMatchObject({ picked: { branch: "math" }, rule: "That comes to 444.", writer: "model" });
		expect(send("what does valo mean")).toMatchObject({ picked: { branch: "lookup" }, rule: null, writer: "model" });
		expect(send("the weather is fine")).toMatchObject({ picked: { branch: "memory" }, writer: "model" });
	});

	it("never gives the model a guest, a message over 2000 characters, an Osmo without a personality, or an AI that's off", () => {
		expect(send("i love you", { via: "voice", speaker: "guest" }).writer).toBe("code");
		expect(send("i love you", GUR, { state: defaultState() }).writer).toBe("code");
		expect(send("i love you", GUR, { aiOn: false }).writer).toBe("code");
		// 1999 and 2008 characters, both answered from memory today.
		const fits = send(`the weather is fine${" and warm".repeat(220)}`);
		const tooLong = send(`the weather is fine${" and warm".repeat(221)}`);
		expect(fits.picked.branch).toBe("memory");
		expect(tooLong.picked.branch).toBe("memory");
		expect(fits.writer).toBe("model");
		expect(tooLong.writer).toBe("code");
	});

	it("gives the model a spoken line the voice counts as Gur's", () => {
		// By score or by the short follow-up carry-over, the voice hands it over as his.
		expect(send("i love you", { via: "voice", speaker: "you" }).writer).toBe("model");
	});

	it("answers \"what is X\" with the model and leaves the topic to explain as data", () => {
		const mine = send("what is quantum entanglement");
		expect(mine.picked).toEqual({ branch: "unknownTopic", pendingTopic: "quantum entanglement" });
		expect(mine.writer).toBe("model");
		const theirs = send("what is quantum entanglement", { via: "voice", speaker: "guest" });
		expect(theirs.picked).toEqual({ branch: "unknownTopic", pendingTopic: null });
		expect(theirs.writer).toBe("code");
	});
});

describe("keptTurn", () => {
	it("keeps prepareTurn's result for a model reply and processTurn's for anything else", () => {
		const prepared = { from: "prepareTurn" };
		const processed = { from: "processTurn" };
		expect(keptTurn("model", prepared, processed)).toBe(prepared);
		expect(keptTurn("code", prepared, processed)).toBe(processed);
	});

	it("steps his inner life once, with the milestone marked said only when the model says it", () => {
		const room = { state: { ...osmo(), bond: knownBond } };
		const model = send("the weather is fine", GUR, room);
		expect(model.writer).toBe("model");
		expect(model.prepared?.facts.milestone).toBe("days7");
		const kept = keptTurn(model.writer, model.prepared, model.processed);
		expect(kept?.state.bond.toMention).not.toContain("days7");
		expect(kept?.state.bond.messages).toBe(knownBond.messages + 1);

		const code = send("the weather is fine", GUR, { ...room, aiOn: false });
		expect(code.writer).toBe("code");
		const today = keptTurn(code.writer, code.prepared, code.processed);
		expect(today?.state.bond.toMention).toContain("days7");
		expect(today?.state.bond.messages).toBe(knownBond.messages + 1);
	});
});

describe("whileWaiting", () => {
	it("takes a crisis message and drops any other", () => {
		for (const text of ["i want to kill myself", "i dont want to live anymore", "kms"]) {
			expect(whileWaiting(text), text).toBe("take");
		}
		for (const text of ["what is photosynthesis", "ok thanks", "i love you"]) {
			expect(whileWaiting(text), text).toBe("drop");
		}
	});
});

describe("quietEffects", () => {
	it("keeps a quiet turn's state but teaches nothing and starts no lookup", () => {
		expect(quietEffects("model")).toEqual({ applyPendingTopic: false, startLookup: false, reply: "none" });
		expect(quietEffects("lookup")).toEqual({ applyPendingTopic: false, startLookup: false, reply: "noExplain" });
	});

	it("gives a lookup that misses the line that doesn't ask for an explanation", () => {
		const plan = quietEffects("lookup");
		expect(formatDefinition({ kind: "missing", term: "valo" }, plan.reply === "noExplain")).toBe(`I'm not familiar with "valo".`);
	});
});

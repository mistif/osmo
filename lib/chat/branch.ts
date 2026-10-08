// Who writes a reply: code or the model. sendText (app/assistant.tsx) keeps today's chain of branches in today's
// order; these pure functions pick the branch and its writer, so the choice is tested with the real helpers.

import { decisionOf } from "../actions/decision-words";
import { askedForName, justLearnedName } from "../agent/context";
import { isCrisis } from "../agent/safety";
import type { AskResult } from "./ask";
import type { DecisionAnswer } from "./decision";
import { LIMITS } from "./types";

export type Branch =
	| "learning"
	| "correctedName"
	| "answeredName"
	| "foundName"
	| "lookedBack"
	| "recall"
	| "turn"
	| "guestNotes"
	| "slang"
	| "fact"
	| "math"
	| "lookup"
	| "unknownTopic"
	| "memory";

// The values sendText computes before choosing a reply.
export type ChainValues = {
	learning: string | null;
	correctedName: string | null;
	answeredName: string | null;
	foundName: string | null;
	lookedBack: boolean;
	recall: boolean;
	turnReply: string | null;
	guest: boolean;
	taughtSlang: boolean;
	learnedFact: boolean;
	mathResult: number | null;
	lookupTerm: string | null;
	unknownTopic: string | null;
};

// The branch, and the topic today's reply would ask Gur to explain. It's data: sendText sets pendingLearning only when
// today's reply is the one delivered.
export type Picked = { branch: Branch; pendingTopic: string | null };

// Everyday branches, whose words the model may write. The rest save or change something, so code keeps them.
export const MODEL_BRANCHES: ReadonlySet<Branch> = new Set<Branch>(["recall", "turn", "math", "lookup", "unknownTopic", "memory"]);

export type WriterCheck = {
	branch: Branch;
	aiOn: boolean;
	guest: boolean;
	preparedReply: string | null;
	ruleReply: string | null;
	textLength: number;
};
export type Writer = "code" | "model";

// Today's else-if chain in sendText, in today's order and with its truthiness.
function branchOf(v: ChainValues): Branch {
	if (v.learning) return "learning";
	if (v.correctedName) return "correctedName";
	if (v.answeredName) return "answeredName";
	if (v.foundName) return "foundName";
	if (v.lookedBack) return "lookedBack";
	if (v.recall) return "recall";
	if (v.turnReply != null) return "turn";
	if (v.guest && (v.taughtSlang || v.learnedFact)) return "guestNotes";
	if (v.taughtSlang) return "slang";
	if (v.learnedFact) return "fact";
	if (v.mathResult !== null) return "math";
	if (v.lookupTerm) return "lookup";
	if (v.unknownTopic) return "unknownTopic";
	return "memory";
}

export function pickBranch(v: ChainValues): Picked {
	const branch = branchOf(v);
	// A guest can't teach Osmo anything, so nothing waits for their explanation.
	return { branch, pendingTopic: branch === "unknownTopic" && !v.guest ? v.unknownTopic : null };
}

// The model writes an everyday reply only for Gur, with the AI on, when code hasn't
// decided the turn, the message fits the route, and today's reply doesn't ask his name or say his saved name back:
// his answer is saved, and a misheard name corrected, only after code's own wording.
export function writerFor(c: WriterCheck): Writer {
	const aboutName = c.ruleReply !== null && (askedForName(c.ruleReply) || justLearnedName(c.ruleReply) !== null);
	const model =
		MODEL_BRANCHES.has(c.branch) &&
		c.aiOn &&
		!c.guest &&
		c.preparedReply === null &&
		c.textLength <= LIMITS.text &&
		!aboutName;
	return model ? "model" : "code";
}

// The detection a model answer carries, still to be validated by the room; null for any other answer.
export const detectionOf = (answer: AskResult | null): unknown => (answer?.kind === "model" ? answer.detection : null);

// His inner life steps once: prepareTurn's result goes with a model reply, processTurn's with anything else.
export function keptTurn<T>(writer: Writer, prepared: T, processed: T): T {
	return writer === "model" ? prepared : processed;
}

// While Osmo waits on a reply, only a crisis message is taken; any other is dropped, as today.
export function whileWaiting(text: string): "take" | "drop" {
	return isCrisis(text) ? "take" : "drop";
}

// What a waiting turn may still do once a crisis has made it quiet: keep its state step, but teach nothing and start no
// lookup. An aborted model turn says nothing; a lookup still answers, without asking Gur to explain the word.
export type QuietPlan = { applyPendingTopic: false; startLookup: false; reply: "none" | "noExplain" };
export function quietEffects(waitingOn: "model" | "lookup"): QuietPlan {
	return { applyPendingTopic: false, startLookup: false, reply: waitingOn === "model" ? "none" : "noExplain" };
}

// A bare yes or no answers the waiting confirmation (spec 4.3) only from Gur, never in a crisis, and only while one waits.
// A longer sentence with a yes in it is the conversation's.
export function decisionFor(c: { guest: boolean; crisis: boolean; waiting: boolean; text: string }): "yes" | "no" | null {
	return c.guest || c.crisis || !c.waiting ? null : decisionOf(c.text);
}

// Whether a bare yes or no still goes to /api/act after this step. A guest's turn leaves it as it was. Any other turn of
// Gur's moves past the question, code's turns included, so a yes to Osmo's own question ("Do you agree?") is never taken
// for one; then a model answer, or the decision's own answer, says whether one waits again. A decision that never reached
// the server leaves it as it was, so his yes said again still goes to /api/act.
export type WaitingStep = { on: "guest" } | { on: "turn" } | { on: "model"; answer: AskResult | null } | { on: "decision"; answer: DecisionAnswer };
export function waitingAfter(was: boolean, step: WaitingStep): boolean {
	if (step.on === "guest") return was;
	if (step.on === "model") return step.answer?.kind === "model" && step.answer.waiting;
	if (step.on === "decision") return step.answer.reached ? step.answer.waiting : was;
	return false;
}

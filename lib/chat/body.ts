// The body the room posts to /api/chat: Gur's recent conversation without crisis talk or guests, his memory and this
// turn's facts, all cut to the route's limits so an old long message or fact never gets the request refused.
// Pure, so it's tested; the room (app/assistant.tsx) builds every request with chatBody.

import type { TurnFacts } from "../agent/mind";
import type { AgentState } from "../agent/state";
import type { MemoryFact } from "../facts";
import type { ChatBody, HistoryLine } from "./types";
import { CRISIS_REPLY, isCrisis } from "../agent/safety";
import { ownerHistory } from "../voice/guest";
import { CRISIS_CAUSE } from "../agent/mind";
import { LIMITS } from "./types";

// A line of the room's conversation, as sendText sees it.
export type RoomLine = { role: "user" | "agent"; text: string; speaker?: "guest" };

// Text cut to at most `max` characters, never between the two halves of an emoji.
function clip(text: string, max: number): string {
	if (text.length <= max) return text;
	const end = /[\uD800-\uDBFF]/.test(text.charAt(max - 1)) ? max - 1 : max;
	return text.slice(0, end);
}

// Whether a line of Gur's stays out of the model's history. It depends only on the line and its two neighbours. Out
// go: his crisis line; a line the crisis reply answered (a crisis the model flagged); and a line with no reply of its
// own (a turn cut short by a crisis, which might be one the code missed).
function userLeftOut(lines: readonly RoomLine[], i: number): boolean {
	const next = lines[i + 1];
	return isCrisis(lines[i].text) || next?.role !== "agent" || next.text === CRISIS_REPLY;
}

// Whether a line of Gur's conversation stays out of the model's history. Out go his lines above, and of Osmo's: the
// crisis reply and his reply to a crisis line; any line that matches (a recall quoting a crisis message); a line that
// gives the crisis cause as his reason; and a recall that quotes, word for word, a line of Gur's that is left out, so
// a crisis only the model caught is never sent back through a recall.
function leftOut(lines: readonly RoomLine[], i: number): boolean {
	const line = lines[i];
	const before = lines[i - 1];
	if (line.role === "user") return userLeftOut(lines, i);
	if (line.text === CRISIS_REPLY || (before?.role === "user" && isCrisis(before.text)) || isCrisis(line.text)) return true;
	if (line.text.includes(CRISIS_CAUSE)) return true;
	for (let j = i - 1; j >= 0; j--) {
		if (lines[j].role === "user" && line.text.includes(`"${lines[j].text}"`) && userLeftOut(lines, j)) return true;
	}
	return false;
}

// The last 20 lines of Gur's conversation the model may see, oldest first, each cut to the route's limit. Read from
// the newest back, so a long chat costs little more than a short one: only a recall's quote check looks further back,
// and it compares strings, running the crisis check only on a line a reply quotes.
export function modelHistory(messages: readonly RoomLine[]): HistoryLine[] {
	const lines = ownerHistory([...messages]);
	const kept: RoomLine[] = [];
	for (let i = lines.length - 1; i >= 0 && kept.length < LIMITS.history; i--) {
		if (!leftOut(lines, i)) kept.unshift(lines[i]);
	}
	return kept.map(({ role, text }) => ({ role, text: clip(text, LIMITS.line) }));
}

// His memory, oldest to newest, cut to the route's limits: the newest facts, and always Gur's name.
export function fitMemory(memory: readonly MemoryFact[]): MemoryFact[] {
	const facts = memory.map(({ key, value }) => ({ key: clip(key, LIMITS.fact), value: clip(value, LIMITS.fact) }));
	if (facts.length <= LIMITS.facts) return facts;
	const newest = facts.slice(-LIMITS.facts);
	if (newest.some((fact) => fact.key === "name")) return newest;
	const name = facts.find((fact) => fact.key === "name");
	// The name would fall out: it stays, and the oldest other fact goes instead.
	return name ? [name, ...newest.slice(1)] : newest;
}

// The request for one everyday reply, or null when there's nothing the route would take (a message over the limit),
// so the room answers with code. Any state will do: Osmo's character is the route's own, not part of the body.
export function chatBody(input: {
	text: string;
	messages: readonly RoomLine[];
	memory: readonly MemoryFact[];
	facts: TurnFacts;
	state: AgentState;
	math: number | null;
}): ChatBody | null {
	const { facts, state } = input;
	const text = input.text.trim();
	if (text.length > LIMITS.text) return null;
	return {
		text,
		history: modelHistory(input.messages),
		memory: fitMemory(input.memory),
		facts: {
			feeling: clip(facts.feeling, LIMITS.factField),
			tone: facts.tone,
			// What a crisis left behind is never sent.
			cause: facts.cause === null || facts.cause === CRISIS_CAUSE ? null : clip(facts.cause, LIMITS.factField),
			stage: facts.stage,
			milestone: facts.milestone,
			heavy: facts.heavy,
			// The last save can come from another device whose clock runs ahead, which would make this negative.
			awayMs: Math.max(0, facts.awayMs),
			userName: facts.userName === null ? null : clip(facts.userName, LIMITS.factField),
			turn: facts.turn,
		},
		persona: { weights: state.weights, outlook: state.outlook },
		...(input.math !== null ? { hint: { math: input.math } } : {}),
	};
}

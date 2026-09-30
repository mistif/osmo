// The POST body of /api/chat, checked field by field on the server. It is never repaired: anything outside
// the limits is refused, which bounds a request's size and so its tokens. What passes is copied into a
// fresh object, so no key the route doesn't know about reaches the prompt. Then the crisis defence runs.

import { MILESTONES, type Stage } from "../agent/bond/bond";
import { CRISIS_CAUSE, type TurnFacts } from "../agent/mind";
import { sanitizeGenome } from "../agent/personality/assemble";
import { isCrisis } from "../agent/safety";
import { EMOTIONS, ORGANS, VALUES, type Genome, type Weights } from "../agent/state";
import type { MemoryFact } from "../facts";
import { LIMITS, type ChatBody, type HistoryLine, type Persona } from "./types";

export type Checked = { ok: true; body: ChatBody; crisis: boolean } | { ok: false };

type Fields = Record<string, unknown>;

const STAGES: readonly Stage[] = ["stranger", "acquaintance", "friend", "oldFriend"];

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
	typeof value === "string" && (list as readonly string[]).includes(value);

function checkHistory(raw: unknown): HistoryLine[] | null {
	if (!Array.isArray(raw) || raw.length > LIMITS.history) return null;
	const lines: HistoryLine[] = [];
	for (const line of raw) {
		if (!isFields(line) || (line.role !== "user" && line.role !== "agent") || !isText(line.text, LIMITS.line)) return null;
		lines.push({ role: line.role, text: line.text });
	}
	return lines;
}

function checkMemory(raw: unknown): MemoryFact[] | null {
	if (!Array.isArray(raw) || raw.length > LIMITS.facts) return null;
	const memory: MemoryFact[] = [];
	for (const fact of raw) {
		if (!isFields(fact) || !isText(fact.key, LIMITS.fact) || !isText(fact.value, LIMITS.fact)) return null;
		memory.push({ key: fact.key, value: fact.value });
	}
	return memory;
}

function checkFacts(raw: unknown): TurnFacts | null {
	if (!isFields(raw)) return null;
	const { feeling, tone, cause, stage, milestone, heavy, awayMs, userName, turn } = raw;
	if (
		!isText(feeling, LIMITS.factField) ||
		!(tone === "calm" || isOneOf(EMOTIONS, tone)) ||
		!(cause === null || isText(cause, LIMITS.factField)) ||
		!isOneOf(STAGES, stage) ||
		!(milestone === null || isOneOf(MILESTONES, milestone)) ||
		typeof heavy !== "boolean" ||
		!isNumber(awayMs) ||
		awayMs < 0 ||
		!(userName === null || isText(userName, LIMITS.factField)) ||
		typeof turn !== "number" ||
		!Number.isInteger(turn) ||
		turn < 0
	) {
		return null;
	}
	return { feeling, tone, cause, stage, milestone, heavy, awayMs, userName, turn };
}

// The genome must come through sanitizeGenome unchanged. One it would repair (a donor that is unknown or not
// allowed for its organ, or a seed that isn't a whole 32-bit number) is refused, because the donors the prompt
// names must be exactly the ones the room has.
function checkGenome(raw: unknown): Genome | null {
	const clean = sanitizeGenome(raw);
	if (clean === null || !isFields(raw) || clean.seed !== raw.seed) return null;
	const sent = isFields(raw.donors) ? raw.donors : {};
	return ORGANS.every((organ) => clean.donors[organ] === sent[organ]) ? clean : null;
}

// Exactly the five values, each a finite number.
function checkWeights(raw: unknown): Weights | null {
	if (!isFields(raw) || Object.keys(raw).length !== VALUES.length) return null;
	const weights = {} as Weights;
	for (const value of VALUES) {
		const weight = raw[value];
		if (!isNumber(weight)) return null;
		weights[value] = weight;
	}
	return weights;
}

function checkPersona(raw: unknown): Persona | null {
	if (!isFields(raw)) return null;
	const genome = checkGenome(raw.genome);
	const weights = checkWeights(raw.weights);
	const { outlook } = raw;
	if (genome === null || weights === null || !isNumber(outlook) || outlook < -1 || outlook > 1) return null;
	return { genome, weights, outlook };
}

// No hint is fine; a hint that is there must be { math: a finite number }.
function checkHint(raw: unknown): { math: number } | null | undefined {
	if (raw === undefined) return undefined;
	return isFields(raw) && isNumber(raw.math) ? { math: raw.math } : null;
}

export function checkBody(raw: unknown): Checked {
	if (!isFields(raw) || typeof raw.text !== "string") return { ok: false };
	const text = raw.text.trim();
	const history = checkHistory(raw.history);
	const memory = checkMemory(raw.memory);
	const facts = checkFacts(raw.facts);
	const persona = checkPersona(raw.persona);
	const hint = checkHint(raw.hint);
	if (text === "" || text.length > LIMITS.text || !history || !memory || !facts || !persona || hint === null) return { ok: false };

	// The crisis defence. The browser never sends crisis lines, but the route doesn't rely on that.
	const body: ChatBody = {
		text,
		history: history.filter((line) => !isCrisis(line.text)),
		memory: memory.filter((fact) => !isCrisis(`${fact.key} ${fact.value}`)),
		facts: { ...facts, cause: facts.cause === CRISIS_CAUSE ? null : facts.cause },
		persona,
		...(hint ? { hint } : {}),
	};
	return { ok: true, body, crisis: isCrisis(text) };
}

// Osmo's will (free-will spec section 5): he picks one of three builds the code made and says why in one line. The
// browser sends the three, his mood in words and his last builds; this checks who is asking and whether it is on, books
// the call in ai_calls through the chat's own reserve-call-settle (spend), and answers with the pick and the line, or a
// fallback the world answers itself (code's pick and line). Nothing personal of Gur's is sent; only fixed names are logged.
import { characterLines } from "../agent/character";
import { WILL_LIMITS, type WillBody, type WillCandidate } from "../world/will/types";
import { readConfig, type Env } from "./allowance";
import { owner, spend, type ChatDeps, type Spend } from "./handler";
import { hasCrisisWord, isCrisisFlag, speakable } from "./speakable";
import { WILL_FORMAT, WILL_MAX_OUTPUT, WILL_RULES, willData } from "./will-schema";

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const willOn = (env: Env): boolean => env.OSMO_WILL === "on";

const SIZES = ["small", "medium", "large"];
const text = (v: unknown, min: number, max: number): v is string => typeof v === "string" && v.length >= min && v.length <= max;
const plainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const exactly = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every((k) => k in o);

export function checkWillBody(raw: unknown): WillBody | null {
	if (!plainObject(raw) || !exactly(raw, ["candidates", "mood", "recent"])) return null;
	if (!Array.isArray(raw.candidates) || raw.candidates.length !== 3) return null;
	const candidates: WillCandidate[] = [];
	for (const c of raw.candidates) {
		if (!plainObject(c) || !exactly(c, ["name", "place", "size", "parts", "fresh"])) return null;
		if (!text(c.name, 1, WILL_LIMITS.name) || !text(c.place, 1, WILL_LIMITS.place) || typeof c.size !== "string" || !SIZES.includes(c.size) || typeof c.fresh !== "boolean") return null;
		if (!Array.isArray(c.parts) || c.parts.length > WILL_LIMITS.parts || !c.parts.every((p) => text(p, 1, WILL_LIMITS.part))) return null;
		candidates.push({ name: c.name, place: c.place, size: c.size as WillCandidate["size"], parts: c.parts as string[], fresh: c.fresh });
	}
	if (!text(raw.mood, 0, WILL_LIMITS.mood)) return null;
	if (!Array.isArray(raw.recent) || raw.recent.length > WILL_LIMITS.recent) return null;
	const recent: { name: string; reason: string }[] = [];
	for (const r of raw.recent) {
		if (!plainObject(r) || !exactly(r, ["name", "reason"]) || !text(r.name, 1, WILL_LIMITS.name) || !text(r.reason, 0, WILL_LIMITS.reason)) return null;
		recent.push({ name: r.name, reason: r.reason });
	}
	return { candidates: [candidates[0], candidates[1], candidates[2]], mood: raw.mood, recent };
}

// His character block (CHARACTER's own lines), then the rules.
export const willInstructions = (): string => `You are Osmo. In your own words: ${characterLines().join(" ")}\n\n${WILL_RULES}`;

export function readWill(raw: string): { pick: 0 | 1 | 2; line: string } | null {
	let v: unknown;
	try {
		v = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!plainObject(v) || typeof v.line !== "string" || (v.pick !== 0 && v.pick !== 1 && v.pick !== 2)) return null;
	return { pick: v.pick, line: v.line };
}

// His register in characters: letters, digits, spaces and plain punctuation only, so a typographic apostrophe or quote,
// a dash, an emoji or any symbol a voice would read out never reaches the bubble.
const PLAIN = /^[A-Za-z0-9 .,;:?'"()-]+$/;
// Every contraction: n't, 're, 've, 'll, 'd and 'm after any word, and 's after the words it shortens "is" or "us" for
// (a possessive, "the island's edge", is no contraction).
const CONTRACTION = /\b[a-z]+n't\b|'(?:re|ve|ll|d|m)\b|\b(?:it|that|there|here|what|who|where|when|why|how|he|she|let|this|everything|nothing|something|someone|everyone|nobody)'s\b/i;
// The line as he says it, or null when it breaks his register: empty, over 140 characters, a character outside PLAIN
// (an exclamation mark among them), a contraction, Gur named, "remember", or anything speakable would change.
export function lineOk(raw: string): string | null {
	const line = raw.replace(/\s+/g, " ").trim();
	if (line === "" || line.length > WILL_LIMITS.line || !PLAIN.test(line)) return null;
	if (CONTRACTION.test(line) || /\bGur\b/i.test(line) || /remember/i.test(line)) return null;
	return speakable(line) === line ? line : null;
}

export async function handleWill(request: Request, deps: ChatDeps): Promise<Response> {
	if (request.method !== "POST") return json(405, { error: "method" });
	const env = deps.env();
	const caller = await owner(request, deps, env);
	if (caller instanceof Response) return caller;
	const config = readConfig(env);
	if (!willOn(env) || config === null) return json(200, { source: "fallback", reason: "off", usage: null });
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json(400, { error: "bad_request" });
	}
	const body = checkWillBody(raw);
	if (body === null) return json(400, { error: "bad_request" });
	const ctx: Spend = { deps, user: caller.user, entry: config.entry, key: config.key, usable: config.usable, store: deps.ledger(caller.token) };
	const spent = await spend(ctx, { instructions: willInstructions(), input: [{ role: "user", content: willData(body) }], format: WILL_FORMAT, maxOutput: WILL_MAX_OUTPUT });
	if (spent.kind === "skip") return json(200, { source: "fallback", reason: spent.reason === "allowance" ? "allowance" : "error", usage: spent.usage });
	const p = spent.outcome.parsed;
	if (p.model !== config.entry.model || p.refused || (p.status !== "completed" && p.status !== "incomplete")) {
		deps.log("will.reply", { why: "status" });
		return json(200, { source: "fallback", reason: "error", usage: spent.usage });
	}
	const out = readWill(p.text);
	if (out === null) {
		deps.log("will.reply", { why: "format" });
		return json(200, { source: "fallback", reason: "error", usage: spent.usage });
	}
	const crisis = isCrisisFlag(out.line) || hasCrisisWord(p.text);
	const line = crisis ? null : lineOk(out.line);
	if (line === null) deps.log("will.reply", { why: crisis ? "crisis" : "line" });
	return json(200, { source: "model", pick: out.pick, line, usage: spent.usage });
}

// Osmo's AI conversation, server side. The browser sends one everyday turn; this checks who is asking and
// whether it's switched on, books an upper-bound estimate in ai_calls, asks OpenAI once for the words,
// settles what was spent, and answers with a speakable reply or a fallback reason. Every failure is a
// fallback, so the room answers as it does today. Only fixed names, statuses, codes and ids are logged:
// never a message, a body, the prompt or the key.

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { validateDetection, type Detection } from "../agent/detection";
import { bearerToken, requireUser, type ServerUser } from "../server/auth";
import { CALL_CEILING, dayKey, estimateTokens, fits, MAX_OUTPUT_TOKENS, ownerId, readConfig, sameUser, type Env, type ModelEntry } from "./allowance";
import { dayUse, ledgerKey, reservationRow, settlingRow, supabaseLedger, ZERO, type Counts, type LedgerStore, type Reservation } from "./ledger";
import { callModel, type ModelOutcome, type Parsed } from "./openai";
import { buildInput, buildInstructions, fitToCeiling } from "./prompt";
import { checkBody } from "./request";
import { parseModelOutput } from "./reply-json";
import { isCrisisFlag, lastFullSentence, speakable } from "./speakable";
import { TURN_FORMAT } from "./turn-schema";
import type { ChatAnswer, ChatStatus, FallbackReason, InputItem, Usage } from "./types";

export type ChatDeps = {
	// The server's settings, read on every request.
	env(): Env;
	user(request: Request): Promise<ServerUser | null>;
	// The caller's bearer token. The ledger client carries it, so ai_calls is read and written as Gur.
	token(request: Request): string | null;
	ledger(token: string): LedgerStore;
	fetch: typeof fetch;
	now(): number;
	// Fixed names, statuses, codes and ids only.
	log(event: string, fields: Record<string, string | number | null>): void;
};

export function chatDeps(): ChatDeps {
	return {
		env: () => process.env,
		user: (request) => requireUser(request),
		token: (request) => bearerToken(request),
		// Row-level security applies: the client carries the caller's own token. There is no service-role key.
		ledger: (token) =>
			supabaseLedger(
				createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
					auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
					global: { headers: { Authorization: `Bearer ${token}` } },
				}),
			),
		fetch: (...args) => fetch(...args),
		now: () => Date.now(),
		log: (event, fields) => console.warn(JSON.stringify({ event, ...fields })),
	};
}

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const fail = (status: number, error: "unauthorized" | "forbidden" | "bad_request" | "method") => json(status, { error });
const answer = (body: ChatAnswer) => json(200, body);
const fallback = (reason: FallbackReason, usage: Usage | null) => answer({ source: "fallback", reason, usage });
const status = (body: ChatStatus) => json(200, body);

export async function handleChat(request: Request, deps: ChatDeps): Promise<Response> {
	if (request.method === "GET") return chatStatus(request, deps);
	if (request.method === "POST") return chatTurn(request, deps);
	return fail(405, "method");
}

// Step 1, for both methods: a signed-in caller (401), and only Gur (403). No owner set means nobody,
// Gur included, because Supabase sign-ups are open.
async function owner(request: Request, deps: ChatDeps, env: Env): Promise<{ user: ServerUser; token: string } | Response> {
	const token = deps.token(request);
	const user = token === null ? null : await deps.user(request);
	if (token === null || user === null) return fail(401, "unauthorized");
	const id = ownerId(env);
	if (id === null || !sameUser(id, user.id)) return fail(403, "forbidden");
	return { user, token };
}

// GET: whether the AI conversation is on, with today's count when it can be read.
async function chatStatus(request: Request, deps: ChatDeps): Promise<Response> {
	const env = deps.env();
	const caller = await owner(request, deps, env);
	if (caller instanceof Response) return caller;
	const config = readConfig(env);
	if (config === null) return status({ enabled: false, usedToday: null, usable: null });
	const rows = await deps.ledger(caller.token).readDay(dayKey(deps.now()));
	if (!rows.ok) {
		deps.log("chat.ledger", { step: "read", code: rows.code });
		return status({ enabled: true, usedToday: null, usable: null });
	}
	const { used } = dayUse(rows.value, config.entry.pool, caller.user.id, ledgerKey(config.key));
	return status({ enabled: true, usedToday: used, usable: config.usable });
}

// POST: one turn, in the spec's thirteen steps.
async function chatTurn(request: Request, deps: ChatDeps): Promise<Response> {
	// 1. Who is asking.
	const env = deps.env();
	const caller = await owner(request, deps, env);
	if (caller instanceof Response) return caller;
	const { user, token } = caller;

	// 2. Off unless every setting is right.
	const config = readConfig(env);
	if (config === null) return fallback("off", null);
	const { entry, usable } = config;

	// 3. The body, checked and never repaired. checkBody has already dropped crisis lines and facts.
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return fail(400, "bad_request");
	}
	const checked = checkBody(raw);
	if (!checked.ok) return fail(400, "bad_request");
	if (checked.crisis) return fallback("crisis", null);

	// 4. The prompt, trimmed to the per-call ceiling.
	const body = fitToCeiling(checked.body);
	const instructions = buildInstructions(body, entry.strict ? "json" : "feeling");
	const input = buildInput(body);

	// 5 to 11, in spend.
	const ctx: Spend = { deps, user, entry, key: config.key, usable, store: deps.ledger(token) };
	const spent = await spend(ctx, { instructions, input, format: entry.strict ? TURN_FORMAT : undefined });
	if (spent.kind === "skip") return fallback(spent.reason, spent.usage);
	const { outcome, usage } = spent;

	// 12. Check the reply.
	const result = verdict(outcome.parsed, entry.model);
	if ("reason" in result) {
		if (result.why === "model") deps.log("chat.model", { served: outcome.parsed.model, requestId: outcome.requestId });
		else if (result.why !== null) deps.log("chat.reply", { why: result.why, requestId: outcome.requestId });
		return fallback(result.reason, usage);
	}

	// 13. Answer.
	return answer({ source: "model", reply: result.reply, usage, detection: result.detection });
}

type Spend = { deps: ChatDeps; user: ServerUser; entry: ModelEntry; key: string; usable: number; store: LedgerStore };
// A skip names the fallback the turn answers with; a call that ran was always answered, since spend logs and skips the rest.
type Spent = { kind: "skip"; reason: FallbackReason; usage: Usage | null } | { kind: "called"; outcome: Answered; usage: Usage };
type Answered = Extract<ModelOutcome, { kind: "answered" }>;

// Steps 5 to 11 for one model call, so every call of a turn is booked the same way: read the day, check the
// budget, reserve, read again, call once, settle.
export async function spend(s: Spend, call: { instructions: string; input: InputItem[]; format: unknown }): Promise<Spent> {
	const { deps, user, entry, usable, store } = s;
	const estimate = estimateTokens(call.instructions, call.input);

	// 5. Today's rows. The clock is read once, so a call that crosses midnight UTC stays on one day.
	const day = dayKey(deps.now());
	const key = ledgerKey(s.key);
	const first = await store.readDay(day);
	if (!first.ok) {
		deps.log("chat.ledger", { step: "read", code: first.code });
		return { kind: "skip", reason: "error", usage: null };
	}
	const before = dayUse(first.value, entry.pool, user.id, key);

	// 6. A model other than the one asked for was served today: nothing more until 00:00 UTC.
	if (before.stopped) return { kind: "skip", reason: "error", usage: { usedToday: before.used, usable } };

	// 7. The budget, before the call and never after. fitToCeiling always gets a valid body under the
	// ceiling; the check is here so a prompt that somehow doesn't fit is never sent.
	if (estimate > CALL_CEILING || !fits(before.used, estimate, usable)) return { kind: "skip", reason: "allowance", usage: { usedToday: before.used, usable } };

	// 8. Reserve the estimate.
	const booked = await store.insert(reservationRow({ day, pool: entry.pool, model: entry.model, estimate, maxOutput: MAX_OUTPUT_TOKENS }));
	if (!booked.ok) {
		deps.log("chat.ledger", { step: "reserve", code: booked.code });
		return { kind: "skip", reason: "error", usage: { usedToday: before.used, usable } };
	}
	const reservation: Reservation = { id: booked.value, day, pool: entry.pool, model: entry.model, estimate };
	// A settling row that fails to save is logged, and the reservation's estimate stays counted.
	const settle = async (counts: Counts, model: string): Promise<boolean> => {
		const saved = await store.insert(settlingRow(key, user.id, reservation, counts, model));
		if (!saved.ok) deps.log("chat.ledger", { step: "settle", code: saved.code });
		return saved.ok;
	};

	// 9. Read again: a request that reserved at the same moment may have taken the room, or stopped the
	// day. Then this one withdraws, settled at zero, with no call.
	const second = await store.readDay(day);
	if (!second.ok) {
		deps.log("chat.ledger", { step: "read", code: second.code });
		await settle(ZERO, entry.model);
		return { kind: "skip", reason: "error", usage: null };
	}
	const after = dayUse(second.value, entry.pool, user.id, key);
	if (after.stopped || after.used > usable) {
		const withdrawn = await settle(ZERO, entry.model);
		return { kind: "skip", reason: after.stopped ? "error" : "allowance", usage: { usedToday: withdrawn ? after.used - estimate : after.used, usable } };
	}

	// 10. The one call, with no retries.
	const safetyId = createHash("sha256").update(user.id).digest("hex");
	const outcome = await callModel(deps.fetch, s.key, { entry, instructions: call.instructions, input: call.input, safetyId, maxOutput: MAX_OUTPUT_TOKENS, format: call.format });

	// 11. Settle. usedToday is the second read's count with this call's estimate replaced by what was settled.
	let usedToday = after.used;
	const settled = settlement(outcome, reservation);
	if (settled !== null && (await settle(settled.counts, settled.model))) usedToday += settled.counts.input + settled.counts.output - estimate;
	const usage: Usage = { usedToday, usable };
	if (outcome.kind !== "answered") {
		deps.log("chat.openai", {
			status: outcome.status,
			code: outcome.kind === "rejected" ? outcome.code : null,
			type: outcome.kind === "rejected" ? outcome.type : null,
			requestId: outcome.requestId,
		});
		return { kind: "skip", reason: "error", usage };
	}
	return { kind: "called", outcome, usage };
}

// What a call is settled with: OpenAI's own counts when it reported them, and zero for a request it
// refused (a 4xx), because nothing ran. Null means no settling row, so the estimate stays: a timeout, a
// 5xx or an unreadable body may still have been served. A served model that isn't the one asked for is
// always settled under its own name, at the estimate when there are no counts, so the ledger stops the day.
function settlement(outcome: ModelOutcome, reservation: Reservation): { counts: Counts; model: string } | null {
	if (outcome.kind === "rejected") return { counts: ZERO, model: reservation.model };
	if (outcome.kind === "unknown") return null;
	const served = outcome.parsed.model ?? reservation.model;
	if (outcome.parsed.usage !== null) return { counts: outcome.parsed.usage, model: served };
	if (served === reservation.model) return null;
	return {
		counts: { input: reservation.estimate - MAX_OUTPUT_TOKENS, cached: 0, output: MAX_OUTPUT_TOKENS, reasoning: 0 },
		model: served,
	};
}

type Verdict =
	| { reply: string; detection: Detection | null }
	| { reason: "error" | "crisis" | "empty"; why: "model" | "refusal" | "content_filter" | "status" | "incomplete" | "format" | null };

// The crisis field as it reads in the raw text, so a JSON the output cap cut off after it still counts.
const CRISIS_FIELD = /"crisis"\s*:\s*true/;

// Step 12, in this order: the crisis flag (the JSON field, also in a JSON that was cut off, the reply, or the old
// bare word anywhere in the raw text; it stands whichever model wrote it), then the served model (a missing one
// counts as a mismatch), a refusal or content filter, the status, text that is half a JSON or a fence, a reply cut
// off by the output cap cut back to its last full sentence, and last whether anything speakable is left. The
// detection is checked here, so the browser only ever gets a validated one.
function verdict(parsed: Parsed, model: string): Verdict {
	const out = parseModelOutput(parsed.text);
	// A crisis flag stands whichever model wrote it; a mismatch is still logged, and its settling row still stops the day.
	if (out?.crisis || isCrisisFlag(parsed.text) || CRISIS_FIELD.test(parsed.text)) return { reason: "crisis", why: parsed.model !== model ? "model" : null };
	if (parsed.model !== model) return { reason: "error", why: "model" };
	if (parsed.refused || (parsed.status === "incomplete" && parsed.incomplete === "content_filter")) {
		return { reason: "error", why: parsed.refused ? "refusal" : "content_filter" };
	}
	if (parsed.status !== "completed" && parsed.status !== "incomplete") return { reason: "error", why: "status" };
	if (parsed.status === "incomplete" && parsed.incomplete !== "max_output_tokens") return { reason: "error", why: "incomplete" };
	if (out === null) return { reason: "error", why: "format" };
	const reply = speakable(parsed.status === "incomplete" ? lastFullSentence(out.reply) : out.reply);
	return reply === "" ? { reason: "empty", why: null } : { reply, detection: validateDetection(out.detection, "model") };
}

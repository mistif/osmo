// POST /api/build (artifacts spec 3.3, 9, 10): the model call that writes one small React component, streamed to the
// room as lines of JSON (lib/artifacts/protocol.ts) and booked through the same token ledger as chat. The route checks
// who asks, the switches, the level and the daily cap itself, reserves an upper bound, streams, and settles with what
// the model really used. A client that leaves aborts the call; the tokens stay booked and nothing is kept. Only fixed
// names, statuses, codes and ids are logged: never the brief, the source, the prompt or the key.

import { createHash } from "node:crypto";
import { after } from "next/server";
import { buildGate } from "../actions";
import { LIMITS } from "../artifacts/compile";
import { encodeLine, type BuildError, type BuildLine } from "../artifacts/protocol";
import { requireUser } from "../server/auth";
import { estimateTokens, ownerId, readConfig, sameUser, utf8Bytes } from "./allowance";
import { buildPrompt, repairPrompt } from "./build-prompt";
import { chatDeps, owner, reserveCall, type ChatDeps, type Spend } from "./handler";
import { ZERO, type Counts, type Reservation } from "./ledger";
import { streamModel, type StreamOutcome } from "./openai-stream";
import type { InputItem } from "./types";

export type BuildDeps = ChatDeps & {
	// The route's own re-check of the switch, the owner, the level and the daily cap (lib/actions buildGate).
	gate(userId: string, now: number): Promise<"ok" | "off" | "cap">;
	// Keeps the function alive until the promise settles (the ledger write after the browser has gone). Never throws.
	defer(p: Promise<unknown>): void;
	stream: typeof streamModel;
};

export function buildDeps(): BuildDeps {
	return {
		...chatDeps(),
		user: (request) => requireUser(request),
		gate: (userId, now) => buildGate(userId, now),
		// after() throws outside a request; the promise runs on its own either way, so there is nothing more to do then.
		defer: (p) => {
			try {
				after(() => p);
			} catch {
				// Not inside a request.
			}
		},
		stream: streamModel,
	};
}

const MAX_BODY = 20_000;
const HEADERS = { "content-type": "application/x-ndjson", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" };
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const encoder = new TextEncoder();
// One error line and nothing else, for a build that never started.
const refused = (code: BuildError) => new Response(encodeLine({ t: "error", code }), { status: 200, headers: HEADERS });

type Ask = { instructions: string; input: InputItem[] };

// {brief} or {repair: {source, error}}, and a speaker that is not a guest. Anything else is refused outright.
function readAsk(text: string): Ask | null {
	if (utf8Bytes(text) > MAX_BODY) return null;
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
	const o = raw as Record<string, unknown>;
	if (o.speaker !== undefined && (typeof o.speaker !== "string" || o.speaker.trim().toLowerCase() === "guest")) return null;
	const keys = Object.keys(o).filter((k) => k !== "speaker");
	if (keys.length !== 1) return null;
	if (keys[0] === "brief") {
		const brief = typeof o.brief === "string" ? o.brief.trim() : "";
		return brief.length >= 1 && brief.length <= LIMITS.briefChars ? buildPrompt(brief) : null;
	}
	if (keys[0] !== "repair" || o.repair === null || typeof o.repair !== "object" || Array.isArray(o.repair)) return null;
	const r = o.repair as Record<string, unknown>;
	if (Object.keys(r).some((k) => k !== "source" && k !== "error")) return null;
	if (typeof r.source !== "string" || typeof r.error !== "string") return null;
	if (r.source === "" || utf8Bytes(r.source) > LIMITS.sourceBytes) return null;
	if (r.error === "" || r.error.length > LIMITS.repairErrorChars) return null;
	return repairPrompt(r.error, r.source);
}

// What a streamed call is settled with: OpenAI's own counts when it reported them, zero for a request it refused (a 4xx),
// nothing for a call that may still have been served (the estimate stays booked), and, for a served model other than the
// one asked for, the estimate under its own name, so the ledger stops the day.
function settlement(outcome: StreamOutcome, reservation: Reservation, maxOutput: number): { counts: Counts; model: string } | null {
	if (outcome.kind === "rejected") return { counts: ZERO, model: reservation.model };
	if (outcome.kind === "unknown") return null;
	const served = outcome.model ?? reservation.model;
	if (outcome.usage !== null) return { counts: outcome.usage, model: served };
	if (served === reservation.model) return null;
	return { counts: { input: reservation.estimate - maxOutput, cached: 0, output: maxOutput, reasoning: 0 }, model: served };
}

export async function handleBuild(request: Request, deps: BuildDeps): Promise<Response> {
	if (request.method !== "POST") return json(405, { error: "method" });
	const env = deps.env();
	const caller = await owner(request, deps, env);
	if (caller instanceof Response) return caller;
	const { user, token } = caller;
	// owner() has answered 401 and 403 already. A build spends tokens, so the id is held against the owner once more here.
	const gur = ownerId(env);
	if (gur === null || !sameUser(gur, user.id)) return json(403, { error: "forbidden" });
	if (env.OSMO_BUILD !== "on") return json(404, { error: "off" });

	let text: string;
	try {
		const declared = Number(request.headers.get("content-length"));
		if (Number.isFinite(declared) && declared > MAX_BODY) return json(400, { error: "bad_request" });
		text = await request.text();
	} catch {
		return json(400, { error: "bad_request" });
	}
	const ask = readAsk(text);
	if (ask === null) return json(400, { error: "bad_request" });

	const config = readConfig(env);
	if (config === null) return refused("off");
	const gate = await deps.gate(user.id, deps.now()).catch((): "off" => "off");
	if (gate !== "ok") return refused(gate);

	const maxOutput = LIMITS.outputTokens;
	const ctx: Spend = { deps, user, entry: config.entry, key: config.key, usable: config.usable, store: deps.ledger(token) };
	const booked = await reserveCall(ctx, { estimate: estimateTokens(ask.instructions, ask.input, maxOutput), maxOutput });
	if (booked.kind === "skip") return refused(booked.reason === "allowance" ? "allowance" : "failed");
	const { reservation, settle } = booked;

	// The upstream call stops when the room cancels the response or the request is aborted (a tab closed, a crisis typed).
	const upstream = new AbortController();
	if (request.signal.aborted) upstream.abort();
	else request.signal.addEventListener("abort", () => upstream.abort(), { once: true });
	const gone = () => upstream.signal.aborted;

	let finish = () => {};
	deps.defer(new Promise<void>((resolve) => (finish = resolve)));

	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			let open = true;
			const write = (line: BuildLine) => {
				if (!open || gone()) return;
				try {
					controller.enqueue(encoder.encode(encodeLine(line)));
				} catch {
					open = false;
				}
			};
			const close = () => {
				if (!open) return;
				open = false;
				try {
					controller.close();
				} catch {
					// Already closed by the room.
				}
			};
			void (async () => {
				let bytes = 0,
					tooBig = false;
				try {
					const safetyId = createHash("sha256").update(user.id).digest("hex");
					const req = { entry: config.entry, instructions: ask.instructions, input: ask.input, safetyId, maxOutput };
					const outcome = await deps.stream(
						deps.fetch,
						config.key,
						req,
						(piece) => {
							if (bytes + utf8Bytes(piece) > LIMITS.sourceBytes) {
								tooBig = true;
								return false;
							}
							bytes += utf8Bytes(piece);
							write({ t: "delta", s: piece });
							return true;
						},
						upstream.signal,
					);
					const settled = settlement(outcome, reservation, maxOutput);
					if (settled !== null) await settle(settled.counts, settled.model);
					if (outcome.kind !== "streamed") {
						deps.log("build.openai", {
							status: outcome.status,
							code: outcome.kind === "rejected" ? outcome.code : null,
							type: outcome.kind === "rejected" ? outcome.type : null,
							requestId: outcome.requestId,
						});
						return void write({ t: "error", code: "failed" });
					}
					if (tooBig) return void write({ t: "error", code: "too_big" });
					// A model other than the one asked for, or none named, is a failure; its settling row above stops the day.
					if (outcome.model !== config.entry.model) {
						deps.log("build.model", { served: outcome.model, requestId: outcome.requestId });
						return void write({ t: "error", code: "failed" });
					}
					if (outcome.status === "incomplete") return void write({ t: "error", code: outcome.incomplete === "max_output_tokens" ? "too_big" : "failed" });
					// A stream that only refuses reads as streamed with no text.
					if (outcome.status !== "completed" || outcome.text.trim() === "") return void write({ t: "error", code: "failed" });
					// Text the stream did not deliver as deltas (a terminal response that carried it whole) goes out as one.
					if (bytes === 0) {
						if (utf8Bytes(outcome.text) > LIMITS.sourceBytes) return void write({ t: "error", code: "too_big" });
						write({ t: "delta", s: outcome.text });
					}
					write({ t: "done", tokens: outcome.usage === null ? reservation.estimate : outcome.usage.input + outcome.usage.output });
				} catch {
					deps.log("build.run", { step: "stream" });
					write({ t: "error", code: "failed" });
				} finally {
					close();
					finish();
				}
			})();
		},
		cancel() {
			upstream.abort();
		},
	});
	return new Response(body, { status: 200, headers: HEADERS });
}

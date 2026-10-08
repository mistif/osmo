// The room's side of /api/chat: whether the AI conversation is on, and asking for a reply the model
// wrote. fetch and Gur's access token are passed in, so this file imports nothing at run time and can
// be tested with a fake fetch. Nothing here throws: every failure is an answer the room falls back from.

import type { ChatBody, ChatStatus, FallbackReason, Usage } from "./types";

// The browser's limit. A turn with a result makes two model calls of up to 10 seconds each, so the route
// can take about 20 seconds and normally answers well before this.
export const ASK_TIMEOUT_MS = 25_000;

const CHAT_URL = "/api/chat";

export type AskResult =
	| { kind: "model"; reply: string; usage: Usage; detection: unknown; waiting: boolean; pendingId: string | null }
	| { kind: "crisis"; usage: Usage | null }
	| { kind: "fallback"; why: FallbackReason | "http" | "network" | "timeout" | "aborted" | "bad_answer"; usage: Usage | null; stop: boolean };

type Why = Extract<AskResult, { kind: "fallback" }>["why"];
type Halt = "timeout" | "aborted";

const REASONS: readonly FallbackReason[] = ["off", "allowance", "error", "empty", "crisis"];
// The longest row id /api/act takes back (a uuid is 36).
const MAX_PENDING_ID = 100;

const failed = (why: Why, stop = false): AskResult => ({ kind: "fallback", why, usage: null, stop });

// Settles when the time runs out or the caller aborts, whichever comes first, and aborts the request
// either way. A fetch that ignores its signal still can't hold the room past the limit.
function deadline(timeoutMs: number, signal?: AbortSignal) {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onAbort = () => {};
	const halt = new Promise<{ halted: Halt }>((resolve) => {
		const stop = (halted: Halt) => {
			resolve({ halted });
			controller.abort();
		};
		timer = setTimeout(() => stop("timeout"), timeoutMs);
		onAbort = () => stop("aborted");
		signal?.addEventListener("abort", onAbort, { once: true });
	});
	const release = () => {
		clearTimeout(timer);
		signal?.removeEventListener("abort", onAbort);
	};
	return { signal: controller.signal, halt, release };
}

// The body as JSON. A body that isn't JSON (or isn't there) reads as undefined, which no shape accepts.
const bodyOf = (response: Response) =>
	response.json().then(
		(json: unknown) => ({ json }),
		() => ({ json: undefined }),
	);

// A token count as the route sends it: a whole number, never negative.
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

// The answer's usage: null when the route sent null, undefined when it isn't a usage at all.
function usageOf(value: unknown): Usage | null | undefined {
	if (value === null) return null;
	if (typeof value !== "object") return undefined;
	const { usedToday, usable } = value as Record<string, unknown>;
	return isCount(usedToday) && isCount(usable) ? { usedToday, usable } : undefined;
}

// The route's answer, read strictly: anything unexpected is a bad answer, never a guess.
function answerOf(json: unknown): AskResult {
	if (typeof json !== "object" || json === null) return failed("bad_answer");
	const answer = json as Record<string, unknown>;
	const usage = usageOf(answer.usage);
	if (usage === undefined) return failed("bad_answer");
	if (answer.source === "model") {
		const reply = answer.reply;
		if (typeof reply !== "string" || reply.trim() === "" || usage === null) return failed("bad_answer");
		// Passed on unchecked (this file imports nothing); the room validates it. A missing one is null, never a bad answer: an older server still works.
		// waiting: only a true counts, so an older server that sends none reads as not waiting. pendingId: the waiting row's
		// id, kept only with a true waiting and only as /api/act would take it back; anything else is none, never a bad answer.
		const waiting = answer.waiting === true;
		const id = answer.pendingId;
		return {
			kind: "model",
			reply,
			usage,
			detection: typeof answer.detection === "object" && answer.detection !== null ? answer.detection : null,
			waiting,
			pendingId: waiting && typeof id === "string" && id.length > 0 && id.length <= MAX_PENDING_ID ? id : null,
		};
	}
	const reason = answer.source === "fallback" ? REASONS.find((known) => known === answer.reason) : undefined;
	if (reason === undefined) return failed("bad_answer");
	if (reason === "crisis") return { kind: "crisis", usage };
	// "off" means the route is switched off, so the room asks nothing more this visit.
	return { kind: "fallback", why: reason, usage, stop: reason === "off" };
}

// Asks the route to write this turn's reply. A 401 is only this reply falling back: it can come from
// a passing Supabase hiccup, and a real sign-out reaches the room through its own listener.
export async function askForReply(
	fetchFn: typeof fetch,
	token: string,
	body: ChatBody,
	signal?: AbortSignal,
	timeoutMs = ASK_TIMEOUT_MS,
): Promise<AskResult> {
	if (signal?.aborted) return failed("aborted");
	const wait = deadline(timeoutMs, signal);
	try {
		const sent = await Promise.race([
			fetchFn(CHAT_URL, {
				method: "POST",
				signal: wait.signal,
				headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
				body: JSON.stringify(body),
			}).then((response) => ({ response })),
			wait.halt,
		]);
		if ("halted" in sent) return failed(sent.halted);
		// A 403 means this account may not use the model at all, so the room stops asking.
		if (!sent.response.ok) return failed("http", sent.response.status === 403);
		const read = await Promise.race([bodyOf(sent.response), wait.halt]);
		return "halted" in read ? failed(read.halted) : answerOf(read.json);
	} catch {
		return failed("network");
	} finally {
		wait.release();
	}
}

// Both counts or neither: the route sends nulls when it's off or today's count can't be read.
function statusOf(json: unknown): ChatStatus | null {
	if (typeof json !== "object" || json === null) return null;
	const { enabled, usedToday, usable } = json as Record<string, unknown>;
	if (typeof enabled !== "boolean") return null;
	if (usedToday === null && usable === null) return { enabled, usedToday: null, usable: null };
	return isCount(usedToday) && isCount(usable) ? { enabled, usedToday, usable } : null;
}

// Whether the AI conversation is on for this account, and today's use. Null means off for this
// visit: any failure, a 401, a 403 or an answer of the wrong shape.
export async function askStatus(fetchFn: typeof fetch, token: string, timeoutMs = ASK_TIMEOUT_MS): Promise<ChatStatus | null> {
	const wait = deadline(timeoutMs);
	try {
		const sent = await Promise.race([
			fetchFn(CHAT_URL, {
				method: "GET",
				cache: "no-store",
				signal: wait.signal,
				headers: { authorization: `Bearer ${token}` },
			}).then((response) => ({ response })),
			wait.halt,
		]);
		if ("halted" in sent || !sent.response.ok) return null;
		const read = await Promise.race([bodyOf(sent.response), wait.halt]);
		return "halted" in read ? null : statusOf(read.json);
	} catch {
		return null;
	} finally {
		wait.release();
	}
}

// The Settings line after a reply: off once the room stops asking, today's numbers when the answer
// carried them, and otherwise what it showed before.
export function nextUsage(current: ChatStatus | null, result: AskResult): ChatStatus | null {
	if (result.kind === "fallback" && result.stop) return { enabled: false, usedToday: null, usable: null };
	return result.usage ? { enabled: true, ...result.usage } : current;
}

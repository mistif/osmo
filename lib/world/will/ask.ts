// The world's side of /api/will (spec section 5): asks the model to pick one of three and say why. fetch and Gur's
// access token are passed in; nothing here throws: every failure is a fallback answer.
import type { Usage } from "../../chat/types";
import { WILL_LIMITS, type WillAnswer, type WillBody, type WillFallback } from "./types";

export const WILL_URL = "/api/will";
export const WILL_TIMEOUT_MS = 15_000;

const fail = (reason: WillFallback): WillAnswer => ({ source: "fallback", reason, usage: null });
const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
function usageOf(v: unknown): Usage | null | undefined {
	if (v === null) return null;
	if (typeof v !== "object") return undefined;
	const { usedToday, usable } = v as Record<string, unknown>;
	return count(usedToday) && count(usable) ? { usedToday, usable } : undefined;
}
function answerOf(json: unknown): WillAnswer {
	if (typeof json !== "object" || json === null) return fail("bad_answer");
	const a = json as Record<string, unknown>;
	const usage = usageOf(a.usage);
	if (usage === undefined) return fail("bad_answer");
	if (a.source === "model") {
		const lineOk = a.line === null || (typeof a.line === "string" && a.line.length >= 1 && a.line.length <= WILL_LIMITS.line);
		if ((a.pick !== 0 && a.pick !== 1 && a.pick !== 2) || !lineOk || usage === null) return fail("bad_answer");
		return { source: "model", pick: a.pick, line: a.line as string | null, usage };
	}
	if (a.source === "fallback" && (a.reason === "off" || a.reason === "allowance" || a.reason === "error")) return { source: "fallback", reason: a.reason, usage };
	return fail("bad_answer");
}

export async function askWill(fetchFn: typeof fetch, token: string, body: WillBody, timeoutMs: number = WILL_TIMEOUT_MS): Promise<WillAnswer> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchFn(WILL_URL, {
			method: "POST",
			signal: controller.signal,
			headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
			body: JSON.stringify(body),
		});
		if (!response.ok) return fail("http");
		let json: unknown;
		try {
			json = await response.json();
		} catch {
			return fail(controller.signal.aborted ? "timeout" : "bad_answer");
		}
		return answerOf(json);
	} catch {
		return fail(controller.signal.aborted ? "timeout" : "network");
	} finally {
		clearTimeout(timer);
	}
}

// The room's side of /api/act (spec 4.3): a bare yes or no answers the waiting confirmation, and a crisis
// cancels it. fetch and Gur's access token are passed in, so this file imports nothing and can be tested
// with a fake fetch. Nothing here throws: every failure reads as not handled.

// waiting: the row still waits for an answer after this one, as when a spoken yes must be typed. Only a true
// from the server counts, so an older /api/act reads as nothing waiting.
// reached: the server answered. A network error, a timeout, an error status or a body that is not JSON never reached
// it, or its answer never came back, so it says nothing about the row: it may still wait, or /api/act may have run it.
export type DecisionAnswer = { handled: boolean; reply: string | null; waiting: boolean; reached: boolean };

const NONE: DecisionAnswer = { handled: false, reply: null, waiting: false, reached: true };
export const UNREACHED: DecisionAnswer = { handled: false, reply: null, waiting: false, reached: false };

// What Osmo says when the server answered that nothing waits.
export const NOTHING_WAITING_LINE = "Nothing is waiting for your yes.";
// What Osmo says when no answer came back: neither that nothing waits nor that his answer did not get through, since a
// timeout or a lost answer can follow an action /api/act already ran. Said again, it finds the row if it still waits.
export const UNREACHED_LINE = "I did not hear back about your answer just now. If it is still waiting, say it again in a moment.";

// pendingId: the row his yes or no is for (the one the model answer named), sent only when it is a string, so /api/act
// answers that row and no other. Without one (an older server named none) it answers whichever row waits. A crisis is
// sent without one: it cancels every row.
export async function sendDecision(
	fetchFn: typeof fetch,
	token: string,
	decision: "yes" | "no" | "crisis",
	via: "typed" | "voice",
	timeoutMs = 10_000,
	pendingId?: string | null,
): Promise<DecisionAnswer> {
	try {
		const r = await fetchFn("/api/act", {
			method: "POST",
			signal: AbortSignal.timeout(timeoutMs),
			headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
			body: JSON.stringify({ decision, via, ...(typeof pendingId === "string" ? { pendingId } : {}) }),
		});
		if (!r.ok) return UNREACHED;
		const j: unknown = await r.json();
		const o = typeof j === "object" && j !== null ? (j as Record<string, unknown>) : {};
		// Only a true counts, and the reply line is code's, passed on as sent.
		return o.handled === true ? { handled: true, reply: typeof o.reply === "string" ? o.reply : null, waiting: o.waiting === true, reached: true } : NONE;
	} catch {
		return UNREACHED;
	}
}

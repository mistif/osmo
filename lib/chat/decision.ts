// The room's side of /api/act (spec 4.3): a bare yes or no answers the waiting confirmation, and a crisis
// cancels it. fetch and Gur's access token are passed in, so this file imports nothing and can be tested
// with a fake fetch. Nothing here throws: every failure reads as not handled.

// waiting: the row still waits for an answer after this one, as when a spoken yes must be typed. Only a true
// from the server counts, so an older /api/act reads as nothing waiting.
// reached: the server answered. A network error, a timeout, an error status or a body that is not JSON never reached
// it (or never came back), so it says nothing about the row, which may still wait.
export type DecisionAnswer = { handled: boolean; reply: string | null; waiting: boolean; reached: boolean };

const NONE: DecisionAnswer = { handled: false, reply: null, waiting: false, reached: true };
export const UNREACHED: DecisionAnswer = { handled: false, reply: null, waiting: false, reached: false };

// What Osmo says when his answer never reached the server: never that nothing waits, since it may.
export const UNREACHED_LINE = "I could not get your answer through just now. Say it again in a moment.";

export async function sendDecision(
	fetchFn: typeof fetch,
	token: string,
	decision: "yes" | "no" | "crisis",
	via: "typed" | "voice",
	timeoutMs = 10_000,
): Promise<DecisionAnswer> {
	try {
		const r = await fetchFn("/api/act", {
			method: "POST",
			signal: AbortSignal.timeout(timeoutMs),
			headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
			body: JSON.stringify({ decision, via }),
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

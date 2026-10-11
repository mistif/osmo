// The world's side of /api/will (spec section 5): asks the model to pick one of three and say why. fetch and Gur's
// access token are passed in; nothing here throws: every failure is a fallback answer. Task 0 stub; T9 builds it.
import type { WillAnswer, WillBody } from "./types";

export const WILL_URL = "/api/will";
export const WILL_TIMEOUT_MS = 15_000;
export async function askWill(fetchFn: typeof fetch, token: string, body: WillBody, timeoutMs: number = WILL_TIMEOUT_MS): Promise<WillAnswer> {
	void [fetchFn, token, body, timeoutMs];
	throw new Error("not built: askWill");
}

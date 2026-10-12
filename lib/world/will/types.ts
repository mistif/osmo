// The will's wire types (spec section 5.1), shared by the planner (T8, which builds the body), the browser's client
// (T9, ask.ts) and the route (T9, lib/chat/will.ts). Types and limits only (Task 0, complete).
import type { Usage } from "../../chat/types";

export const WILL_LIMITS = { name: 60, place: 80, part: 30, parts: 5, mood: 200, reason: 140, recent: 3, line: 140 } as const;
export type WillCandidate = { name: string; place: string; size: "small" | "medium" | "large"; parts: string[]; fresh: boolean };
export type WillBody = { candidates: [WillCandidate, WillCandidate, WillCandidate]; mood: string; recent: { name: string; reason: string }[] };
// Why code picks instead: the route's own reasons, and the client's when the call itself failed.
export type WillFallback = "off" | "allowance" | "error" | "http" | "network" | "timeout" | "bad_answer";
// line: null when the model's line failed the checks (or flagged a crisis): the world then says code's line, and the
// model's pick stands.
export type WillAnswer =
	| { source: "model"; pick: 0 | 1 | 2; line: string | null; usage: Usage }
	| { source: "fallback"; reason: WillFallback; usage: Usage | null };

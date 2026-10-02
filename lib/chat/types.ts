// The AI conversation's wire types, shared by the room (which asks) and the route (which answers).
// Types only, apart from the body's limits, so the browser can import this without pulling in the
// server's code.

import type { TurnFacts } from "../agent/mind";
import type { Weights } from "../agent/state";
import type { MemoryFact } from "../facts";

// One line of the recent conversation, as sent to the route.
export type HistoryLine = { role: "user" | "agent"; text: string };
// One item of the model's input.
export type InputItem = { role: "user" | "assistant"; content: string };
export type Persona = { weights: Weights; outlook: number };
export type ChatBody = {
	text: string;
	history: HistoryLine[];
	memory: MemoryFact[];
	facts: TurnFacts;
	persona: Persona;
	hint?: { math: number };
};
export type Usage = { usedToday: number; usable: number };
export type FallbackReason = "off" | "allowance" | "error" | "empty" | "crisis";
export type ChatAnswer =
	| { source: "model"; reply: string; usage: Usage }
	| { source: "fallback"; reason: FallbackReason; usage: Usage | null };
// GET /api/chat, and the room's aiUsage.
export type ChatStatus = { enabled: boolean; usedToday: number | null; usable: number | null };
// The body's limits, shared by the browser (which trims) and the route (which refuses).
export const LIMITS = { text: 2000, history: 20, line: 2000, facts: 200, fact: 300, factField: 200 } as const;

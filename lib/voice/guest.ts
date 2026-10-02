// How Osmo treats a voice that isn't Gur's: polite, private, and learning nothing from it.
// Pure, so the room (app/assistant.tsx) and the brain (lib/agent/mind.ts) share one set of rules.

import type { MemoryFact } from "../facts";

// Who said a message: Gur ("you") or anyone else ("guest"). Typed messages are always Gur's.
export type Speaker = "you" | "guest";
// How a message arrived.
export type Via = "typed" | "voice";
// What the voice passes to the room's sendText. `greet` is true on a guest's first line in a conversation.
export type SendOptions = { via: Via; speaker: Speaker; greet?: boolean };

// A guest's turn sees no memory. Never mutated.
export const GUEST_MEMORY: MemoryFact[] = [];

export const GUEST_GREETING = "Hello. I don't believe we've met.";
export const GUEST_PRIVATE = "That's between me and the person I belong to.";
export const GUEST_DILEMMA = "I keep my dilemmas for the person I belong to.";

// Gur's own conversation: everything except guests' lines and Osmo's replies to them.
export function ownerHistory<T extends { speaker?: "guest" }>(messages: T[]): T[] {
	return messages.filter((message) => message.speaker !== "guest");
}

// The greeting opens a guest's first reply in a conversation, but never a crisis reply.
export function greetGuest(reply: string, greet: boolean, crisis: boolean): string {
	return greet && !crisis ? `${GUEST_GREETING} ${reply}` : reply;
}

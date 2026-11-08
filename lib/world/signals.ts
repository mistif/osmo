// What changed in the room since the last render, as events for him (spec 3, "Events in"). The room passes its
// line count, whether the voice is in a conversation (awake, thinking, speaking or follow-up), whether he is
// speaking (a reply being typed out) and whether he is thinking. Typing and composer focus reach him directly
// through the world's control (attend), not through here.
import type { ActorEvent } from "./actor";

export type RoomSignals = { lines: number; inTalk: boolean; speaking: boolean; thinking: boolean };

export function roomEvents(prev: RoomSignals | null, next: RoomSignals, now: number): ActorEvent[] {
	if (!prev) return [];
	const out: ActorEvent[] = [];
	if (next.lines > prev.lines || (next.inTalk && !prev.inTalk)) out.push({ type: "message", now });
	if (next.speaking && !prev.speaking) out.push({ type: "reply", now });
	if (!next.speaking && prev.speaking) out.push({ type: "replyDone", now });
	if (prev.inTalk && !next.inTalk && !next.speaking) out.push({ type: "rest", now });
	return out;
}

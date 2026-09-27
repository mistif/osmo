// Osmo's side of a spoken conversation, as a pure state machine. The engine (./engine.ts) feeds it events
// and opens or closes the microphone, detector and recognizer to match the mode.

import type { Speaker, Via } from "./guest";
import { WAKE } from "./wake";

export type Mode = "off" | "paused" | "sleeping" | "awake" | "thinking" | "speaking" | "followup";

export type VoiceState = {
	mode: Mode;
	// "Listen for 'Osmo'" is on.
	listening: boolean;
	// When the current mode began (ms).
	since: number;
	// Speech has started since he began listening.
	heard: boolean;
	// This conversation has recognized Gur.
	owner: boolean;
	// A guest has been greeted in this conversation.
	greeted: boolean;
	// The reply being spoken belongs to a spoken conversation, so a follow-up window comes after it.
	conversation: boolean;
};

export type VoiceEvent =
	| { type: "listen"; on: boolean; now: number }
	| { type: "wake"; now: number }
	| { type: "mic"; now: number }
	| { type: "speech"; now: number }
	| { type: "judged"; speaker: Speaker }
	| { type: "greeted" }
	| { type: "sent"; now: number }
	| { type: "dropped"; now: number }
	| { type: "reply"; via: Via; spoken: boolean; now: number }
	| { type: "spoken"; now: number }
	| { type: "stop"; now: number }
	| { type: "hidden"; now: number }
	| { type: "visible"; now: number }
	| { type: "tick"; now: number };

// After he finishes a spoken reply, he listens this long for a follow-up without the wake word.
export const FOLLOW_UP_MS = 6000;

export function initialVoice(now = 0): VoiceState {
	return { mode: "off", listening: false, since: now, heard: false, owner: false, greeted: false, conversation: false };
}

// Back to waiting: asleep if listening is on, otherwise off. The conversation is over.
function rest(s: VoiceState, now: number): VoiceState {
	return { ...s, mode: s.listening ? "sleeping" : "off", since: now, heard: false, owner: false, greeted: false, conversation: false };
}

// A conversation runs from waking (or the mic button) until he rests again.
const inConversation = (s: VoiceState) =>
	s.mode === "awake" || s.mode === "thinking" || s.mode === "speaking" || s.mode === "followup";

export const detectorOn = (s: VoiceState) => s.mode === "sleeping";
export const recognizerOn = (s: VoiceState) => s.mode === "awake" || s.mode === "followup";
// The microphone, and the listening line under the text box, are on exactly when one of them runs.
export const micOpen = (s: VoiceState) => detectorOn(s) || recognizerOn(s);

export function step(s: VoiceState, e: VoiceEvent): VoiceState {
	switch (e.type) {
		case "listen": {
			if (!e.on) return s.mode === "off" && !s.listening ? s : rest({ ...s, listening: false }, e.now);
			if (s.listening) return s;
			return s.mode === "off" ? { ...s, listening: true, mode: "sleeping", since: e.now } : { ...s, listening: true };
		}
		case "wake":
			return s.mode === "sleeping" ? { ...s, mode: "awake", since: e.now, heard: false } : s;
		case "mic":
			return s.mode === "off" || s.mode === "sleeping" || s.mode === "followup" ? { ...s, mode: "awake", since: e.now, heard: false } : s;
		case "speech":
			if (s.mode === "awake") return s.heard ? s : { ...s, heard: true };
			if (s.mode === "followup") return { ...s, mode: "awake", since: e.now, heard: true };
			return s;
		case "judged":
			return inConversation(s) && e.speaker === "you" && !s.owner ? { ...s, owner: true } : s;
		case "greeted":
			return inConversation(s) && !s.greeted ? { ...s, greeted: true } : s;
		case "sent":
			return s.mode === "awake" ? { ...s, mode: "thinking", since: e.now } : s;
		case "dropped":
			return s.mode === "awake" || s.mode === "thinking" || s.mode === "followup" ? rest(s, e.now) : s;
		case "reply":
			if (s.mode === "thinking") {
				return e.spoken
					? { ...s, mode: "speaking", since: e.now, conversation: true }
					: { ...s, mode: "followup", since: e.now, heard: false };
			}
			if (e.spoken && e.via === "typed" && (s.mode === "off" || s.mode === "sleeping")) {
				return { ...s, mode: "speaking", since: e.now, conversation: false };
			}
			return s;
		case "spoken":
			if (s.mode !== "speaking") return s;
			return s.conversation ? { ...s, mode: "followup", since: e.now, heard: false } : rest(s, e.now);
		case "stop":
			return s.mode === "speaking" ? rest(s, e.now) : s;
		case "hidden": {
			if (s.mode === "off" || s.mode === "paused") return s;
			const rested = rest(s, e.now);
			return rested.mode === "sleeping" ? { ...rested, mode: "paused" } : rested;
		}
		case "visible":
			return s.mode === "paused" ? { ...s, mode: "sleeping", since: e.now } : s;
		case "tick":
			if (s.mode === "awake" && !s.heard && e.now - s.since >= WAKE.noSpeechMs) return rest(s, e.now);
			if (s.mode === "followup" && e.now - s.since >= FOLLOW_UP_MS) return rest(s, e.now);
			return s;
	}
}

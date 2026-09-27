import { describe, expect, it } from "vitest";
import { detectorOn, FOLLOW_UP_MS, initialVoice, micOpen, recognizerOn, step, type VoiceEvent, type VoiceState } from "./machine";
import { WAKE } from "./wake";

const run = (events: VoiceEvent[], start: VoiceState = initialVoice(0)) => events.reduce(step, start);
const listening = () => run([{ type: "listen", on: true, now: 0 }]);
const inConversation = () =>
	run(
		[
			{ type: "wake", now: 10 },
			{ type: "speech", now: 20 },
			{ type: "judged", speaker: "you" },
			{ type: "sent", now: 30 },
		],
		listening(),
	);

describe("step", () => {
	it("starts off, and sleeps once listening is on", () => {
		expect(initialVoice().mode).toBe("off");
		expect(listening().mode).toBe("sleeping");
	});

	it("wakes from sleep, and ignores a wake while awake, thinking or speaking", () => {
		const awake = step(listening(), { type: "wake", now: 1 });
		expect(awake.mode).toBe("awake");
		expect(step(awake, { type: "wake", now: 2 })).toBe(awake);
		const thinking = inConversation();
		expect(step(thinking, { type: "wake", now: 40 })).toBe(thinking);
		const speaking = step(thinking, { type: "reply", via: "voice", spoken: true, now: 50 });
		expect(step(speaking, { type: "wake", now: 60 })).toBe(speaking);
		expect(step(initialVoice(), { type: "wake", now: 1 }).mode).toBe("off");
	});

	it("goes back to sleep silently when nothing is said after waking", () => {
		const awake = step(listening(), { type: "wake", now: 1000 });
		expect(step(awake, { type: "tick", now: 1000 + WAKE.noSpeechMs - 1 }).mode).toBe("awake");
		expect(step(awake, { type: "tick", now: 1000 + WAKE.noSpeechMs }).mode).toBe("sleeping");
	});

	it("keeps listening while Gur is still talking", () => {
		const talking = run([{ type: "wake", now: 0 }, { type: "speech", now: 100 }], listening());
		expect(step(talking, { type: "tick", now: 60_000 }).mode).toBe("awake");
	});

	it("thinks, speaks, then listens for a follow-up that ends after six seconds", () => {
		const thinking = inConversation();
		expect(thinking.mode).toBe("thinking");
		const speaking = step(thinking, { type: "reply", via: "voice", spoken: true, now: 40 });
		expect(speaking.mode).toBe("speaking");
		const followup = step(speaking, { type: "spoken", now: 100 });
		expect(followup.mode).toBe("followup");
		expect(step(followup, { type: "tick", now: 100 + FOLLOW_UP_MS - 1 }).mode).toBe("followup");
		const rested = step(followup, { type: "tick", now: 100 + FOLLOW_UP_MS });
		expect(rested.mode).toBe("sleeping");
		expect(rested.owner).toBe(false);
	});

	it("keeps Gur recognized through a follow-up", () => {
		const followup = run(
			[
				{ type: "reply", via: "voice", spoken: true, now: 40 },
				{ type: "spoken", now: 50 },
				{ type: "speech", now: 60 },
			],
			inConversation(),
		);
		expect(followup.mode).toBe("awake");
		expect(followup.owner).toBe(true);
	});

	it("goes straight to the follow-up when the device can't speak", () => {
		expect(step(inConversation(), { type: "reply", via: "voice", spoken: false, now: 40 }).mode).toBe("followup");
	});

	it("rests when a message is dropped, awake, thinking or in a follow-up", () => {
		expect(step(step(listening(), { type: "wake", now: 1 }), { type: "dropped", now: 2 }).mode).toBe("sleeping");
		expect(step(inConversation(), { type: "dropped", now: 40 }).mode).toBe("sleeping");
		const followup = run([{ type: "reply", via: "voice", spoken: false, now: 40 }], inConversation());
		expect(step(followup, { type: "dropped", now: 50 }).mode).toBe("sleeping");
	});

	it("remembers a guest was greeted, until the conversation ends", () => {
		const greeted = step(step(listening(), { type: "wake", now: 1 }), { type: "greeted" });
		expect(greeted.greeted).toBe(true);
		expect(step(greeted, { type: "dropped", now: 2 }).greeted).toBe(false);
	});

	it("speaks a typed reply from sleep, then sleeps again without a follow-up", () => {
		const speaking = step(listening(), { type: "reply", via: "typed", spoken: true, now: 5 });
		expect(speaking.mode).toBe("speaking");
		expect(step(speaking, { type: "spoken", now: 9 }).mode).toBe("sleeping");
		const awake = step(listening(), { type: "wake", now: 1 });
		expect(step(awake, { type: "reply", via: "typed", spoken: true, now: 2 })).toBe(awake);
	});

	it("stops speaking when asked", () => {
		const speaking = step(listening(), { type: "reply", via: "typed", spoken: true, now: 5 });
		expect(step(speaking, { type: "stop", now: 6 }).mode).toBe("sleeping");
	});

	it("starts a conversation from the mic button even when not listening, and ends back off", () => {
		const awake = step(initialVoice(), { type: "mic", now: 0 });
		expect(awake.mode).toBe("awake");
		expect(step(awake, { type: "tick", now: WAKE.noSpeechMs }).mode).toBe("off");
	});

	it("pauses while the page is hidden, and resumes listening when it comes back", () => {
		const paused = step(listening(), { type: "hidden", now: 1 });
		expect(paused.mode).toBe("paused");
		expect(step(paused, { type: "visible", now: 2 }).mode).toBe("sleeping");
		const micOnly = step(initialVoice(), { type: "mic", now: 0 });
		expect(step(micOnly, { type: "hidden", now: 1 }).mode).toBe("off");
		expect(step(initialVoice(), { type: "hidden", now: 1 }).mode).toBe("off");
	});

	it("turns everything off when listening is switched off mid-conversation", () => {
		const off = step(inConversation(), { type: "listen", on: false, now: 50 });
		expect(off.mode).toBe("off");
		expect(off.listening).toBe(false);
	});

	it("returns the same state when nothing changes", () => {
		const s = listening();
		expect(step(s, { type: "tick", now: 5 })).toBe(s);
		expect(step(s, { type: "judged", speaker: "guest" })).toBe(s);
	});
});

describe("what runs in each mode", () => {
	it("runs the detector only while sleeping, and the recognizer only while awake or in a follow-up", () => {
		const sleeping = listening();
		const awake = step(sleeping, { type: "wake", now: 1 });
		const thinking = inConversation();
		expect([detectorOn(sleeping), recognizerOn(sleeping), micOpen(sleeping)]).toEqual([true, false, true]);
		expect([detectorOn(awake), recognizerOn(awake), micOpen(awake)]).toEqual([false, true, true]);
		expect([detectorOn(thinking), recognizerOn(thinking), micOpen(thinking)]).toEqual([false, false, false]);
		expect(micOpen(initialVoice())).toBe(false);
	});
});

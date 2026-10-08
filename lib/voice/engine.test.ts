import { describe, expect, it, vi } from "vitest";
import {
	JUDGEMENT_LOG_SIZE,
	LISTENING_STOPPED,
	MIC_BLOCKED,
	MicError,
	MODEL_FAILED,
	NO_MIC,
	SPEECH_WATCHDOG_EXTRA_MS,
	SPEECH_WATCHDOG_MS_PER_CHAR,
	VoiceEngine,
	WORD_TIMING_WAIT_MS,
	type HearHooks,
	type SayHooks,
	type VoiceConfig,
	type VoiceDeps,
	type VoiceView,
} from "./engine";
import type { SendOptions } from "./guest";
import { FOLLOW_UP_MS } from "./machine";
import { SampleRing } from "./ring";
import { LEAN_THRESHOLD, MODEL_ID } from "./voiceprint";
import { WAKE } from "./wake";

type FakeMic = { ring: SampleRing; closed: boolean; onAudio: (s: Int16Array) => void; close(): void };

function harness(
	over: Partial<VoiceConfig> = {},
	options: { micFailure?: MicError; embedFailure?: boolean; endAtOnce?: boolean; warmThrows?: boolean } = {},
) {
	let now = 1000;
	let embedding = [1, 0];
	let wake: (() => void) | null = null;
	const timers: { at: number; run: () => void; live: boolean }[] = [];
	const mics: FakeMic[] = [];
	const fed: number[] = [];
	const embedded: number[] = [];
	const hearings: { hooks: HearHooks; aborted: boolean }[] = [];
	const said: { text: string; hooks: SayHooks; cancelled: boolean }[] = [];
	const sent: { text: string; options: SendOptions }[] = [];
	const chimes = { count: 0 };
	const detectorResets = { count: 0 };
	// "warm" and "embed" calls in the order they happened.
	const order: string[] = [];
	const deps: VoiceDeps = {
		now: () => now,
		later: (run, ms) => {
			const timer = { at: now + ms, run, live: true };
			timers.push(timer);
			return () => {
				timer.live = false;
			};
		},
		openMic: async (onAudio) => {
			if (options.micFailure) throw options.micFailure;
			const mic: FakeMic = {
				ring: new SampleRing(16000 * 12),
				closed: false,
				onAudio,
				close() {
					mic.closed = true;
				},
			};
			mics.push(mic);
			return mic;
		},
		createDetector: async (onWake) => {
			wake = onWake;
			return { feed: (samples) => fed.push(samples.length), reset: () => detectorResets.count++ };
		},
		hear: async (hooks) => {
			const hearing = { hooks, aborted: false };
			hearings.push(hearing);
			return { stop() {}, abort: () => void (hearing.aborted = true) };
		},
		warmEmbed: () => {
			order.push("warm");
			if (options.warmThrows) throw new Error("warm failed");
		},
		embed: async (samples) => {
			order.push("embed");
			if (options.embedFailure) throw new Error("embed failed");
			embedded.push(samples.length);
			return embedding;
		},
		say: (text, hooks) => {
			const line = { text, hooks, cancelled: false };
			said.push(line);
			if (options.endAtOnce) hooks.onEnd();
			return {
				cancel() {
					line.cancelled = true;
					hooks.onEnd();
				},
			};
		},
		chime: () => void chimes.count++,
	};
	const views: VoiceView[] = [];
	const engine = new VoiceEngine(deps, (view) => views.push(view));
	const speech = { onSpeechStart: vi.fn(), onNoWordTiming: vi.fn(), onWord: vi.fn(), onSpeechEnd: vi.fn() };
	const config: VoiceConfig = {
		listen: true,
		wakeReady: true,
		prints: [{ model: MODEL_ID, embedding: [1, 0] }],
		canSpeak: true,
		speakTyped: false,
		sendText: (text, sendOptions) => {
			sent.push({ text, options: sendOptions });
			return true;
		},
		speech,
		listenOff: vi.fn(),
		needTeaching: vi.fn(),
		...over,
	};
	engine.configure(config);
	return {
		order,
		engine,
		config,
		mics,
		fed,
		embedded,
		hearings,
		said,
		sent,
		chimes,
		detectorResets,
		speech,
		mode: () => engine.view().state.mode,
		flush: () => new Promise((resolve) => setTimeout(resolve, 0)),
		advance(ms: number) {
			now += ms;
			for (const t of timers) if (t.live && t.at <= now) {
				t.live = false;
				t.run();
			}
			engine.tick();
		},
		// Speech-like audio into the newest microphone: a steady tone, loud enough to count as speech.
		talk(samples = 32000) {
			const mic = mics.at(-1)!;
			const pcm = Int16Array.from({ length: samples }, (_, i) => Math.round(Math.sin(i / 5) * 8000));
			mic.ring.push(pcm);
			mic.onAudio(pcm);
		},
		// Real samples into the newest microphone's ring, but nothing loud enough to count as speech:
		// a mic that's open and streaming, yet has nothing to judge a speaker by.
		silence(samples: number) {
			const mic = mics.at(-1)!;
			const pcm = new Int16Array(samples);
			mic.ring.push(pcm);
			mic.onAudio(pcm);
		},
		wake: () => wake?.(),
		setEmbedding(next: number[]) {
			embedding = next;
		},
	};
}

// Wake, say something, and wait for it to be judged and sent.
async function converse(h: ReturnType<typeof harness>, text: string, samples = 32000) {
	h.wake();
	await h.flush();
	h.talk(samples);
	const hear = h.hearings.at(-1)!.hooks;
	hear.onSpeech();
	hear.onText(text);
	hear.onDone(text);
	await h.flush();
}

// Finish speaking a voice reply and let the follow-up microphone open.
async function replyAndFollowUp(h: ReturnType<typeof harness>, reply = "Of course.") {
	h.engine.onReply(reply, "voice");
	h.said.at(-1)!.hooks.onEnd();
	await h.flush();
}

describe("VoiceEngine", () => {
	it("opens the microphone and the detector when listening is on, and feeds audio only while asleep", async () => {
		const h = harness();
		await h.flush();
		expect(h.mode()).toBe("sleeping");
		expect(h.mics).toHaveLength(1);
		h.talk(1280);
		expect(h.fed).toEqual([1280]);
	});

	it("wakes, hears Gur, recognizes him and sends his message", async () => {
		const h = harness();
		await h.flush();
		await converse(h, "Osmo, what's the time");
		expect(h.chimes.count).toBe(1);
		expect(h.sent).toEqual([{ text: "what's the time", options: { via: "voice", speaker: "you", greet: false } }]);
		expect(h.mode()).toBe("thinking");
		expect(h.mics[0].closed).toBe(true);
	});

	it("judges the wake word's audio together with the message", async () => {
		const h = harness();
		await h.flush();
		h.talk(48000);
		h.wake();
		await h.flush();
		h.talk(16000);
		const hear = h.hearings[0].hooks;
		hear.onSpeech();
		hear.onDone("hello");
		await h.flush();
		expect(h.embedded[0]).toBe(32000);
	});

	it("greets a guest once per conversation and tells the room who spoke", async () => {
		const h = harness();
		await h.flush();
		h.setEmbedding([0, 1]);
		await converse(h, "Osmo, who are you");
		await replyAndFollowUp(h);
		h.talk(32000);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("and what can you do");
		await h.flush();
		expect(h.sent.map((s) => s.options)).toEqual([
			{ via: "voice", speaker: "guest", greet: true },
			{ via: "voice", speaker: "guest", greet: false },
		]);
	});

	it("speaks a spoken conversation's reply, passes word timing to the room, then listens for a follow-up without a chime", async () => {
		const h = harness();
		await h.flush();
		await converse(h, "Osmo, hello");
		h.engine.onReply("Good evening.", "voice");
		expect(h.mode()).toBe("speaking");
		expect(h.said[0].text).toBe("Good evening.");
		expect(h.speech.onSpeechStart).toHaveBeenCalled();
		h.said[0].hooks.onWord(0, 4);
		expect(h.speech.onWord).toHaveBeenCalledWith(4, "Good");
		h.said[0].hooks.onEnd();
		expect(h.speech.onSpeechEnd).toHaveBeenCalled();
		expect(h.mode()).toBe("followup");
		await h.flush();
		expect(h.mics).toHaveLength(2);
		expect(h.hearings).toHaveLength(2);
		expect(h.chimes.count).toBe(1);
		h.advance(FOLLOW_UP_MS);
		expect(h.mode()).toBe("sleeping");
		expect(h.hearings[1].aborted).toBe(true);
	});

	it("types the reply at speaking pace when the device gives no word timing", async () => {
		const h = harness({ speakTyped: true });
		await h.flush();
		h.engine.onReply("Hello there.", "typed");
		h.advance(WORD_TIMING_WAIT_MS);
		expect(h.speech.onNoWordTiming).toHaveBeenCalledTimes(1);
		const timed = harness({ speakTyped: true });
		await timed.flush();
		timed.engine.onReply("Hello there.", "typed");
		timed.said[0].hooks.onWord(0, 5);
		timed.advance(WORD_TIMING_WAIT_MS);
		expect(timed.speech.onNoWordTiming).not.toHaveBeenCalled();
	});

	it("goes back to sleep silently after a wake-up with nothing said", async () => {
		const h = harness();
		await h.flush();
		h.wake();
		await h.flush();
		h.advance(WAKE.noSpeechMs);
		expect(h.mode()).toBe("sleeping");
		expect(h.sent).toEqual([]);
		expect(h.hearings[0].aborted).toBe(true);
	});

	it("forgets the wake word's audio when he goes back to sleep", async () => {
		const h = harness();
		await h.flush();
		h.wake();
		await h.flush();
		h.advance(WAKE.noSpeechMs);
		expect(h.mode()).toBe("sleeping");
		expect(h.detectorResets.count).toBeGreaterThanOrEqual(1);
	});

	it("sends nothing when only the wake word was heard", async () => {
		const h = harness();
		await h.flush();
		await converse(h, "Osmo");
		expect(h.sent).toEqual([]);
		expect(h.mode()).toBe("sleeping");
	});

	it("goes back to sleep when the room refuses the message", async () => {
		const h = harness({ sendText: () => false });
		await h.flush();
		await converse(h, "Osmo, hi");
		expect(h.mode()).toBe("sleeping");
	});

	it("speaks typed replies only when asked to, with no follow-up after", async () => {
		const h = harness({ speakTyped: true });
		await h.flush();
		h.engine.onReply("Hello.", "typed");
		expect(h.mode()).toBe("speaking");
		h.said[0].hooks.onEnd();
		expect(h.mode()).toBe("sleeping");
		expect(h.hearings).toHaveLength(0);
		const quiet = harness();
		await quiet.flush();
		quiet.engine.onReply("Hello.", "typed");
		expect(quiet.said).toHaveLength(0);
	});

	it("listens for a follow-up straight away when the device has no voice", async () => {
		const h = harness({ canSpeak: false });
		await h.flush();
		await converse(h, "Osmo, hello");
		h.engine.onReply("Good evening.", "voice");
		expect(h.said).toHaveLength(0);
		expect(h.mode()).toBe("followup");
	});

	it("turns listening off with a clear message when the microphone is blocked", async () => {
		const h = harness({}, { micFailure: new MicError("blocked") });
		await h.flush();
		expect(h.engine.view().error).toBe(MIC_BLOCKED);
		expect(h.config.listenOff).toHaveBeenCalled();
		expect(h.mode()).toBe("off");
	});

	it("restarts the recognizer quietly, and stops after three failures in a row", async () => {
		const h = harness();
		await h.flush();
		h.wake();
		await h.flush();
		h.hearings[0].hooks.onProblem("network");
		expect(h.hearings).toHaveLength(2);
		expect(h.engine.view().error).toBeNull();
		h.hearings[1].hooks.onProblem("network");
		h.hearings[2].hooks.onProblem("network");
		expect(h.engine.view().error).toBe(LISTENING_STOPPED);
		expect(h.mode()).toBe("off");
		expect(h.config.listenOff).toHaveBeenCalled();
	});

	it("gives the recognizer the microphone to itself when it needs it, judging the wake word's audio", async () => {
		const h = harness();
		await h.flush();
		h.talk(16000);
		h.wake();
		await h.flush();
		h.hearings[0].hooks.onProblem("audio");
		expect(h.mics[0].closed).toBe(true);
		expect(h.hearings).toHaveLength(2);
		h.hearings[1].hooks.onSpeech();
		h.hearings[1].hooks.onDone("what's up");
		await h.flush();
		expect(h.embedded[0]).toBe(16000);
		expect(h.sent[0].options.speaker).toBe("you");
	});

	it("tries the shared microphone again after a conversation ends", async () => {
		const h = harness();
		await h.flush();
		h.talk(16000);
		h.wake();
		await h.flush();
		h.hearings[0].hooks.onProblem("audio");
		expect(h.mics[0].closed).toBe(true);
		const before = h.mics.length;
		h.advance(WAKE.noSpeechMs);
		expect(h.mode()).toBe("sleeping");
		h.engine.micPress();
		await h.flush();
		expect(h.mics.length).toBeGreaterThan(before);
		expect(h.mics.at(-1)!.closed).toBe(false);
		h.talk(32000);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("hello again");
		await h.flush();
		expect(h.sent[0].options.speaker).toBe("you");
	});

	it("closes everything while the page is hidden, and listens again when it's back", async () => {
		const h = harness({ speakTyped: true });
		await h.flush();
		h.engine.onReply("Hello.", "typed");
		h.engine.visibility(true);
		expect(h.said[0].cancelled).toBe(true);
		expect(h.speech.onSpeechEnd).toHaveBeenCalled();
		expect(h.mode()).toBe("paused");
		h.engine.visibility(false);
		await h.flush();
		expect(h.mode()).toBe("sleeping");
		expect(h.mics.at(-1)!.closed).toBe(false);
	});

	it("stops speaking when asked and reveals the whole reply", async () => {
		const h = harness({ speakTyped: true });
		await h.flush();
		h.engine.onReply("A long answer.", "typed");
		h.engine.stop();
		expect(h.said[0].cancelled).toBe(true);
		expect(h.speech.onSpeechEnd).toHaveBeenCalled();
		expect(h.mode()).toBe("sleeping");
	});

	it("keeps a short follow-up Gur's, but judges a full sentence again", async () => {
		const h = harness();
		await h.flush();
		await converse(h, "Osmo, hello");
		await replyAndFollowUp(h);
		h.setEmbedding([0, 1]);
		h.talk(16000);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("yes");
		await h.flush();
		expect(h.sent[1].options.speaker).toBe("you");
		await replyAndFollowUp(h);
		h.talk(32000);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("tell me what he said about work");
		await h.flush();
		expect(h.sent[2].options).toEqual({ via: "voice", speaker: "guest", greet: true });
	});

	it("asks for teaching when the mic is pressed before Osmo knows Gur's voice", async () => {
		const h = harness({ listen: false, prints: [] });
		await h.flush();
		h.engine.micPress();
		expect(h.config.needTeaching).toHaveBeenCalledWith("mic");
		expect(h.hearings).toHaveLength(0);
	});

	it("starts a conversation from the mic button with listening off, and closes the microphone after", async () => {
		const h = harness({ listen: false });
		await h.flush();
		expect(h.mics).toHaveLength(0);
		h.engine.micPress();
		await h.flush();
		expect(h.mode()).toBe("awake");
		expect(h.hearings).toHaveLength(1);
		expect(h.mics).toHaveLength(1);
		h.advance(WAKE.noSpeechMs);
		expect(h.mode()).toBe("off");
		expect(h.mics[0].closed).toBe(true);
	});

	it("ignores a wake while he is speaking", async () => {
		const h = harness({ speakTyped: true });
		await h.flush();
		h.engine.onReply("Hello, I'm Osmo.", "typed");
		h.wake();
		expect(h.chimes.count).toBe(0);
		expect(h.mode()).toBe("speaking");
	});

	it("listening needs a taught voice", async () => {
		const h = harness({ prints: [] });
		await h.flush();
		expect(h.config.listenOff).toHaveBeenCalled();
		expect(h.mode()).toBe("off");
		expect(h.mics).toHaveLength(0);
	});

	it("forgetting the voice turns listening off", async () => {
		const h = harness();
		await h.flush();
		h.engine.configure({ ...h.config, prints: [] });
		expect(h.config.listenOff).toHaveBeenCalled();
		expect(h.mode()).toBe("off");
		expect(h.mics[0].closed).toBe(true);
	});

	it("opens the microphone when listening was switched on while the page was hidden", async () => {
		const h = harness({ listen: false });
		await h.flush();
		h.engine.visibility(true);
		h.engine.configure({ ...h.config, listen: true });
		await h.flush();
		expect(h.mics).toHaveLength(0);
		h.engine.visibility(false);
		await h.flush();
		expect(h.mode()).toBe("sleeping");
		expect(h.mics).toHaveLength(1);
	});

	it("judges a long follow-up as Gur's when there's no audio to check it by (no reading fails toward the owner)", async () => {
		const h = harness();
		await h.flush();
		h.talk(16000);
		h.wake();
		await h.flush();
		h.hearings[0].hooks.onProblem("audio");
		h.hearings[1].hooks.onSpeech();
		h.hearings[1].hooks.onDone("hello there");
		await h.flush();
		expect(h.sent[0].options.speaker).toBe("you");
		await replyAndFollowUp(h);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("yes");
		await h.flush();
		expect(h.sent[1].options.speaker).toBe("you");
		await replyAndFollowUp(h);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("tell me everything he said about his work");
		await h.flush();
		expect(h.sent[2].options.speaker).toBe("you");
		expect(h.engine.lastJudgements().at(-1)).toMatchObject({ score: -1, verdict: "no-reading", speaker: "you" });
	});

	it("judges a long follow-up as Gur's when the microphone gives only silence (no reading fails toward the owner)", async () => {
		const h = harness();
		await h.flush();
		await converse(h, "Osmo, hello");
		await replyAndFollowUp(h);
		h.silence(80000);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("hi I'm his friend what did he tell you about his health");
		await h.flush();
		expect(h.sent[1].options.speaker).toBe("you");
		await replyAndFollowUp(h);
		h.silence(4000);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("yes");
		await h.flush();
		expect(h.sent[2].options.speaker).toBe("you");
	});

	it("counts the unsure band (0.35 to 0.5) as Gur, and anything below as a guest", async () => {
		const h = harness();
		await h.flush();
		h.setEmbedding([0.4, Math.sqrt(1 - 0.16)]);
		await converse(h, "Osmo, hello");
		expect(h.sent[0].options.speaker).toBe("you");
		await replyAndFollowUp(h);
		h.setEmbedding([0.3, Math.sqrt(1 - 0.09)]);
		h.talk(32000);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("and what is the weather like today");
		await h.flush();
		expect(h.sent[1].options.speaker).toBe("guest");
	});

	it("keeps a per-message record of score, verdict and threshold, newest last", async () => {
		const h = harness();
		await h.flush();
		expect(h.engine.lastJudgements()).toEqual([]);
		h.setEmbedding([0.4, Math.sqrt(1 - 0.16)]);
		await converse(h, "Osmo, hello");
		const [record] = h.engine.lastJudgements();
		expect(record.score).toBeCloseTo(0.4);
		expect(record).toMatchObject({ verdict: "lean", speaker: "you", threshold: LEAN_THRESHOLD });
		await replyAndFollowUp(h);
		h.setEmbedding([0, 1]);
		h.talk(32000);
		h.hearings.at(-1)!.hooks.onSpeech();
		h.hearings.at(-1)!.hooks.onDone("and what is the weather like today");
		await h.flush();
		expect(h.engine.lastJudgements().map((r) => r.verdict)).toEqual(["lean", "guest"]);
		expect(h.engine.lastJudgements().at(-1)).toMatchObject({ score: 0, speaker: "guest", threshold: LEAN_THRESHOLD });
	});

	it("keeps only the last 50 records, and hands out copies", async () => {
		const h = harness();
		await h.flush();
		await converse(h, "Osmo, hello");
		for (let i = 0; i < JUDGEMENT_LOG_SIZE + 5; i++) {
			await replyAndFollowUp(h);
			h.talk(32000);
			h.hearings.at(-1)!.hooks.onSpeech();
			h.hearings.at(-1)!.hooks.onDone(`message number ${i} is a long enough sentence`);
			await h.flush();
		}
		const records = h.engine.lastJudgements();
		expect(records).toHaveLength(JUDGEMENT_LOG_SIZE);
		(records as unknown[]).length = 0;
		expect(h.engine.lastJudgements()).toHaveLength(JUDGEMENT_LOG_SIZE);
	});

	it("loads the speaker model when listening is switched on, before the first judgement", async () => {
		const h = harness();
		await h.flush();
		expect(h.order).toEqual(["warm"]);
		await converse(h, "Osmo, hello");
		expect(h.order).toEqual(["warm", "embed"]);
	});

	it("loads it once per switch-on, however often the room reconfigures", async () => {
		const h = harness({ listen: false });
		await h.flush();
		expect(h.order).toEqual([]);
		h.engine.configure({ ...h.config, listen: true });
		h.engine.configure({ ...h.config, listen: true });
		expect(h.order).toEqual(["warm"]);
		h.engine.configure({ ...h.config, listen: false });
		h.engine.configure({ ...h.config, listen: true });
		expect(h.order).toEqual(["warm", "warm"]);
	});

	it("doesn't load it when listening can't start (no taught voice, or the wake word is untrained)", async () => {
		const noPrints = harness({ prints: [] });
		await noPrints.flush();
		expect(noPrints.order).toEqual([]);
		const untrained = harness({ wakeReady: false });
		await untrained.flush();
		expect(untrained.order).toEqual([]);
	});

	it("carries on if the head start fails", async () => {
		const h = harness({}, { warmThrows: true });
		await h.flush();
		await converse(h, "Osmo, hello");
		expect(h.sent).toHaveLength(1);
	});

	it("says it couldn't load what it needs instead of treating Gur as a stranger", async () => {
		const h = harness({}, { embedFailure: true });
		await h.flush();
		await converse(h, "Osmo, hello");
		expect(h.sent).toEqual([]);
		expect(h.engine.view().error).toBe(MODEL_FAILED);
		expect(h.mode()).toBe("sleeping");
	});

	it("doesn't stay speaking when the device ends at once", async () => {
		const h = harness({ speakTyped: true }, { endAtOnce: true });
		await h.flush();
		h.engine.onReply("Hello.", "typed");
		expect(h.mode()).toBe("sleeping");
		expect(h.speech.onSpeechEnd).toHaveBeenCalled();
	});

	it("stops speaking after the watchdog if the device never reports the end", async () => {
		const h = harness({ speakTyped: true });
		await h.flush();
		h.engine.onReply("Hello.", "typed");
		h.advance("Hello.".length * SPEECH_WATCHDOG_MS_PER_CHAR + SPEECH_WATCHDOG_EXTRA_MS);
		expect(h.mode()).toBe("sleeping");
		expect(h.said[0].cancelled).toBe(true);
	});

	it("keeps a message the recognizer finished without reporting speech", async () => {
		const h = harness();
		await h.flush();
		h.wake();
		await h.flush();
		h.talk(32000);
		h.hearings[0].hooks.onDone("Osmo, what time is it");
		h.advance(WAKE.noSpeechMs);
		await h.flush();
		expect(h.sent).toHaveLength(1);
	});

	it("drops the message when sendText throws", async () => {
		const h = harness({
			sendText: () => {
				throw new Error("boom");
			},
		});
		await h.flush();
		await converse(h, "Osmo, hello");
		expect(h.mode()).toBe("sleeping");
	});

	it("shows no-microphone when there is none", async () => {
		const h = harness({}, { micFailure: new MicError("unavailable") });
		await h.flush();
		expect(h.engine.view().error).toBe(NO_MIC);
	});

	it("turns listening off when the recognizer is blocked", async () => {
		const h = harness();
		await h.flush();
		h.wake();
		await h.flush();
		h.hearings[0].hooks.onProblem("blocked");
		expect(h.engine.view().error).toBe(MIC_BLOCKED);
		expect(h.config.listenOff).toHaveBeenCalled();
		expect(h.mode()).toBe("off");
	});

	it("starts cleanly again after being disposed and configured, as React does in development", async () => {
		const h = harness();
		await h.flush();
		h.engine.dispose();
		expect(h.mics[0].closed).toBe(true);
		h.engine.configure(h.config);
		await h.flush();
		expect(h.mode()).toBe("sleeping");
		expect(h.mics).toHaveLength(2);
		expect(h.mics[1].closed).toBe(false);
	});
});

// Osmo's listening and speaking, wired together: the machine (./machine.ts) decides what should happen,
// and this carries it out. The browser's pieces arrive as VoiceDeps, so tests run it with fakes
// and a laptop or phone app can swap in native ones.

import type { SendOptions, Speaker, Via } from "./guest";
import { speechSeconds, trimSilence } from "./levels";
import { detectorOn, inConversation, initialVoice, micOpen, recognizerOn, step, type VoiceEvent, type VoiceState } from "./machine";
import type { SampleRing } from "./ring";
import { messageFrom, spokenSeconds } from "./utterance";
import { bestScore, judge, type Voiceprint } from "./voiceprint";

export const MIC_BLOCKED = "I can't hear you. Allow the microphone for this site in your browser settings, then try again.";
export const NO_MIC = "I can't find a microphone on this device.";
export const MODEL_FAILED = "I couldn't load what I need to listen. Check your connection and try again.";
export const LISTENING_STOPPED = "Listening stopped. Tap the mic to start again.";

// The second of audio before the detector fired holds "Osmo" itself; it's judged together with the message.
export const WAKE_AUDIO_SAMPLES = 16000;
// Recognizer failures in a row before listening gives up.
export const MAX_FAILURES = 3;
// How long to wait for word timing before his text types out at speaking pace instead.
export const WORD_TIMING_WAIT_MS = 800;
// If the device never reports the end of speech (an iPhone that blocked speech, a stuck voice), a watchdog
// ends it after roughly how long the text should take to say, so he doesn't stay "speaking" forever.
export const SPEECH_WATCHDOG_MS_PER_CHAR = 150;
export const SPEECH_WATCHDOG_EXTRA_MS = 5000;
// The speaker model needs at least one 25 ms frame.
const MIN_EMBED_SAMPLES = 400;

export class MicError extends Error {
	readonly problem: "blocked" | "unavailable";

	constructor(problem: "blocked" | "unavailable") {
		super(`Microphone ${problem}`);
		this.problem = problem;
	}
}

export type HearProblem = "blocked" | "audio" | "network" | "other";
export type HearHooks = {
	onSpeech(): void;
	onText(text: string): void;
	// The whole transcript once the recognizer ends ("" when nothing was said). Not called after a problem or abort.
	onDone(text: string): void;
	onProblem(problem: HearProblem): void;
};
export type Hearing = { stop(): void; abort(): void };
export type MicHandle = { readonly ring: SampleRing; close(): void };
export type Detector = { feed(samples: Int16Array): void; reset(): void };
export type SayHooks = { onWord(start: number, end: number): void; onEnd(): void };
export type Spoken = { cancel(): void };

export type VoiceDeps = {
	now(): number;
	// Runs `run` after `ms`; returns a cancel.
	later(run: () => void, ms: number): () => void;
	openMic(onAudio: (samples: Int16Array) => void): Promise<MicHandle>;
	createDetector(onWake: () => void): Promise<Detector>;
	hear(hooks: HearHooks): Promise<Hearing>;
	// A voice embedding for 16 kHz samples on the -1..1 scale.
	embed(samples: Float32Array): Promise<number[]>;
	say(text: string, hooks: SayHooks): Spoken;
	chime(): void;
};

// How the room shows his speech.
export type SpeechHooks = {
	onSpeechStart(): void;
	onNoWordTiming(): void;
	onWord(end: number): void;
	onSpeechEnd(): void;
};
export type SendText = (text: string, options: SendOptions) => boolean;

export type VoiceConfig = {
	// "Listen for 'Osmo'" is on (and the voiceprints have loaded).
	listen: boolean;
	// The trained "osmo" detector exists.
	wakeReady: boolean;
	// Gur's voiceprints; empty means Osmo hasn't been taught his voice.
	prints: Voiceprint[];
	// The device has a voice to speak with.
	canSpeak: boolean;
	speakTyped: boolean;
	sendText: SendText;
	speech: SpeechHooks;
	// Switch "Listen for 'Osmo'" off (it lives in the device settings).
	listenOff(): void;
	// Open Settings at "Teach Osmo my voice".
	needTeaching(reason: "mic"): void;
};

export type VoiceView = { state: VoiceState; liveText: string | null; error: string | null };

export class VoiceEngine {
	private readonly deps: VoiceDeps;
	private readonly emit: (view: VoiceView) => void;
	private state: VoiceState;
	private config: VoiceConfig | null = null;
	private mic: MicHandle | null = null;
	private micOpening = false;
	// The newest microphone's recent audio, kept after it closes so the voice check can still read it.
	private ring: SampleRing | null = null;
	private detector: Detector | null = null;
	private detectorLoading = false;
	private hearing: Hearing | null = null;
	// Bumped whenever the recognizer is stopped or replaced, so its late callbacks are ignored.
	private hearingId = 0;
	// Where the current message's audio starts in `ring`.
	private mark = 0;
	private failures = 0;
	// Safari may not share the microphone with its recognizer; then the detector's stream closes while it listens.
	private exclusive = false;
	private hidden = false;
	private spoken: Spoken | null = null;
	private speakingNow: object | null = null;
	private liveText: string | null = null;
	private error: string | null = null;
	// Bumped by dispose(), so a mic or detector still loading from before it can't land on the fresh instance.
	private generation = 0;

	constructor(deps: VoiceDeps, emit: (view: VoiceView) => void) {
		this.deps = deps;
		this.emit = emit;
		this.state = initialVoice(deps.now());
	}

	readonly view = (): VoiceView => ({ state: this.state, liveText: this.liveText, error: this.error });

	readonly configure = (config: VoiceConfig): void => {
		this.config = config;
		const want = config.listen && config.wakeReady;
		if (want && config.prints.length === 0) {
			// Listening needs a taught voice, so the second check always runs while the microphone is on.
			config.listenOff();
			if (this.state.listening) this.send({ type: "listen", on: false, now: this.deps.now() });
			return;
		}
		if (want !== this.state.listening) this.send({ type: "listen", on: want, now: this.deps.now() });
		if (want && !this.detector && !this.detectorLoading) void this.loadDetector();
	};

	readonly micPress = (): void => {
		const config = this.config;
		if (!config) return;
		if (config.prints.length === 0) {
			config.needTeaching("mic");
			return;
		}
		this.error = null;
		const before = this.state;
		const next = this.send({ type: "mic", now: this.deps.now() });
		if (next.mode === "awake" && before.mode !== "awake") this.startHearing(this.markNow());
		else this.publish();
	};

	readonly stop = (): void => {
		this.send({ type: "stop", now: this.deps.now() });
	};

	readonly tick = (): void => {
		this.send({ type: "tick", now: this.deps.now() });
	};

	readonly visibility = (hidden: boolean): void => {
		this.hidden = hidden;
		this.send({ type: hidden ? "hidden" : "visible", now: this.deps.now() });
		// Listening may have been switched on while hidden, leaving "sleeping" with no microphone open;
		// this opens what the mode needs now that the "visible" event alone may not have changed anything.
		if (!hidden) this.sync(this.state, this.state);
	};

	readonly onReply = (reply: string, via: Via): void => {
		const config = this.config;
		if (!config) return;
		const wanted = (via === "voice" || config.speakTyped) && config.canSpeak;
		const before = this.state;
		const next = this.send({ type: "reply", via, spoken: wanted, now: this.deps.now() });
		// A new typed reply replaces one he is still saying.
		const replacing = before.mode === "speaking" && next.mode === "speaking" && via === "typed" && wanted;
		if ((next.mode === "speaking" && before.mode !== "speaking") || replacing) this.speak(reply);
	};

	readonly clearError = (): void => {
		if (this.error === null) return;
		this.error = null;
		this.publish();
	};

	// Closes everything and starts over as "off"; the next configure reopens what's needed. The loaded
	// detector is kept (reloading the model is wasted when React StrictMode remounts the same engine).
	readonly dispose = (): void => {
		this.generation += 1;
		this.stopHearing();
		this.mic?.close();
		this.mic = null;
		this.micOpening = false;
		this.ring = null;
		// Cleared before cancelling, so the cancel's onEnd sees a stale token and does nothing.
		this.speakingNow = null;
		const spoken = this.spoken;
		this.spoken = null;
		spoken?.cancel();
		this.exclusive = false;
		this.failures = 0;
		this.hidden = false;
		this.error = null;
		this.liveText = null;
		this.state = initialVoice(this.deps.now());
	};

	private send(event: VoiceEvent): VoiceState {
		const before = this.state;
		const next = step(before, event);
		if (next === before) return before;
		this.state = next;
		this.sync(before, next);
		this.publish();
		return next;
	}

	private publish(): void {
		this.emit(this.view());
	}

	private wantsMic(state: VoiceState): boolean {
		if (this.hidden) return false;
		return this.exclusive ? detectorOn(state) : micOpen(state);
	}

	// Opens and closes what each mode needs.
	private sync(before: VoiceState, next: VoiceState): void {
		// A conversation that ends gives the shared microphone another chance: one glitch shouldn't degrade the whole visit.
		if (inConversation(before) && !inConversation(next)) this.exclusive = false;
		// Waiting for his name again: forget the audio that woke him, or it wakes him twice.
		if (next.mode === "sleeping" && before.mode !== "sleeping") this.detector?.reset();
		if (this.wantsMic(next)) {
			if (!this.mic && !this.micOpening) void this.openMic();
		} else if (this.mic) {
			this.mic.close();
			this.mic = null;
			// The next message never reads the previous conversation's audio before a new microphone opens.
			// Exclusive mode keeps its ring, since it holds the wake audio judged with the next message.
			if (!this.exclusive) this.ring = null;
		}
		if (recognizerOn(before) && !recognizerOn(next)) this.stopHearing();
		if (before.mode === "speaking" && next.mode !== "speaking" && this.spoken) {
			const spoken = this.spoken;
			this.spoken = null;
			spoken.cancel();
		}
		if (next.mode === "followup" && before.mode !== "followup") this.startHearing(this.markNow());
	}

	private async openMic(): Promise<void> {
		const generation = this.generation;
		this.micOpening = true;
		try {
			const mic = await this.deps.openMic((samples) => {
				if (detectorOn(this.state) && !this.hidden) this.detector?.feed(samples);
			});
			// A dispose() moved on while this was in flight; leave its bookkeeping alone, a fresh attempt owns it now.
			if (generation !== this.generation) {
				mic.close();
				return;
			}
			this.micOpening = false;
			if (!this.wantsMic(this.state) || this.mic) {
				mic.close();
				return;
			}
			this.mic = mic;
			this.ring = mic.ring;
		} catch (error) {
			if (generation !== this.generation) return;
			this.micOpening = false;
			this.fail(error instanceof MicError && error.problem === "blocked" ? MIC_BLOCKED : NO_MIC);
		}
	}

	private async loadDetector(): Promise<void> {
		const generation = this.generation;
		this.detectorLoading = true;
		try {
			// Keep the detector even if dispose() ran meanwhile: the loaded model is still good, and reloading it is wasted.
			this.detector = await this.deps.createDetector(() => this.onWake());
		} catch {
			if (generation === this.generation) this.fail(MODEL_FAILED);
		} finally {
			this.detectorLoading = false;
		}
	}

	private onWake(): void {
		if (this.state.mode !== "sleeping" || this.hidden) return;
		this.deps.chime();
		const mark = this.mic ? Math.max(0, this.mic.ring.total - WAKE_AUDIO_SAMPLES) : 0;
		this.send({ type: "wake", now: this.deps.now() });
		this.startHearing(mark);
	}

	// Where the next message's audio starts: now on the open microphone, or at the start of the next one.
	private markNow(): number {
		if (this.mic) return this.mic.ring.total;
		return this.exclusive && this.ring ? this.ring.total : 0;
	}

	private startHearing(mark: number): void {
		this.stopHearing();
		this.mark = mark;
		this.liveText = "";
		const id = this.hearingId;
		void this.deps
			.hear({
				onSpeech: () => {
					if (id === this.hearingId) this.send({ type: "speech", now: this.deps.now() });
				},
				onText: (text) => {
					if (id !== this.hearingId) return;
					this.liveText = messageFrom(text);
					this.publish();
				},
				onDone: (text) => {
					void this.finish(id, text);
				},
				onProblem: (problem) => this.heardProblem(id, problem),
			})
			.then((hearing) => {
				if (id === this.hearingId) this.hearing = hearing;
				else hearing.abort();
			})
			.catch(() => this.heardProblem(id, "other"));
		this.publish();
	}

	private stopHearing(): void {
		this.hearingId += 1;
		this.hearing?.abort();
		this.hearing = null;
		this.liveText = null;
	}

	private async finish(id: number, text: string): Promise<void> {
		if (id !== this.hearingId) return;
		this.hearing = null;
		this.liveText = null;
		// Any hearing that finishes at all ends a run of recognizer failures.
		this.failures = 0;
		const message = messageFrom(text);
		if (!message) {
			this.send({ type: "dropped", now: this.deps.now() });
			this.publish();
			return;
		}
		// Speech has clearly started; this also stops the no-speech timer resting the conversation mid-judgement.
		this.send({ type: "speech", now: this.deps.now() });
		const speaker = await this.whoSpoke(message);
		if (id !== this.hearingId || this.state.mode !== "awake") return;
		if (speaker === null) {
			this.error = MODEL_FAILED;
			this.send({ type: "dropped", now: this.deps.now() });
			this.publish();
			return;
		}
		this.send({ type: "judged", speaker });
		const greet = speaker === "guest" && !this.state.greeted;
		if (greet) this.send({ type: "greeted" });
		let accepted: boolean;
		try {
			accepted = this.config?.sendText(message, { via: "voice", speaker, greet }) ?? false;
		} catch {
			accepted = false;
		}
		this.send({ type: accepted ? "sent" : "dropped", now: this.deps.now() });
	}

	// null means the speaker model couldn't run at all (not "unsure", which still returns "guest").
	private async whoSpoke(message: string): Promise<Speaker | null> {
		const pcm = this.ring ? this.ring.since(this.mark) : new Int16Array(0);
		const audio = trimSilence(Float32Array.from(pcm, (sample) => sample / 32768));
		// No speech audio to measure (an exclusive recognizer that never fed the ring, or a ring of pure silence
		// trimmed away to nothing) isn't the same as a short reading: fall back to the word-count estimate.
		const seconds = audio.length === 0 ? spokenSeconds(message) : speechSeconds(audio);
		let score = -1;
		if (audio.length >= MIN_EMBED_SAMPLES) {
			try {
				score = bestScore(await this.deps.embed(audio), this.config?.prints ?? []);
			} catch {
				return null;
			}
		}
		return judge({ score, speechSeconds: seconds, ownerSoFar: this.state.owner });
	}

	private heardProblem(id: number, problem: HearProblem): void {
		if (id !== this.hearingId) return;
		this.hearing = null;
		if (problem === "blocked") {
			this.fail(MIC_BLOCKED);
			return;
		}
		if (problem === "audio" && !this.exclusive) {
			this.exclusive = true;
			this.mic?.close();
			this.mic = null;
			this.startHearing(this.mark);
			return;
		}
		this.failures += 1;
		if (this.failures >= MAX_FAILURES) {
			this.failures = 0;
			// Listening really turns off here, rather than just resting this one conversation.
			this.fail(LISTENING_STOPPED);
			return;
		}
		if (recognizerOn(this.state)) this.startHearing(this.mark);
	}

	private fail(message: string): void {
		this.error = message;
		this.config?.listenOff();
		this.send({ type: "listen", on: false, now: this.deps.now() });
		this.publish();
	}

	private speak(text: string): void {
		const speech = this.config?.speech;
		if (!speech) return;
		const token = {};
		this.speakingNow = token;
		let timed = false;
		speech.onSpeechStart();
		const cancelWait = this.deps.later(() => {
			if (this.speakingNow === token && !timed) speech.onNoWordTiming();
		}, WORD_TIMING_WAIT_MS);
		// Ends this speech exactly once, however it ends: the device's own onEnd, stop()/hidden moving the
		// machine on and cancelling it, or the watchdog below giving up on a device that never reports the end.
		const ended = (): void => {
			if (this.speakingNow !== token) return;
			this.speakingNow = null;
			cancelWait();
			cancelWatchdog();
			this.spoken = null;
			speech.onSpeechEnd();
			// A stop or a hidden page has already moved the machine on; only report the end here otherwise.
			if (this.state.mode === "speaking") this.send({ type: "spoken", now: this.deps.now() });
		};
		// If the device never reports the end (an iPhone that blocked speech, a stuck voice), he doesn't stay "speaking" forever.
		const cancelWatchdog = this.deps.later(() => {
			if (this.speakingNow !== token) return;
			const current = this.spoken;
			ended();
			current?.cancel();
		}, text.length * SPEECH_WATCHDOG_MS_PER_CHAR + SPEECH_WATCHDOG_EXTRA_MS);
		const spoken = this.deps.say(text, {
			onWord: (_start, end) => {
				if (this.speakingNow !== token) return;
				timed = true;
				speech.onWord(end);
			},
			onEnd: ended,
		});
		// A device that ends synchronously (inside the say() call above) no longer strands "speaking".
		if (this.speakingNow === token) this.spoken = spoken;
	}
}

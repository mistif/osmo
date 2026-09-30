// Speaking a reply as one clip per sentence, in order, with a breath between them, and the device's
// own voice as the fallback. Every browser piece arrives as a dependency, so the sequencing is tested
// without a network or a speaker, and a laptop or phone app can swap the pieces later.
//
// The room only ever sees engine.ts's contract: onWord offsets are into the *whole* reply, never into
// one sentence, so the circle and the reveal behave exactly as with a built-in voice.

import type { SayHooks, Spoken } from "./engine";
import { splitSentences, type SpokenChunk } from "./sentences";
import { type SpeechTone, wordsSpokenBy, wordSpans } from "./tts";

// How long the first clip may take before he gives up and uses the device's voice instead.
// He must never sit in silence: the worst case is that he sounds like he did before.
// Measured on 2026-09-30: gpt-4o-mini-tts delivers a sentence in about 2.1 s (first byte at 1.25 s),
// plus the route's own time, so anything under 3 s hands every new sentence to the device's voice.
export const FIRST_SOUND_GUARD_MS = 4000;

export type Clip = {
	// Seconds. May be 0 or NaN until the browser knows.
	duration(): number;
	currentTime(): number;
	stop(): void;
	// Resolves when the clip finishes or fails. It never rejects.
	ended: Promise<void>;
};

export type CloudSayDeps = {
	// The audio for one sentence. Rejects if it can't be had.
	clip(text: string, tone: SpeechTone, signal: AbortSignal): Promise<Blob>;
	play(clip: Blob): Promise<Clip>;
	later(run: () => void, ms: number): () => void;
	// Runs `run` every frame until the returned cancel is called.
	frames(run: () => void): () => void;
	tone(): SpeechTone;
	fallback(text: string, hooks: SayHooks): Spoken;
};

export function createCloudSay(deps: CloudSayDeps) {
	return function cloudSay(text: string, hooks: SayHooks): Spoken {
		const chunks = splitSentences(text);
		const tone = deps.tone();
		const controller = new AbortController();
		let cancelled = false;
		// True once audio has actually been heard. After that there's no falling back: the device's
		// voice would repeat what he has already said.
		let heard = false;
		let finished = false;
		let clip: Clip | null = null;
		let stopFrames: (() => void) | null = null;
		let stopWaiting: (() => void) | null = null;
		// Set when the device's voice has taken the reply over; it owns `hooks` from then on.
		let local: Spoken | null = null;

		const finish = (): void => {
			if (finished) return;
			finished = true;
			stopFrames?.();
			stopFrames = null;
			hooks.onEnd();
		};

		if (chunks.length === 0) {
			queueMicrotask(finish);
			return { cancel: finish };
		}

		// Hand the whole reply to the device's voice. Only ever called before anything was heard.
		const handOver = (): void => {
			if (cancelled || finished || local) return;
			finished = true;
			stopFrames?.();
			controller.abort();
			local = deps.fallback(text, hooks);
		};

		const pending = new Map<number, Promise<Blob>>();
		const want = (index: number): void => {
			if (index >= chunks.length || pending.has(index)) return;
			// A rejection is read where it's awaited; this keeps it from being unhandled meanwhile.
			const coming = deps.clip(chunks[index].text, tone, controller.signal);
			coming.catch(() => {});
			pending.set(index, coming);
		};
		// One sentence ahead, from the start.
		want(0);
		want(1);

		const cancelGuard = deps.later(() => {
			if (!heard) handOver();
		}, FIRST_SOUND_GUARD_MS);

		// Reveals his words against the whole reply while this sentence plays. Progress comes from the
		// clip's own currentTime, so it corrects itself every frame instead of drifting on a timer.
		const follow = (chunk: SpokenChunk, playing: Clip): (() => void) => {
			const spans = wordSpans(chunk.text);
			let said = 0;
			return deps.frames(() => {
				const length = playing.duration();
				if (!Number.isFinite(length) || length <= 0) return;
				const through = wordsSpokenBy(spans, chunk.text.length, playing.currentTime() / length);
				while (said < through) {
					const span = spans[said];
					said += 1;
					hooks.onWord(chunk.start + span.start, chunk.start + span.end);
				}
			});
		};

		const breathe = (ms: number): Promise<void> =>
			new Promise((resolve) => {
				const cancel = deps.later(resolve, ms);
				stopWaiting = () => {
					cancel();
					resolve();
				};
			});

		const stopped = (): boolean => cancelled || finished || local !== null;

		void (async () => {
			for (let index = 0; index < chunks.length; index += 1) {
				let audio: Blob;
				try {
					want(index);
					audio = await pending.get(index)!;
				} catch {
					// Nothing heard yet: the device's voice says the whole reply. Partway through, stop
					// where he got to rather than start again.
					if (!heard) handOver();
					else finish();
					return;
				}
				if (stopped()) return;
				// The sentence after next, so there's always one waiting.
				want(index + 2);

				try {
					clip = await deps.play(audio);
				} catch {
					if (!heard) handOver();
					else finish();
					return;
				}
				if (stopped()) {
					clip.stop();
					clip = null;
					return;
				}
				heard = true;
				cancelGuard();
				stopFrames = follow(chunks[index], clip);
				await clip.ended;
				stopFrames?.();
				stopFrames = null;
				clip = null;
				if (stopped()) return;

				const gap = chunks[index].gapMs;
				if (gap > 0) {
					await breathe(gap);
					stopWaiting = null;
					if (stopped()) return;
				}
			}
			finish();
		})();

		return {
			cancel() {
				if (local) {
					// The device's voice owns the reply now; it reports its own end.
					finished = true;
					local.cancel();
					return;
				}
				cancelled = true;
				cancelGuard();
				controller.abort();
				stopWaiting?.();
				clip?.stop();
				clip = null;
				// say.ts ends the speech on cancel too, and engine.ts ignores a late end.
				finish();
			},
		};
	};
}

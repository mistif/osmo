// openWakeWord's streaming features, computed the way its Python library does, with the models passed in.
// Audio is 16 kHz int16 in any chunk sizes. Every 1280 samples (80 ms), the mel model sees 480 samples of
// context plus the new chunk, giving 8 frames. The embedding model sees the last 76 frames (transformed x / 10 + 2),
// and once 16 embeddings exist the wake-word model scores them.
// After a reset the buffers are refilled by running 16 chunks (1.28 s) of silence through the models before the next
// real audio, as openWakeWord's Python library does at start-up, so the detector is not deaf while 16 embeddings build up.
// `push` must not be called again before its promise settles; callers serialize their calls.

export type WakeModels = {
	mel(samples: Float32Array): Promise<Float32Array>;
	embed(window: Float32Array): Promise<Float32Array>;
	score(features: Float32Array): Promise<number>;
};

export const CHUNK = 1280;
export const CONTEXT = 480;
const MEL_BINS = 32;
const MEL_WINDOW = 76;
const EMBED_SIZE = 96;
const FEATURE_FRAMES = 16;

export class WakeStream {
	private readonly models: WakeModels;
	private pending!: Float32Array;
	private context!: Float32Array;
	private mels!: Float32Array[];
	private features!: Float32Array[];
	private prefill = false;

	constructor(models: WakeModels) {
		this.models = models;
		this.clear();
	}

	private clear(): void {
		this.pending = new Float32Array(0);
		this.context = new Float32Array(CONTEXT);
		this.mels = Array.from({ length: MEL_WINDOW }, () => new Float32Array(MEL_BINS).fill(1));
		this.features = [];
	}

	// Forgets whatever audio came before, as if freshly constructed.
	reset(): void {
		this.clear();
		this.prefill = true;
	}

	// Runs one 80 ms chunk through the three models; the score is null until 16 embeddings exist.
	private async chunk(samples: Float32Array): Promise<number | null> {
		const input = new Float32Array(CONTEXT + CHUNK);
		input.set(this.context);
		input.set(samples, CONTEXT);
		this.context = input.slice(-CONTEXT);
		const frames = await this.models.mel(input);
		for (let f = 0; f + MEL_BINS <= frames.length; f += MEL_BINS) {
			this.mels.push(frames.slice(f, f + MEL_BINS).map((v) => v / 10 + 2));
		}
		this.mels = this.mels.slice(-MEL_WINDOW);
		const window = new Float32Array(MEL_WINDOW * MEL_BINS);
		this.mels.forEach((row, i) => window.set(row, i * MEL_BINS));
		this.features.push(await this.models.embed(window));
		this.features = this.features.slice(-FEATURE_FRAMES);
		if (this.features.length < FEATURE_FRAMES) return null;
		const x = new Float32Array(FEATURE_FRAMES * EMBED_SIZE);
		this.features.forEach((row, i) => x.set(row, i * EMBED_SIZE));
		return this.models.score(x);
	}

	// Scores for every whole chunk now available, oldest first.
	async push(samples: Int16Array): Promise<number[]> {
		if (this.prefill) {
			this.prefill = false;
			const silence = new Float32Array(CHUNK);
			for (let i = 0; i < FEATURE_FRAMES; i++) await this.chunk(silence);
		}
		const joined = new Float32Array(this.pending.length + samples.length);
		joined.set(this.pending);
		joined.set(samples, this.pending.length);
		const scores: number[] = [];
		let at = 0;
		for (; joined.length - at >= CHUNK; at += CHUNK) {
			const score = await this.chunk(joined.subarray(at, at + CHUNK));
			if (score !== null) scores.push(score);
		}
		this.pending = joined.slice(at);
		return scores;
	}
}

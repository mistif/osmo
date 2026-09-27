// The last few seconds of microphone audio, addressed by a running sample count,
// so the voice check can look back at the wake word after the detector heard it.

export class SampleRing {
	private readonly data: Int16Array;
	private written = 0;

	constructor(capacity: number) {
		this.data = new Int16Array(capacity);
	}

	// How many samples have ever been pushed. A past value marks a position in the stream.
	get total(): number {
		return this.written;
	}

	push(samples: Int16Array): void {
		for (let i = 0; i < samples.length; i++) this.data[(this.written + i) % this.data.length] = samples[i];
		this.written += samples.length;
	}

	// Samples from position `from` up to now. Audio that has already been overwritten is skipped.
	since(from: number): Int16Array {
		const start = Math.min(this.written, Math.max(from, this.written - this.data.length, 0));
		const out = new Int16Array(this.written - start);
		for (let i = 0; i < out.length; i++) out[i] = this.data[(start + i) % this.data.length];
		return out;
	}
}

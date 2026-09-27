// Microphones run at 44.1 or 48 kHz; the models want 16 kHz. Averages each output sample's span of input,
// and keeps its fractional position between chunks so time doesn't drift.

export class Downsampler {
	private readonly ratio: number;
	private carry = new Float32Array(0);
	private position = 0;

	constructor(fromRate: number, toRate = 16000) {
		if (fromRate < toRate) throw new Error(`Can't raise ${fromRate} Hz to ${toRate} Hz`);
		this.ratio = fromRate / toRate;
	}

	push(input: Float32Array): Float32Array {
		const buffer = new Float32Array(this.carry.length + input.length);
		buffer.set(this.carry);
		buffer.set(input, this.carry.length);
		const out: number[] = [];
		while (this.position + this.ratio <= buffer.length) {
			const start = Math.floor(this.position);
			const end = Math.floor(this.position + this.ratio);
			let sum = 0;
			for (let i = start; i < end; i++) sum += buffer[i];
			out.push(end > start ? sum / (end - start) : buffer[start]);
			this.position += this.ratio;
		}
		const used = Math.floor(this.position);
		this.carry = buffer.slice(used);
		this.position -= used;
		return Float32Array.from(out);
	}
}

export function toInt16(samples: Float32Array): Int16Array {
	return Int16Array.from(samples, (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767))));
}

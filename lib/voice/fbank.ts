// Kaldi-style log mel filterbank features, the input 3D-Speaker CAM++ was trained on:
// 25 ms frames every 10 ms, DC removed, pre-emphasis 0.97, Povey window, 512-point FFT, power spectrum,
// 80 mel bins from 20 Hz to 8 kHz, natural log; then each bin's mean over the recording is subtracted.
// Samples are 16 kHz on the -1..1 scale.

export const FBANK_BINS = 80;

const RATE = 16000;
const FRAME = 400;
const SHIFT = 160;
const FFT = 512;
const LOW_HZ = 20;
const HIGH_HZ = 8000;
const PREEMPH = 0.97;
const FLOOR = 1.1920929e-7; // float epsilon, as Kaldi uses

const mel = (hz: number) => 1127 * Math.log(1 + hz / 700);

const WINDOW = Float64Array.from({ length: FRAME }, (_, i) => Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)), 0.85));

// One triangle per bin over the FFT's frequencies: the first FFT bin it covers, and its weights from there.
const FILTERS = Array.from({ length: FBANK_BINS }, (_, b) => {
	const low = mel(LOW_HZ);
	const delta = (mel(HIGH_HZ) - low) / (FBANK_BINS + 1);
	const left = low + b * delta;
	const center = left + delta;
	const right = center + delta;
	const weights: number[] = [];
	let first = -1;
	for (let i = 0; i < FFT / 2; i++) {
		const m = mel((i * RATE) / FFT);
		if (m > left && m < right) {
			if (first < 0) first = i;
			weights.push(m <= center ? (m - left) / (center - left) : (right - m) / (right - center));
		}
	}
	return { first: Math.max(first, 0), weights: Float64Array.from(weights) };
});

function fftInPlace(re: Float64Array, im: Float64Array): void {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const angle = (-2 * Math.PI) / len;
		const wr = Math.cos(angle);
		const wi = Math.sin(angle);
		for (let i = 0; i < n; i += len) {
			let cr = 1;
			let ci = 0;
			for (let k = 0; k < len / 2; k++) {
				const a = i + k;
				const b = a + len / 2;
				const vr = re[b] * cr - im[b] * ci;
				const vi = re[b] * ci + im[b] * cr;
				re[b] = re[a] - vr;
				im[b] = im[a] - vi;
				re[a] += vr;
				im[a] += vi;
				const next = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = next;
			}
		}
	}
}

export function fbank(samples: Float32Array, options: { meanNormalize?: boolean } = {}): { feats: Float32Array; frames: number } {
	const frames = samples.length < FRAME ? 0 : 1 + Math.floor((samples.length - FRAME) / SHIFT);
	const feats = new Float32Array(frames * FBANK_BINS);
	const re = new Float64Array(FFT);
	const im = new Float64Array(FFT);
	for (let f = 0; f < frames; f++) {
		re.fill(0);
		im.fill(0);
		let mean = 0;
		for (let i = 0; i < FRAME; i++) {
			re[i] = samples[f * SHIFT + i];
			mean += re[i];
		}
		mean /= FRAME;
		for (let i = 0; i < FRAME; i++) re[i] -= mean;
		for (let i = FRAME - 1; i > 0; i--) re[i] -= PREEMPH * re[i - 1];
		re[0] -= PREEMPH * re[0];
		for (let i = 0; i < FRAME; i++) re[i] *= WINDOW[i];
		fftInPlace(re, im);
		for (let b = 0; b < FBANK_BINS; b++) {
			const { first, weights } = FILTERS[b];
			let energy = 0;
			for (let k = 0; k < weights.length; k++) {
				const i = first + k;
				energy += weights[k] * (re[i] * re[i] + im[i] * im[i]);
			}
			feats[f * FBANK_BINS + b] = Math.log(Math.max(energy, FLOOR));
		}
	}
	if (options.meanNormalize !== false && frames > 0) {
		for (let b = 0; b < FBANK_BINS; b++) {
			let sum = 0;
			for (let f = 0; f < frames; f++) sum += feats[f * FBANK_BINS + b];
			const binMean = sum / frames;
			for (let f = 0; f < frames; f++) feats[f * FBANK_BINS + b] -= binMean;
		}
	}
	return { feats, frames };
}

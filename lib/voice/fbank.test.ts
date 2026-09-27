import { describe, expect, it } from "vitest";
import { FBANK_BINS, fbank } from "./fbank";

const tone = (hz: number, seconds: number, amp = 0.5) =>
	Float32Array.from({ length: Math.round(16000 * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / 16000));

describe("fbank", () => {
	it("makes one frame per 10 ms after the first 25 ms", () => {
		expect(fbank(new Float32Array(16000)).frames).toBe(98);
		expect(fbank(new Float32Array(400)).frames).toBe(1);
		const short = fbank(new Float32Array(399));
		expect(short.frames).toBe(0);
		expect(short.feats.length).toBe(0);
	});

	it("puts a 1 kHz tone's energy in the mel bin around 1 kHz", () => {
		const { feats, frames } = fbank(tone(1000, 1), { meanNormalize: false });
		const average = Array.from({ length: FBANK_BINS }, (_, b) => {
			let sum = 0;
			for (let f = 0; f < frames; f++) sum += feats[f * FBANK_BINS + b];
			return sum / frames;
		});
		const peak = average.indexOf(Math.max(...average));
		expect([26, 27]).toContain(peak);
	});

	it("subtracts each bin's mean over the recording by default", () => {
		const { feats, frames } = fbank(tone(440, 1));
		for (let b = 0; b < FBANK_BINS; b++) {
			let sum = 0;
			for (let f = 0; f < frames; f++) sum += feats[f * FBANK_BINS + b];
			expect(Math.abs(sum / frames)).toBeLessThan(1e-3);
		}
	});

	it("stays finite on silence", () => {
		const { feats } = fbank(new Float32Array(8000), { meanNormalize: false });
		expect(feats.every((x) => Number.isFinite(x))).toBe(true);
	});
});

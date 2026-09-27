import { describe, expect, it } from "vitest";
import { readWav } from "./wav";

function wav(samples: number[], { rate = 16000, channels = 1, bits = 16, fmtSize = 16 } = {}) {
	const data = samples.length * 2;
	const buffer = new ArrayBuffer(12 + 8 + fmtSize + 8 + data);
	const view = new DataView(buffer);
	const tag = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
	tag(0, "RIFF");
	view.setUint32(4, buffer.byteLength - 8, true);
	tag(8, "WAVE");
	tag(12, "fmt ");
	view.setUint32(16, fmtSize, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * channels * 2, true);
	view.setUint16(32, channels * 2, true);
	view.setUint16(34, bits, true);
	const dataAt = 20 + fmtSize;
	tag(dataAt, "data");
	view.setUint32(dataAt + 4, data, true);
	samples.forEach((s, i) => view.setInt16(dataAt + 8 + i * 2, s, true));
	return new Uint8Array(buffer);
}

describe("readWav", () => {
	it("reads 16-bit mono samples and the rate", () => {
		const { rate, samples } = readWav(wav([1, -2, 300]));
		expect(rate).toBe(16000);
		expect(Array.from(samples)).toEqual([1, -2, 300]);
	});

	it("reads Windows' 18-byte format chunk", () => {
		expect(Array.from(readWav(wav([7, 8], { fmtSize: 18 })).samples)).toEqual([7, 8]);
	});

	it("rejects stereo and anything that isn't a WAV file", () => {
		expect(() => readWav(wav([1, 2], { channels: 2 }))).toThrow();
		expect(() => readWav(new Uint8Array(40))).toThrow();
	});
});

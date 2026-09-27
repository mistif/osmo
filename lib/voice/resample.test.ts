import { describe, expect, it } from "vitest";
import { Downsampler, toInt16 } from "./resample";

function feed(down: Downsampler, input: Float32Array, chunk = 128) {
	const parts: number[] = [];
	for (let at = 0; at < input.length; at += chunk) parts.push(...down.push(input.subarray(at, at + chunk)));
	return parts;
}

describe("Downsampler", () => {
	it("turns 48 kHz into 16 kHz across small chunks without drift", () => {
		const out = feed(new Downsampler(48000), new Float32Array(4800).fill(0.5));
		expect(Math.abs(out.length - 1600)).toBeLessThanOrEqual(1);
		expect(out.every((x) => Math.abs(x - 0.5) < 1e-6)).toBe(true);
	});

	it("keeps time at 44.1 kHz too", () => {
		const out = feed(new Downsampler(44100), new Float32Array(44100));
		expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(1);
	});

	it("passes 16 kHz through", () => {
		expect(feed(new Downsampler(16000), Float32Array.of(0.1, 0.2, 0.3))).toEqual([
			expect.closeTo(0.1, 6),
			expect.closeTo(0.2, 6),
			expect.closeTo(0.3, 6),
		]);
	});

	it("refuses to raise a lower rate", () => {
		expect(() => new Downsampler(8000)).toThrow();
	});
});

describe("toInt16", () => {
	it("scales and clamps", () => {
		expect(Array.from(toInt16(Float32Array.of(1.5, -1.5, 0, 0.5)))).toEqual([32767, -32768, 0, 16384]);
	});
});

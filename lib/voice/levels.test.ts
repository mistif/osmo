import { describe, expect, it } from "vitest";
import { readingDone, readingProblem, speechSeconds, trailingSilenceMs, trimSilence } from "./levels";

const RATE = 16000;
const tone = (seconds: number, amp = 0.3) =>
	Float32Array.from({ length: Math.round(RATE * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / RATE));
const silence = (seconds: number) => new Float32Array(Math.round(RATE * seconds));
const join = (...parts: Float32Array[]) => {
	const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
};

describe("speechSeconds", () => {
	it("counts the loud part of a recording", () => {
		expect(speechSeconds(tone(3))).toBeCloseTo(3, 1);
		expect(speechSeconds(join(silence(1), tone(2), silence(1)))).toBeCloseTo(2, 1);
	});
});

describe("readingProblem", () => {
	it("accepts two seconds of clear speech or more", () => {
		expect(readingProblem(tone(3))).toBeNull();
	});

	it("calls a whisper too quiet", () => {
		expect(readingProblem(tone(3, 0.005))).toBe("quiet");
	});

	it("calls one second of speech too short", () => {
		expect(readingProblem(join(tone(1), silence(2)))).toBe("short");
	});
});

describe("trailingSilenceMs", () => {
	it("measures the quiet after the last speech", () => {
		expect(trailingSilenceMs(join(tone(2), silence(1)))).toBeCloseTo(1000, -2);
		expect(trailingSilenceMs(tone(2))).toBe(0);
	});
});

describe("readingDone", () => {
	it("ends a reading after speech and 1.2 seconds of quiet", () => {
		expect(readingDone(join(tone(2), silence(1.3)))).toBe(true);
		expect(readingDone(join(tone(2), silence(0.5)))).toBe(false);
	});

	it("keeps waiting in silence, until the time limit", () => {
		expect(readingDone(silence(3))).toBe(false);
		expect(readingDone(silence(10))).toBe(true);
	});
});

describe("trimSilence", () => {
	it("cuts long silence around speech, keeping 100 ms on each side", () => {
		const trimmed = trimSilence(join(silence(1), tone(2), silence(1)));
		expect(trimmed.length / RATE).toBeCloseTo(2.2, 1);
	});

	it("is empty for a silent recording", () => {
		expect(trimSilence(silence(2)).length).toBe(0);
	});
});

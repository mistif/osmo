import { describe, expect, it } from "vitest";
import { CHUNK, CONTEXT, WakeStream, type WakeModels } from "./wake-stream";

function fakeModels() {
	const calls = { mel: [] as Float32Array[], embed: [] as Float32Array[], score: [] as Float32Array[] };
	const models: WakeModels = {
		mel: async (samples) => {
			calls.mel.push(samples.slice());
			return new Float32Array(8 * 32).fill(10);
		},
		embed: async (window) => {
			calls.embed.push(window.slice());
			return new Float32Array(96).fill(calls.embed.length);
		},
		score: async (features) => {
			calls.score.push(features.slice());
			return 0.5;
		},
	};
	return { models, calls };
}

const ramp = (length: number, from = 0) => Int16Array.from({ length }, (_, i) => from + i);

describe("WakeStream", () => {
	it("runs the mel model on 480 samples of context plus each new 80 ms chunk", async () => {
		const { models, calls } = fakeModels();
		const stream = new WakeStream(models);
		await stream.push(ramp(1000));
		expect(calls.mel).toHaveLength(0);
		await stream.push(ramp(1560, 1000));
		expect(calls.mel).toHaveLength(2);
		expect(calls.mel[0].length).toBe(CONTEXT + CHUNK);
		expect(Array.from(calls.mel[0].subarray(0, CONTEXT))).toEqual(new Array(CONTEXT).fill(0));
		expect(calls.mel[0][CONTEXT]).toBe(0);
		expect(Array.from(calls.mel[1].subarray(0, CONTEXT))).toEqual(Array.from(ramp(CONTEXT, CHUNK - CONTEXT)));
		expect(calls.mel[1][CONTEXT]).toBe(CHUNK);
	});

	it("gives the embedding model the last 76 mel frames, transformed like openWakeWord (x / 10 + 2)", async () => {
		const { models, calls } = fakeModels();
		await new WakeStream(models).push(ramp(CHUNK));
		const window = calls.embed[0];
		expect(window.length).toBe(76 * 32);
		expect(window[0]).toBe(1);
		expect(window[(76 - 9) * 32]).toBe(1);
		expect(window[(76 - 8) * 32]).toBe(3);
		expect(window[76 * 32 - 1]).toBe(3);
	});

	it("scores once 16 embeddings exist, then after every chunk, newest last", async () => {
		const { models, calls } = fakeModels();
		const scores = await new WakeStream(models).push(ramp(CHUNK * 20));
		expect(scores).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
		expect(calls.score[0].length).toBe(16 * 96);
		expect(calls.score[0][0]).toBe(1);
		expect(calls.score[0][16 * 96 - 1]).toBe(16);
	});

	it("starts over after a reset", async () => {
		const { models, calls } = fakeModels();
		const stream = new WakeStream(models);
		await stream.push(ramp(CHUNK));
		stream.reset();
		await stream.push(ramp(CHUNK));
		// Silence first, so the real chunk's context is the silence before it.
		expect(Array.from(calls.mel[1].subarray(0, CONTEXT))).toEqual(new Array(CONTEXT).fill(0));
		expect(calls.mel.at(-1)![CONTEXT]).toBe(0);
		expect(calls.embed[1][0]).toBe(1);
	});

	it("scores from the first chunk after a reset, because the buffer is prefilled with silence", async () => {
		const { models, calls } = fakeModels();
		const stream = new WakeStream(models);
		expect(await stream.push(ramp(CHUNK))).toEqual([]);
		stream.reset();
		const scores = await stream.push(ramp(CHUNK, 5000));
		expect(scores).toEqual([0.5]);
		// The scored window ends with the real chunk's features; the 15 before it came from silence.
		expect(calls.score.at(-1)!.length).toBe(16 * 96);
	});

	it("feeds the prefill as silence and never reports a score for it", async () => {
		const { models, calls } = fakeModels();
		const stream = new WakeStream(models);
		stream.reset();
		await stream.push(ramp(CHUNK, 7000));
		const silent = calls.mel.slice(0, -1);
		expect(silent.length).toBeGreaterThanOrEqual(16);
		for (const input of silent) expect(input.every((v) => v === 0)).toBe(true);
		expect(calls.mel.at(-1)![CONTEXT]).toBe(7000);
	});

	it("primes once per reset, not once per push", async () => {
		const { models, calls } = fakeModels();
		const stream = new WakeStream(models);
		stream.reset();
		await stream.push(ramp(CHUNK));
		const after = calls.mel.length;
		await stream.push(ramp(CHUNK));
		expect(calls.mel.length).toBe(after + 1);
	});
});

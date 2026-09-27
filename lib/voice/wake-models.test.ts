import { describe, expect, it } from "vitest";
import { wakeModels } from "./wake-models";

class FakeTensor {
	constructor(
		readonly type: string,
		readonly data: Float32Array,
		readonly dims: readonly number[],
	) {}
}

function session(input: string, output: string, result: Float32Array) {
	const feeds: FakeTensor[] = [];
	return {
		feeds,
		inputNames: [input],
		outputNames: [output],
		run: async (given: Record<string, unknown>) => {
			feeds.push(given[input] as FakeTensor);
			return { [output]: { data: result } };
		},
	};
}

describe("wakeModels", () => {
	it("shapes each model's input the way openWakeWord's models expect", async () => {
		const mel = session("input", "output", new Float32Array(8 * 32));
		const embed = session("input_1", "conv2d_19", new Float32Array(96));
		const keyword = session("x.1", "53", Float32Array.of(0.8));
		const models = wakeModels({ Tensor: FakeTensor }, { mel, embed, keyword });
		await models.mel(new Float32Array(1760));
		await models.embed(new Float32Array(76 * 32));
		expect(await models.score(new Float32Array(16 * 96))).toBeCloseTo(0.8);
		expect(mel.feeds[0].dims).toEqual([1, 1760]);
		expect(embed.feeds[0].dims).toEqual([1, 76, 32, 1]);
		expect(keyword.feeds[0].dims).toEqual([1, 16, 96]);
	});
});

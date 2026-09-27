import { describe, expect, it } from "vitest";
import { embedVoice } from "./speaker";

class FakeTensor {
	constructor(
		readonly type: string,
		readonly data: Float32Array,
		readonly dims: readonly number[],
	) {}
}

function fakeSession() {
	const feeds: Record<string, unknown>[] = [];
	return {
		feeds,
		inputNames: ["x"],
		outputNames: ["embedding"],
		run: async (input: Record<string, unknown>) => {
			feeds.push(input);
			return { embedding: { data: Float32Array.of(0.5, -0.25, 1) } };
		},
	};
}

describe("embedVoice", () => {
	it("feeds the model 80-bin features for every frame and returns its embedding", async () => {
		const session = fakeSession();
		const embedding = await embedVoice({ Tensor: FakeTensor }, session, new Float32Array(16000).fill(0.1));
		expect(embedding).toEqual([0.5, -0.25, 1]);
		const tensor = session.feeds[0].x as FakeTensor;
		expect(tensor.type).toBe("float32");
		expect(tensor.dims).toEqual([1, 98, 80]);
		expect(tensor.data.length).toBe(98 * 80);
	});

	it("refuses audio shorter than one frame", async () => {
		await expect(embedVoice({ Tensor: FakeTensor }, fakeSession(), new Float32Array(300))).rejects.toThrow();
	});
});

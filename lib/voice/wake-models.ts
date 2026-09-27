// The three openWakeWord models as a WakeModels, on any runtime shaped like onnxruntime-web.

import type { OrtLike, SessionLike } from "./runtime";
import type { WakeModels } from "./wake-stream";

export function wakeModels(ort: OrtLike, sessions: { mel: SessionLike; embed: SessionLike; keyword: SessionLike }): WakeModels {
	const run = async (session: SessionLike, data: Float32Array, dims: number[]) => {
		const outputs = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", data, dims) });
		return outputs[session.outputNames[0]].data as Float32Array;
	};
	return {
		mel: (samples) => run(sessions.mel, samples, [1, samples.length]),
		embed: (window) => run(sessions.embed, window, [1, 76, 32, 1]),
		score: async (features) => (await run(sessions.keyword, features, [1, 16, 96]))[0],
	};
}

// A voice embedding from 16 kHz samples (-1..1), using the speaker model's own features.
// The runtime is passed in, so the browser and the voice check share this code.

import { FBANK_BINS, fbank } from "./fbank";
import type { OrtLike, SessionLike } from "./runtime";

export async function embedVoice(ort: OrtLike, session: SessionLike, samples: Float32Array): Promise<number[]> {
	const { feats, frames } = fbank(samples);
	if (frames === 0) throw new Error("Too short to recognize a voice");
	const outputs = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", feats, [1, frames, FBANK_BINS]) });
	return Array.from(outputs[session.outputNames[0]].data as Float32Array);
}

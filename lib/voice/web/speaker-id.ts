// Gur's voice, or not: the speaker model loads on first use and stays loaded.

import { embedVoice } from "../speaker";
import { loadModel } from "./ort";

const SPEAKER_MODEL_URL = "/models/speaker/campplus-en.onnx";
let model: ReturnType<typeof loadModel> | null = null;

function speakerModel(): ReturnType<typeof loadModel> {
	if (!model) {
		model = loadModel(SPEAKER_MODEL_URL);
		model.catch(() => {
			model = null;
		});
	}
	return model;
}

// Starts the download now, so the first judgement doesn't wait for 29.6 MB. A failure is forgotten and retried on first use.
export function warmSpeakerModel(): void {
	speakerModel().catch(() => undefined);
}

// A voice embedding for 16 kHz samples on the -1..1 scale.
export async function voiceEmbedding(samples: Float32Array): Promise<number[]> {
	const { ort, session } = await speakerModel();
	return embedVoice(ort, session, samples);
}

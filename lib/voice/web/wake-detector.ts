// The "osmo" detector: openWakeWord's two feature models plus Gur's trained model, fed from the microphone.

import type { Detector } from "../engine";
import { WakeGate } from "../wake";
import { wakeModels } from "../wake-models";
import { WakeStream } from "../wake-stream";
import { loadModel } from "./ort";

export const WAKE_MODEL_URL = "/models/wake/osmo.onnx";

// The detector exists only once Gur has trained it (docs/osmo-wake-word.md).
export async function wakeWordTrained(): Promise<boolean> {
	try {
		return (await fetch(WAKE_MODEL_URL, { method: "HEAD" })).ok;
	} catch {
		return false;
	}
}

export async function createDetector(onWake: () => void): Promise<Detector> {
	const [mel, embed, keyword] = await Promise.all([
		loadModel("/models/wake/melspectrogram.onnx"),
		loadModel("/models/wake/embedding_model.onnx"),
		loadModel(WAKE_MODEL_URL),
	]);
	const stream = new WakeStream(wakeModels(mel.ort, { mel: mel.session, embed: embed.session, keyword: keyword.session }));
	const gate = new WakeGate();
	let queue: Promise<void> = Promise.resolve();
	return {
		feed(samples) {
			// One batch at a time, in order. A failed run is skipped rather than stopping the detector.
			queue = queue
				.then(async () => {
					for (const score of await stream.push(samples)) if (gate.feed(score, performance.now())) onWake();
				})
				.catch(() => undefined);
		},
		reset() {
			queue = queue.then(() => { stream.reset(); gate.reset(); }).catch(() => undefined);
		},
	};
}

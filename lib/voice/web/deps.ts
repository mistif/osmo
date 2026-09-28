// The browser's implementations of the engine's VoiceDeps. A laptop or phone app would provide its own.

import type { VoiceDeps } from "../engine";
import { chime } from "./chime";
import { openMic } from "./mic";
import { chosenVoice, say } from "./say";
import { voiceEmbedding } from "./speaker-id";
import { hear } from "./transcriber";
import { createDetector } from "./wake-detector";

export function webVoiceDeps(): VoiceDeps {
	return {
		now: () => Date.now(),
		later: (run, ms) => {
			const id = setTimeout(run, ms);
			return () => clearTimeout(id);
		},
		openMic,
		createDetector,
		hear,
		embed: voiceEmbedding,
		say: (text, hooks) => say(text, chosenVoice(), hooks),
		chime,
	};
}

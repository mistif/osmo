// Runs Osmo's real models on the Windows-voice clips (scripts/voice-clips.ps1): the speaker model must tell
// the voices apart fast enough, and the wake-word pipeline must fire on its phrase and nothing else.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-web";
import { beforeAll, describe, expect, it } from "vitest";
import { embedVoice } from "../lib/voice/speaker";
import { averagePrint, cosine, MATCH_THRESHOLD } from "../lib/voice/voiceprint";
import { WAKE } from "../lib/voice/wake";
import { wakeModels } from "../lib/voice/wake-models";
import { WakeStream } from "../lib/voice/wake-stream";
import { readWav } from "../lib/voice/wav";

ort.env.wasm.numThreads = 1;
const ROOT = process.cwd();
const CLIPS = join(ROOT, "scripts", "voice-clips");
const VOICES = ["David", "Mark", "Zira"];

const clip = (name: string) => {
	const { rate, samples } = readWav(new Uint8Array(readFileSync(join(CLIPS, `${name}.wav`))));
	if (rate !== 16000) throw new Error(`${name}.wav is ${rate} Hz, not 16000`);
	return samples;
};
const float = (samples: Int16Array) => Float32Array.from(samples, (s) => s / 32768);
const session = (path: string) => ort.InferenceSession.create(new Uint8Array(readFileSync(join(ROOT, path))));

beforeAll(() => {
	if (!existsSync(join(CLIPS, "David-1.wav"))) {
		throw new Error("No clips yet. Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/voice-clips.ps1");
	}
});

describe("speaker model (3D-Speaker CAM++)", () => {
	it("scores the same voice far above different voices, fast enough to judge every message", async () => {
		const speaker = await session("public/models/speaker/campplus-en.onnx");
		const embeddings: Record<string, number[]> = {};
		const times: number[] = [];
		for (const voice of VOICES) {
			for (const n of [1, 2, 3, 4, 5]) {
				const started = performance.now();
				embeddings[`${voice}-${n}`] = await embedVoice(ort, speaker, float(clip(`${voice}-${n}`)));
				times.push(performance.now() - started);
			}
		}
		const table = VOICES.map((voice) => {
			const print = averagePrint([1, 2, 3, 4].map((n) => embeddings[`${voice}-${n}`]));
			return Object.fromEntries(VOICES.map((other) => [other, Number(cosine(print, embeddings[`${other}-5`]).toFixed(2))]));
		});
		console.table(Object.fromEntries(VOICES.map((voice, i) => [`${voice}'s voiceprint`, table[i]])));
		times.sort((a, b) => a - b);
		console.log(`median judgement: ${times[Math.floor(times.length / 2)].toFixed(0)} ms`);
		VOICES.forEach((voice, i) =>
			VOICES.forEach((other) => {
				if (voice === other) expect(table[i][other]).toBeGreaterThan(0.8);
				else expect(table[i][other]).toBeLessThan(MATCH_THRESHOLD);
			}),
		);
		expect(times[Math.floor(times.length / 2)]).toBeLessThan(300);
	});
});

describe("wake word pipeline", () => {
	it("fires on its phrase and stays quiet on other speech", async () => {
		const trained = existsSync(join(ROOT, "public/models/wake/osmo.onnx"));
		const keywordPath = trained ? "public/models/wake/osmo.onnx" : "scripts/voice-clips/hey_jarvis_v0.1.onnx";
		const positives = trained ? ["David-osmo", "Mark-osmo", "Zira-osmo"] : ["hey-jarvis"];
		const negatives = trained ? ["David-2", "Mark-3", "Zira-4"] : ["hey-travis", "David-2"];
		const [mel, embed, keyword] = await Promise.all([
			session("public/models/wake/melspectrogram.onnx"),
			session("public/models/wake/embedding_model.onnx"),
			session(keywordPath),
		]);
		const best = async (name: string) => {
			const stream = new WakeStream(wakeModels(ort, { mel, embed, keyword }));
			const speech = clip(name);
			const padded = new Int16Array(16000 + speech.length + 16000);
			padded.set(speech, 16000);
			let top = 0;
			for (let at = 0; at < padded.length; at += 1000) {
				for (const score of await stream.push(padded.subarray(at, at + 1000))) top = Math.max(top, score);
			}
			return top;
		};
		for (const name of positives) {
			const score = await best(name);
			console.log(`${name}: ${score.toFixed(3)}`);
			expect(score).toBeGreaterThanOrEqual(WAKE.threshold);
		}
		for (const name of negatives) {
			const score = await best(name);
			console.log(`${name}: ${score.toFixed(3)}`);
			expect(score).toBeLessThan(0.5);
		}
	});
});

// The one microphone stream: 16 kHz mono int16 in small batches, with the last 12 seconds kept for the voice check.

import { MicError, type MicHandle } from "../engine";
import { Downsampler, toInt16 } from "../resample";
import { SampleRing } from "../ring";

// The wake detector and the speaker check hear the raw microphone: Chrome's noise suppression and automatic gain smear
// a quickly said "Osmo" (the detector was trained on clean clips) and shift the level the speaker model scores.
// Only one stream is needed. The recognizer is the browser's Web Speech API, which opens its own capture with the
// browser's usual processing, so it keeps the processed audio without a second track from us.
// Trade-off: raw audio is quieter and noisier in a loud room, which the detector and speaker model now see as it is.
// Echo cancellation is off too; it only mattered while Osmo spoke, and the mic is closed then.
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
	channelCount: 1,
	echoCancellation: false,
	noiseSuppression: false,
	autoGainControl: false,
};

export async function openMic(onAudio: (samples: Int16Array) => void): Promise<MicHandle> {
	if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
		throw new MicError("unavailable");
	}
	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
	} catch (error) {
		const name = error instanceof DOMException ? error.name : "";
		throw new MicError(name === "NotAllowedError" || name === "SecurityError" ? "blocked" : "unavailable");
	}
	let context: AudioContext | null = null;
	try {
		context = new AudioContext();
		await context.audioWorklet.addModule("/voice/pcm-worklet.js");
		const source = context.createMediaStreamSource(stream);
		const tap = new AudioWorkletNode(context, "pcm-tap");
		const down = new Downsampler(context.sampleRate);
		const ring = new SampleRing(16000 * 12);
		tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
			const samples = toInt16(down.push(event.data));
			ring.push(samples);
			onAudio(samples);
		};
		source.connect(tap);
		// The tap's output is silence; connecting it keeps the browser pulling audio through it.
		tap.connect(context.destination);
		const audio = context;
		// A context that isn't allowed to start yet keeps its resume promise pending, so never wait on it:
		// ask now, and again on the next tap, which is what unlocks it.
		const wake = () => {
			if (audio.state === "suspended") void audio.resume().catch(() => undefined);
		};
		wake();
		document.addEventListener("pointerdown", wake);
		return {
			ring,
			close() {
				tap.port.onmessage = null;
				source.disconnect();
				tap.disconnect();
				stream.getTracks().forEach((track) => track.stop());
				document.removeEventListener("pointerdown", wake);
				void audio.close();
			},
		};
	} catch {
		// Whatever failed after permission was granted, the microphone must not stay open.
		stream.getTracks().forEach((track) => track.stop());
		void context?.close();
		throw new MicError("unavailable");
	}
}

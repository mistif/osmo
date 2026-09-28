// The one microphone stream: 16 kHz mono int16 in small batches, with the last 12 seconds kept for the voice check.

import { MicError, type MicHandle } from "../engine";
import { Downsampler, toInt16 } from "../resample";
import { SampleRing } from "../ring";

export async function openMic(onAudio: (samples: Int16Array) => void): Promise<MicHandle> {
	if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
		throw new MicError("unavailable");
	}
	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({
			audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
		});
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
		if (context.state === "suspended") await context.resume().catch(() => undefined);
		const audio = context;
		return {
			ring,
			close() {
				tap.port.onmessage = null;
				source.disconnect();
				tap.disconnect();
				stream.getTracks().forEach((track) => track.stop());
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

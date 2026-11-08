// The browser's side of Osmo's cloud voice: fetching a sentence's audio (cache first), playing it,
// and choosing between the cloud voice and the device's own. The sequencing itself lives in
// ../cloud-say.ts, which has no browser in it.

import { ensureSession } from "@/lib/supabase";
import { createCloudSay, type Clip } from "../cloud-say";
import type { SayHooks, Spoken } from "../engine";
import { cacheKey, type SpeechTone } from "../tts";
import { chosenVoice, say } from "./say";
import { getVoiceSettings } from "./settings-store";
import { cachedClip, keepClip } from "./tts-cache";

const tone: SpeechTone = "composed";

// Set when /api/speak says there's no key, so a device without one asks only once a visit.
let noKey = false;

async function fetchClip(text: string, forTone: SpeechTone, signal: AbortSignal): Promise<Blob> {
	const key = cacheKey(text, forTone);
	const kept = await cachedClip(key);
	if (kept) return kept;
	const session = await ensureSession();
	if (!session) throw new Error("not signed in");
	const response = await fetch("/api/speak", {
		method: "POST",
		signal,
		headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
		body: JSON.stringify({ text, tone: forTone }),
	});
	// No key (503), not the owner (403) or the day's cap reached (429): the device's voice takes over,
	// and this visit stops asking.
	if (response.status === 503 || response.status === 403 || response.status === 429) {
		noKey = true;
		throw new Error("no key");
	}
	if (!response.ok) throw new Error(`speak ${response.status}`);
	const blob = await response.blob();
	// Keeping it is a bonus, never something this waits on.
	void keepClip(key, blob);
	return blob;
}

function playBlob(blob: Blob): Promise<Clip> {
	const url = URL.createObjectURL(blob);
	const audio = new Audio(url);
	let settle: () => void = () => {};
	const ended = new Promise<void>((resolve) => {
		settle = resolve;
	});
	// Whichever comes first, the URL is released exactly once and the clip is over.
	const done = (): void => {
		URL.revokeObjectURL(url);
		settle();
	};
	audio.addEventListener("ended", done, { once: true });
	audio.addEventListener("error", done, { once: true });
	return audio.play().then(() => ({
		duration: () => audio.duration,
		currentTime: () => audio.currentTime,
		stop: () => {
			audio.pause();
			done();
		},
		ended,
	}));
}

const cloudSay = createCloudSay({
	clip: fetchClip,
	play: playBlob,
	later: (run, ms) => {
		const id = setTimeout(run, ms);
		return () => clearTimeout(id);
	},
	frames: (run) => {
		let id = requestAnimationFrame(function step() {
			run();
			id = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(id);
	},
	tone: () => tone,
	fallback: (text, hooks) => say(text, chosenVoice(), hooks),
});

// An iPhone only plays audio that a tap started. This is called from the same taps that unlock
// speech, so the first spoken reply isn't swallowed.
export function unlockCloudAudio(): void {
	if (typeof Audio === "undefined") return;
	try {
		const primer = new Audio();
		primer.muted = true;
		void primer.play().catch(() => {});
	} catch {
		// Nothing to unlock on this device.
	}
}

// Whether the cloud voice can be used for this reply at all.
export function cloudVoiceReady(): boolean {
	return getVoiceSettings().naturalVoice && !noKey && typeof Audio !== "undefined";
}

// What deps.ts hands the engine: the cloud voice when it's on and usable, the device's voice otherwise.
export function speakReply(text: string, hooks: SayHooks): Spoken {
	if (cloudVoiceReady()) return cloudSay(text, hooks);
	return say(text, chosenVoice(), hooks);
}

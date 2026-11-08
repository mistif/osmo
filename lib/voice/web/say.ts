// Osmo's spoken voice: the device's speech synthesis, with word timing for the circle.

import type { SayHooks, Spoken } from "../engine";
import { pickVoice, VOICE_SETTINGS, wordEnd } from "../voices";

let chosen: SpeechSynthesisVoice | null = null;
let current: SpeechSynthesisUtterance | null = null;

function speechAvailable(): boolean {
	return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Chrome fills the voice list asynchronously, so wait for it once (at most 1.5 s).
function voices(): Promise<SpeechSynthesisVoice[]> {
	const now = window.speechSynthesis.getVoices();
	if (now.length > 0) return Promise.resolve(now);
	return new Promise((resolve) => {
		const done = () => resolve(window.speechSynthesis.getVoices());
		window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
		setTimeout(done, 1500);
	});
}

export async function chooseVoice(): Promise<SpeechSynthesisVoice | null> {
	if (!speechAvailable()) return null;
	chosen = pickVoice(await voices());
	return chosen;
}

export const chosenVoice = (): SpeechSynthesisVoice | null => chosen;

// An iPhone only lets a page speak after a tap has started speech once; a silent line does that.
export function unlockSpeech(): void {
	if (speechAvailable()) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

export function say(text: string, voice: SpeechSynthesisVoice | null, hooks: SayHooks): Spoken {
	const synth = window.speechSynthesis;
	// The previous line's handlers go first, so its ending can't be mistaken for this one's.
	if (current) {
		current.onboundary = null;
		current.onend = null;
		current.onerror = null;
	}
	synth.cancel();
	const utterance = new SpeechSynthesisUtterance(text);
	if (voice) {
		utterance.voice = voice;
		utterance.lang = voice.lang;
	}
	utterance.rate = VOICE_SETTINGS.rate;
	utterance.pitch = VOICE_SETTINGS.pitch;
	let ended = false;
	const end = () => {
		if (ended) return;
		ended = true;
		if (current === utterance) current = null;
		hooks.onEnd();
	};
	utterance.onboundary = (event) => {
		if (event.name === "sentence") return;
		hooks.onWord(event.charIndex, event.charLength ? event.charIndex + event.charLength : wordEnd(text, event.charIndex));
	};
	utterance.onend = end;
	utterance.onerror = end;
	current = utterance;
	synth.speak(utterance);
	return {
		cancel() {
			utterance.onboundary = null;
			synth.cancel();
			end();
		},
	};
}

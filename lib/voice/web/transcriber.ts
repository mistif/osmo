// Turning Gur's speech into text with the browser's own recognizer, on the device where Chrome can.
// TypeScript's DOM types don't include speech recognition yet, so the few parts used are typed here.

import type { HearHooks, Hearing } from "../engine";
import { heardEnough } from "../utterance";

type Alternative = { transcript: string };
type Result = { isFinal: boolean; length: number; [index: number]: Alternative };
type ResultEvent = { resultIndex: number; results: { length: number; [index: number]: Result } };
type Recognizer = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	processLocally?: boolean;
	onresult: ((event: ResultEvent) => void) | null;
	onspeechstart: (() => void) | null;
	onerror: ((event: { error: string }) => void) | null;
	onend: (() => void) | null;
	start(): void;
	stop(): void;
	abort(): void;
};
type Options = { langs: string[]; processLocally: boolean };
type RecognizerClass = {
	new (): Recognizer;
	available?(options: Options): Promise<string>;
	install?(options: Options): Promise<boolean>;
};

const LANG = "en-US";

function recognizerClass(): RecognizerClass | null {
	if (typeof window === "undefined") return null;
	const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Chrome, Edge and Safari can listen; Firefox can't.
export const canListen = (): boolean => recognizerClass() !== null;

let local: Promise<boolean> | null = null;

// Chrome can recognize English entirely on the device once its offline pack is installed; it installs it when it can.
function preferOnDevice(): Promise<boolean> {
	if (!local) {
		local = (async () => {
			const R = recognizerClass();
			if (!R?.available) return false;
			try {
				const options = { langs: [LANG], processLocally: true };
				const status = await R.available(options);
				if (status === "available") return true;
				if ((status === "downloadable" || status === "downloading") && R.install) return await R.install(options);
			} catch {
				// Fall back to the browser's default recognizer.
			}
			return false;
		})();
	}
	return local;
}

export async function hear(hooks: HearHooks): Promise<Hearing> {
	const R = recognizerClass();
	if (!R) {
		hooks.onProblem("other");
		return { stop() {}, abort() {} };
	}
	const onDevice = await preferOnDevice();
	const recognizer = new R();
	recognizer.lang = LANG;
	recognizer.continuous = false;
	recognizer.interimResults = true;
	if (onDevice) recognizer.processLocally = true;

	let text = "";
	let lastChange: number | null = null;
	let spoke = false;
	let finished = false;
	let failed = false;
	const speech = () => {
		if (spoke) return;
		spoke = true;
		hooks.onSpeech();
	};
	const timer = setInterval(() => {
		if (heardEnough(lastChange, Date.now())) recognizer.stop();
	}, 200);

	recognizer.onspeechstart = speech;
	recognizer.onresult = (event) => {
		speech();
		let all = "";
		for (let i = 0; i < event.results.length; i++) all += event.results[i][0].transcript;
		if (all !== text) {
			text = all;
			lastChange = Date.now();
			hooks.onText(text);
		}
	};
	recognizer.onerror = (event) => {
		if (event.error === "no-speech" || event.error === "aborted") return;
		failed = true;
		hooks.onProblem(
			event.error === "not-allowed" || event.error === "service-not-allowed"
				? "blocked"
				: event.error === "audio-capture"
					? "audio"
					: event.error === "network"
						? "network"
						: "other",
		);
	};
	recognizer.onend = () => {
		clearInterval(timer);
		if (finished) return;
		finished = true;
		if (!failed) hooks.onDone(text.trim());
	};
	try {
		recognizer.start();
	} catch {
		clearInterval(timer);
		finished = true;
		hooks.onProblem("other");
	}
	return {
		stop: () => recognizer.stop(),
		abort: () => {
			finished = true;
			clearInterval(timer);
			recognizer.abort();
		},
	};
}

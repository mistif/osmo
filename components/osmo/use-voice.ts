"use client";

// The room's side of Osmo's voice: one VoiceEngine for the page, fed by the device settings, Gur's voiceprints
// and whether the wake word has been trained.

import { useEffect, useState, useSyncExternalStore } from "react";
import { VoiceEngine, type SendText, type SpeechHooks, type VoiceView } from "@/lib/voice/engine";
import { initialVoice, micOpen } from "@/lib/voice/machine";
import { displayVoiceName } from "@/lib/voice/voices";
import type { Voiceprint } from "@/lib/voice/voiceprint";
import { webVoiceDeps } from "@/lib/voice/web/deps";
import { chooseVoice, unlockSpeech } from "@/lib/voice/web/say";
import { cloudVoiceReady, unlockCloudAudio } from "@/lib/voice/web/say-cloud";
import { getVoiceSettings, serverVoiceSettings, setVoiceSettings, subscribeVoiceSettings } from "@/lib/voice/web/settings-store";
import { canListen } from "@/lib/voice/web/transcriber";
import { forgetVoiceprints, loadVoiceprints } from "@/lib/voice/web/voiceprints";
import { wakeWordTrained } from "@/lib/voice/web/wake-detector";

// Why Settings is teaching his voice: the listening switch, the mic button, or Gur asked.
export type TeachingReason = "listen" | "mic" | "settings";

const noSubscription = () => () => {};

// An iPhone only speaks and only plays audio after a tap has started each once. Both are unlocked
// together, from the same taps, so either voice can be the one that answers.
function unlockVoices(): void {
	unlockSpeech();
	unlockCloudAudio();
}

export function useVoice(options: { speech: SpeechHooks; sendTextRef: { current: SendText | null }; openSettings(): void }) {
	const settings = useSyncExternalStore(subscribeVoiceSettings, getVoiceSettings, serverVoiceSettings);
	// False on the server and while hydrating, then the browser's real answer.
	const listenSupported = useSyncExternalStore(noSubscription, canListen, () => false);
	const [voice, setVoice] = useState<SpeechSynthesisVoice | null | undefined>(undefined);
	const [prints, setPrints] = useState<Voiceprint[] | "error" | null>(null);
	const [wakeReady, setWakeReady] = useState<boolean | null>(null);
	const [teaching, setTeaching] = useState<TeachingReason | null>(null);
	const [view, setView] = useState<VoiceView>(() => ({ state: initialVoice(), liveText: null, error: null }));
	const [engine] = useState(() => new VoiceEngine(webVoiceDeps(), setView));

	useEffect(() => {
		let live = true;
		async function load() {
			const [voiceResult, printsResult, wakeResult] = await Promise.allSettled([chooseVoice(), loadVoiceprints(), wakeWordTrained()]);
			if (!live) return;
			setVoice(voiceResult.status === "fulfilled" ? voiceResult.value : null);
			setPrints(printsResult.status === "fulfilled" ? (printsResult.value ?? "error") : "error");
			setWakeReady(wakeResult.status === "fulfilled" ? wakeResult.value : false);
		}
		void load();
		return () => {
			live = false;
		};
	}, []);

	const { speech, sendTextRef, openSettings } = options;
	useEffect(() => {
		engine.configure({
			// Listening waits for the voiceprints to load, so a slow load never reads as "not taught".
			// Off while teaching: one of the sentences says his name, and his reply would end up in the reading.
			listen: settings.listen && listenSupported && Array.isArray(prints) && teaching === null,
			wakeReady: wakeReady === true,
			prints: Array.isArray(prints) ? prints : [],
			// The cloud voice can speak on a device that has no English voice of its own.
			canSpeak: voice != null || (settings.naturalVoice && cloudVoiceReady()),
			speakTyped: settings.speakTyped,
			// Read at call time, so a message always goes through the room's latest sendText.
			sendText: (text, sendOptions) => sendTextRef.current?.(text, sendOptions) ?? false,
			speech,
			listenOff: () => setVoiceSettings({ listen: false }),
			needTeaching: () => {
				setTeaching("mic");
				openSettings();
			},
		});
	});

	useEffect(() => {
		const onVisibility = () => engine.visibility(document.hidden);
		// The page may already be hidden when the room mounts.
		onVisibility();
		document.addEventListener("visibilitychange", onVisibility);
		const ticking = setInterval(engine.tick, 250);
		return () => {
			document.removeEventListener("visibilitychange", onVisibility);
			clearInterval(ticking);
			engine.dispose();
		};
	}, [engine]);

	async function refreshPrints() {
		const list = await loadVoiceprints();
		setPrints(list ?? "error");
	}

	return {
		mode: view.state.mode,
		micOpen: micOpen(view.state),
		liveText: view.liveText,
		error: view.error,
		listening: settings.listen,
		speakTyped: settings.speakTyped,
		naturalVoice: settings.naturalVoice,
		showChat: settings.showChat,
		fadeSaid: settings.fadeSaid,
		// undefined while checking, null when the device has no English voice.
		voiceName: voice === undefined ? undefined : voice ? displayVoiceName(voice.name) : null,
		listenSupported,
		wakeReady,
		prints,
		teaching,
		onReply: engine.onReply,
		// The last 50 speaker checks (score, verdict, threshold), oldest first, for Settings to show later.
		lastJudgements: engine.lastJudgements,
		stop: engine.stop,
		micPress() {
			unlockVoices();
			engine.micPress();
		},
		setListen(on: boolean) {
			unlockVoices();
			engine.clearError();
			if (on && !(Array.isArray(prints) && prints.length > 0)) {
				setTeaching("listen");
				return;
			}
			setVoiceSettings({ listen: on });
		},
		setSpeakTyped(on: boolean) {
			unlockVoices();
			setVoiceSettings({ speakTyped: on });
		},
		setNaturalVoice(on: boolean) {
			unlockVoices();
			setVoiceSettings({ naturalVoice: on });
		},
		setShowChat: (on: boolean) => setVoiceSettings({ showChat: on }),
		setFadeSaid: (on: boolean) => setVoiceSettings({ fadeSaid: on }),
		startTeaching() {
			setTeaching("settings");
		},
		async finishTeaching(saved: boolean) {
			const reason = teaching;
			setTeaching(null);
			await refreshPrints();
			if (saved && reason === "listen") setVoiceSettings({ listen: true });
		},
		async forgetVoice(): Promise<boolean> {
			const done = await forgetVoiceprints();
			if (done) {
				setVoiceSettings({ listen: false });
				await refreshPrints();
			}
			return done;
		},
	};
}

export type VoiceControls = ReturnType<typeof useVoice>;

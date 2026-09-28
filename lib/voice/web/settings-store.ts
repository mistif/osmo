// The per-device voice settings in localStorage, as an external store for useSyncExternalStore.
// If storage is unavailable (a private window), they're kept in memory for this visit.

import { DEFAULT_VOICE_SETTINGS, parseVoiceSettings, type VoiceSettings } from "../settings";

const KEY = "osmo-voice";
const listeners = new Set<() => void>();
let memory: string | null = null;
let cachedRaw: string | null | undefined;
let cached: VoiceSettings = DEFAULT_VOICE_SETTINGS;

function readRaw(): string | null {
	try {
		return window.localStorage.getItem(KEY) ?? memory;
	} catch {
		return memory;
	}
}

export function getVoiceSettings(): VoiceSettings {
	const raw = readRaw();
	if (raw !== cachedRaw) {
		cachedRaw = raw;
		cached = parseVoiceSettings(raw);
	}
	return cached;
}

export function serverVoiceSettings(): VoiceSettings {
	return DEFAULT_VOICE_SETTINGS;
}

export function subscribeVoiceSettings(listener: () => void): () => void {
	listeners.add(listener);
	window.addEventListener("storage", listener);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", listener);
	};
}

export function setVoiceSettings(patch: Partial<VoiceSettings>): void {
	const raw = JSON.stringify({ ...getVoiceSettings(), ...patch });
	memory = raw;
	try {
		window.localStorage.setItem(KEY, raw);
	} catch {
		// Kept in memory for this visit.
	}
	listeners.forEach((listener) => listener());
}

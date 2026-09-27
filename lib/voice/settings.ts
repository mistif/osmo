// The per-device voice settings as saved in localStorage. Anything unreadable falls back to off.

export type VoiceSettings = { listen: boolean; speakTyped: boolean };

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { listen: false, speakTyped: false };

export function parseVoiceSettings(raw: string | null): VoiceSettings {
	if (!raw) return DEFAULT_VOICE_SETTINGS;
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_VOICE_SETTINGS;
		const saved = value as Record<string, unknown>;
		return { listen: saved.listen === true, speakTyped: saved.speakTyped === true };
	} catch {
		return DEFAULT_VOICE_SETTINGS;
	}
}

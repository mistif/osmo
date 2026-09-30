// The per-device voice settings as saved in localStorage. Anything unreadable falls back to off.

// `naturalVoice` sends the text of his replies to OpenAI to be spoken. It is off until Gur turns
// it on, so a device that has never been asked keeps the built-in voice.
// `showChat` shows the conversation as text with a box to type in; off, the room is voice only: him,
// his subtitles, and the mic. `fadeSaid` fades his subtitle a moment after he finishes; off, it stays.
export type VoiceSettings = { listen: boolean; speakTyped: boolean; naturalVoice: boolean; showChat: boolean; fadeSaid: boolean };

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { listen: false, speakTyped: false, naturalVoice: false, showChat: false, fadeSaid: false };

export function parseVoiceSettings(raw: string | null): VoiceSettings {
	if (!raw) return DEFAULT_VOICE_SETTINGS;
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_VOICE_SETTINGS;
		const saved = value as Record<string, unknown>;
		return {
			listen: saved.listen === true,
			speakTyped: saved.speakTyped === true,
			naturalVoice: saved.naturalVoice === true,
			showChat: saved.showChat === true,
			fadeSaid: saved.fadeSaid === true,
		};
	} catch {
		return DEFAULT_VOICE_SETTINGS;
	}
}

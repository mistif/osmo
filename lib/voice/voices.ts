// Which built-in voice Osmo speaks with, and how fast his words go by.
// Calm, British and male where the device has one; on-device voices first, so his replies aren't sent to a speech service.

export type VoiceInfo = { name: string; lang: string; localService: boolean };

// A steady voice: normal speed, a touch lower than the default pitch.
export const VOICE_SETTINGS = { rate: 1, pitch: 0.95 } as const;

// When a device reports no word timing, his text types out at roughly the speed he speaks (14 characters a second).
export const SPEECH_CHAR_MS = Math.round(1000 / 14);

const MALE_NAMES = [
	"daniel", "george", "arthur", "oliver", "ryan", "thomas", "alfie",
	"david", "mark", "guy", "james", "alex", "fred", "aaron", "tom",
	"eric", "roger", "christopher", "andrew", "brian", "steffan", "gordon",
];

const langTag = (lang: string) => lang.replace("_", "-").toLowerCase();
const english = (v: VoiceInfo) => langTag(v.lang).startsWith("en");
const british = (v: VoiceInfo) => langTag(v.lang) === "en-gb";
const american = (v: VoiceInfo) => langTag(v.lang) === "en-us";

export function isMaleVoice(name: string): boolean {
	const n = name.toLowerCase();
	if (/\bfemale\b/.test(n)) return false;
	if (/\bmale\b/.test(n)) return true;
	return MALE_NAMES.some((m) => new RegExp(`\\b${m}\\b`).test(n));
}

// The spec's order: on-device British man, on-device British, on-device American man, on-device English, any English.
const TIERS: ((v: VoiceInfo) => boolean)[] = [
	(v) => v.localService && british(v) && isMaleVoice(v.name),
	(v) => v.localService && british(v),
	(v) => v.localService && american(v) && isMaleVoice(v.name),
	(v) => v.localService && english(v),
	(v) => english(v),
];

export function pickVoice<T extends VoiceInfo>(voices: readonly T[]): T | null {
	for (const fits of TIERS) {
		const voice = voices.find(fits);
		if (voice) return voice;
	}
	return null;
}

// Where the word starting at `start` ends, for devices that report a word's start but not its length.
export function wordEnd(text: string, start: number): number {
	const match = /^\S+/.exec(text.slice(start));
	return start + (match ? match[0].length : 1);
}

// "Microsoft George - English (United Kingdom)" reads as "Microsoft George" in Settings.
export function displayVoiceName(name: string): string {
	return name.replace(/\s*-\s*English\b.*$/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// What Osmo's cloud voice sounds like, and the sums the browser needs to move the circle with it.
// Pure, so the delivery and the timing can be tested without a network or a speaker.

// How he delivers a line. "grave" is rare: see speechTone below.
export type SpeechTone = "composed" | "grave";

// OpenAI's speech model. `gpt-4o-mini-tts` is the one that takes `instructions`; the dated
// snapshots (for example gpt-4o-mini-tts-2025-12-15) can be pinned here if the alias ever drifts.
export const TTS_MODEL = "gpt-4o-mini-tts";
// A male voice that holds the British accent the instructions ask for. Gur chose it over ash and onyx
// on 2026-09-30 from samples of the same line.
export const TTS_VOICE = "fable";
// A shade quicker than default. Gur heard the default and asked for faster.
export const TTS_SPEED = 1.15;
// Bump this whenever an instruction below changes, or cached audio outlives the change.
export const INSTRUCTIONS_VERSION = 1;

// Gur's steer: he's JARVIS, so he stays himself, and only goes out of line if something is really bad.
// The first string asks for life and pace on purpose. An earlier version asked for "measured" and
// "slightly slower", and that is exactly what sounded robotic.
export const TONE_INSTRUCTIONS: Record<SpeechTone, string> = {
	composed:
		"Speak like a real person mid-conversation: British, Received Pronunciation, warm and quick-witted. " +
		"Easy natural pace with light variation in pitch and emphasis - not flat, not slow. " +
		"Clip your sentences the way people actually talk. Assured and dry, never theatrical, never plodding.",
	grave:
		"Speak like a real person mid-conversation: British, Received Pronunciation, quietly warm. " +
		"A little lower and slower than usual, quieter, carrying weight - something serious has been said. " +
		"Still composed and dry: no audible emotion, no theatricality, no performance of sadness.",
};

// He only drops to "grave" when the mood is clearly negative *and* strongly felt, so an ordinary
// gloomy exchange doesn't move his voice. Both come from `moodTheme`.
export const GRAVE_VALENCE = -0.45;
export const GRAVE_STRENGTH = 0.6;

export function speechTone(valence: number, strength: number): SpeechTone {
	if (!Number.isFinite(valence) || !Number.isFinite(strength)) return "composed";
	return valence <= GRAVE_VALENCE && strength >= GRAVE_STRENGTH ? "grave" : "composed";
}

// What the audio for a line depends on. Everything that changes the sound is in the key, so a
// changed voice, speed, model or instruction can never be answered with the old clip.
// The whole string is the key: an IndexedDB key may be long, and no hash means no collisions.
export function cacheKey(text: string, tone: SpeechTone): string {
	return `${INSTRUCTIONS_VERSION}|${TTS_MODEL}|${TTS_VOICE}|${TTS_SPEED}|${tone}|${text}`;
}

// How much of his voice one device keeps. Clips are small; these are generous.
export const MAX_CACHE_ENTRIES = 300;
export const MAX_CACHE_BYTES = 20 * 1024 * 1024;

export type CacheEntry = { key: string; bytes: number; usedAt: number };

// Which clips to drop to get back under both limits: the longest unused first.
export function evictions(
	entries: readonly CacheEntry[],
	maxEntries = MAX_CACHE_ENTRIES,
	maxBytes = MAX_CACHE_BYTES,
): string[] {
	const oldestFirst = [...entries].sort((a, b) => a.usedAt - b.usedAt);
	let count = entries.length;
	let bytes = entries.reduce((total, entry) => total + entry.bytes, 0);
	const drop: string[] = [];
	for (const entry of oldestFirst) {
		if (count <= maxEntries && bytes <= maxBytes) break;
		drop.push(entry.key);
		count -= 1;
		bytes -= entry.bytes;
	}
	return drop;
}

export type WordSpan = { start: number; end: number };

// Where each word sits in a line, for the room's word-by-word reveal.
export function wordSpans(text: string): WordSpan[] {
	const spans: WordSpan[] = [];
	for (const match of text.matchAll(/\S+/g)) {
		spans.push({ start: match.index, end: match.index + match[0].length });
	}
	return spans;
}

// How many of those words the audio has passed, given how far through the clip it is.
// Characters stand in for time: close enough word to word, and it self-corrects every frame
// because the real `currentTime` drives `progress`.
export function wordsSpokenBy(spans: readonly WordSpan[], textLength: number, progress: number): number {
	if (!Number.isFinite(progress) || progress <= 0) return 0;
	if (progress >= 1) return spans.length;
	const spoken = progress * textLength;
	let count = 0;
	while (count < spans.length && spans[count].end <= spoken) count += 1;
	return count;
}

// What Osmo's cloud voice sounds like, and the sums the browser needs to move the circle with it.
// Pure, so the delivery and the timing can be tested without a network or a speaker.

// How he delivers a line. "grave" is rare: see speechTone below.
export type SpeechTone = "composed" | "grave";

// OpenAI's speech model. `gpt-4o-mini-tts` is the one that takes `instructions`; the dated
// snapshots (for example gpt-4o-mini-tts-2025-12-15) can be pinned here if the alias ever drifts.
export const TTS_MODEL = "gpt-4o-mini-tts";
// A male voice that holds the British accent the instructions ask for. Gur chose it over ash and onyx
// on 2026-09-30 from samples of the same line, and again over onyx on 2026-10-08 once the wording
// changed. It is the expressive voice rather than the deep one, which is the one way he is unlike
// the reference; the accent is why it still wins.
export const TTS_VOICE = "fable";
// Default pace. JARVIS "never rushes": his authority comes partly from not hurrying, so this stays
// at 1. An earlier 1.15 was a wrong fix for a real problem - the flatness was the instruction's
// fault, not the speed's, and hurrying him bought liveliness twice. Gur picked 1 by ear on
// 2026-10-08 against 1.05 and 1.15. See the test that keeps it from creeping back up.
export const TTS_SPEED = 1;
// Bump this whenever an instruction below changes, or cached audio outlives the change.
// The voice, speed and model are already in the cache key; the instruction text is not.
export const INSTRUCTIONS_VERSION = 2;

// Gur's steer: he's JARVIS, so he stays himself, and only goes out of line if something is really bad.
//
// Both strings ask for unhurried *certainty* rather than for slowness. The reference is described as
// "calm, measured British delivery", but "measured" and "slower" are exactly the words that make this
// model go flat, and flat is what reads as robotic - so the same idea is carried by "unhurried and
// certain", "each word gets its weight", and an explicit "never flat". Keep the pitch-and-emphasis
// variation in any rewrite: that is what buys the life, and the pace is a separate dial.
// Gur chose this composed wording by ear on 2026-10-08.
export const TONE_INSTRUCTIONS: Record<SpeechTone, string> = {
	composed:
		"Speak like a real person mid-conversation: British, Received Pronunciation, quietly warm and dryly witted. " +
		"Unhurried and certain - you worked out the answer before you spoke. Each word gets its weight. " +
		"Keep light variation in pitch and emphasis, never flat and never plodding. " +
		"Clipped and precise, assured and dry, never theatrical.",
	grave:
		"Speak like a real person mid-conversation: British, Received Pronunciation, quietly warm. " +
		"Lower and quieter than usual, carrying weight - something serious has been said. " +
		"Unhurried and certain, still composed and dry - never flat: no audible emotion, no theatricality, " +
		"no performance of sadness.",
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

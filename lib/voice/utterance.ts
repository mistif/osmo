// Pulling Gur's message out of what the recognizer heard, and deciding when he has finished.

// The wake word as a recognizer may spell it, at the very start only ("I like Osmo" is left alone).
const WAKE_PREFIX = /^\s*(?:hey\s+)?(?:osmo|ozmo|osmoe|asmo|oz\s?mo|os\s?mo)(?![\p{L}\p{N}])[\s,.!?:;-]*/iu;

export function messageFrom(transcript: string): string {
	return transcript.replace(WAKE_PREFIX, "").trim();
}

// Some recognizers keep listening after Gur stops; a second with no new words ends the message.
export const SILENCE_MS = 1000;

export function heardEnough(lastChangeAt: number | null, now: number): boolean {
	return lastChangeAt !== null && now - lastChangeAt >= SILENCE_MS;
}

// Roughly how long a transcript took to say (about 2.5 words a second), for when there's no audio to measure.
export function spokenSeconds(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length * 0.4;
}

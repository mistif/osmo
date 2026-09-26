// How Osmo "speaks" a reply: how loud each character is, where it pauses, and how fast it goes.
// Pure, so the rhythm can be tested; the page only feeds it into CSS variables.

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isWordChar = (c: string) => /[\p{L}\p{N}]/u.test(c);
const VOWELS = "aeiouyAEIOUY";

// Extra milliseconds to wait after a mark, like a breath.
const PAUSES: Record<string, number> = { ",": 140, ";": 140, ":": 140, ".": 200, "!": 220, "?": 220 };

export type Beat = {
	// 0..1: how far the circle swells for this character.
	voice: number;
	// Extra pause in ms after this character.
	pause: number;
	// True on the first letter of a word: this is where a ripple leaves.
	wordStart: boolean;
};

export function speechBeat(char: string, prev: string | undefined): Beat {
	if (!char) return { voice: 0, pause: 0, wordStart: false };
	const pause = PAUSES[char] ?? 0;
	const wordStart = isWordChar(char) && (prev === undefined || !isWordChar(prev));

	let voice: number;
	if (pause > 0) voice = 0;
	else if (VOWELS.includes(char)) voice = 0.7 + (char.charCodeAt(0) % 4) * 0.1;
	else if (isWordChar(char)) voice = 0.4;
	else if (/\s/.test(char)) voice = 0.08;
	else voice = 0.15;

	return { voice: clamp(voice, 0, 1), pause, wordStart };
}

// Milliseconds per character: quicker when the mood is aroused, slower when it is low,
// and capped so a long reply never takes more than a few seconds.
export function charDelay(length: number, pulseSeconds: number): number {
	const pulse = Number.isFinite(pulseSeconds) ? pulseSeconds : 3.2;
	const base = clamp(18 + pulse * 8, 18, 66);
	const cap = length > 0 ? 3500 / length : base;
	return Math.round(clamp(Math.min(base, cap), 12, 66));
}

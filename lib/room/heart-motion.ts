// How Osmo's heart moves while he speaks. Pure, so the motion can be tested; the room eases these
// targets frame by frame and writes them into CSS variables (--voice, --open, --flow, --r1..3).
import type { Beat } from "../agent/speech";

export type Motion = {
	// 0..1: how loud this instant. Swells the heart and brightens the rings.
	voice: number;
	// 0..1: how open the "mouth" is. A vowel opens the heart taller and narrower.
	open: number;
	// How many times faster than at rest the rings turn: 1 at rest, 3 while speaking.
	flow: number;
};

// Three corner-radius sets, one per layer of the heart.
export type Shapes = [string, string, string];

export const STILL: Motion = { voice: 0, open: 0, flow: 1 };
export const REST_SHAPES: Shapes = [
	"60% 40% 30% 70% / 60% 30% 70% 40%",
	"30% 60% 70% 40% / 50% 60% 30% 60%",
	"50% 50% 40% 60% / 40% 60% 60% 40%",
];
// Between two spoken words, when the voice gives word timings but no loudness.
export const BETWEEN_WORDS: Motion = { voice: 0.2, open: 0, flow: 3 };

const SPEAKING_FLOW = 3;
const VOWEL = /[aeiouy]/i;
const LETTER = /[\p{L}\p{N}]/u;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const openFor = (char: string) => (VOWEL.test(char) ? 1 : LETTER.test(char) ? 0.4 : 0);

// The typed-out reply: one character at a time, as loud as its beat, scaled by how strongly he feels.
export function beatTargets(char: string, beat: Beat, strength: number): Motion {
	return {
		voice: clamp(beat.voice * (0.6 + 0.4 * strength), 0, 1),
		open: openFor(char),
		flow: SPEAKING_FLOW,
	};
}

// The cloud voice: a whole word at a time.
export function wordTargets(word: string): Motion {
	return { voice: 0.8, open: VOWEL.test(word) ? 1 : LETTER.test(word) ? 0.4 : 0, flow: SPEAKING_FLOW };
}

// A new shape for every word, so the heart is never the same form twice.
export function rollShapes(rng: () => number = Math.random): Shapes {
	const r = () => 35 + Math.floor(rng() * 31);
	const shape = () => `${r()}% ${r()}% ${r()}% ${r()}% / ${r()}% ${r()}% ${r()}% ${r()}%`;
	return [shape(), shape(), shape()];
}

// Time constants in ms: a fast attack and a slower release, and rings that change pace slowly.
const TAU = { voiceUp: 40, voiceDown: 90, openUp: 50, openDown: 110, flow: 400 };
const step = (from: number, to: number, tau: number, dt: number) => from + (to - from) * (1 - Math.exp(-dt / tau));

// One frame of easing, independent of the frame rate.
export function ease(from: Motion, to: Motion, dtMs: number): Motion {
	const dt = clamp(dtMs, 0, 250);
	return {
		voice: step(from.voice, to.voice, to.voice > from.voice ? TAU.voiceUp : TAU.voiceDown, dt),
		open: step(from.open, to.open, to.open > from.open ? TAU.openUp : TAU.openDown, dt),
		flow: step(from.flow, to.flow, TAU.flow, dt),
	};
}

export function settled(m: Motion, to: Motion): boolean {
	return Math.abs(m.voice - to.voice) < 0.005 && Math.abs(m.open - to.open) < 0.005 && Math.abs(m.flow - to.flow) < 0.005;
}

// The subtitle under him: the sentence he's in, from the text said so far.
const SENTENCE_BREAK = /(?<=[.!?…])\s+/;
export function currentSentence(saidSoFar: string): string {
	const parts = saidSoFar.split(SENTENCE_BREAK);
	return parts[parts.length - 1] ?? "";
}

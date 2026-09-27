// Telling Gur's voice from anyone else's. The numbers come from the planning check with 3D-Speaker CAM++:
// the same voice scored 0.92 or more, and different voices at most 0.38 (see docs/osmo-voice-models.md).

import type { Speaker } from "./guest";

// Which model made an embedding. Voiceprints from any other model are never compared.
export const MODEL_ID = "campplus-en-voxceleb-16k";
// At or above this, the voice is Gur's. Anything else, including unsure, is someone else.
export const MATCH_THRESHOLD = 0.5;
// While teaching, each reading must be at least this close to the average of the others.
export const READING_AGREEMENT = 0.5;
// Follow-ups shorter than this keep the conversation's speaker once Gur has been recognized.
export const CARRY_OVER_SECONDS = 1.5;

// Read aloud while teaching: about 30 seconds in all, each with over two seconds of speech.
export const TEACHING_SENTENCES = [
	"The morning light came through the kitchen window.",
	"I'd like to hear about the weather this weekend.",
	"Please remind me to call my sister after lunch.",
	"Numbers like forty-two are easy to say out loud.",
	"Osmo, this is my voice. Remember how it sounds.",
] as const;

export type Voiceprint = { model: string; embedding: number[] };

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
	if (a.length !== b.length || a.length === 0) return -1;
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return na === 0 || nb === 0 ? -1 : dot / Math.sqrt(na * nb);
}

function unit(v: ArrayLike<number>): number[] {
	let norm = 0;
	for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
	norm = Math.sqrt(norm);
	return Array.from(v, (x) => (norm === 0 ? 0 : x / norm));
}

// The voiceprint of several readings: the average of their directions.
export function averagePrint(readings: readonly ArrayLike<number>[]): number[] {
	if (readings.length === 0) return [];
	const units = readings.map(unit);
	return unit(units[0].map((_, i) => units.reduce((sum, u) => sum + u[i], 0)));
}

// Readings that don't sound like the rest (a cough, someone else talking), by index.
export function outliers(readings: readonly ArrayLike<number>[]): number[] {
	if (readings.length < 2) return [];
	return readings.flatMap((reading, i) =>
		cosine(reading, averagePrint(readings.filter((_, j) => j !== i))) < READING_AGREEMENT ? [i] : [],
	);
}

// How close a voice is to Gur's closest voiceprint from this model; -1 when there is none to compare.
export function bestScore(embedding: ArrayLike<number>, prints: readonly Voiceprint[], model: string = MODEL_ID): number {
	return prints.filter((p) => p.model === model).reduce((best, p) => Math.max(best, cosine(embedding, p.embedding)), -1);
}

export function judge(input: { score: number; speechSeconds: number; ownerSoFar: boolean }): Speaker {
	if (input.ownerSoFar && input.speechSeconds < CARRY_OVER_SECONDS) return "you";
	return input.score >= MATCH_THRESHOLD ? "you" : "guest";
}

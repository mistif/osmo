import { CHARACTER } from "./character";
import { moodPosition } from "./heart";
import { ANCHORS, EMOTIONS, type Activations, type Emotion, type Mood, type Vec3 } from "./state";
import { feelingWords } from "./talk";

export const HALF_LIFE_MS = 12 * 3_600_000;
const CAUSE_TTL_MS = 36 * 3_600_000;
const NUDGE = 0.15;
// How far the slow mood must drift from rest to show (spec 5.5 says 0.08; see "Spec deviations" 1). Tuned in Task 2.11.
const SLOW_MIN = 0.02;

export function relaxMood(mood: Mood | null, now: number, baseline: Activations = CHARACTER.baseline): Mood {
	const t = moodPosition(baseline);
	if (!mood) return { pad: t, at: now, causes: [] };
	const k = Math.pow(0.5, Math.max(0, now - mood.at) / HALF_LIFE_MS);
	return { pad: mood.pad.map((v, i) => t[i] + (v - t[i]) * k) as Vec3, at: now, causes: mood.causes.filter((c) => now - c.at <= CAUSE_TTL_MS) };
}

export function nudgeMood(mood: Mood, a: Activations): Mood {
	const p = moodPosition(a);
	return { ...mood, pad: mood.pad.map((v, i) => v + NUDGE * (p[i] - v)) as Vec3 };
}

// The emotion whose direction from rest best matches the drift (cosine), or null when the drift is under SLOW_MIN.
export function slowEmotion(mood: { pad: Vec3 }, baseline: Activations, skip: Emotion[] = []): Emotion | null {
	const t = moodPosition(baseline);
	const d = mood.pad.map((v, i) => v - t[i]);
	const size = Math.hypot(...d);
	if (size < SLOW_MIN) return null;
	let best: Emotion | null = null;
	let bestCos = -Infinity;
	for (const e of EMOTIONS) {
		if (skip.includes(e)) continue;
		const v = ANCHORS[e].map((x, i) => x - t[i]);
		const cos = v.reduce((s, x, i) => s + x * d[i], 0) / (Math.hypot(...v) * size);
		if (cos > bestCos) [best, bestCos] = [e, cos];
	}
	return best;
}

export function moodWords(mood: Mood | null, baseline: Activations = CHARACTER.baseline): string {
	const e = mood ? slowEmotion(mood, baseline) : null;
	return e ? feelingWords(e) : "";
}

export const causeFor = (mood: Mood | null, e: Emotion, now: number): string | null =>
	mood?.causes.find((c) => c.tone === e && now - c.at <= CAUSE_TTL_MS)?.because ?? null;

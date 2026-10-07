import {
	ANCHORS,
	BASELINE,
	EMOTIONS,
	type Activations,
	type Coupling,
	type Emotion,
	type Vec3,
} from "./state";

const STEP = 0.1;
const DECAY = 0.05;
const SALIENCE = 0.1;

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function stepHeart(
	a: Activations,
	coupling: Coupling,
	baseline: Activations = BASELINE,
): Activations {
	const next = {} as Activations;
	for (const target of EMOTIONS) {
		let influence = 0;
		for (const [source, w] of Object.entries(coupling[target] ?? {}) as [Emotion, number][]) {
			// Coupling acts on deviation from baseline, so a resting state stays at rest.
			influence += w * (a[source] - baseline[source]);
		}
		const coupled = clamp01(a[target] + STEP * influence);
		next[target] = clamp01(coupled + DECAY * (baseline[target] - coupled));
	}
	return next;
}

export function applyShifts(
	a: Activations,
	shifts: Partial<Record<Emotion, number>>,
	scale = 1,
): Activations {
	const next = { ...a };
	for (const [emotion, amount] of Object.entries(shifts) as [Emotion, number][]) {
		next[emotion] = clamp01(next[emotion] + amount * scale);
	}
	return next;
}

export function moodPosition(a: Activations): Vec3 {
	let total = 0;
	const sum: Vec3 = [0, 0, 0];
	for (const e of EMOTIONS) {
		total += a[e];
		for (let i = 0; i < 3; i++) sum[i] += a[e] * ANCHORS[e][i];
	}
	if (total <= 0) return [0, 0, 0];
	return [sum[0] / total, sum[1] / total, sum[2] / total];
}

export function dominantEmotions(a: Activations, max = 3, baseline: Activations = BASELINE): Emotion[] {
	return EMOTIONS.map((e) => ({ e, excess: a[e] - baseline[e] }))
		.filter((x) => x.excess >= SALIENCE)
		.sort((x, y) => y.excess - x.excess)
		.slice(0, max)
		.map((x) => x.e);
}

const NAMED_BLENDS: Record<string, string> = {
	"joy+sadness": "bittersweet",
	"fear+hope": "anxious anticipation",
	"anger+guilt": "conflicted",
	"loneliness+love": "longing",
	"boredom+joy": "content but restless",
};

export function blendLabel(emotions: Emotion[]): string {
	if (emotions.length === 0) return "calm";
	if (emotions.length === 1) return emotions[0];
	const [a, b] = emotions;
	return NAMED_BLENDS[[a, b].sort().join("+")] ?? `${a} and ${b}`;
}

export function moodLabel(a: Activations, baseline: Activations = BASELINE): string {
	return blendLabel(dominantEmotions(a, 3, baseline));
}

const OPENERS: Record<string, string> = {
	bittersweet: "Bittersweet, honestly.",
	"anxious anticipation": "I am nervous, but hopeful.",
	conflicted: "I am feeling conflicted.",
	"content but restless": "I am content, if a little restless.",
	joy: "I am feeling good.",
	sadness: "I am a bit down.",
	anger: "I am irritated.",
	fear: "I am uneasy.",
	trust: "I feel at ease with you.",
	disgust: "That left a bad taste.",
	surprise: "That surprised me.",
	love: "I feel warm toward you.",
	hope: "I am feeling hopeful.",
	guilt: "I feel a bit guilty.",
	boredom: "I am a little bored.",
};

function moodOpener(label: string): string {
	return OPENERS[label] ?? "";
}

export function withMood(a: Activations, reply: string): string {
	const opener = moodOpener(moodLabel(a));
	return opener ? `${opener} ${reply}` : reply;
}

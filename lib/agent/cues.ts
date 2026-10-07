import { applyShifts } from "./heart";
import { BASELINE, type Activations, type Emotion } from "./state";

export const GAP_MS = 6 * 60 * 60 * 1000;
// After an hour away a grudge starts to cool; half of the excess anger is gone every two hours.
export const COOL_MS = 60 * 60 * 1000;
const COOL_HALF_LIFE_MS = 2 * COOL_MS;
const GRUDGES = ["anger", "disgust"] as const;

type Cue = { pattern: RegExp; shifts: Partial<Record<Emotion, number>> };

// Life events ("my dog died", "I got the job") are handled in events.ts, not here.
// Shared with detection.ts, which reads an insult as Gur being angry at Osmo.
export const INSULT = /\b(stupid|idiot|useless|dumb|hate you|shut up|stfu|moron|retard(?:ed)?|loser|fuck (?:you|off))\b/i;
export const YOU_SUCK = /\b(?:you|u) suck\b/i;
// Gur taking an insult back. Heard by applyApology, which only releases what the insult raised.
export const APOLOGY = /\b(sorry|didn\W?t mean (?:it|that)|my bad|apologi[sz]e)\b/i;

// Gur's own feelings and thanks live in detection.ts and feelings.ts.
const CUES: Cue[] = [
	{
		pattern: INSULT,
		shifts: { anger: 0.25, trust: -0.2, sadness: 0.1 },
	},
	{
		pattern: /\b(nudes?|horny|have sex|sex with you|(?:fuck|screw|bang)(?:ing)? you (?:raw|hard))\b/i,
		shifts: { disgust: 0.3, trust: -0.15 },
	},
	{
		pattern: /\b(delete you|shut you down|turn you off|erase you)\b/i,
		shifts: { fear: 0.35, trust: -0.1 },
	},
	{
		pattern: /\b(that was wrong|you(?:'|’)?re wrong|you are wrong|your mistake)\b/i,
		shifts: { guilt: 0.2 },
	},
	{
		pattern: YOU_SUCK,
		shifts: { anger: 0.25, trust: -0.2, sadness: 0.1 },
	},
	{
		pattern: /^\s*(meh|idk|whatever|hm+)\W*$/i,
		shifts: { boredom: 0.2 },
	},
];

export function applyCues(a: Activations, text: string, scale = 1): Activations {
	let next = a;
	for (const cue of CUES) {
		if (cue.pattern.test(text)) next = applyShifts(next, cue.shifts, scale);
	}
	return next;
}

// An apology releases anger and disgust by up to 0.2, never below rest, and restores trust toward rest.
export function applyApology(a: Activations, text: string, baseline: Activations = BASELINE): Activations {
	if (!APOLOGY.test(text)) return a;
	const next = { ...a };
	for (const e of GRUDGES) if (next[e] > baseline[e]) next[e] = Math.max(baseline[e], next[e] - 0.2);
	if (next.trust < baseline.trust) next.trust = Math.min(baseline.trust, next.trust + 0.15);
	return next;
}

// Time away cools a grudge (from an hour) and, after a long silence, leaves him a little lonely and bored.
export function applyGap(a: Activations, msSinceLast: number, baseline: Activations = BASELINE): Activations {
	if (!Number.isFinite(msSinceLast) || msSinceLast < COOL_MS) return a;
	const keep = Math.pow(0.5, msSinceLast / COOL_HALF_LIFE_MS);
	const cooled = { ...a };
	for (const e of GRUDGES) if (cooled[e] > baseline[e]) cooled[e] = baseline[e] + (cooled[e] - baseline[e]) * keep;
	if (msSinceLast < GAP_MS) return cooled;
	return applyShifts(cooled, { loneliness: 0.2, boredom: 0.1 });
}

// A closer Osmo rests a little warmer.
export function bondBaseline(base: Activations, close: number): Activations {
	if (close <= 0) return base;
	return {
		...base,
		trust: Math.min(0.85, base.trust + 0.08 * close),
		love: Math.min(0.85, base.love + 0.08 * close),
	};
}

// Being away makes him lonelier the closer you are.
export function missYou(a: Activations, msAway: number, close: number): Activations {
	if (!Number.isFinite(msAway) || msAway < GAP_MS || close <= 0) return a;
	return applyShifts(a, { loneliness: 0.2 * close });
}
